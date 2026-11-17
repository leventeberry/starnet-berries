// Local preview: serves site/ and runs api/*.js the way Vercel does (Web Request → Response handlers).
// Usage: npm run dev   (reads .env.local if present; never commit that file)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const envFile = join(root, '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const port = Number(process.env.PORT || 3000);
// Same security headers as production, so a CSP mistake shows up locally first.
const siteHeaders = Object.fromEntries(JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')).headers[0].headers.filter((h) => h.key !== 'Strict-Transport-Security').map((h) => [h.key, h.value]));

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, '');
      const file = join(root, 'api', `${name}.js`);
      if (!name || name.startsWith('_') || !existsSync(file)) { res.writeHead(404).end('{"error":"not found"}'); return; }
      const mod = await import(pathToFileURL(file).href);
      const fn = mod[req.method];
      if (!fn) { res.writeHead(405).end(); return; }
      const chunks = []; for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: { ...req.headers, 'x-forwarded-for': req.socket.remoteAddress }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const out = await fn(request);
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(Buffer.from(await out.arrayBuffer()));
      return;
    }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path.endsWith('/')) path += 'index.html';
    const file = join(root, 'site', path);
    if (!file.startsWith(join(root, 'site')) || !(await stat(file).catch(() => null))?.isFile()) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { ...siteHeaders, 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch (err) {
    console.error(err);
    res.writeHead(500).end('Server error');
  }
}).listen(port, () => console.log(`Portfolio preview on http://localhost:${port}`));
