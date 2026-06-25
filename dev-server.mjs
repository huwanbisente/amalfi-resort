import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5274);
const hubOrigin = process.env.HUB_ORIGIN || 'http://127.0.0.1:3101';
const adminToken = process.env.HUB_ADMIN_TOKEN || 'dev-token';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

function proxyApi(req, res) {
  const target = new URL(req.url, hubOrigin);
  const headers = { ...req.headers, host: target.host };
  if (req.url?.startsWith('/api/v1/admin/')) {
    headers.authorization = `Bearer ${adminToken}`;
  }

  const proxyReq = http.request(target, { method: req.method, headers }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Amalfi hub is not reachable.' }));
  });

  req.pipe(proxyReq);
}

http.createServer((req, res) => {
  if (req.url?.startsWith('/api/')) {
    proxyApi(req, res);
    return;
  }

  const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const relativePath = rawPath === '/' ? 'index.html' : rawPath.replace(/^\/+/, '');
  const filePath = path.resolve(__dirname, relativePath);
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  serveFile(res, filePath);
}).listen(port, () => {
  console.log(`Amalfi desktop admin: http://127.0.0.1:${port}`);
  console.log(`Proxying /api to ${hubOrigin}`);
});
