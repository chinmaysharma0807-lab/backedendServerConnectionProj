const dgram = require('dgram');
const server = dgram.createSocket('udp4');

server.on('message', (msg,rinfo) => {
    console.log('Server recieved:' ,msg.toString(), 'from', rinfo.address + ':' + rinfo.port)
})
server.bind(4000, ()=>{
    console.log('UDP Server listening on port 4000')
})