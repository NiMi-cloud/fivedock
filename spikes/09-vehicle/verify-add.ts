/**
 * Gegenprobe für „Teile hinzufügen“ auf dem echten Fahrzeug: Ein Lichtbalken mit Sirenen-Knochen wird in die Modelldatei(en) eingebaut.
 * CodeWalker muss die geänderten Dateien lesen. Verglichen werden die XML-Ausgaben vor und nach dem Einbau Zeile für Zeile:
 * Entfallen dürfen nur die Zeilen, die sich zwangsläufig ändern (Obergrenze des Fahrzeugs, die Knochenzahl in den Modellen, das
 * Geschwister des bisher letzten Kindes). Alles andere in der Datei muss unverändert sein. Dazu kommen die neuen Knochen und Geometrien.
 *
 * Das Fahrzeug ist eine Fremddatei und liegt nur lokal in .local/vehicles/ (nicht im Repo). Ohne die Datei überspringt
 * sich das Skript.
 *
 *   node spikes/09-vehicle/verify-add.ts [Ordnername in .local/vehicles, Standard 20fpiu]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEFAULT_LIGHTBAR, applyAddedParts, buildVehicleParts, suggestLightbarMaterials, suggestRoofPosition } from '../../packages/forge-core/src/index.ts';
import { decodePageFlags, parseResource, readYft } from '../../packages/rage-formats/src/index.ts';

const root = resolve(import.meta.dirname, '..', '..');
const folder = process.argv[2] ?? '20fpiu';
const streamDir = join(root, '.local', 'vehicles', folder, 'stream');
const dotnet = join(root, '.dotnet', 'dotnet.exe');
const oracle = join(root, '.local', 'oracle', 'bin', 'Release', 'net10.0', 'Oracle.dll');
const outDir = join(root, '.local', 'verify', 'add');

if (!existsSync(streamDir) || !existsSync(dotnet) || !existsSync(oracle)) {
  console.log('ÜBERSPRUNGEN: Fahrzeugdateien oder Vergleichswerkzeug fehlen (.local/).');
  process.exit(0);
}
const yftFiles = readdirSync(streamDir).filter((f) => f.toLowerCase().endsWith('.yft'));
if (yftFiles.length === 0) {
  console.log('ÜBERSPRUNGEN: Keine .yft-Datei im Ordner.');
  process.exit(0);
}
mkdirSync(outDir, { recursive: true });
const env = { ...process.env, DOTNET_ROOT: join(root, '.dotnet'), DOTNET_NOLOGO: '1' };

let failed = false;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'OK    ' : 'FEHLER'}  ${label}${detail ? ` – ${detail}` : ''}`);
  if (!ok) failed = true;
}

/** Zeilen als Mehrfachmenge. */
function lineCounts(text: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    map.set(line, (map.get(line) ?? 0) + 1);
  }
  return map;
}

const bar = (() => {
  const first = readYft(new Uint8Array(readFileSync(join(streamDir, yftFiles.sort((a, b) => a.length - b.length)[0]!))));
  const parts = buildVehicleParts(first).parts;
  const spec = { ...DEFAULT_LIGHTBAR };
  const position = suggestRoofPosition(first, parts, spec);
  if (position) spec.position = position;
  const mats = suggestLightbarMaterials(first, parts);
  return { reference: first, added: [{ id: 'a', kind: 'lightbar' as const, spec, housingShader: mats.housing ?? 0, lensShader: mats.lens, sirens: true, parentBone: 0 }] };
})();

for (const name of yftFiles) {
  console.log(`\n== ${name}`);
  const path = join(streamDir, name);
  const original = new Uint8Array(readFileSync(path));
  const before = readYft(original);

  const t0 = performance.now();
  const applied = applyAddedParts(original, bar.added, bar.reference);
  console.log(`INFO    eingebaut in ${Math.round(performance.now() - t0)} ms: ${applied.result.added} Geometrien, Knochen ${applied.result.boneIndices.join(',')}, Detailstufen ${applied.result.lods.join('/')}`);
  const changedPath = join(outDir, name);
  writeFileSync(changedPath, applied.file);

  // eigener Leser
  const after = readYft(applied.file);
  check('Unser Leser findet 2 neue Geometrien und alle neuen Knochen', after.geometries.length === before.geometries.length + 2 && after.bones.length === before.bones.length + 1 + applied.sirens.length);
  check('Die neuen Sirenen-Knochen heißen siren<Nummer> und hängen am Balken', applied.sirens.every((s) => after.bones.some((b) => b.name === `siren${s.number}` && after.bones[b.parent]?.name.startsWith('forge_lightbar'))));
  const f = parseResource(applied.file);
  check('Seiten-Flags passen zur Größe', decodePageFlags(f.systemFlags).totalSize === f.system.length && decodePageFlags(f.graphicsFlags).totalSize === f.graphics.length);

  // CodeWalker
  const beforeXml = join(outDir, `${name}.before.xml`);
  const afterXml = join(outDir, `${name}.after.xml`);
  execFileSync(dotnet, [oracle, 'yft2xml', path, beforeXml], { env, stdio: 'pipe' });
  execFileSync(dotnet, [oracle, 'yft2xml', changedPath, afterXml], { env, stdio: 'pipe' });
  check('CodeWalker liest die geänderte Datei', existsSync(afterXml));

  const a = lineCounts(readFileSync(beforeXml, 'utf8').replace(/\r\n/g, '\n'));
  const b = lineCounts(readFileSync(afterXml, 'utf8').replace(/\r\n/g, '\n'));
  const lost: string[] = [];
  for (const [line, n] of a) {
    const m = b.get(line) ?? 0;
    if (m < n) lost.push(`${n - m}× ${line.slice(0, 90)}`);
  }
  const allowed = [/^<BoundingBoxMax /, /^<Unknown1 value=/, /^<SiblingIndex value=/, /^<BoundingBoxMin /];
  const unexpected = lost.filter((l) => !allowed.some((rx) => rx.test(l.replace(/^\d+× /, ''))));
  check('Aus der Datei verschwindet nichts außer Obergrenze, Knochenzahl und einem Geschwister-Eintrag', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));
  const lostCount = lost.reduce((s, l) => s + Number(/^(\d+)×/.exec(l)![1]), 0);
  console.log(`INFO    geänderte Zeilen: ${lostCount} (Obergrenze, Knochenzahl je Detailstufe, Geschwister)`);

  const xml = readFileSync(afterXml, 'utf8');
  for (const n of applied.sirens) check(`siren${n.number} steht in der CodeWalker-Ausgabe`, xml.includes(`<Name>siren${n.number}</Name>`));
  check('Der Balken-Knochen steht in der CodeWalker-Ausgabe', xml.includes('<Name>forge_lightbar</Name>'));
  const items = (text: string) => (text.match(/<ShaderIndex /g) ?? []).length;
  console.log(`INFO    Geometrien in der Ausgabe: ${items(readFileSync(beforeXml, 'utf8'))} → ${items(xml)}`);
}

console.log(failed ? '\nMindestens eine Prüfung ist fehlgeschlagen.' : '\nAlle Prüfungen bestanden.');
process.exit(failed ? 1 : 0);
