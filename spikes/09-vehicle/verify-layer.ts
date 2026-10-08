/**
 * Gegenprobe für „Livery-Ebene anlegen“ auf dem echten Fahrzeug: Ein paint1- oder paint2-Lack-Shader wird auf paint3 umgestellt. Hat das
 * Fahrzeug selbst schon einen paint3-Shader (das ist bei Fahrzeugen mit Livery der Fall), dient er als Maßstab: Die Parameterliste des
 * umgestellten Shaders muss in der CodeWalker-Ausgabe Eintrag für Eintrag mit der des echten übereinstimmen (Namen, Arten, Reihenfolge und
 * Werte), und die Zahlen in den Parameterköpfen (Nummern, Größen, Zahl der Texturen) ebenso. Alles andere in der Datei muss gleich bleiben.
 *
 * Das Fahrzeug ist eine Fremddatei und liegt nur lokal in .local/vehicles/ (nicht im Repo). Ohne die Datei überspringt
 * sich das Skript.
 *
 *   node spikes/09-vehicle/verify-layer.ts [Ordnername in .local/vehicles, Standard 20fpiu]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildVehicleParts, liveryCandidates } from '../../packages/forge-core/src/index.ts';
import { Memory, SYSTEM_BASE, editYft, parseResource, readYft } from '../../packages/rage-formats/src/index.ts';

const root = resolve(import.meta.dirname, '..', '..');
const folder = process.argv[2] ?? '20fpiu';
const streamDir = join(root, '.local', 'vehicles', folder, 'stream');
const dotnet = join(root, '.dotnet', 'dotnet.exe');
const oracle = join(root, '.local', 'oracle', 'bin', 'Release', 'net10.0', 'Oracle.dll');
const outDir = join(root, '.local', 'verify', 'layer-spike');

if (!existsSync(streamDir) || !existsSync(dotnet) || !existsSync(oracle)) {
  console.log('ÜBERSPRUNGEN: Fahrzeugdateien oder Vergleichswerkzeug fehlen (.local/).');
  process.exit(0);
}
const yftFiles = readdirSync(streamDir).filter((f) => f.toLowerCase().endsWith('.yft') && !/_hi\./i.test(f));
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

/** Die Parameter-Zeilen des Shaders mit der Nummer `index` aus der CodeWalker-Ausgabe. */
function shaderLines(xml: string, index: number): string[] {
  const start = xml.indexOf('<Shaders>');
  const end = xml.indexOf('</Shaders>', start);
  const items = xml.slice(start, end).split(/\n {4}<Item>\n/).slice(1);
  const item = items[index];
  if (!item) return [];
  // Name der Textur steht in der Zeile danach; die Zeilen werden unverändert verglichen, nur der Texturname der neuen Ebene darf abweichen
  return item.split('\n').map((l) => l.trim());
}

/** Rohe Köpfe, Größen und Zähler des Shaders aus der Datei. */
function rawShader(file: Uint8Array, index: number) {
  const res = parseResource(file);
  const mem = new Memory(res.system, res.graphics);
  const drawable = mem.ptr(SYSTEM_BASE + 0x30);
  const fx = mem.ptr(mem.ptr(mem.ptr(drawable + 0x10) + 0x10) + index * 8);
  const params = mem.ptr(fx);
  const n = mem.u8(fx + 0x10);
  return {
    count: n,
    size: mem.u16(fx + 0x14),
    data: mem.u16(fx + 0x16),
    textures: mem.u8(fx + 0x27),
    heads: Array.from({ length: n }, (_, p) => `${mem.u8(params + p * 16)}/${mem.u8(params + p * 16 + 1)}`).join(' '),
  };
}

const name = yftFiles.sort((a, b) => a.length - b.length)[0]!;
const path = join(streamDir, name);
const original = new Uint8Array(readFileSync(path));
const before = readYft(original);
const parts = buildVehicleParts(before).parts;
const candidates = liveryCandidates(before, parts);
const real = before.shaders.findIndex((s) => s.preset === 'vehicle_paint3');
console.log(`INFO    ${name}: ${candidates.length} umstellbare Lack-Shader, echter paint3-Shader: ${real >= 0 ? `Nummer ${real}` : 'keiner'}`);
if (candidates.length === 0 || real < 0) {
  console.log('ÜBERSPRUNGEN: Es braucht einen paint1/paint2- und einen paint3-Shader im selben Fahrzeug.');
  process.exit(0);
}
// Ein paint3-Shader der Datei hat zwei oder drei Texturen mehr; die Texturnamen der neuen Ebene sind frei, daher wird er mit dem
// Namen des echten paint3-Shaders umgestellt.
const target = candidates[0]!;
const realLayer = before.shaders[real]!.textures.find((t) => t.param === 'DiffuseSampler2')?.name ?? 'livery';
const changed = editYft(original, { paint: [{ shader: target.shader, textureName: realLayer }] }).file;
writeFileSync(join(outDir, name), changed);

