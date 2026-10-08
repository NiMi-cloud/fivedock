/**
 * Gegenprobe: Unser selbst geschriebenes YDR wird vom lokalen Vergleichswerkzeug (CodeWalker) gelesen
 * und mit dem verglichen, was CodeWalker aus dem Sollumz-Referenz-XML (ohne Kollision) selbst baut.
 * Geprüft werden drei Shader-Varianten (opak, Alpha-Test, Überblendung) und zusätzlich die Box-Kollision.
 *
 *   node spikes/05-ydr/verify-ydr.ts
 *
 * Die Referenzen für Alpha-Test und Überblendung entstehen mit .local/scripts/make_reference_shader.py (Blender + Sollumz).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildYdr, simpleShader } from '../../packages/rage-formats/src/index.ts';
import type { SimpleShaderKind } from '../../packages/rage-formats/src/index.ts';

const root = resolve(import.meta.dirname, '..', '..');
const dotnet = join(root, '.dotnet', 'dotnet.exe');
const oracle = join(root, '.local', 'oracle', 'bin', 'Release', 'net10.0', 'Oracle.dll');
const refs = join(root, '.local', 'reference-exports');
const outDir = join(root, '.local', 'verify', 'ydr');

const cases: { label: string; kind: SimpleShaderKind; name: string; xml: string }[] = [
  { label: 'opak (default.sps)', kind: 'opaque', name: 'forge_cube', xml: join(refs, 'cube', 'gen8', 'forge_cube.ydr.xml') },
  { label: 'Alpha-Test (cutout.sps)', kind: 'cutout', name: 'forge_cutout', xml: join(refs, 'forge_cutout', 'gen8', 'forge_cutout.ydr.xml') },
  { label: 'Überblendung (alpha.sps)', kind: 'alpha', name: 'forge_alpha', xml: join(refs, 'forge_alpha', 'gen8', 'forge_alpha.ydr.xml') },
];

if (!existsSync(dotnet) || !existsSync(oracle) || !existsSync(cases[0]!.xml)) {
  console.log('ÜBERSPRUNGEN: lokales Vergleichswerkzeug oder Referenzdateien fehlen (.local/).');
  process.exit(0);
}
mkdirSync(outDir, { recursive: true });
const env = { ...process.env, DOTNET_ROOT: join(root, '.dotnet'), DOTNET_NOLOGO: '1' };
const run = (mode: string, input: string, output: string) => execFileSync(dotnet, [oracle, mode, input, output], { env, stdio: 'pipe' });
const norm = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n').trim();

let failed = false;
function check(label: string, ok: boolean) {
  console.log(`${ok ? 'OK    ' : 'FEHLER'}  ${label}`);
  if (!ok) failed = true;
}

function showDifferences(a: string, b: string) {
  const al = a.split('\n');
  const bl = b.split('\n');
  let shown = 0;
  for (let i = 0; i < Math.max(al.length, bl.length) && shown < 12; i++) {
    if (al[i] !== bl[i]) {
      console.log(`  Zeile ${i + 1}:\n    unser:     ${al[i]}\n    Referenz:  ${bl[i]}`);
      shown++;
    }
  }
}

const nums = (text: string) => text.trim().split(/\s+/).map(Number);

function readGeometry(xml: string) {
  const vertexText = /<VertexBuffer>[\s\S]*?<Data>([\s\S]*?)<\/Data>/.exec(xml)![1]!;
  const indexText = /<IndexBuffer>\s*<Data>([\s\S]*?)<\/Data>/.exec(xml)![1]!;
  const v = nums(vertexText);
  const vertexCount = v.length / 12;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Uint8Array(vertexCount * 4);
  const uvs = new Float32Array(vertexCount * 2);
  for (let i = 0; i < vertexCount; i++) {
    positions.set(v.slice(i * 12, i * 12 + 3), i * 3);
    normals.set(v.slice(i * 12 + 3, i * 12 + 6), i * 3);
    colors.set(v.slice(i * 12 + 6, i * 12 + 10), i * 4);
    uvs.set(v.slice(i * 12 + 10, i * 12 + 12), i * 2);
  }
  return { positions, normals, colors, uvs, indices: nums(indexText), vertexCount };
}

let boxGeometry: ReturnType<typeof readGeometry> | null = null;

for (const c of cases) {
  console.log(`\n--- ${c.label} ---`);
  if (!existsSync(c.xml)) {
    console.log(`ÜBERSPRUNGEN: Referenz fehlt (${c.xml}).`);
    continue;
  }
  // 1. Referenz ohne Kollision: Sollumz-XML, Bounds-Block entfernt, von CodeWalker gebaut und zurückgelesen.
  const refXml = readFileSync(c.xml, 'utf8');
  const refNoBoundsXml = join(outDir, `${c.name}.reference.ydr.xml`);
  writeFileSync(refNoBoundsXml, refXml.replace(/<Bounds[\s\S]*?<\/Bounds>\s*/, ''));
  run('ydr', refNoBoundsXml, join(outDir, `${c.name}.reference.ydr`));
  run('ydr2xml', join(outDir, `${c.name}.reference.ydr`), join(outDir, `${c.name}.reference.roundtrip.xml`));

  // 2. Geometrie aus dem Referenz-XML lesen, 3. unser Drawable bauen.
  const geo = readGeometry(refXml);
  if (c.kind === 'opaque') boxGeometry = geo;
  const ours = buildYdr({
    name: c.name,
    shaders: [simpleShader(c.kind, `${c.name}_diffuse`)],
    high: [{ geometries: [{ positions: geo.positions, normals: geo.normals, colors: geo.colors, uvs: geo.uvs, indices: geo.indices, shader: 0 }] }],
  });
  writeFileSync(join(outDir, `${c.name}.ours.ydr`), ours);
  let readable = true;
  try {
    run('ydr2xml', join(outDir, `${c.name}.ours.ydr`), join(outDir, `${c.name}.ours.roundtrip.xml`));
  } catch (e) {
    readable = false;
    console.log(String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 1200));
  }
  check('CodeWalker liest unser YDR ohne Fehler', readable);
  if (readable) {
    const a = norm(join(outDir, `${c.name}.ours.roundtrip.xml`));
    const b = norm(join(outDir, `${c.name}.reference.roundtrip.xml`));
    check('XML ist identisch zur Referenz ohne Kollision (Shader, Bucket, Parameter, Geometrie)', a === b);
    if (a !== b) showDifferences(a, b);
  }
  console.log(`INFO    ${geo.vertexCount} Eckpunkte, ${geo.indices.length} Indizes, unsere Datei ${ours.length} Byte`);
}

