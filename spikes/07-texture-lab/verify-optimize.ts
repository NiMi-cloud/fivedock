/**
 * Gegenprobe für Optimieren und Retexture: Das von CodeWalker gebaute YTD (siehe verify-read.ts) wird mit unserem
 * Code verkleinert beziehungsweise teilweise ersetzt, danach liest CodeWalker das Ergebnis, und Größe,
 * Mip-Stufen und Format aus dessen XML müssen stimmen.
 *
 *   node spikes/07-texture-lab/verify-read.ts       (einmalig, erzeugt die Eingabe)
 *   node spikes/07-texture-lab/verify-optimize.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildYtd, decodeTexture, readYtd } from '../../packages/rage-formats/src/index.ts';
import type { RgbaImage } from '../../packages/rage-formats/src/index.ts';
import { optimizePack, retexture } from '../../packages/forge-core/src/index.ts';

const root = resolve(import.meta.dirname, '..', '..');
const dotnet = join(root, '.dotnet', 'dotnet.exe');
const oracle = join(root, '.local', 'oracle', 'bin', 'Release', 'net10.0', 'Oracle.dll');
const outDir = join(root, '.local', 'verify', 'read');
const input = join(outDir, 'codewalker.ytd');

if (!existsSync(dotnet) || !existsSync(oracle) || !existsSync(input)) {
  console.log('ÜBERSPRUNGEN: Vergleichswerkzeug oder Eingabe fehlt (erst verify-read.ts ausführen).');
  process.exit(0);
}
const env = { ...process.env, DOTNET_ROOT: join(root, '.dotnet'), DOTNET_NOLOGO: '1' };
const toXml = (ytd: string, xml: string) => execFileSync(dotnet, [oracle, 'ytd2xml', ytd, xml], { env, stdio: 'pipe' });

interface Item {
  name: string;
  width: number;
  height: number;
  levels: number;
  format: string;
}
function items(xmlPath: string): Map<string, Item> {
  const xml = readFileSync(xmlPath, 'utf8');
  const out = new Map<string, Item>();
  for (const m of xml.matchAll(/<Item>([\s\S]*?)<\/Item>/g)) {
    const body = m[1]!;
    const num = (tag: string) => Number(new RegExp(`<${tag} value="(\\d+)"`).exec(body)![1]);
    const name = /<Name>(.*?)<\/Name>/.exec(body)![1]!;
    out.set(name, { name, width: num('Width'), height: num('Height'), levels: num('MipLevels'), format: /<Format>(.*?)<\/Format>/.exec(body)![1]! });
  }
  return out;
}

let failed = false;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'OK    ' : 'FEHLER'}  ${label}${detail ? ` – ${detail}` : ''}`);
  if (!ok) failed = true;
}

const original = new Uint8Array(readFileSync(input));

// 1. Optimieren auf höchstens 16 Pixel
const result = await optimizePack({ 'stream/mixed.ytd': original }, { maxSize: 16 });
const file = result.report.files[0]!;
check('Datei wurde optimiert', file.status === 'optimized', `${file.pixelBytesBefore} -> ${file.pixelBytesAfter} Byte Pixeldaten`);
writeFileSync(join(outDir, 'optimized.ytd'), result.files['stream/mixed.ytd']!);
toXml(join(outDir, 'optimized.ytd'), join(outDir, 'optimized.xml'));
const optimized = items(join(outDir, 'optimized.xml'));
const before = items(join(outDir, 'codewalker.out.xml'));
check('CodeWalker liest die optimierte Datei', optimized.size === before.size, `${optimized.size} Texturen`);
for (const [name, b] of before) {
  const a = optimized.get(name);
  const shrink = Math.max(1, Math.ceil(Math.max(b.width, b.height) / 16));
  const wantW = Math.max(1, b.width / Math.max(1, shrink));
  const wantH = Math.max(1, b.height / Math.max(1, shrink));
  const ok = !!a && a.width === Math.min(b.width, wantW) && a.height === Math.min(b.height, wantH) && a.format === b.format;
  check(
    `${name}: ${b.width}x${b.height} -> ${a?.width}x${a?.height}, Format ${a?.format}, ${a?.levels} Stufen`,
    ok && !!a && a.levels >= 1,
    ok ? '' : `erwartet ${wantW}x${wantH}`,
  );
}

// 2. Retexture: t_dxt5 durch ein rotes Bild ersetzen, alle anderen Texturen bleiben byte-gleich
const textures = readYtd(original);
const old = textures.find((t) => t.name === 't_dxt5')!;
const red: RgbaImage = { width: 64, height: 64, data: new Uint8Array(64 * 64 * 4) };
for (let i = 0; i < 64 * 64; i++) red.data.set([220, 30, 30, 255], i * 4);
const replaced = retexture(old, red);
const next = textures.map((t) => (t.name === 't_dxt5' ? replaced.texture : t));
writeFileSync(join(outDir, 'retextured.ytd'), buildYtd(next));
toXml(join(outDir, 'retextured.ytd'), join(outDir, 'retextured.xml'));
const re = items(join(outDir, 'retextured.xml'));
const r5 = re.get('t_dxt5');
check('Retexture: Größe und Format der ersetzten Textur bleiben (32x16, DXT5)', !!r5 && r5.width === old.width && r5.height === old.height && r5.format === 'D3DFMT_DXT5');
const back = readYtd(new Uint8Array(readFileSync(join(outDir, 'retextured.ytd'))));
const mine = decodeTexture(back.find((t) => t.name === 't_dxt5')!);
check('Retexture: Pixel der ersetzten Textur sind rot', mine.data[0]! > 200 && mine.data[1]! < 50);
const untouched = ['t_dxt1', 't_dxt3', 't_ati1', 't_ati2'].every((n) => {
  const a = textures.find((t) => t.name === n)!;
  const b = back.find((t) => t.name === n)!;
  return Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) === 0;
});
check('Retexture: die übrigen Texturen sind unverändert', untouched);

process.exit(failed ? 1 : 0);