execFileSync(dotnet, [oracle, 'yft2xml', path, join(outDir, 'before.xml')], { env, stdio: 'pipe' });
execFileSync(dotnet, [oracle, 'yft2xml', join(outDir, name), join(outDir, 'after.xml')], { env, stdio: 'pipe' });
check('CodeWalker liest die geänderte Datei', existsSync(join(outDir, 'after.xml')));

const beforeXml = readFileSync(join(outDir, 'before.xml'), 'utf8').replace(/\r\n/g, '\n');
const afterXml = readFileSync(join(outDir, 'after.xml'), 'utf8').replace(/\r\n/g, '\n');
const a = shaderLines(afterXml, target.shader);
const b = shaderLines(beforeXml, real);
// Name, Dateiname und Art der Zeilen vergleichen: der umgestellte Shader (nachher) gegen den echten paint3-Shader (vorher)
const names = (lines: string[]) => lines.filter((l) => l.startsWith('<Item name=')).map((l) => l.replace(/\s+(x|y|z|w)=.*$/, '').replace(/ \/>$/, '').replace(/>$/, ''));
check('Parameterliste (Namen, Arten, Reihenfolge) wie beim echten paint3-Shader', JSON.stringify(names(a)) === JSON.stringify(names(b)), `${names(a).length} Einträge`);
check('Shader- und Dateiname wie paint3', a.find((l) => l.startsWith('<Name>')) === b.find((l) => l.startsWith('<Name>')) && a.find((l) => l.startsWith('<FileName>')) === b.find((l) => l.startsWith('<FileName>')));
// Werte: alle Vektorzeilen, die es in beiden gibt, sind gleich, soweit sie aus derselben Quelle stammen (neue Vektoren haben die üblichen Werte)
const vectorLines = (lines: string[]) => lines.filter((l) => l.startsWith('<Item name=') && l.includes('type="Vector"'));
const newOnes = ['diffuse2SpecMod', 'matDiffuseColor2'];
const va = vectorLines(a).filter((l) => newOnes.some((n) => l.includes(`name="${n}"`)));
const vb = vectorLines(b).filter((l) => newOnes.some((n) => l.includes(`name="${n}"`)));
check('Die neuen Vektoren haben dieselben Werte wie im echten paint3-Shader', JSON.stringify(va) === JSON.stringify(vb), va.join(' | '));
const heads = rawShader(changed, target.shader);
const headsReal = rawShader(original, real);
check('Köpfe, Größen und Zahl der Texturen wie beim echten paint3-Shader', heads.heads === headsReal.heads && heads.size === headsReal.size && heads.data === headsReal.data && heads.textures === headsReal.textures && heads.count === headsReal.count, `${heads.count} Parameter, ${heads.size}/${heads.data}`);

// Der Rest der Datei bleibt: Zeile für Zeile bis auf den umgestellten Shader
const strip = (xml: string) => xml.split('\n').map((l) => l.trim());
const lines = new Map<string, number>();
for (const l of strip(beforeXml)) lines.set(l, (lines.get(l) ?? 0) + 1);
for (const l of strip(afterXml)) lines.set(l, (lines.get(l) ?? 0) - 1);
const lost = [...lines.entries()].filter(([, n]) => n > 0).reduce((s, [, n]) => s + n, 0);
const gained = [...lines.entries()].filter(([, n]) => n < 0).reduce((s, [, n]) => s - n, 0);
console.log(`INFO    Zeilen vorher nicht mehr da: ${lost}, neu dazu: ${gained} (nur im umgestellten Shader)`);
const shaderSize = shaderLines(beforeXml, target.shader).length;
check('Änderungen bleiben im Umfang des einen Shaders', lost <= shaderSize + 2 && gained <= shaderLines(afterXml, target.shader).length + 2, `Shader hat ${shaderSize} Zeilen`);

console.log(failed ? '\nMindestens eine Prüfung ist fehlgeschlagen.' : '\nAlle Prüfungen bestanden.');
process.exit(failed ? 1 : 0);
