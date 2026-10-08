/**
 * Kleiner Testserver für den fertigen Build: liefert apps/web/dist aus und wendet die Header aus
 * apps/web/public/_headers an, damit man die Content-Security-Policy so prüfen kann, wie Cloudflare sie ausliefert.
 *
 *   corepack pnpm@10.34.6 --filter @toolkit/web build     (mit ALLOW_INCOMPLETE_LEGAL=1, falls das Impressum noch leer ist)
 *   node spikes/08-deploy/serve-dist.ts [Port]            (Standard 4173)
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const dist = join(root, 'apps', 'web', 'dist');
const port = Number(process.argv[2] ?? 4173);

if (!existsSync(join(dist, 'index.html'))) {
  console.error('apps/web/dist fehlt. Erst bauen: corepack pnpm@10.34.6 --filter @toolkit/web build');
  process.exit(1);
}

/** Liest die _headers-Datei: Blöcke aus einer Pfadzeile und eingerückten "Name: Wert"-Zeilen. */
function parseHeaders(text: string): { pattern: string; headers: [string, string][] }[] {
  const blocks: { pattern: string; headers: [string, string][] }[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) {
      blocks.push({ pattern: line.trim(), headers: [] });
    } else if (blocks.length > 0) {
      const i = line.indexOf(':');
      blocks[blocks.length - 1]!.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    }
  }
  return blocks;
}

const rules = parseHeaders(readFileSync(join(dist, '_headers'), 'utf8'));
const matches = (pattern: string, path: string) =>
  pattern.endsWith('/*') ? path.startsWith(pattern.slice(0, -1)) || path === pattern.slice(0, -2) : pattern === path;

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let path = decodeURIComponent(url.pathname);
  if (path === '/') path = '/index.html';
  // Nur für lokale Browsertests: Beispielmodelle aus spikes/fixtures unter /__fixtures__/ und eigene Testdateien aus
  // .local/test-inputs unter /__local__/ bereitstellen (dort liegen zum Beispiel fremde Fahrzeuge, die nie ins Repo gehören).
  const mounts: Record<string, string> = {
    '/__fixtures__': join(root, 'spikes', 'fixtures'),
    '/__local__': join(root, '.local', 'test-inputs'),
  };
  const mount = Object.keys(mounts).find((m) => path.startsWith(m + '/'));
  const base = mount ? mounts[mount]! : dist;
  const file = resolve(base, '.' + (mount ? path.slice(mount.length) : path));
  const inside = file === base || file.startsWith(base + sep);
  const found = inside && existsSync(file) && statSync(file).isFile() ? file : null;

  for (const rule of rules) {
    if (matches(rule.pattern, path)) for (const [name, value] of rule.headers) res.setHeader(name, value);
  }
  if (!found) {
    res.statusCode = 404;
    res.end('Nicht gefunden');
    return;
  }
  res.setHeader('Content-Type', types[extname(found)] ?? 'application/octet-stream');
  res.end(readFileSync(found));
}).listen(port, '127.0.0.1', () => console.log(`dist auf http://127.0.0.1:${port}/ (mit Headern aus _headers)`));
