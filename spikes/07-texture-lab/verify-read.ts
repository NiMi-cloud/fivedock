/**
 * Gegenprobe für den YTD-Leser mit einer fremden Quelle: CodeWalker baut aus DDS-Dateien ein YTD mit
 * mehreren Pixelformaten, unser Leser liest es, und die Pixel müssen Byte für Byte den DDS-Daten entsprechen.
 * Danach schreiben wir die gelesenen Texturen selbst zurück und lassen CodeWalker beide Dateien als XML ausgeben.
 *
 *   node spikes/07-texture-lab/verify-read.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildYtd, encodeMipChain, readYtd, writeDdsTexture } from '../../packages/rage-formats/src/index.ts';
import type { BlockFormat, RgbaImage, YtdTexture } from '../../packages/rage-formats/src/index.ts';

const root = resolve(import.meta.dirname, '..', '..');
const dotnet = join(root, '.dotnet', 'dotnet.exe');
const oracle = join(root, '.local', 'oracle', 'bin', 'Release', 'net10.0', 'Oracle.dll');
const outDir = join(root, '.local', 'verify', 'read');

if (!existsSync(dotnet) || !existsSync(oracle)) {
  console.log('ÜBERSPRUNGEN: lokales Vergleichswerkzeug fehlt (.local/).');
  process.exit(0);
}
mkdirSync(outDir, { recursive: true });
const env = { ...process.env, DOTNET_ROOT: join(root, '.dotnet'), DOTNET_NOLOGO: '1' };
const run = (...args: string[]) => execFileSync(dotnet, [oracle, ...args], { env, stdio: 'pipe' });

function gradient(width: number, height: number, seed: number): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set(
        [(x * 255) / (width - 1), (y * 255) / (height - 1), (seed * 53) % 256, x < width / 2 ? 255 : 128].map(Math.round),
        (y * width + x) * 4,
      );
    }
  }
  return { width, height, data };
}

interface Spec {
  name: string;
  width: number;
  height: number;
  format: BlockFormat;
  cwFormat: string;
  usage: string;
}
const specs: Spec[] = [
  { name: 't_dxt1', width: 64, height: 64, format: 'DXT1', cwFormat: 'D3DFMT_DXT1', usage: 'DIFFUSE' },
  { name: 't_dxt3', width: 32, height: 32, format: 'DXT3', cwFormat: 'D3DFMT_DXT3', usage: 'DIFFUSE' },
  { name: 't_dxt5', width: 32, height: 16, format: 'DXT5', cwFormat: 'D3DFMT_DXT5', usage: 'DIFFUSE' },
  { name: 't_ati1', width: 32, height: 32, format: 'ATI1', cwFormat: 'D3DFMT_ATI1', usage: 'SPECULAR' },
  { name: 't_ati2', width: 16, height: 16, format: 'ATI2', cwFormat: 'D3DFMT_ATI2', usage: 'NORMAL' },
];

const expected = new Map<string, YtdTexture>();
let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<TextureDictionary>\n';
specs.forEach((s, i) => {
  const { data, levels } = encodeMipChain(gradient(s.width, s.height, i + 1), s.format);
  const tex: YtdTexture = { name: s.name, width: s.width, height: s.height, levels, format: s.format, data };
  expected.set(s.name, tex);
  writeFileSync(join(outDir, `${s.name}.dds`), writeDdsTexture(tex));
  xml +=
    `  <Item>\n    <Name>${s.name}</Name>\n    <Unk32 value="0" />\n    <Usage>${s.usage}</Usage>\n    <UsageFlags>NOT_HALF</UsageFlags>\n` +
    `    <ExtraFlags value="0" />\n    <Width value="${s.width}" />\n    <Height value="${s.height}" />\n    <MipLevels value="${levels}" />\n` +
    `    <Format>${s.cwFormat}</Format>\n    <FileName>${s.name}.dds</FileName>\n  </Item>\n`;
});
xml += '</TextureDictionary>\n';
writeFileSync(join(outDir, 'mixed.ytd.xml'), xml);

let failed = false;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'OK    ' : 'FEHLER'}  ${label}${detail ? ` – ${detail}` : ''}`);
  if (!ok) failed = true;
}

// 1. CodeWalker baut das YTD aus XML und DDS.
try {
  run('ytd', join(outDir, 'mixed.ytd.xml'), join(outDir, 'codewalker.ytd'));
} catch (e) {
  console.log('FEHLER  CodeWalker konnte das YTD nicht bauen:\n' + String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 1200));
  process.exit(1);
}
const cwFile = new Uint8Array(readFileSync(join(outDir, 'codewalker.ytd')));

// 2. Unser Leser liest es.
const read = readYtd(cwFile);
check(`Leser findet alle ${specs.length} Texturen`, read.length === specs.length, `gefunden: ${read.map((t) => t.name).join(', ')}`);
for (const got of read) {
  const want = expected.get(got.name);
  if (!want) {
    check(`Textur ${got.name} ist erwartet`, false);
    continue;
  }
  const same = got.width === want.width && got.height === want.height && got.levels === want.levels && got.format === want.format;
  check(
    `${got.name}: ${got.width}x${got.height}, ${got.levels} Stufen, ${got.format}`,
    same,
    same ? '' : `erwartet ${want.width}x${want.height}, ${want.levels} Stufen, ${want.format}`,
  );
  check(`${got.name}: Pixeldaten (${got.data.length} Byte) stimmen mit der DDS-Quelle überein`, Buffer.compare(Buffer.from(got.data), Buffer.from(want.data)) === 0);
}
const usage = new Map(read.map((t) => [t.name, t.usage]));
check('Verwendungszweck wird gelesen (NORMAL = 22, SPECULAR = 23, DIFFUSE = 20)', usage.get('t_ati2') === 22 && usage.get('t_ati1') === 23 && usage.get('t_dxt1') === 20);

// 3. Wir schreiben dieselben Texturen selbst, CodeWalker liest beide Dateien, die XML-Ausgaben müssen gleich sein.
writeFileSync(join(outDir, 'ours.ytd'), buildYtd(read));
run('ytd2xml', join(outDir, 'codewalker.ytd'), join(outDir, 'codewalker.out.xml'));
run('ytd2xml', join(outDir, 'ours.ytd'), join(outDir, 'ours.out.xml'));
const norm = (file: string) => readFileSync(join(outDir, file), 'utf8').replace(/\r\n/g, '\n').trim();
const sameXml = norm('codewalker.out.xml') === norm('ours.out.xml');
check('CodeWalker liest unser neu geschriebenes YTD und meldet dieselben Texturen wie beim eigenen', sameXml);
if (!sameXml) console.log('--- CodeWalker ---\n' + norm('codewalker.out.xml') + '\n--- unsere Datei ---\n' + norm('ours.out.xml'));

process.exit(failed ? 1 : 0);
