const http = require('http');
const fs = require('fs');
const path = require('path');

// --- Load files into memory ONCE at startup ---
const cache = {};
const files = ['about.html', 'contact.html', 'img1.jpg', 'img2.jpg'];  // your actual filenames
for (const file of files) {
    cache['/' + file] = fs.readFileSync('resources/' + file);
}

function getContentType(ext) {
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    return 'text/html';
}

const server = http.createServer((req, res) => {
    const content = cache[req.url];          // look up in memory — NO disk read
    if (!content) {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>');
        return;
    }
    const ext = path.extname(req.url);
    res.writeHead(200, { 'Content-Type': getContentType(ext) });
    res.end(content);
});

server.listen(8080, () => {
    console.log('Caching HTTP server listening on port 8080');
});