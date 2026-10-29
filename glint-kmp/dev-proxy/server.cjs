/* Local CORS proxy for the Glint web preview.
   Same engine as the PWA deployment (proxy-core.cjs + proxy-policy.json):
   GET  /api/proxy?u=<https source url>   — public reads
   POST /api/proxy                        — pb_private account envelopes
   Runs on http://localhost:8081 next to the wasm dev server on :8080. */
'use strict';
const http = require('http');
const proxy = require('./proxy-core.cjs');

const PORT = Number(process.env.GLINT_PROXY_PORT || 8081);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/api/proxy') {
    res.writeHead(404, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end('{"error":"Only /api/proxy exists on this server."}');
    return;
  }
  let body = Buffer.alloc(0);
  let tooLarge = false;
  req.on('data', (chunk) => {
    body = Buffer.concat([body, chunk]);
    if (body.length > proxy.maxRequestBytes) { tooLarge = true; req.destroy(); }
  });
  req.on('end', async () => {
    if (tooLarge) return;
    try {
      const r = await proxy.handleProxy(req.method, url.searchParams.get('u') || '', body.length ? body : null);
      res.writeHead(r.statusCode, r.headers);
      res.end(r.body);
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end('{"error":"Proxy failure."}');
    }
  });
});

server.listen(PORT, () => {
  console.log('[glint] dev proxy ready on http://localhost:' + PORT + '/api/proxy');
});
