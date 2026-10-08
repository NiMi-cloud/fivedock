/**
 * Gegenprobe für den YFT-Leser mit einer fremden Quelle: CodeWalker gibt ein Fahrzeug als XML aus, unser Leser muss
 * dieselben Knochen, Shader, Texturnamen und Geometrien (Eckpunkte, Indizes) liefern.
 *
 * Das Fahrzeug ist eine Fremddatei und liegt nur lokal in .local/vehicles/ (nicht im Repo). Ohne die Datei überspringt
 * sich das Skript.
 *
 *   node spikes/09-vehicle/verify-yft.ts [Ordnername in .local/vehicles, Standard 20fpiu] [Dateiname, Standard <Ordner>.yft]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readYft } from '../../packages/rage-formats/src/index.ts';

const root = resolve(import.meta.dirname, '..', '..');
const folder = process.argv[2] ?? '20fpiu';
const fileName = process.argv[3] ?? `${folder}.yft`;
const yftPath = join(root, '.local', 'vehicles', folder, 'stream', fileName);
const dotnet = join(root, '.dotnet', 'dotnet.exe');
const oracle = join(root, '.local', 'oracle', 'bin', 'Release', 'net10.0', 'Oracle.dll');
const outDir = join(root, '.local', 'verify', 'yft');
const xmlPath = join(outDir, `${fileName}.xml`);

if (!existsSync(yftPath) || !existsSync(dotnet) || !existsSync(oracle)) {
  console.log('ÜBERSPRUNGEN: Fahrzeugdatei oder Vergleichswerkzeug fehlt (.local/).');
  process.exit(0);
}
mkdirSync(outDir, { recursive: true });
if (!existsSync(xmlPath)) {
  execFileSync(dotnet, [oracle, 'yft2xml', yftPath, xmlPath], { env: { ...process.env, DOTNET_ROOT: join(root, '.dotnet'), DOTNET_NOLOGO: '1' }, stdio: 'pipe' });
}

let failed = false;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'OK    ' : 'FEHLER'}  ${label}${detail ? ` – ${detail}` : ''}`);
  if (!ok) failed = true;
}

const t0 = performance.now();
const yft = readYft(new Uint8Array(readFileSync(yftPath)));
console.log(`INFO    gelesen in ${Math.round(performance.now() - t0)} ms: ${yft.geometries.length} Geometrien, ${yft.shaders.length} Shader, ${yft.bones.length} Knochen, Name "${yft.name}"`);

const xml = readFileSync(xmlPath, 'utf8').replace(/\r\n/g, '\n');
const between = (text: string, open: string, close: string, from = 0) => {
  const a = text.indexOf(open, from);
  if (a < 0) return '';
  const b = text.indexOf(close, a);
  return text.slice(a, b + close.length);
};

// --- Knochen -------------------------------------------------------------------------------------------
const skeleton = between(xml, '<Skeleton>', '</Skeleton>');
const boneBlocks = [...skeleton.matchAll(/<Item>\s*<Name>([^<]*)<\/Name>\s*<Tag value="(\d+)" \/>[\s\S]*?<ParentIndex value="(-?\d+)" \/>/g)];
check(`Knochenzahl (${boneBlocks.length})`, boneBlocks.length === yft.bones.length, `unser ${yft.bones.length}`);
const boneSame = boneBlocks.every((m, i) => yft.bones[i]?.name === m[1] && yft.bones[i]?.tag === Number(m[2]) && yft.bones[i]?.parent === Number(m[3]));
check('Knochen: Namen, Tags und Elternindizes stimmen', boneSame);
const chassis = yft.bones[0];
console.log(`INFO    Knochen 0: ${chassis?.name} bei ${chassis?.position.map((v) => v.toFixed(3)).join(', ')}; Beispiele: ${['door_dside_f', 'bonnet', 'wheel_lf'].map((n) => { const b = yft.bones.find((x) => x.name === n); return b ? `${n} (${b.position.map((v) => v.toFixed(2)).join(', ')})` : `${n} fehlt`; }).join('; ')}`);

// --- Shader ----------------------------------------------------------------------------------------------
const group = between(xml, '<ShaderGroup>', '</ShaderGroup>');
const shaderBlocks = group.split(/\n {4}<Item>\n/).slice(1);
check(`Shaderzahl (${shaderBlocks.length})`, shaderBlocks.length === yft.shaders.length, `unser ${yft.shaders.length}`);
let shaderMismatch = 0;
shaderBlocks.forEach((block, i) => {
  const fileHash = /<FileName>([^<]*)<\/FileName>/.exec(block)![1]!;
  const bucket = Number(/<RenderBucket value="(\d+)"/.exec(block)![1]);
  const textures = [...block.matchAll(/<Item name="([^"]+)" type="Texture">\s*<Name>([^<]*)<\/Name>/g)].map((m) => `${m[1]}=${m[2]}`);
  const ours = yft.shaders[i];
  const oursHash = ours ? `hash_${ours.presetHash.toString(16).toUpperCase().padStart(8, '0')}` : '';
  const oursTextures = ours?.textures.map((t) => `${t.param}=${t.name}`) ?? [];
  if (!ours || oursHash !== fileHash || ours.renderBucket !== bucket || JSON.stringify(oursTextures) !== JSON.stringify(textures)) {
    shaderMismatch++;
    if (shaderMismatch <= 3) console.log(`  Shader ${i}: unser ${oursHash} bucket ${ours?.renderBucket} ${oursTextures}\n            Referenz ${fileHash} bucket ${bucket} ${textures}`);
  }
});
check('Shader: Voreinstellung, Zeichen-Eimer und Texturnamen stimmen', shaderMismatch === 0, shaderMismatch ? `${shaderMismatch} weichen ab` : '');
const named = yft.shaders.filter((s) => !s.preset.startsWith('hash_')).length;
console.log(`INFO    Shadernamen erkannt: ${named} von ${yft.shaders.length}; Lack: ${yft.shaders.map((s, i) => (/^vehicle_paint/.test(s.preset) ? `${i}:${s.preset}` : '')).filter(Boolean).join(', ')}`);

// --- Geometrien (höchste Detailstufe des Haupt-Drawables) ---------------------------------------------
const high = between(xml, '<DrawableModelsHigh>', '</DrawableModelsHigh>');
const geometryBlocks = high.split(/\n {5}<Item>\n/).slice(1);
check(`Geometrienzahl (${geometryBlocks.length})`, geometryBlocks.length === yft.geometries.length, `unser ${yft.geometries.length}`);

const FIELD_WIDTH: Record<string, number> = { Position: 3, BlendWeights: 4, BlendIndices: 4, Normal: 3, Colour0: 4, Colour1: 4, Tangent: 4, Binormal: 4 };
let worst = 0;
let mismatches = 0;
let checkedVertices = 0;
geometryBlocks.forEach((block, gi) => {
  const ours = yft.geometries[gi];
  if (!ours) return;
  const shader = Number(/<ShaderIndex value="(\d+)"/.exec(block)![1]);
  const layout = [...between(block, '<Layout', '</Layout>').matchAll(/<(\w+) \/>/g)].map((m) => m[1]!);
  const dataText = /<VertexBuffer>[\s\S]*?<Data>([\s\S]*?)<\/Data>/.exec(block)![1]!;
  const rows = dataText.trim().split('\n');
  const width = layout.reduce((s, f) => s + (FIELD_WIDTH[f] ?? 2), 0);
  const indexText = /<IndexBuffer>\s*<Data>([\s\S]*?)<\/Data>/.exec(block)![1]!.trim().split(/\s+/).map(Number);
  let ok = ours.shader === shader && ours.vertexCount === rows.length && ours.indices.length === indexText.length;
  if (ok) for (let i = 0; i < indexText.length; i++) if (ours.indices[i] !== indexText[i]) { ok = false; break; }
  // Alle Eckpunkte stichprobenartig (jeder 7.) und der letzte vergleichen
  for (let v = 0; ok && v < rows.length; v += v + 7 >= rows.length && v !== rows.length - 1 ? rows.length - 1 - v : 7) {
    const t = rows[v]!.trim().split(/\s+/).map(Number);
    if (t.length !== width) { ok = false; break; }
    let at = 0;
    for (const field of layout) {
      const n = FIELD_WIDTH[field] ?? 2;
      const ref = t.slice(at, at + n);
      at += n;
      let mine: ArrayLike<number> | null = null;
      if (field === 'Position') mine = ours.positions.subarray(v * 3, v * 3 + 3);
      else if (field === 'Normal') mine = ours.normals?.subarray(v * 3, v * 3 + 3) ?? null;
      else if (field === 'Colour0') mine = ours.colors?.subarray(v * 4, v * 4 + 4) ?? null;
      else if (field === 'BlendWeights') mine = ours.blendWeights?.subarray(v * 4, v * 4 + 4) ?? null;
      else if (field === 'BlendIndices') mine = ours.blendIndices?.subarray(v * 4, v * 4 + 4) ?? null;
      else if (field.startsWith('TexCoord')) mine = ours.uvs[Number(field.slice(8))]?.subarray(v * 2, v * 2 + 2) ?? null;
      else continue; // Tangente, Binormale, Farbe 1 werden nicht gelesen
      if (!mine) { ok = false; break; }
      for (let k = 0; k < n; k++) {
        const d = Math.abs(mine[k]! - ref[k]!);
        worst = Math.max(worst, d);
        if (d > 2e-4) ok = false;
      }
    }
    checkedVertices++;
    if (v === rows.length - 1) break;
  }
  if (!ok) {
    mismatches++;
    if (mismatches <= 3) console.log(`  Geometrie ${gi}: weicht ab (Shader ${ours.shader}/${shader}, Eckpunkte ${ours.vertexCount}/${rows.length}, Indizes ${ours.indices.length}/${indexText.length})`);
  }
});
check('Geometrien: Shader, Eckpunktzahl, alle Indizes und Stichproben der Eckpunktdaten stimmen', mismatches === 0, `${checkedVertices} Eckpunkte geprüft, größte Abweichung ${worst.toExponential(2)}${mismatches ? `, ${mismatches} Geometrien weichen ab` : ''}`);

const triangles = yft.geometries.reduce((s, g) => s + g.indices.length / 3, 0);
const vertices = yft.geometries.reduce((s, g) => s + g.vertexCount, 0);
console.log(`INFO    insgesamt ${vertices.toLocaleString()} Eckpunkte, ${triangles.toLocaleString()} Dreiecke`);
process.exit(failed ? 1 : 0);
