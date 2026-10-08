/**
 * Gegenprobe für das Zurückschreiben der Livery: Auf dem echten Fahrzeug wird die Livery-Textur (`fpiu_sign_1`, die
 * zweite Diffuse-Textur des Lack-Shaders) im YTD durch ein neues Bild ersetzt. CodeWalker muss die Datei lesen, die
 * ersetzte Textur muss Größe und Format der alten haben, und alle anderen Texturen müssen im XML von CodeWalker
 * unverändert aussehen und in den Pixeldaten Byte für Byte gleich sein.
 *
 * Das Fahrzeug ist eine Fremddatei und liegt nur lokal in .local/vehicles/ (nicht im Repo). Ohne die Datei überspringt
 * sich das Skript.
 *
 *   node spikes/09-vehicle/verify-livery.ts [Ordnername in .local/vehicles, Standard 20fpiu] [Textur, Standard fpiu_sign_1] [YTD-Datei, Standard <Ordner>.ytd]
 *
 * Fahrzeuge haben oft eine zweite Datei mit Hochdetail-Texturen (<Name>+hi.ytd), in der dieselbe Livery-Textur noch einmal steht.
 * Der Lauf mit dieser Datei (… fpiu_sign_1 20fpiu+hi.ytd) prüft den Hochdetail-Fall.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodeTexture, readYtd } from '../../packages/rage-formats/src/index.ts';
import type { RgbaImage } from '../../packages/rage-formats/src/index.ts';
import { replaceLiveryTexture } from '../../packages/forge-core/src/index.ts';

const root = resolve(import.meta.dirname, '..', '..');
const folder = process.argv[2] ?? '20fpiu';
const textureName = process.argv[3] ?? 'fpiu_sign_1';
const ytdName = process.argv[4] ?? `${folder}.ytd`;
const ytdPath = join(root, '.local', 'vehicles', folder, 'stream', ytdName);
const dotnet = join(root, '.dotnet', 'dotnet.exe');
const oracle = join(root, '.local', 'oracle', 'bin', 'Release', 'net10.0', 'Oracle.dll');
const outDir = join(root, '.local', 'verify', 'livery');

if (!existsSync(ytdPath) || !existsSync(dotnet) || !existsSync(oracle)) {
  console.log('ÜBERSPRUNGEN: Fahrzeugdatei oder Vergleichswerkzeug fehlt (.local/).');
  process.exit(0);
}
mkdirSync(outDir, { recursive: true });
const env = { ...process.env, DOTNET_ROOT: join(root, '.dotnet'), DOTNET_NOLOGO: '1' };
const toXml = (ytd: string, xml: string) => execFileSync(dotnet, [oracle, 'ytd2xml', ytd, xml], { env, stdio: 'pipe' });

let failed = false;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'OK    ' : 'FEHLER'}  ${label}${detail ? ` – ${detail}` : ''}`);
  if (!ok) failed = true;
}

const original = new Uint8Array(readFileSync(ytdPath));
const before = readYtd(original);
const old = before.find((t) => t.name === textureName);
if (!old) {
  console.log(`ÜBERSPRUNGEN: Die Textur ${textureName} steht nicht in ${ytdName}.`);
  process.exit(0);
}
console.log(`INFO    ${before.length} Texturen, ${textureName}: ${old.width}x${old.height} ${old.format}, ${old.levels} Stufe(n)`);

// Eine "bemalte" Livery: durchsichtig mit einem roten Rechteck und einem halbdurchsichtigen blauen Streifen.
const size = old.width;
const painted: RgbaImage = { width: size, height: size, data: new Uint8Array(size * size * 4) };
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    if (x >= 100 && x < 600 && y >= 100 && y < 400) painted.data.set([220, 30, 30, 255], i);
    else if (y >= 900 && y < 1000) painted.data.set([30, 60, 220, 128], i);
  }
}

const t0 = performance.now();
const result = replaceLiveryTexture(original, textureName, painted);
console.log(`INFO    geschrieben in ${Math.round(performance.now() - t0)} ms, ${result.ytd.length} Byte (vorher ${original.length})`);
writeFileSync(join(outDir, `before_${ytdName}`), original);
writeFileSync(join(outDir, `after_${ytdName}`), result.ytd);
toXml(join(outDir, `before_${ytdName}`), join(outDir, `before_${ytdName}.xml`));
toXml(join(outDir, `after_${ytdName}`), join(outDir, `after_${ytdName}.xml`));

interface Item {
  name: string;
  body: string;
  width: number;
  height: number;
  levels: number;
  format: string;
}
function items(path: string): Map<string, Item> {
  const xml = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const out = new Map<string, Item>();
  for (const m of xml.matchAll(/<Item>([\s\S]*?)<\/Item>/g)) {
    const body = m[1]!;
    const name = /<Name>(.*?)<\/Name>/.exec(body)?.[1];
    if (!name) continue;
    const num = (tag: string) => Number(new RegExp(`<${tag} value="(\\d+)"`).exec(body)![1]);
    out.set(name, { name, body, width: num('Width'), height: num('Height'), levels: num('MipLevels'), format: /<Format>(.*?)<\/Format>/.exec(body)![1]! });
  }
  return out;
}
const xmlBefore = items(join(outDir, `before_${ytdName}.xml`));
const xmlAfter = items(join(outDir, `after_${ytdName}.xml`));
check('CodeWalker liest die neue Datei und findet alle Texturen', xmlAfter.size === xmlBefore.size && xmlAfter.size === before.length, `${xmlAfter.size} von ${before.length}`);

const a = xmlAfter.get(textureName);
const b = xmlBefore.get(textureName);
check(`${textureName}: Größe und Format wie vorher (${b?.width}x${b?.height} ${b?.format})`, !!a && !!b && a.width === b.width && a.height === b.height && a.format === b.format, `jetzt ${a?.width}x${a?.height} ${a?.format}, ${a?.levels} Stufen`);

let sameXml = 0;
const differing: string[] = [];
for (const [name, item] of xmlBefore) {
  if (name === textureName) continue;
  const other = xmlAfter.get(name);
  if (other && other.body === item.body) sameXml++;
  else differing.push(name);
}
check('Alle anderen Texturen: Eintrag in CodeWalkers XML unverändert', differing.length === 0, differing.length ? `abweichend: ${differing.slice(0, 5).join(', ')}` : `${sameXml} Einträge`);

const after = readYtd(result.ytd);
let identical = 0;
const changed: string[] = [];
for (const t of before) {
  if (t.name === textureName) continue;
  const u = after.find((x) => x.name === t.name);
  if (u && Buffer.compare(Buffer.from(t.data), Buffer.from(u.data)) === 0 && u.width === t.width && u.height === t.height && u.levels === t.levels && u.format === t.format) identical++;
  else changed.push(t.name);
}
check('Alle anderen Texturen: Pixeldaten, Größe, Stufen und Format Byte für Byte gleich', changed.length === 0, changed.length ? `abweichend: ${changed.slice(0, 5).join(', ')}` : `${identical} Texturen`);

const sign = after.find((t) => t.name === textureName)!;
const pixels = decodeTexture(sign, 0);
const at = (x: number, y: number) => Array.from(pixels.data.slice((y * sign.width + x) * 4, (y * sign.width + x) * 4 + 4));
check('Ersetzte Textur: rotes Rechteck, voll deckend', at(300, 200).join() === '220,30,30,255', at(300, 200).join());
check('Ersetzte Textur: blauer Streifen, halb durchsichtig', at(300, 950).join() === '30,60,220,128', at(300, 950).join());
check('Ersetzte Textur: übrige Fläche ganz durchsichtig', at(1500, 1500)[3] === 0, at(1500, 1500).join());

process.exit(failed ? 1 : 0);
