import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import { missingLegalFields, readOperator, variableName } from './src/legal.config.ts';

/**
 * Bricht den Produktions-Build ab, solange die Betreiberangaben für das Impressum fehlen. Sie kommen aus Umgebungsvariablen
 * (VITE_OPERATOR_*, auch aus apps/web/.env.local), siehe src/legal.config.ts.
 * Zum Testen des Builds ohne Angaben: ALLOW_INCOMPLETE_LEGAL=1 setzen.
 */
function requireLegalInfo(): Plugin {
  let env: Record<string, string | undefined> = {};
  return {
    name: 'require-legal-info',
    apply: 'build',
    configResolved(config) {
      env = { ...loadEnv(config.mode, config.envDir || config.root, 'VITE_'), ...process.env };
    },
    buildStart() {
      const missing = missingLegalFields(readOperator(env));
      if (missing.length > 0 && process.env.ALLOW_INCOMPLETE_LEGAL !== '1') {
        this.error(
          `Impressum unvollständig: ${missing.map(variableName).join(', ')} fehlt. Die Angaben gehören in Umgebungsvariablen ` +
            '(auf GitHub: Repository-Variablen OPERATOR_NAME usw., lokal: apps/web/.env.local), siehe src/legal.config.ts. ' +
            'Nur für Testbuilds: ALLOW_INCOMPLETE_LEGAL=1 setzen.',
        );
      }
    },
  };
}
/**
 * RAR- und 7z-Archive entpackt libarchive.js in einem Web Worker. Der Worker lädt seine WebAssembly-Datei relativ zu sich selbst,
 * beide müssen deshalb unter festen Namen im selben Ordner liegen (Vite würde sie sonst mit Hash-Namen trennen).
 * Im Entwicklungsserver und im Build landen sie unter /libarchive/.
 */
function libarchiveAssets(): Plugin {
  const dist = join(import.meta.dirname, 'node_modules', 'libarchive.js', 'dist');
  const files: Record<string, string> = { 'worker-bundle.js': 'text/javascript', 'libarchive.wasm': 'application/wasm' };
  return {
    name: 'libarchive-assets',
    configureServer(server) {
      server.middlewares.use('/libarchive/', (req, res, next) => {
        const name = (req.url ?? '').split('?')[0]!.replace(/^\//, '');
        const type = files[name];
        if (!type) return next();
        res.setHeader('Content-Type', type);
        res.end(readFileSync(join(dist, name)));
      });
    },
    generateBundle() {
      for (const name of Object.keys(files)) {
        this.emitFile({ type: 'asset', fileName: `libarchive/${name}`, source: readFileSync(join(dist, name)) });
      }
    },
  };
}

/**
 * GitHub Pages kann keine eigenen Antwort-Header setzen (die Datei public/_headers gilt nur bei Cloudflare Pages und Netlify).
 * Damit die strenge Content-Security-Policy trotzdem greift, wird sie beim Build zusätzlich als meta-Tag in die Seite geschrieben.
 * `frame-ancestors` gibt es im meta-Tag nicht, es bleibt den echten Headern vorbehalten.
 */
function policyAsMeta(): Plugin {
  return {
    name: 'policy-as-meta',
    apply: 'build',
    transformIndexHtml() {
      const headers = readFileSync(join(import.meta.dirname, 'public', '_headers'), 'utf8');
      const line = /Content-Security-Policy:\s*(.+)/.exec(headers)?.[1];
      if (!line) return;
      const policy = line.split(';').map((d) => d.trim()).filter((d) => d && !d.startsWith('frame-ancestors')).join('; ');
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }];
    },
  };
}

/**
 * Basispfad der Seite. Auf GitHub Pages liegt sie unter /<Repository>/, deshalb setzt der Deploy-Workflow PAGES_BASE.
 * Lokal und bei einer eigenen Domain ist es "/".
 */
const base = process.env.PAGES_BASE || '/';

export default defineConfig({
  base,
  plugins: [react(), requireLegalInfo(), libarchiveAssets(), policyAsMeta()],
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022' },
});
