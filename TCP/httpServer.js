const net = require('net');
const fs = require('fs');
const path = require('path');

const server =  net.createServer((socket)=>{
    socket.on('error', (err)=>{
        console.log('Socket error:' , err.message);
    })
    socket.on('data',(data)=>{
        const request = data.toString();
        const fl = request.split('\r\n');
        const parts = fl[0].split(' ');
        const filePath = 'resources'+ parts[1];
        const ext = path.extname(filePath)
        let contentType = 'text/html';
        if(ext==='.png')contentType = 'image/png';
        else if(ext === '.jpeg' || ext === '.jpg')contentType = 'image/jpeg'
        else if(ext === '.html')contentType = 'text/html'
        fs.readFile(filePath,(err,content)=>{
            if(socket.writableEnded || socket.destroyed)return;
            if(err){
                const body = '<h1>404 NOt Found</h1>';
                socket.write('HTTP/1.1 404 Not Found\r\n');
                socket.write('Content-Type:' +contentType+'\r\n');
                socket.write('Content-Length: '+ body.length + '\r\n');
                socket.write('\r\n');
                socket.write(body);
                socket.end();
                return;
            }
            socket.write('HTTP/1.1 200 OK\r\n');
            socket.write('Content-Type: '+contentType+'\r\n');
            socket.write('Content-Length: '+ content.length + '\r\n');
            socket.write('\r\n');
            socket.write(content);
            socket.end();
        });

    });
});

server.listen(8080,()=>{
    console.log('HTTP server listening on port 8080');
});