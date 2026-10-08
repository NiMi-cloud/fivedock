/**
 * Gegenprobe: Unser selbst geschriebenes YTYP wird vom lokalen Vergleichswerkzeug (CodeWalker) gelesen
 * und mit Referenzdateien verglichen.
 *
 *   node spikes/04-ytyp/verify-ytyp.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildYtyp } from '../../packages/rage-formats/src/index.ts';

const root = resolve(import.meta.dirname, '..', '..');
const dotnet = join(root, '.dotnet', 'dotnet.exe');
const oracle = join(root, '.local', 'oracle', 'bin', 'Release', 'net10.0', 'Oracle.dll');
const refDir = join(root, '.local', 'reference-exports', 'cube', 'gen8');
const expDir = join(root, '.local', 'experiments');
const outDir = join(root, '.local', 'verify');

if (!existsSync(dotnet) || !existsSync(oracle) || !existsSync(join(refDir, 'forge_cube.ytyp'))) {
  console.log('ÜBERSPRUNGEN: lokales Vergleichswerkzeug oder Referenzdateien fehlen (.local/).');
  process.exit(0);
}
mkdirSync(outDir, { recursive: true });

const env = { ...process.env, DOTNET_ROOT: join(root, '.dotnet'), DOTNET_NOLOGO: '1' };
function toXml(binPath: string, xmlPath: string): string {
  execFileSync(dotnet, [oracle, 'ytyp2xml', binPath, xmlPath], { env, stdio: 'pipe' });
  return readFileSync(xmlPath, 'utf8').replace(/\r\n/g, '\n').trim();
}

let failed = false;
function check(label: string, ok: boolean) {
  console.log(`${ok ? 'OK    ' : 'FEHLER'}  ${label}`);
  if (!ok) failed = true;
}

// 1. Ein Archetyp, Werte wie im Sollumz-Referenzexport.
const one = buildYtyp('forge_cube', [
  {
    name: 'forge_cube',
    bbMin: [-0.5, -0.5, -0.5],
    bbMax: [0.5, 0.5, 0.5],
    bsCentre: [0, 0, 0],
    bsRadius: 0.8660254,
    lodDist: 200,
    hdTextureDist: 100,
    textureDictionary: 'forge_cube',
    physicsDictionary: 'forge_cube',
    assetType: 'drawable',
    assetName: 'forge_cube',
  },
]);
writeFileSync(join(outDir, 'one.ytyp'), one);
const oneXml = toXml(join(outDir, 'one.ytyp'), join(outDir, 'one.ytyp.xml'));
const refXml = readFileSync(join(refDir, 'roundtrip.ytyp.xml'), 'utf8').replace(/\r\n/g, '\n').trim();
check('Ein Archetyp: CodeWalker liest die Datei und das XML ist identisch zur Referenz', oneXml === refXml);
if (oneXml !== refXml) console.log('--- unser XML ---\n' + oneXml + '\n--- Referenz ---\n' + refXml);

// 2. Zwei Archetypen, verglichen mit der von CodeWalker aus XML gebauten Datei.
if (existsSync(join(expDir, 'two.ytyp'))) {
  const two = buildYtyp('two_props', [
    {
      name: 'prop_a',
      bbMin: [-0.5, -0.5, -0.5],
      bbMax: [0.5, 0.5, 0.5],
      bsCentre: [0, 0, 0],
      bsRadius: 0.8660254,
      lodDist: 200,
      hdTextureDist: 100,
      textureDictionary: 'prop_a',
      physicsDictionary: 'prop_a',
    },
    {
      name: 'prop_b',
      bbMin: [-1, -1, 0],
      bbMax: [1, 1, 2],
      bsCentre: [0, 0, 1],
      bsRadius: 1.5,
      lodDist: 150,
      hdTextureDist: 100,
      textureDictionary: 'prop_b',
      physicsDictionary: 'prop_b',
    },
  ]);
  writeFileSync(join(outDir, 'two.ytyp'), two);
  const ours = toXml(join(outDir, 'two.ytyp'), join(outDir, 'two.ytyp.xml'));
  const theirs = toXml(join(expDir, 'two.ytyp'), join(outDir, 'two-reference.ytyp.xml'));
  check('Zwei Archetypen: XML identisch zur Datei, die CodeWalker selbst gebaut hat', ours === theirs);
  if (ours !== theirs) console.log('--- unser XML ---\n' + ours + '\n--- CodeWalker ---\n' + theirs);
}

console.log(`INFO    Größe einer Datei mit einem Archetyp: ${one.length} Byte (Referenz: ${readFileSync(join(refDir, 'forge_cube.ytyp')).length} Byte)`);
process.exit(failed ? 1 : 0);
