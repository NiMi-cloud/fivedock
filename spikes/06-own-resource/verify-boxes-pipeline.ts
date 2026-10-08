/**
 * Kollision aus mehreren Boxen durch die komplette Prop-Pipeline: Ein U-förmiges Modell wird gebaut, CodeWalker liest
 * das YDR, und im XML müssen mehrere Box-Kinder stehen, die das Modell abdecken und die Lücke freilassen.
 *
 *   node spikes/06-own-resource/verify-boxes-pipeline.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildPropResource } from '../../packages/forge-core/src/index.ts';
import type { ModelData } from '../../packages/forge-core/src/index.ts';

const root = resolve(import.meta.dirname, '..', '..');
const dotnet = join(root, '.dotnet', 'dotnet.exe');
const oracle = join(root, '.local', 'oracle', 'bin', 'Release', 'net10.0', 'Oracle.dll');
const outDir = join(root, '.local', 'verify', 'boxes-pipeline');

if (!existsSync(dotnet) || !existsSync(oracle)) {
  console.log('ÜBERSPRUNGEN: lokales Vergleichswerkzeug fehlt (.local/).');
  process.exit(0);
}
mkdirSync(outDir, { recursive: true });
const env = { ...process.env, DOTNET_ROOT: join(root, '.dotnet'), DOTNET_NOLOGO: '1' };

let failed = false;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'OK    ' : 'FEHLER'}  ${label}${detail ? ` – ${detail}` : ''}`);
  if (!ok) failed = true;
}

/** Boden und zwei Pfosten (Maße in Metern): 4 x 1 x 3, in der Mitte eine Lücke. */
function uShape(): ModelData {
  const boxes: Array<[number, number, number, number, number, number]> = [
    [0, 0, 0, 4, 1, 1],
    [0, 0, 1, 1, 1, 3],
    [3, 0, 1, 4, 1, 3],
  ];
  const parts = boxes.map(([x0, y0, z0, x1, y1, z1], i) => {
    const positions = new Float32Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]);
    const indices = new Uint32Array([0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]);
    const normals = new Float32Array(24);
    for (let v = 0; v < 8; v++) normals[v * 3 + 2] = 1;
    return { name: `b${i}`, positions, normals, uvs: new Float32Array(16), indices, materialIndex: 0 };
  });
  return { name: 'ushape', parts, materials: [{ name: 'm', baseColor: [0.6, 0.6, 0.6, 1], textureIndex: null }], textures: [] };
}

const resource = await buildPropResource(uShape(), { name: 'ushape', collision: 'boxes', lodLevels: 1 });
const file = resource.files.find((f) => f.path === 'stream/ushape.ydr')!;
writeFileSync(join(outDir, 'ushape.ydr'), file.data);
try {
  execFileSync(dotnet, [oracle, 'ydr2xml', join(outDir, 'ushape.ydr'), join(outDir, 'ushape.ydr.xml')], { env, stdio: 'pipe' });
  check('CodeWalker liest das YDR mit Mehrfach-Boxen', true);
} catch (e) {
  check('CodeWalker liest das YDR mit Mehrfach-Boxen', false, String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 400));
  process.exit(1);
}

const xml = readFileSync(join(outDir, 'ushape.ydr.xml'), 'utf8');
const vec = (text: string, tag: string) => {
  const m = new RegExp(`<${tag} x="([^"]+)" y="([^"]+)" z="([^"]+)"`).exec(text)!;
  return [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number];
};
const children = [...xml.matchAll(/<Item type="Box">([\s\S]*?)<\/Item>/g)].map((m) => {
  const body = m[1]!;
  const half = vec(body, 'BoxMax');
  const matrix = /<CompositeTransform>\s*([\s\S]*?)<\/CompositeTransform>/.exec(body)![1]!.trim().split(/\s+/).map(Number);
  const centre = [matrix[12]!, matrix[13]!, matrix[14]!];
  return { min: centre.map((c, k) => c - half[k]!), max: centre.map((c, k) => c + half[k]!) };
});

check(`Mehrere Box-Kinder (gefunden: ${children.length})`, children.length > 1 && children.length <= 16);
const inside = (x: number, y: number, z: number) => children.some((b) => x >= b.min[0]! && x <= b.max[0]! && y >= b.min[1]! && y <= b.max[1]! && z >= b.min[2]! && z <= b.max[2]!);
check('Pfosten und Boden sind abgedeckt', inside(0.5, 0.5, 2) && inside(3.5, 0.5, 2) && inside(2, 0.5, 0.5));
check('Die Lücke zwischen den Pfosten ist frei', !inside(2, 0.5, 2));
const composite = /<Bounds type="Composite">([\s\S]*?)<Children>/.exec(xml)![1]!;
const boxMin = vec(composite, 'BoxMin');
const boxMax = vec(composite, 'BoxMax');
const close = (a: number[], b: number[]) => a.every((v, k) => Math.abs(v - b[k]!) < 1e-4);
check('Komposit umschließt das Modell (0,0,0 bis 4,1,3)', close(boxMin, [0, 0, 0]) && close(boxMax, [4, 1, 3]), `${boxMin} bis ${boxMax}`);
console.log(`INFO    Boxen: ${children.map((b) => `[${b.min.map((v) => v.toFixed(2))} - ${b.max.map((v) => v.toFixed(2))}]`).join(' ')}`);

process.exit(failed ? 1 : 0);
