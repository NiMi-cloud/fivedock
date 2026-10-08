/**
 * Gegenprobe für die Kollision aus mehreren Boxen mit einer echten Sollumz-Ausgabe (drei außermittige Boxen).
 *
 *  1. CodeWalker baut aus dem Sollumz-XML die Referenz-Binärdatei. Wir bauen dieselbe Szene mit unserem Schreiber.
 *     CodeWalker liest beide, die XML-Ausgaben müssen bis auf Rundungsfehler gleich sein.
 *  2. Dazu ein Vergleich auf Binärebene: Felder, die im XML nicht erscheinen (Begrenzungsfeld der Kinder, zweiter
 *     Transformationszeiger, Flags), stehen in beiden Dateien gleich.
 *
 * Die Referenz entsteht mit .local/scripts/make_reference_boxes.py (Blender + Sollumz).
 *
 *   node spikes/05-ydr/verify-boxes.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildYdr, parseResource, simpleShader } from '../../packages/rage-formats/src/index.ts';

const root = resolve(import.meta.dirname, '..', '..');
const dotnet = join(root, '.dotnet', 'dotnet.exe');
const oracle = join(root, '.local', 'oracle', 'bin', 'Release', 'net10.0', 'Oracle.dll');
const refXmlPath = join(root, '.local', 'reference-exports', 'forge_boxes', 'gen8', 'forge_boxes.ydr.xml');
const outDir = join(root, '.local', 'verify', 'boxes');

if (!existsSync(dotnet) || !existsSync(oracle) || !existsSync(refXmlPath)) {
  console.log('ÜBERSPRUNGEN: lokales Vergleichswerkzeug oder Referenz fehlt (.local/).');
  process.exit(0);
}
mkdirSync(outDir, { recursive: true });
const env = { ...process.env, DOTNET_ROOT: join(root, '.dotnet'), DOTNET_NOLOGO: '1' };
const run = (mode: string, input: string, output: string) => execFileSync(dotnet, [oracle, mode, input, output], { env, stdio: 'pipe' });

let failed = false;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'OK    ' : 'FEHLER'}  ${label}${detail ? ` – ${detail}` : ''}`);
  if (!ok) failed = true;
}

const nums = (text: string) => text.trim().split(/\s+/).map(Number);

// Würfel-Geometrie aus der Referenz
const refXml = readFileSync(refXmlPath, 'utf8');
const v = nums(/<VertexBuffer>[\s\S]*?<Data>([\s\S]*?)<\/Data>/.exec(refXml)![1]!);
const indices = nums(/<IndexBuffer>\s*<Data>([\s\S]*?)<\/Data>/.exec(refXml)![1]!);
const count = v.length / 12;
const positions = new Float32Array(count * 3);
const normals = new Float32Array(count * 3);
const colors = new Uint8Array(count * 4);
const uvs = new Float32Array(count * 2);
for (let i = 0; i < count; i++) {
  positions.set(v.slice(i * 12, i * 12 + 3), i * 3);
  normals.set(v.slice(i * 12 + 3, i * 12 + 6), i * 3);
  colors.set(v.slice(i * 12 + 6, i * 12 + 10), i * 4);
  uvs.set(v.slice(i * 12 + 10, i * 12 + 12), i * 2);
}

// Dieselben drei Boxen wie im Blender-Skript: (Mittelpunkt, Abmessungen)
const boxes: [[number, number, number], [number, number, number]][] = [
  [[0.3, 0, 0.2], [0.2, 0.3, 0.4]],
  [[-0.25, 0.1, 0.6], [0.3, 0.2, 0.2]],
  [[0, -0.3, 1.0], [0.5, 0.1, 0.3]],
];
const children = boxes.map(([c, d]) => ({
  type: 'box' as const,
  min: [c[0] - d[0] / 2, c[1] - d[1] / 2, c[2] - d[2] / 2] as [number, number, number],
  max: [c[0] + d[0] / 2, c[1] + d[1] / 2, c[2] + d[2] / 2] as [number, number, number],
}));

const ours = buildYdr({
  name: 'forge_boxes',
  shaders: [simpleShader('opaque', 'forge_boxes_diffuse')],
  high: [{ geometries: [{ positions, normals, colors, uvs, indices, shader: 0 }] }],
  collision: { children },
});
writeFileSync(join(outDir, 'ours.ydr'), ours);
writeFileSync(join(outDir, 'reference.ydr.xml'), refXml);
run('ydr', join(outDir, 'reference.ydr.xml'), join(outDir, 'reference.ydr'));
run('ydr2xml', join(outDir, 'reference.ydr'), join(outDir, 'reference.roundtrip.xml'));

let readable = true;
try {
  run('ydr2xml', join(outDir, 'ours.ydr'), join(outDir, 'ours.roundtrip.xml'));
} catch (e) {
  readable = false;
  console.log(String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 1200));
}
check('CodeWalker liest unser YDR mit drei Boxen', readable);

// --- 1. XML-Vergleich mit Toleranz für Rundungsfehler -------------------------------------------------------
/** Zerlegt Text in Zahlen und Rest. */
function tokens(text: string): (string | number)[] {
  const out: (string | number)[] = [];
  const re = /-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi;
  let last = 0;
  for (const m of text.replace(/\r\n/g, '\n').matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(Number(m[0]));
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
const TOLERANCE = 2e-6;
if (readable) {
  const a = readFileSync(join(outDir, 'ours.roundtrip.xml'), 'utf8').replace(/\r\n/g, '\n').split('\n');
  const b = readFileSync(join(outDir, 'reference.roundtrip.xml'), 'utf8').replace(/\r\n/g, '\n').split('\n');
  let mismatches = a.length === b.length ? 0 : 1;
  let maxError = 0;
  const lines: string[] = a.length === b.length ? [] : [`  Zeilenzahl: unser ${a.length}, Referenz ${b.length}`];
  // Zeile für Zeile, damit eine Zahl in Exponentenschreibweise (1E-08) die übrigen nicht verschiebt
  for (let n = 0; n < Math.min(a.length, b.length); n++) {
    const ta = tokens(a[n]!);
    const tb = tokens(b[n]!);
    let lineOk = ta.length === tb.length;
    for (let i = 0; lineOk && i < ta.length; i++) {
      const x = ta[i];
      const y = tb[i];
      if (typeof x === 'number' && typeof y === 'number') {
        const err = Math.abs(x - y);
        maxError = Math.max(maxError, err);
        if (err > TOLERANCE) lineOk = false;
      } else if (x !== y) {
        lineOk = false;
      }
    }
    if (!lineOk) {
      mismatches++;
      if (lines.length < 12) lines.push(`  Zeile ${n + 1}:\n    unser:    ${a[n]}\n    Referenz: ${b[n]}`);
    }
  }
  check('XML gleich der Sollumz-Referenz (Zahlen auf 2e-6 genau)', mismatches === 0, `größte Abweichung ${maxError.toExponential(2)}`);
  if (mismatches > 0) console.log(lines.join('\n'));
}

// --- 2. Binärvergleich ----------------------------------------------------------------------------------------
const SYSTEM_BASE = 0x50000000;
interface Composite {
  base: number[];
  children: number[][];
  transforms: number[];
  boxes: number[];
  boxesRawW: number[];
  flags1: number[];
  flags2: number[];
  transform2: 'null' | 'same' | 'other';
  counts: [number, number];
}
function readComposite(file: Uint8Array): Composite {
  const { system } = parseResource(file);
  const view = new DataView(system.buffer, system.byteOffset, system.byteLength);
  const off = (address: number) => address - SYSTEM_BASE;
  const ptr = (o: number) => Number(view.getBigUint64(o, true));
  const f32 = (o: number) => view.getFloat32(o, true);
  const baseFields = (o: number) => [
    view.getUint8(o + 0x10), f32(o + 0x14), f32(o + 0x20), f32(o + 0x24), f32(o + 0x28), f32(o + 0x2c),
    f32(o + 0x30), f32(o + 0x34), f32(o + 0x38), view.getUint32(o + 0x3c, true),
    f32(o + 0x40), f32(o + 0x44), f32(o + 0x48), view.getUint8(o + 0x4c),
    f32(o + 0x50), f32(o + 0x54), f32(o + 0x58), f32(o + 0x60), f32(o + 0x64), f32(o + 0x68), f32(o + 0x6c),
  ];
  const c = off(ptr(0xc8));
  const n = view.getUint16(c + 0xa0, true);
  const count2 = view.getUint16(c + 0xa2, true);
  const childArray = off(ptr(c + 0x70));
  const t1 = ptr(c + 0x78);
  const t2 = ptr(c + 0x80);
  const boxes = off(ptr(c + 0x88));
  const f1 = off(ptr(c + 0x90));
  const f2 = off(ptr(c + 0x98));
  return {
    base: baseFields(c),
    children: Array.from({ length: n }, (_, i) => baseFields(off(ptr(childArray + i * 8)))),
    transforms: Array.from({ length: n * 16 }, (_, i) => (i % 4 === 3 ? view.getUint32(off(t1) + i * 4, true) : f32(off(t1) + i * 4))),
    boxes: Array.from({ length: n * 8 }, (_, i) => (i % 8 === 3 ? 0 : f32(boxes + i * 4))),
    boxesRawW: Array.from({ length: n }, (_, i) => view.getUint32(boxes + i * 32 + 12, true)),
    flags1: Array.from({ length: n * 2 }, (_, i) => view.getUint32(f1 + i * 4, true)),
    flags2: Array.from({ length: n * 2 }, (_, i) => view.getUint32(f2 + i * 4, true)),
    transform2: t2 === 0 ? 'null' : t2 === t1 ? 'same' : 'other',
    counts: [n, count2],
  };
}

if (readable) {
  const a = readComposite(ours);
  const b = readComposite(new Uint8Array(readFileSync(join(outDir, 'reference.ydr'))));
  const compare = (label: string, x: number[], y: number[]) => {
    let worst = 0;
    let at = -1;
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = Math.abs((x[i] ?? NaN) - (y[i] ?? NaN));
      if (!(d <= worst)) {
        worst = Number.isNaN(d) ? Infinity : d;
        at = i;
      }
    }
    check(`Binär: ${label}`, worst <= TOLERANCE, worst > TOLERANCE ? `Feld ${at}: unser ${x[at]}, Referenz ${y[at]}` : '');
  };
  compare('Komposit (Typ, Radius, Box, Margin, Mittelpunkt, Schwerpunkt, Trägheit, Volumen)', a.base, b.base);
  a.children.forEach((c, i) => compare(`Kind ${i} (Basisfelder)`, c, b.children[i] ?? []));
  compare('Transformationen (Verschiebung und Flag-Spalte)', a.transforms, b.transforms);
  compare('Begrenzungsfeld der Kinder (lokale Boxen und Margin)', a.boxes, b.boxes);
  check('Binär: Begrenzungsfeld, w-Wert der Min-Zeile gleich', JSON.stringify(a.boxesRawW) === JSON.stringify(b.boxesRawW), `unser ${a.boxesRawW}, Referenz ${b.boxesRawW}`);
  check('Binär: Kollisionsgruppen gleich', JSON.stringify([a.flags1, a.flags2]) === JSON.stringify([b.flags1, b.flags2]));
  check('Binär: Anzahl der Kinder gleich', JSON.stringify(a.counts) === JSON.stringify(b.counts), `unser ${a.counts}, Referenz ${b.counts}`);
  console.log(`INFO    zweiter Transformationszeiger: unser ${a.transform2}, Referenz ${b.transform2}`);
}

process.exit(failed ? 1 : 0);
