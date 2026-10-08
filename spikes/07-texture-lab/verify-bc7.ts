/**
 * Gegenprobe für den BC7-Dekodierer mit einem unabhängigen Dekodierer (Pillow):
 *  1. Zufällige Blöcke aller acht Modi (je 4096), als DDS mit DX10-Kopf geschrieben, von Pillow gelesen und Pixel für Pixel verglichen.
 *  2. Alle BC7-Texturen eines echten Fahrzeugs (falls lokal vorhanden), jeweils die volle Stufe.
 *
 *   python -m pip install --user pillow
 *   node spikes/07-texture-lab/verify-bc7.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodeBc7, readYtd } from '../../packages/rage-formats/src/index.ts';

const root = resolve(import.meta.dirname, '..', '..');
const outDir = join(root, '.local', 'verify', 'bc7');
mkdirSync(outDir, { recursive: true });
const script = join(import.meta.dirname, 'pillow_decode.py');

try {
  execFileSync('python', ['-c', 'import PIL'], { stdio: 'pipe' });
} catch {
  console.log('ÜBERSPRUNGEN: Python mit Pillow fehlt (python -m pip install --user pillow).');
  process.exit(0);
}

let failed = false;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'OK    ' : 'FEHLER'}  ${label}${detail ? ` – ${detail}` : ''}`);
  if (!ok) failed = true;
}

function ddsBc7(width: number, height: number, blocks: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + 124 + 20 + blocks.length);
  const view = new DataView(out.buffer);
  out.set([0x44, 0x44, 0x53, 0x20], 0); // "DDS "
  view.setUint32(4, 124, true);
  view.setUint32(8, 0x1 | 0x2 | 0x4 | 0x1000 | 0x80000, true); // CAPS | HEIGHT | WIDTH | PIXELFORMAT | LINEARSIZE
  view.setUint32(12, height, true);
  view.setUint32(16, width, true);
  view.setUint32(20, blocks.length, true);
  view.setUint32(28, 1, true); // Mip-Zahl
  view.setUint32(76, 32, true); // Größe von DDS_PIXELFORMAT
  view.setUint32(80, 4, true); // FOURCC
  out.set([0x44, 0x58, 0x31, 0x30], 84); // "DX10"
  view.setUint32(108, 0x1000, true); // CAPS: TEXTURE
  view.setUint32(128, 98, true); // DXGI_FORMAT_BC7_UNORM
  view.setUint32(132, 3, true); // Texture2D
  view.setUint32(140, 1, true); // Arraygröße
  out.set(blocks, 148);
  return out;
}

function pillow(name: string, width: number, height: number, blocks: Uint8Array): Uint8Array {
  const dds = join(outDir, `${name}.dds`);
  const raw = join(outDir, `${name}.rgba`);
  writeFileSync(dds, ddsBc7(width, height, blocks));
  execFileSync('python', [script, dds, raw], { stdio: 'pipe' });
  return new Uint8Array(readFileSync(raw));
}

function compare(expected: Uint8Array, actual: Uint8Array): { wrong: number; first: number } {
  let wrong = 0;
  let first = -1;
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== actual[i]) {
      wrong++;
      if (first < 0) first = i;
    }
  }
  return { wrong, first };
}

// 1. Zufällige Blöcke je Modus (feste Startzahl, damit der Lauf wiederholbar ist)
let seed = 0x9e3779b9;
const random = () => {
  seed ^= seed << 13;
  seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  seed >>>= 0;
  return seed;
};
const PER_MODE = 4096;
for (let mode = 0; mode < 8; mode++) {
  const blocks = new Uint8Array(PER_MODE * 16);
  for (let i = 0; i < blocks.length; i++) blocks[i] = random() & 0xff;
  for (let b = 0; b < PER_MODE; b++) {
    // Die Modusnummer steht in den niedrigsten Bits: m Nullen, dann eine Eins.
    const o = b * 16;
    blocks[o] = (blocks[o]! & ~((1 << (mode + 1)) - 1) & 0xff) | (1 << mode);
  }
  const width = 64 * 4;
  const height = (PER_MODE / 64) * 4;
  const expected = pillow(`mode${mode}`, width, height, blocks);
  const actual = decodeBc7(blocks, width, height).data;
  const { wrong, first } = compare(expected, actual);
  check(`Modus ${mode}: ${PER_MODE} zufällige Blöcke stimmen mit Pillow überein`, wrong === 0, wrong ? `${wrong} abweichende Werte, erster bei ${first}` : '');
}

// 2. Echte Texturen
const ytdPath = join(root, '.local', 'vehicles', '20fpiu', 'stream', '20fpiu.ytd');
if (existsSync(ytdPath)) {
  const textures = readYtd(new Uint8Array(readFileSync(ytdPath))).filter((t) => t.format === 'BC7' && t.width % 4 === 0 && t.height % 4 === 0);
  let same = 0;
  const bad: string[] = [];
  for (const t of textures) {
    const level0 = t.data.subarray(0, (t.width / 4) * (t.height / 4) * 16);
    const expected = pillow(`real_${same}`, t.width, t.height, level0);
    const { wrong } = compare(expected, decodeBc7(level0, t.width, t.height).data);
    if (wrong === 0) same++;
    else bad.push(`${t.name} (${wrong})`);
  }
  check(`Echte BC7-Texturen des Fahrzeugs: ${textures.length} verglichen`, bad.length === 0 && textures.length > 0, bad.length ? bad.slice(0, 5).join(', ') : `${same} stimmen vollständig überein`);
} else {
  console.log('INFO    Fahrzeugdatei nicht vorhanden, echte Texturen übersprungen.');
}

process.exit(failed ? 1 : 0);
