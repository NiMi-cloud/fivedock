/**
 * Gegenprobe für „Teile entfernen“ auf dem echten Fahrzeug: Alle Teile mit einer Abzeichen-Textur werden aus der Datei entfernt.
 * CodeWalker muss die geänderte Datei lesen, in jeder Detailstufe müssen Shader, Eckpunkte und alle nicht betroffenen
 * Geometrien Zeichen für Zeichen gleich bleiben, und bei den betroffenen Geometrien muss die neue Indexliste eine Auswahl ganzer
 * Dreiecke der alten in derselben Reihenfolge sein. Kopf und Seiten-Flags der Datei bleiben, die Größe im Speicher auch.
 *
 * Das Fahrzeug ist eine Fremddatei und liegt nur lokal in .local/vehicles/ (nicht im Repo). Ohne die Datei überspringt
 * sich das Skript.
 *
 *   node spikes/09-vehicle/verify-edit.ts [Ordnername in .local/vehicles, Standard 20fpiu] [Teil der Textur, Standard badge]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseResource, readYft } from '../../packages/rage-formats/src/index.ts';
import { buildVehicleParts, diffuseTextureOf, removeParts, ruleOfPart } from '../../packages/forge-core/src/index.ts';

const root = resolve(import.meta.dirname, '..', '..');
const folder = process.argv[2] ?? '20fpiu';
const needle = new RegExp(process.argv[3] ?? 'badge', 'i');
const yftPath = join(root, '.local', 'vehicles', folder, 'stream', `${folder}.yft`);
const dotnet = join(root, '.dotnet', 'dotnet.exe');
const oracle = join(root, '.local', 'oracle', 'bin', 'Release', 'net10.0', 'Oracle.dll');
const outDir = join(root, '.local', 'verify', 'edit');

if (!existsSync(yftPath) || !existsSync(dotnet) || !existsSync(oracle)) {
  console.log('ÜBERSPRUNGEN: Fahrzeugdatei oder Vergleichswerkzeug fehlt (.local/).');
  process.exit(0);
}
mkdirSync(outDir, { recursive: true });
const env = { ...process.env, DOTNET_ROOT: join(root, '.dotnet'), DOTNET_NOLOGO: '1' };

let failed = false;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'OK    ' : 'FEHLER'}  ${label}${detail ? ` – ${detail}` : ''}`);
  if (!ok) failed = true;
}

const original = new Uint8Array(readFileSync(yftPath));
const yft = readYft(original);
const { parts } = buildVehicleParts(yft);
const chosen = parts.filter((p) => needle.test(diffuseTextureOf(yft.shaders[p.shader]!) ?? ''));
if (chosen.length === 0) {
  console.log(`ÜBERSPRUNGEN: Kein Teil mit einer Textur, die zu /${needle.source}/ passt.`);
  process.exit(0);
}
const rules = chosen.map((p) => ruleOfPart(yft, p));
console.log(`INFO    ${chosen.length} Teile gewählt: ${chosen.map((p) => `${p.bone}/${diffuseTextureOf(yft.shaders[p.shader]!)} (${p.triangleCount} Dreiecke)`).join(', ')}`);

const t0 = performance.now();
const result = removeParts(original, rules);
console.log(`INFO    bearbeitet in ${Math.round(performance.now() - t0)} ms: ${result.removed} Dreiecke entfernt, je Stufe ${result.byLod.join(' / ')}`);
check('Es wurden Dreiecke entfernt, mindestens die der gewählten Teile in der höchsten Stufe', result.removed >= chosen.reduce((s, p) => s + p.triangleCount, 0) && result.byLod[0]! >= chosen.reduce((s, p) => s + p.triangleCount, 0));

const patchedPath = join(outDir, 'patched.yft');
writeFileSync(patchedPath, result.file);
execFileSync(dotnet, [oracle, 'yft2xml', yftPath, join(outDir, 'before.xml')], { env, stdio: 'pipe' });
execFileSync(dotnet, [oracle, 'yft2xml', patchedPath, join(outDir, 'after.xml')], { env, stdio: 'pipe' });
check('CodeWalker liest die geänderte Datei', existsSync(join(outDir, 'after.xml')));

// Kopf und Größe im Speicher
const a = parseResource(original);
const b = parseResource(result.file);
check('Kopf, Version und Seiten-Flags bleiben', a.version === b.version && a.systemFlags === b.systemFlags && a.graphicsFlags === b.graphicsFlags);
check('Größe im Speicher bleibt', a.system.length === b.system.length && a.graphics.length === b.graphics.length, `${a.system.length} + ${a.graphics.length} Byte`);

const beforeXml = readFileSync(join(outDir, 'before.xml'), 'utf8').replace(/\r\n/g, '\n');
const afterXml = readFileSync(join(outDir, 'after.xml'), 'utf8').replace(/\r\n/g, '\n');
const between = (text: string, open: string, close: string) => {
  const s = text.indexOf(open);
  if (s < 0) return '';
  return text.slice(s, text.indexOf(close, s) + close.length);
};

let totalChanged = 0;
for (const lod of ['High', 'Medium', 'Low', 'VeryLow']) {
  const open = `<DrawableModels${lod}>`;
  const x = between(beforeXml, open, `</DrawableModels${lod}>`);
  const y = between(afterXml, open, `</DrawableModels${lod}>`);
  if (!x && !y) {
    console.log(`INFO    Stufe ${lod}: nicht vorhanden`);
    continue;
  }
  const xs = x.split(/\n {5}<Item>\n/).slice(1);
  const ys = y.split(/\n {5}<Item>\n/).slice(1);
  check(`Stufe ${lod}: gleiche Geometrienzahl (${xs.length})`, xs.length === ys.length);
  let identical = 0;
  let changed = 0;
  let broken = 0;
  xs.forEach((blockX, i) => {
    const blockY = ys[i] ?? '';
    if (blockX === blockY) {
      identical++;
      return;
    }
    // Eine Geometrie ohne Indizes schreibt CodeWalker als leeres <IndexBuffer> ganz ohne <Data>.
    const bufferTag = /<IndexBuffer>([\s\S]*?)<\/IndexBuffer>/;
    const indices = (block: string) => (bufferTag.exec(block)?.[1] ?? '').replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).map(Number);
    const strip = (block: string) => block.replace(bufferTag, '<IndexBuffer/>');
    const ix = indices(blockX);
    const iy = indices(blockY);
    // Rest der Geometrie (Shader, Eckpunkte, Layout …) muss gleich sein
    let ok = strip(blockX) === strip(blockY) && iy.length % 3 === 0 && iy.length < ix.length;
    // Neue Dreiecke sind eine Auswahl der alten in derselben Reihenfolge
    let at = 0;
    for (let t = 0; ok && t < iy.length; t += 3) {
      while (at < ix.length && !(ix[at] === iy[t] && ix[at + 1] === iy[t + 1] && ix[at + 2] === iy[t + 2])) at += 3;
      if (at >= ix.length) ok = false;
      at += 3;
    }
    if (ok) changed++;
    else broken++;
  });
  totalChanged += changed;
  check(`Stufe ${lod}: ${identical} Geometrien unverändert, ${changed} verkleinert, keine falsch`, broken === 0, broken ? `${broken} unstimmig` : '');
}
check('Mindestens eine Geometrie wurde verändert', totalChanged > 0);

// Unser Leser sieht dasselbe
const after = readYft(result.file);
const trianglesBefore = yft.geometries.reduce((s, g) => s + g.indices.length / 3, 0);
const trianglesAfter = after.geometries.reduce((s, g) => s + g.indices.length / 3, 0);
check('Unser Leser: Dreiecke der höchsten Stufe sinken um die entfernten', trianglesBefore - trianglesAfter === result.byLod[0], `${trianglesBefore} → ${trianglesAfter}`);

process.exit(failed ? 1 : 0);
