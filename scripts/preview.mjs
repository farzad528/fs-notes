import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { ROOT, readConfig, normalizeBase } from './lib.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.pdf': 'application/pdf',
  '.woff2': 'font/woff2' };

export async function preview({ root = ROOT, port = 4173, baseURL } = {}) {
  const base = normalizeBase(baseURL ?? (await readConfig(root)).baseURL);
  const output = path.join(root, 'public');
  await fs.access(path.join(output, 'index.html'));
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === base.pathname.slice(0, -1)) {
        response.writeHead(308, { Location: base.pathname }); response.end(); return;
      }
      if (!url.pathname.startsWith(base.pathname)) { response.writeHead(404); response.end('Not found'); return; }
      const relative = decodeURIComponent(url.pathname.slice(base.pathname.length));
      if (relative.includes('\\') || relative.split('/').includes('..')) { response.writeHead(400); response.end('Bad path'); return; }
      let filename = path.join(output, relative);
      let stat;
      try { stat = await fs.stat(filename); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (stat?.isDirectory()) {
        if (!url.pathname.endsWith('/')) { response.writeHead(308, { Location: `${url.pathname}/${url.search}` }); response.end(); return; }
        filename = path.join(filename, 'index.html');
      }
      let bytes;
      try { bytes = await fs.readFile(filename); }
      catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error;
        response.writeHead(404, { 'Content-Type': types['.html'] }); response.end(await fs.readFile(path.join(output, '404.html'))); return;
      }
      response.writeHead(200, { 'Content-Type': types[path.extname(filename)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      console.error(error.message); response.writeHead(500); response.end('Preview server error');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, url: `http://localhost:${server.address().port}${base.pathname}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  preview().then(({ server, url }) => {
    console.log(`Exact production output: ${url}\nCanonical URLs are intentionally unchanged. Press Ctrl+C to stop.`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
