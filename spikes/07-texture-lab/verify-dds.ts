/**
 * Gegenprobe für den DDS-Leser mit einer fremden Quelle: CodeWalker exportiert die Texturen des YTD aus
 * verify-read.ts als DDS-Dateien (mit seinem eigenen Schreiber). Unser Leser muss daraus dieselben
 * Größen, Formate, Mip-Zahlen und Pixel gewinnen wie unser YTD-Leser aus dem YTD selbst.
 *
 *   node spikes/07-texture-lab/verify-read.ts   (einmalig, erzeugt die Eingabe)
 *   node spikes/07-texture-lab/verify-dds.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readDds, readYtd } from '../../packages/rage-formats/src/index.ts';

const root = resolve(import.meta.dirname, '..', '..');
const dotnet = join(root, '.dotnet', 'dotnet.exe');
const oracle = join(root, '.local', 'oracle', 'bin', 'Release', 'net10.0', 'Oracle.dll');
const input = join(root, '.local', 'verify', 'read', 'codewalker.ytd');
const outDir = join(root, '.local', 'verify', 'dds');

if (!existsSync(dotnet) || !existsSync(oracle) || !existsSync(input)) {
  console.log('ÜBERSPRUNGEN: Vergleichswerkzeug oder Eingabe fehlt (erst verify-read.ts ausführen).');
  process.exit(0);
}
mkdirSync(outDir, { recursive: true });
execFileSync(dotnet, [oracle, 'ytd2xml', input, join(outDir, 'cw.xml')], {
  env: { ...process.env, DOTNET_ROOT: join(root, '.dotnet'), DOTNET_NOLOGO: '1' },
  stdio: 'pipe',
});

let failed = false;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'OK    ' : 'FEHLER'}  ${label}${detail ? ` – ${detail}` : ''}`);
  if (!ok) failed = true;
}

const exported = readdirSync(outDir).filter((f) => f.toLowerCase().endsWith('.dds'));
check('CodeWalker hat DDS-Dateien exportiert', exported.length > 0, `${exported.length} Dateien`);

for (const tex of readYtd(new Uint8Array(readFileSync(input)))) {
  const file = join(outDir, `${tex.name}.dds`);
  if (!existsSync(file)) {
    check(`${tex.name}: DDS vorhanden`, false);
    continue;
  }
  const dds = readDds(new Uint8Array(readFileSync(file)));
  const same = dds.width === tex.width && dds.height === tex.height && dds.declaredLevels === tex.levels && dds.format === tex.format;
  check(
    `${tex.name}: ${dds.width}x${dds.height}, ${dds.declaredLevels} Stufen laut Kopf (${dds.levels} vollständig), ${dds.format}`,
    same,
    same ? '' : `erwartet ${tex.width}x${tex.height}, ${tex.levels} Stufen, ${tex.format}`,
  );
  // CodeWalker kürzt bei Blockformaten die kleinsten Stufen: nur die vollständigen Stufen müssen exakt übereinstimmen.
  const leading = tex.data.subarray(0, dds.data.length);
  check(`${tex.name}: Pixeldaten der vollständigen Stufen stimmen mit dem YTD überein`, Buffer.compare(Buffer.from(dds.data), Buffer.from(leading)) === 0);
  if (dds.levels < dds.declaredLevels) console.log(`INFO    ${tex.name}: ${dds.declaredLevels - dds.levels} kleinste Stufe(n) im DDS von CodeWalker gekürzt`);
}

process.exit(failed ? 1 : 0);
