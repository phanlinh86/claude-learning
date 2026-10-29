// Family Flappy — tiny static server that mimics GitHub Pages (Fastly) response behaviour.
//   node tests/perf/server.js [rootDir] [port]       (defaults: ../../game, 8780)
// - HTTP/1.1 (Chromium opens <= 6 connections per host → more pessimistic than GH Pages' HTTP/2)
// - gzip for text types (html, css, js, svg, json) when the client accepts it
// - Cache-Control: max-age=600, ETag + Last-Modified, 304 on If-None-Match / If-Modified-Since
// - one request per file, no push, no preload hints
// Also usable as a module: require('./server').start(root, port) → Promise<http.Server>
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.woff2': 'font/woff2'
};
const GZIP = new Set(['.html', '.js', '.css', '.svg', '.json']);
const cache = new Map();   // path -> { raw, gz, etag, mtime }

function load(file) {
  const st = fs.statSync(file);
  let e = cache.get(file);
  if (e && e.mtimeMs === st.mtimeMs) return e;
  const raw = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  e = { raw, gz: GZIP.has(ext) ? zlib.gzipSync(raw, { level: 6 }) : null, mtimeMs: st.mtimeMs, mtime: st.mtime.toUTCString(),
    etag: '"' + crypto.createHash('md5').update(raw).digest('hex').slice(0, 16) + '"', type: TYPES[ext] || 'application/octet-stream' };
  cache.set(file, e);
  return e;
}

function start(root, port, opts) {
  root = path.resolve(root);
  const maxAge = opts && opts.maxAge != null ? opts.maxAge : 600;
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    const e = load(file);
    const h = { 'Content-Type': e.type, 'Cache-Control': 'max-age=' + maxAge, 'ETag': e.etag, 'Last-Modified': e.mtime,
      'Access-Control-Allow-Origin': '*', 'Vary': 'Accept-Encoding', 'Timing-Allow-Origin': '*' };
    if (req.headers['if-none-match'] === e.etag) { res.writeHead(304, h); res.end(); return; }
    const gz = e.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    const body = gz ? e.gz : e.raw;
    if (gz) h['Content-Encoding'] = 'gzip';
    h['Content-Length'] = body.length;
    res.writeHead(200, h);
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  srv.keepAliveTimeout = 5000;
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}

module.exports = { start };
if (require.main === module) {
  const root = process.argv[2] || path.join(__dirname, '..', '..', 'game');
  const port = +(process.argv[3] || 8780);
  start(root, port).then(() => console.log(`serving ${root} like GitHub Pages on http://127.0.0.1:${port}/`));
}
