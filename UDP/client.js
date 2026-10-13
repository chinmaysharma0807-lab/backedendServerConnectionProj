const dgram = require('dgram');
const client = dgram.createSocket('udp4');

// client.send('Hello from UPD Client', 4000, '127.0.0.1');

for(let i = 0; i < 20; i++){
    client.send('Message'+i,4000,'127.0.0.1');
}