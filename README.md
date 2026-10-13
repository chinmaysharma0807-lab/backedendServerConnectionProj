# Build a Web Server From First Principles

A learning project: building up from raw TCP sockets to a working HTTP file server — no Express, no frameworks — then load-testing it to find and fix its bottlenecks.

The goal was never "ship a server." It was to understand what actually happens under the hood when a browser talks to a server. This README is written so I (or anyone) can **revise the whole mental model quickly** on a revisit — every section explains the *why*, not just the *what*.

---

## Table of Contents

1. [Core mental model](#core-mental-model)
2. [The building blocks](#the-building-blocks)
3. [Part 1 — TCP client & server](#part-1--tcp-client--server)
4. [Part 2 — One server, many clients](#part-2--one-server-many-clients)
5. [Part 3 — UDP](#part-3--udp)
6. [Part 4 — IP + Port mental model](#part-4--ip--port-mental-model)
7. [Part 5 — HTTP from scratch](#part-5--http-from-scratch)
8. [Part 6 — The HTTP file server](#part-6--the-http-file-server)
9. [Part 7 — Breaking things & load testing](#part-7--breaking-things--load-testing)
10. [The performance journey (the headline result)](#the-performance-journey)
11. [How to run](#how-to-run)
12. [What's left / next steps](#whats-left--next-steps)

---

## Core mental model

The single thread that ties everything together:

- **The OS is the gatekeeper.** Programs never receive raw network traffic directly. The operating system receives *everything* and routes it to the right program based on **interface + port**. If nothing is listening there, the OS itself rejects or discards the traffic.
- **IP + port = one endpoint.** The IP picks the *machine*; the port picks the *program on it*. You need both to reach one specific program on one specific machine.
- **Everything on the wire is bytes.** "Text," "HTML," "image" are just interpretations layered on top of raw bytes. A **protocol** is the agreement on how to interpret those bytes.
- **A connection is identified by a 4-tuple:** `(client IP, client port, server IP, server port)`. This is how one server on one port can hold thousands of simultaneous connections — each client brings a different (ephemeral) port.

Everything below is a consequence of these four ideas.

---

## The building blocks

| Term | What it is |
|---|---|
| **Network** | Devices sharing data over agreed protocols. |
| **IP address** | Unique identifier for a device on a network. `127.0.0.1` = loopback ("this machine only"). `0.0.0.0` when binding = "listen on all interfaces." |
| **Port** | A number (0–65535) identifying *which program* on a machine the data is for. |
| **Protocol** | Agreed rules for formatting/interpreting the bytes (TCP, UDP, HTTP, DNS...). |
| **DNS** | Translates names (`google.com`) into IP addresses *before* any data is exchanged. `localhost` → `127.0.0.1` resolves via the local `hosts` file, not the internet. |
| **Socket** | The programmatic endpoint (IP + port + protocol) — the "plug" each side reads from and writes to. |
| **Ephemeral port** | A temporary port the OS assigns to a client automatically when it connects. The client never chooses it. |

---

## Part 1 — TCP client & server

Built a TCP server and client that exchange a message (`Hello Server` → `Hello Client`).

**Key reasoning (the dependency chain):** each step needs the previous step's product to exist.

```
create socket → bind a port to it → listen → accept → read → send
```

- **Server must start first.** A connection sent to a server that isn't listening has nowhere to land.
- **Two sockets on the server:**
  - **Listening socket** (the *gatekeeper*): created, bound, and listening. Its only job is to receive incoming connections. Carries no conversation data.
  - **Connection socket** (per client): handed back by `accept()`. This is the private line that actually carries the message. It doesn't exist until `accept()` creates it — which is *why* you can't `read()` before you `accept()`.
- **`bind` just means "claim this port so I can be found."** It's about the *server's own address*, and happens at startup before any client exists.
- **The client doesn't bind.** It gets an ephemeral port assigned by the OS. It only needs to *know* the server's IP + port to connect.
- A connection arriving before `accept()` isn't dropped — the OS completes the handshake and **queues** it (the backlog).

**The TCP three-way handshake** (sets up every reliable connection before data flows):

```
Client → SYN       "I want to talk"
Server → SYN-ACK   "Got it, and here's my side"
Client → ACK       "Got yours too"
```

**In Node (`net` module):** `createServer` = the gatekeeper; the `socket` handed to its callback = the per-client connection socket. The callback runs once per client.

---

## Part 2 — One server, many clients

The server already handles multiple clients with no changes. The `createServer` callback **runs once per client**, handing each its own connection socket.

- **One** listening/gatekeeper socket (the `server` object).
- **One connection socket per client** (the callback's `socket` argument).
- The server doesn't manually track "who sent what" — each client's data arrives on *that client's own socket*. The OS keeps them separate using the 4-tuple (same server IP + port for all, but each client has a different ephemeral port).

---

## Part 3 — UDP

Rebuilt the same back-and-forth over UDP (`dgram` module). The ceremony disappears, and that absence *is* the lesson.

- **One socket only.** No listening/connection split, because there are no connections.
- **Connectionless = no state between messages.** In TCP, "who am I talking to" is state held in a connection socket. In UDP, that identity must **ride with every message** — each datagram carries its sender's IP + port (`rinfo` in Node). Like a self-addressed postcard vs. a phone call.
- **Fire and forget.** The sender's OS stamps the destination on the packet and hands it to the network. It does **not** check if anything is listening. The *receiver's* OS checks once on arrival — and if nothing is bound to that port, it **silently discards** the packet. No error, no retry.

### TCP vs UDP

| Question | TCP | UDP |
|---|---|---|
| Connection required? | Yes (handshake) | No |
| Guaranteed delivery? | Yes (ack + retransmit) | No |
| Ordering? | Yes (reassembled by sequence) | No guarantee |
| If a packet is lost? | Silently retransmitted (you never notice) | Silently dropped (gone forever) |

Both *hide* loss from you — TCP by fixing it, UDP by not caring. TCP buys reliability with time; UDP buys speed by giving up guarantees.

> Note: on loopback (same machine), UDP looks perfectly reliable and in-order — because there's effectively no network to lose or reorder packets. That's UDP *permitting* loss, not guaranteeing delivery; it abandons you the moment the network gets hard.

---

## Part 4 — IP + Port mental model

Experiments that burn in "IP + port → where should the data go?"

- **Two servers on the same port → `EADDRINUSE`.** The OS refuses the second bind. If two programs owned one port, incoming data would be ambiguous — the OS enforces one owner per `IP:port` so delivery is never a coin-flip.
- **Two servers on different ports (8080 vs 8081) → both run fine.** Same IP, different port = different endpoint = no collision.
- **Steering by port:** a client aimed at `:8080` reaches server A; `:8081` reaches server B. The port alone decides which program receives the data.

**Three OS verdicts, one rule** (`IP:port` maps to exactly one program):

| Verdict | Meaning |
|---|---|
| `EADDRINUSE` | That endpoint is already owned — can't bind. |
| `ECONNREFUSED` | Nothing owns that endpoint — nowhere to deliver. |
| Clean delivery | Exactly one owner — here's your data. |

---

## Part 5 — HTTP from scratch

**Key realization: a plain TCP server is already most of a web server.** HTTP adds *no new networking* — it's just an agreed text format sent over the TCP connection you already built. A browser is just a TCP client that speaks HTTP.

Pointing a browser at a raw TCP server prints the raw HTTP request — proof it's just text:

```
GET /about.html HTTP/1.1      ← request line: METHOD PATH VERSION
Host: localhost:8080          ← headers (metadata, one per line)
User-Agent: ...
                              ← blank line: separates headers from body
<body here>
```

**An HTTP response mirrors that structure:**

```
HTTP/1.1 200 OK               ← status line (version + status code)
Content-Type: text/html       ← headers
Content-Length: 29
                              ← blank line (REQUIRED)
<h1>Hello from my server</h1> ← body
```

Things that clicked:
- **The blank line is mandatory.** It's the only marker telling the receiver where headers end and the body begins. Without it, the response is an unparseable soup of bytes.
- **`Content-Type` decides interpretation.** `text/html` → rendered; `text/plain` → literal tags shown as text; wrong type on an image → garbage. The browser *trusts* this label even when it's a lie.
- **`Content-Length` solves message framing.** It tells the client exactly how many body bytes to expect, so it knows when the message is complete **without** waiting for the connection to close. (This is the answer to the classic "how do I know I got the whole message?" problem.)

**Debugging with curl** (`curl.exe -v` on Windows — plain `curl` is a PowerShell alias for `Invoke-WebRequest`):
- `>` lines = what was sent (request)
- `<` lines = what came back (response)
- `*` lines = curl's own commentary (DNS resolve, TCP connect, etc.)

---

## Part 6 — The HTTP file server

A file server with no framework. The 9 steps:

1. Create a TCP socket
2. Listen on a port (8080)
3. Accept connections
4. Read the HTTP request
5. **Parse the path** — take the first line, `split(' ')`, grab index **1** (`GET` `/about.html` `HTTP/1.1` → the middle piece)
6. **Find the file** — `'resources' + path`, read with `fs`
7. **Build the response** — status line + headers + blank line + body
8. Send it through the socket
9. **404** if the file doesn't exist (the `fs.readFile` error branch)

**Two new concepts here:**
- **Text vs binary.** HTML is readable bytes (fine as a string). An image is binary — it must stay a raw **Buffer** and never be `.toString()`'d, or it corrupts. Send the Buffer directly.
- **Content-Type per file extension.** `.html` → `text/html`, `.png` → `image/png`, `.jpg`/`.jpeg` → `image/jpeg`. The type must match the real file or the browser mangles it.

**Bugs this stage taught me (all real):**
- Falling through from the 404 branch into the 200 branch → crash. Fix: `return` after sending the 404.
- `404` on a file that "exists" → it didn't exist under the exact name requested (`.png` vs `.jpg`, case, apostrophes in filenames). `fs.readFile` failing *is* the 404 condition.
- Serving `.jpg` but only checking for `.jpeg` → fell through to `text/html` → image broke.
- `ERR_STREAM_WRITE_AFTER_END` under load → the `data` handler fired again after the socket was already `end()`ed. A raw-socket lifecycle hazard that frameworks handle for you.

---

## Part 7 — Breaking things & load testing

Deliberately broke the server to learn from the failures, then measured its capacity with [`autocannon`](https://github.com/mcollina/autocannon):

```
autocannon -c <concurrent-connections> -d <seconds> http://localhost:8080/about.html
```

What the numbers mean:
- **Req/Sec** — throughput. Rises with concurrency, then **plateaus** (the real ceiling), then can *fall* past the breaking point.
- **Latency** — climbs once the server is saturated (extra connections just wait in a queue).
- **Errors** (`ECONNABORTED`, etc.) — appear when the server is overwhelmed (accept queue full, or ephemeral-port / file-descriptor exhaustion). On Windows + loopback, port exhaustion shows up relatively early because of the small ephemeral range + long `TIME_WAIT`.

**Diagnosing the bottleneck** — the guiding questions:
- Handling one at a time? → No, Node juggles via its single-threaded event loop.
- Is disk reading slowing it down? → Yes, more than expected (see below).
- Is the CPU the bottleneck? → Eventually, the single event-loop thread saturates one core.
- What if lots of clients ask for the same file? → Every request re-reads it from disk. Wasteful for static files → **cache it in memory.**

---

## The performance journey

The headline result — each fix removed one bottleneck and revealed the next:

| Version | Peak req/sec | Bottleneck that was removed / revealed |
|---|---:|---|
| Raw server (`Connection: close`) | ~700 | A fresh TCP handshake **per request** |
| `http` module (keep-alive) | ~1,600 | Keep-alive fixed the handshake tax; now **disk reads** (via libuv's thread pool) are the limit |
| `http` + in-memory cache | **~9,700** | Disk eliminated; now the **single event-loop thread (CPU)** is the limit |

Key insights:
- **"Non-blocking" ≠ "free."** `fs.readFile` is backgrounded, but it runs on libuv's small (default 4) thread pool. Under load, requests queue *for the thread pool* even while the main thread is idle. Caching removed those reads entirely → ~6× throughput.
- **Caching only works because the files are static** (they don't change between requests). A dynamic server couldn't naively cache like this.
- **The final ceiling is one CPU core.** Node runs on a single thread = one core. The remaining cores sit idle. This is *why* real servers scale out across cores/machines — understood from the mechanics up, not just "they have lots of servers."

---

## How to run

**Requirements:** Node.js (v18+). Check with `node --version`.

```bash
# clone and enter the project
cd TCP

# run whichever server (they all listen on 8080)
node server.js          # Part 1 raw TCP server
node httpServer.js      # Part 6 raw HTTP file server
node httpServer2.js     # http module version
node httpServer3.js     # http module + in-memory cache

# in another terminal, hit it:
#   browser → http://localhost:8080/about.html
#   or:
curl.exe -v http://localhost:8080/about.html   # Windows (use curl on mac/linux)
```

**Resources served** live in `resources/`:

```
resources/
├── about.html
├── contact.html
├── img1.jpg
└── img2.jpg
```

**Load testing:**

```bash
npm install -g autocannon
autocannon -c 100 -d 10 http://localhost:8080/about.html
```

> Tip: only one program can bind port 8080 at a time — stop one server before starting another, or you'll get `EADDRINUSE`.

---

## What's left / next steps

Ideas for when I revisit, roughly in order of payoff:

- [ ] **Clustering** — use the `cluster` module to run one worker per CPU core, all sharing port 8080. Should multiply throughput by ~core count. This is the direct fix for the single-thread ceiling.
- [ ] **Path-traversal safety** — right now `/../httpServer.js` could escape the `resources/` folder. Sanitize the requested path.
- [ ] **Handle the `/` root path** — serve a default page instead of 404.
- [ ] **Request buffering / framing** — the raw server assumes one `data` event = one whole request. Buffer until the full request is received (matters for large requests / POST bodies).
- [ ] **Keep-alive on the raw server** — instead of `Connection: close` per request.

---

### The one-line takeaway

HTTP isn't magic. It's structured text moving through a TCP connection — and once you've built that connection by hand, the whole stack (DNS → IP+port → TCP → HTTP → performance) stops being a black box.
