/**
 * Gegenprobe: Unser selbst geschriebenes YTD wird vom lokalen Vergleichswerkzeug (CodeWalker) gelesen
 * und mit der Referenz verglichen. Das Werkzeug liegt nur lokal in .local/ (nicht im Repo).
 *
 *   node spikes/03-ytd-verify/verify-ytd.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildMipChain, buildYtd, packBgra, parseResource } from '../../packages/rage-formats/src/index.ts';

const root = resolve(import.meta.dirname, '..', '..');
const dotnet = join(root, '.dotnet', 'dotnet.exe');
const oracle = join(root, '.local', 'oracle', 'bin', 'Release', 'net10.0', 'Oracle.dll');
const refDir = join(root, '.local', 'reference-exports', 'cube', 'ytd');
const outDir = join(root, '.local', 'verify');

if (!existsSync(dotnet) || !existsSync(oracle) || !existsSync(join(refDir, 'forge_cube.ytd'))) {
  console.log('ÜBERSPRUNGEN: lokales Vergleichswerkzeug oder Referenzdateien fehlen (.local/).');
  process.exit(0);
}
mkdirSync(outDir, { recursive: true });

// Dieselbe Textur wie in der Referenz (siehe spikes/02-cube-prop/make-cube-texture.ts).
const size = 64;
const data = new Uint8Array(size * size * 4);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const on = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
    const c = on ? 0.85 : 0.15;
    const i = (y * size + x) * 4;
    data[i] = Math.round(c * 255);
    data[i + 1] = Math.round(c * 0.6 * 255);
    data[i + 2] = Math.round(0.2 * 255);
    data[i + 3] = 255;
  }
}
const chain = buildMipChain({ width: size, height: size, data });
const pixels = packBgra(chain);

const ours = buildYtd([
  { name: 'forge_cube_diffuse', width: size, height: size, levels: chain.length, format: 'A8R8G8B8', data: pixels },
]);
const oursPath = join(outDir, 'ours.ytd');
writeFileSync(oursPath, ours);

// 1. CodeWalker liest unser YTD und schreibt XML.
const xmlPath = join(outDir, 'ours.ytd.xml');
execFileSync(dotnet, [oracle, 'ytd2xml', oursPath, xmlPath], { env: { ...process.env, DOTNET_ROOT: join(root, '.dotnet'), DOTNET_NOLOGO: '1' }, stdio: 'pipe' });
const oursXml = readFileSync(xmlPath, 'utf8').replace(/\r\n/g, '\n').trim();
const refXml = readFileSync(join(refDir, 'roundtrip.ytd.xml'), 'utf8').replace(/\r\n/g, '\n').trim();

let failed = false;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'OK    ' : 'FEHLER'}  ${label}${detail ? ` – ${detail}` : ''}`);
  if (!ok) failed = true;
}

check('CodeWalker liest unser YTD ohne Fehler', true);
check('XML ist identisch mit dem der Referenz (Name, Größe, Mips, Format, Usage)', oursXml === refXml);
if (oursXml !== refXml) {
  console.log('--- unser XML ---\n' + oursXml + '\n--- Referenz-XML ---\n' + refXml);
}

// 2. Pixeldaten: Referenz-Grafikspeicher beginnt mit derselben Mip-Kette.
const ref = parseResource(new Uint8Array(readFileSync(join(refDir, 'forge_cube.ytd'))));
const refPixels = ref.graphics.subarray(0, pixels.length);
check('Pixeldaten (21.844 Byte) stimmen mit der Referenz überein', Buffer.compare(Buffer.from(refPixels), Buffer.from(pixels)) === 0);

// 3. Größe der fertigen Datei im Vergleich.
console.log(`INFO    unsere Datei: ${ours.length} Byte, Referenz: ${readFileSync(join(refDir, 'forge_cube.ytd')).length} Byte`);

process.exit(failed ? 1 : 0);