// 4. Veraltet: Diese Box-Referenz hatte ich selbst abgeleitet (Komposit mit Margin, Box nicht lokal). Die Kollision wird jetzt
// in verify-boxes.ts gegen eine echte Sollumz-Ausgabe geprüft. Nur noch auf ausdrücklichen Wunsch: LEGACY_BOX_CHECK=1.
if (process.env.LEGACY_BOX_CHECK === '1' && boxGeometry) {
  console.log('\n--- Box-Kollision ---');
  const g = boxGeometry;
  execFileSync(process.execPath, [join(root, 'spikes', '05-ydr', 'make-box-reference.ts')], { stdio: 'pipe' });
  run('ydr', join(outDir, 'box.ydr.xml'), join(outDir, 'box.reference.ydr'));
  run('ydr2xml', join(outDir, 'box.reference.ydr'), join(outDir, 'box.reference.roundtrip.xml'));

  const withBox = buildYdr({
    name: 'forge_cube',
    shaders: [simpleShader('opaque', 'forge_cube_diffuse')],
    high: [{ geometries: [{ positions: g.positions, normals: g.normals, colors: g.colors, uvs: g.uvs, indices: g.indices, shader: 0 }] }],
    collision: { children: [{ type: 'box', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }] },
  });
  writeFileSync(join(outDir, 'box.ours.ydr'), withBox);
  let boxReadable = true;
  try {
    run('ydr2xml', join(outDir, 'box.ours.ydr'), join(outDir, 'box.ours.roundtrip.xml'));
  } catch (e) {
    boxReadable = false;
    console.log(String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 1200));
  }
  check('Mit Box-Kollision: CodeWalker liest unser YDR ohne Fehler', boxReadable);
  if (boxReadable) {
    const a = norm(join(outDir, 'box.ours.roundtrip.xml'));
    const b = norm(join(outDir, 'box.reference.roundtrip.xml'));
    check('Mit Box-Kollision: XML identisch zur Referenz', a === b);
    if (a !== b) showDifferences(a, b);
  }
  console.log(`INFO    Größe mit Box: unsere Datei ${withBox.length} Byte, Referenz ${readFileSync(join(outDir, 'box.reference.ydr')).length} Byte`);
}
process.exit(failed ? 1 : 0);
