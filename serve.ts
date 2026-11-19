// A tiny static server for game/ (Node 22, standard library only).
//
// Play the entry locally without a build step:
//
//   node serve.ts [--port 8080] [--host 127.0.0.1] [--log]
//
// It serves game/ on http://localhost:8080, sends the MIME types a
// browser game needs, and refuses any path outside game/. This is a
// development convenience, not a web server for the internet.
// With --log it prints one line per request (method, path, status),
// so a broken asset shows up in the terminal instead of silently
// failing in the browser. v4 rewrote this file wholesale — same
// routes, same guards, new structure.
// v6: a few internal names refreshed, behaviour identical.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

// Parse --port from the argv; anything invalid falls back to 8080.
function parsePort(argv) {
  const flag = argv.indexOf('--port');
  const value = flag === -1 ? NaN : Number(argv[flag + 1]);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : 8080;
}

// --host binds the server somewhere else (default loopback only);
// pass 0.0.0.0 to play from another device on your own network.
function parseHost(argv) {
  const flag = argv.indexOf('--host');
  if (flag === -1 || !argv[flag + 1]) return '127.0.0.1';
  return argv[flag + 1];
}

// --log prints one line per request to stdout.
function parseLogging(argv) {
  return argv.includes('--log');
}

const port = parsePort(process.argv.slice(2));
const host = parseHost(process.argv.slice(2));
const logging = parseLogging(process.argv.slice(2));

function logLine(method, pathname, status) {
  if (!logging) return;
  const stamp = new Date().toISOString().slice(11, 19);
  console.log(`${stamp} ${method} ${pathname} -> ${status}`);
}

// Resolve a request path to a file inside game/, or null if it escapes.
function insideRoot(pathname) {
  const file = resolve(join(root, normalize(pathname)));
  if (file !== root && !file.startsWith(root + sep)) return null;
  return file;
}

function typeFor(file) {
  return MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    logLine(request.method, url.pathname, 400);
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = insideRoot(pathname);
  if (file === null) {
    logLine(request.method, pathname, 403);
    response.writeHead(403).end('forbidden');
    return;
  }
  let size;
  try {
    const stat = statSync(file);
    if (!stat.isFile()) throw new Error('not a file');
    size = stat.size;
  } catch {
    logLine(request.method, pathname, 404);
    response.writeHead(404).end('not found');
    return;
  }
  logLine(request.method, pathname, 200);
  response.writeHead(200, {
    'content-type': typeFor(file),
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}).listen(port, host, () => {
  console.log(`game/ is on http://${host}:${port}`);
});

// v7: the dev server serves the same game, now with six more modules behind it.
