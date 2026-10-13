const net = require('net');
const server =net.createServer((socket)=>{
    console.log('New client connected');
    socket.on('data',(data)=>{
        console.log('server recieved:', data.toString());
        socket.write('HTTP/1.1 200 OK\r\n');
        socket.write('Content-Type: text/html\r\n');
        socket.write('\r\n');
        socket.write('<h1>Hello from my server</h1>');
        socket.end();
    })
});
// server.listen(3000, ()=>{
    
// });

const port = process.argv[2] || 8080;
server.listen(port,()=>{
    console.log('Server listening on port', port);
})