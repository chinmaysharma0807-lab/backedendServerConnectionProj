const net = require('net');

const clientId = process.argv[2] || 'unknown';

// const socket = net.createConnection(8080, '127.0.0.1', ()=>{
//     console.log('Connected to server');
//     socket.write('Hello from client:' + clientId);
//     socket.on('data',(data)=>{
//         console.log('Server sent:', data.toString());
//     });
// });

const port = process.argv[2] || 8080;
const socket = net.createConnection(port, '127.0.0.1', () => {
  console.log('Connected to server on port ' + port);
  socket.write('Hello Server');
});