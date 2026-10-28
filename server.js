const http = require('http');
const fs = require('fs');
const path = require('path');
const { getTelemetrySnapshot } = require('./lib/telemetry');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png'
};

let currentMetrics = getTelemetrySnapshot();
const sseClients = new Set();

// Regular background sampling interval
setInterval(() => {
  currentMetrics = getTelemetrySnapshot();

  if (sseClients.size > 0) {
    const payload = `data: ${JSON.stringify(currentMetrics)}\n\n`;
    for (const res of sseClients) {
      res.write(payload);
    }
  }
}, 1000);

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathParam = parsedUrl.searchParams.get('path');
  const pathname = pathParam || req.headers['x-matched-path'] || req.headers['x-vercel-matched-path'] || parsedUrl.pathname;

  // SSE Stream
  if (pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(`data: ${JSON.stringify(currentMetrics)}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // Telemetry endpoint (Upstash Redis integration)
  if (pathname === '/api/telemetry') {
    if (!res.status) {
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
    }
    if (!res.json) {
      res.json = (data) => {
        res.setHeader('Content-Type', 'application/json; charset=UTF-8');
        res.end(JSON.stringify(data));
      };
    }
    const telemetryHandler = require('./api/telemetry');
    telemetryHandler(req, res);
    return;
  }

  // REST API Endpoint
  if (pathname === '/api/metrics') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=UTF-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(currentMetrics, null, 2));
    return;
  }

  // Health endpoint
  if (pathname === '/health' || pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }

  // Static file handling
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '') {
    safePath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

if (!process.env.VERCEL) {
  server.listen(PORT, HOST, () => {
    console.log(`⚡ Astral Node Telemetry running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  });
}

module.exports = server;
