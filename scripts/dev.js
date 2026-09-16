// Local server; does not deploy or schedule alerts. Uses the real API handlers.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../public');
const routes = new Set(['football', 'img', 'news', 'subscribe', 'cron-alerts']);
const mime = { '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png', '.jpeg':'image/jpeg', '.jpg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml' };
const common = require('../vercel.json').headers[0].headers;
const server = http.createServer(async (req, res) => {
  try {
    for (const { key, value } of common) res.setHeader(key, value);
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5);
      if (!routes.has(name)) { res.writeHead(404); return res.end(); }
      req.query = {};
      for (const [key, value] of url.searchParams) {
        req.query[key] = key in req.query ? [].concat(req.query[key], value) : value;
      }
      const chunks = []; let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 65536) { res.writeHead(413); return res.end(); }
        chunks.push(chunk);
      }
      if (length) {
        try { req.body = JSON.parse(Buffer.concat(chunks).toString()); }
        catch { res.writeHead(400); return res.end('Invalid JSON'); }
      }
      res.status = code => { res.statusCode = code; return res; };
      res.json = value => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(value)); };
      res.send = value => res.end(value);
      const file = require.resolve(`../api/${name}.js`);
      delete require.cache[file];
      return await require(file)(req, res);
    }
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control','no-store');
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    console.error('Local request failed:', err.message);
    if (!res.headersSent) res.writeHead(500);
    res.end('Local server error');
  }
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log(`FutStats local: http://127.0.0.1:${server.address().port}`));
