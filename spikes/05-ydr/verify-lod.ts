/**
 * Gegenprobe für Detailstufen: Ein dichtes Modell wird mit drei Stufen gebaut, CodeWalker liest die Datei,
 * und die Dreieckszahlen der Stufen werden aus dem zurückgelesenen XML gezählt.
 *
 *   node spikes/05-ydr/verify-lod.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildPropResource } from '../../packages/forge-core/src/index.ts';
import type { ModelData } from '../../packages/forge-core/src/index.ts';

const root = resolve(import.meta.dirname, '..', '..');
const dotnet = join(root, '.dotnet', 'dotnet.exe');
const oracle = join(root, '.local', 'oracle', 'bin', 'Release', 'net10.0', 'Oracle.dll');
const outDir = join(root, '.local', 'verify', 'lod');

if (!existsSync(dotnet) || !existsSync(oracle)) {
  console.log('ÜBERSPRUNGEN: lokales Vergleichswerkzeug fehlt (.local/).');
  process.exit(0);
}
mkdirSync(outDir, { recursive: true });

// Gewölbte Platte mit 3200 Dreiecken.
const n = 40;
const w = n + 1;
const positions = new Float32Array(w * w * 3);
const normals = new Float32Array(w * w * 3);
const uvs = new Float32Array(w * w * 2);
for (let y = 0; y < w; y++) {
  for (let x = 0; x < w; x++) {
    const i = y * w + x;
    positions.set([x / n, y / n, 0.1 * Math.sin((x / n) * Math.PI) * Math.sin((y / n) * Math.PI)], i * 3);
    normals.set([0, 0, 1], i * 3);
    uvs.set([x / n, y / n], i * 2);
  }
}
const idx: number[] = [];
for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
  const a = y * w + x;
  idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
}
const model: ModelData = {
  name: 'plate',
  parts: [{ name: 'p', positions, normals, uvs, indices: Uint32Array.from(idx), materialIndex: 0 }],
  materials: [{ name: 'm', baseColor: [0.4, 0.5, 0.6, 1], textureIndex: null }],
  textures: [],
};

const resource = await buildPropResource(model, { name: 'plate', collision: 'box', lodLevels: 3 });
const ydr = resource.files.find((f) => f.path === 'stream/plate.ydr')!.data;
writeFileSync(join(outDir, 'plate.ydr'), ydr);

const env = { ...process.env, DOTNET_ROOT: join(root, '.dotnet'), DOTNET_NOLOGO: '1' };
let ok = true;
try {
  execFileSync(dotnet, [oracle, 'ydr2xml', join(outDir, 'plate.ydr'), join(outDir, 'plate.ydr.xml')], { env, stdio: 'pipe' });
  console.log('OK      CodeWalker liest das YDR mit drei Detailstufen');
} catch (e) {
  console.log('FEHLER  CodeWalker kann die Datei nicht lesen:\n' + String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 800));
  process.exit(1);
}

const xml = readFileSync(join(outDir, 'plate.ydr.xml'), 'utf8');
const section = (tag: string) => new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1] ?? '';
const triangles = (tag: string) => {
  const body = section(tag);
  const indices = [...body.matchAll(/<IndexBuffer>\s*<Data>([\s\S]*?)<\/Data>/g)].map((m) => m[1]!.trim().split(/\s+/).length);
  return indices.reduce((s, c) => s + c / 3, 0);
};
const high = triangles('DrawableModelsHigh');
const med = triangles('DrawableModelsMedium');
const low = triangles('DrawableModelsLow');
console.log(`INFO    Dreiecke: hoch ${high}, mittel ${med}, niedrig ${low}`);
const lodDist = ['LodDistHigh', 'LodDistMed', 'LodDistLow'].map((t) => Number(new RegExp(`<${t} value="([^"]+)"`).exec(xml)?.[1]));
console.log(`INFO    Entfernungen: hoch ${lodDist[0]}, mittel ${lodDist[1]}, niedrig ${lodDist[2]}`);

const check = (label: string, pass: boolean) => {
  console.log(`${pass ? 'OK    ' : 'FEHLER'}  ${label}`);
  if (!pass) ok = false;
};
check('Hohe Stufe hat alle 3200 Dreiecke', high === 3200);
check('Mittlere Stufe ist deutlich kleiner als die hohe', med > 0 && med < high * 0.7);
check('Niedrige Stufe ist kleiner als die mittlere', low > 0 && low < med);
check('Entfernungen steigen von hoch über mittel zu niedrig', lodDist[0]! < lodDist[1]! && lodDist[1]! < lodDist[2]!);
process.exit(ok ? 0 : 1);
