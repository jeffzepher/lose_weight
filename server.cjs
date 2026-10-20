const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  const pathname = new URL(req.url,'http://localhost').pathname;
  const assets=['index.html','style.css','mobile.css','core.js','app.js','install.js','sw.js','manifest.webmanifest','icons/icon.svg','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
  const files = Object.fromEntries(assets.map(file=>['/'+file,file]));
  files['/']='index.html';
  if(!files[pathname]){res.writeHead(404);res.end('Not found');return;}
  const file=path.join(__dirname,files[pathname]);
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(500);res.end('Read error');return;}res.setHeader('Content-Type',types[path.extname(file)]);res.setHeader('Cache-Control','no-cache');res.end(data);});
}).listen(4173,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4173'));
