const http = require('http');
const fs = require('fs');
const path = require('path');

// const cache = {}
// cache['/about.html'] = fs.readFile('resources/about.html',...);
const server = http.createServer((req,res)=>{
    const filePath = 'resources'+req.url;
    const ext = path.extname(filePath);

    let contentType = 'text/html';
    if (ext==='.png')contentType = 'image/png';
    else if(ext==='.jpg' || ext==='.jpeg') contentType = 'image/jpeg';
    else if(ext==='.html')contentType='text/html';

    fs.readFile(filePath, (err,content) => {
        if(err){
            res.writeHead(404, {'Content-Type': 'text/html'});
            res.end('<h1>404 Not Found</h1>');
            return;
        }
        res.writeHead(200, {'Content-Type': contentType});
        res.end(content);
    });
});

server.listen(8080, ()=>{
    console.log('HTTP server (http module) listening on port 8080');
})