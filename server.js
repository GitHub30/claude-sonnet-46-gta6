// Simple static file server
const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = '/workspaces/codespaces-blank';

const mimeTypes = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
};

const server = http.createServer((req, res) => {
  // Sanitize path to prevent path traversal
  const safePath = path.normalize(req.url.split('?')[0]).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(ROOT, safePath === '/' ? 'index.html' : safePath);

  // Ensure we stay within ROOT
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'text/plain',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

server.listen(8080, '0.0.0.0', () => {
  console.log('Server running on http://localhost:8080');
});
