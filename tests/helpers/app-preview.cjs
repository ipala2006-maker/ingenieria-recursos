// Local, read-only preview of public app assets; no accounts or production APIs.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.webp':'image/webp', '.woff2':'font/woff2', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.webmanifest':'application/manifest+json' };
function createPreview() {
  return http.createServer((req,res) => {
    let name;
    try { name = decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).replace(/^\//,'') || 'index.html'; } catch (_) {res.writeHead(400).end();return;}
    const file=path.resolve(root,name);
    const allowed=/^(index\.html|widget\.html|service-worker\.js|site\.webmanifest|(scripts|styles|shared|assets|data)\/[\w./-]+)$/.test(name);
    if(!['GET','HEAD'].includes(req.method)||!allowed||!file.startsWith(root+path.sep)||name.split('/').some(p=>p.startsWith('.'))||!types[path.extname(file)]){res.writeHead(404).end();return;}
    fs.stat(file,(err,stat)=>{
      if(err||!stat.isFile()){res.writeHead(404).end();return;}
      res.writeHead(200,{'Content-Type':types[path.extname(file)]+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      if(req.method==='HEAD')res.end();else fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
    });
  });
}
module.exports = { createPreview };
if(require.main===module) createPreview().listen(8149,'127.0.0.1',()=>console.log('Vista de prueba de la app: http://127.0.0.1:8149/ (sin cuentas)'));
