/**
 * DDS-Schreiber (DirectDraw Surface), unkomprimiert 32 Bit BGRA, mit Mipmaps.
 *
 * Das Format ist von Microsoft öffentlich dokumentiert ("Programming Guide for DDS").
 * Unkomprimiert ist für Tests und kleine Texturen gültig; für echte Resources kommen später
 * BC1/BC3/BC7 dazu (kleiner im Speicher).
 */

import { mipSize, rowStride } from './ytd.ts';
import type { TextureFormat, YtdTexture } from './ytd.ts';

const DDS_MAGIC = 0x20534444; // "DDS "

const DDSD_CAPS = 0x1;
const DDSD_HEIGHT = 0x2;
const DDSD_WIDTH = 0x4;
const DDSD_PITCH = 0x8;
const DDSD_PIXELFORMAT = 0x1000;
const DDSD_MIPMAPCOUNT = 0x20000;

const DDPF_ALPHAPIXELS = 0x1;
const DDPF_RGB = 0x40;

const DDSCAPS_COMPLEX = 0x8;
const DDSCAPS_TEXTURE = 0x1000;
const DDSCAPS_MIPMAP = 0x400000;

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA, 8 Bit pro Kanal, Zeile für Zeile von oben nach unten (length = width * height * 4). */
  data: Uint8Array;
}

/** Anzahl Mip-Stufen bis 1x1 (inklusive der Basisstufe). */
export function mipLevelCount(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

/** Halbiert ein Bild mit einem 2x2-Boxfilter. Kanten mit ungerader Länge werden geklemmt. */
export function downsampleBox(src: RgbaImage): RgbaImage {
  const w = Math.max(1, src.width >> 1);
  const h = Math.max(1, src.height >> 1);
  const out = new Uint8Array(w * h * 4);

  for (let y = 0; y < h; y++) {
    const y0 = Math.min(src.height - 1, y * 2);
    const y1 = Math.min(src.height - 1, y * 2 + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.min(src.width - 1, x * 2);
      const x1 = Math.min(src.width - 1, x * 2 + 1);
      for (let c = 0; c < 4; c++) {
        const sum =
          src.data[(y0 * src.width + x0) * 4 + c]! +
          src.data[(y0 * src.width + x1) * 4 + c]! +
          src.data[(y1 * src.width + x0) * 4 + c]! +
          src.data[(y1 * src.width + x1) * 4 + c]!;
        out[(y * w + x) * 4 + c] = (sum + 2) >> 2;
      }
    }
  }
  return { width: w, height: h, data: out };
}

/** Erzeugt die komplette Mip-Kette (Stufe 0 zuerst) mit 2x2-Boxfilter. */
export function buildMipChain(image: RgbaImage): RgbaImage[] {
  const { width, height } = image;
  if (!isPowerOfTwo(width) || !isPowerOfTwo(height)) {
    throw new Error(`Texturgröße ${width}x${height} ist keine Zweierpotenz.`);
  }
  if (image.data.length !== width * height * 4) {
    throw new Error('Pixeldaten passen nicht zu Breite und Höhe.');
  }
  const levels: RgbaImage[] = [image];
  while (levels.length < mipLevelCount(width, height)) {
    levels.push(downsampleBox(levels[levels.length - 1]!));
  }
  return levels;
}

/**
 * Packt eine Mip-Kette als rohe BGRA-Bytes (Stufe 0 zuerst, ohne Kopf, ohne Lücken).
 * Das ist das Pixelformat "A8R8G8B8" im Spiel.
 */
export function packBgra(levels: RgbaImage[]): Uint8Array {
  const total = levels.reduce((sum, l) => sum + l.width * l.height * 4, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const level of levels) {
    for (let i = 0; i < level.width * level.height; i++) {
      out[offset++] = level.data[i * 4 + 2]!; // B
      out[offset++] = level.data[i * 4 + 1]!; // G
      out[offset++] = level.data[i * 4]!; // R
      out[offset++] = level.data[i * 4 + 3]!; // A
    }
  }
  return out;
}

/**
 * Schreibt ein DDS mit 32-Bit-BGRA-Pixeln und kompletter Mipmap-Kette.
 * Breite und Höhe müssen Zweierpotenzen sein (Voraussetzung für die Spiel-Texturen).
 */
export function writeDdsBgra(image: RgbaImage): Uint8Array {
  const { width, height } = image;
  const levels = buildMipChain(image);

  const headerSize = 4 + 124;
  const pixelBytes = levels.reduce((sum, l) => sum + l.width * l.height * 4, 0);
  const out = new Uint8Array(headerSize + pixelBytes);
  const view = new DataView(out.buffer);

  view.setUint32(0, DDS_MAGIC, true);
  view.setUint32(4, 124, true); // dwSize
  view.setUint32(8, DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_PITCH | DDSD_PIXELFORMAT | DDSD_MIPMAPCOUNT, true);
  view.setUint32(12, height, true);
  view.setUint32(16, width, true);
  view.setUint32(20, width * 4, true); // dwPitchOrLinearSize
  view.setUint32(24, 0, true); // dwDepth
  view.setUint32(28, levels.length, true); // dwMipMapCount
  // dwReserved1[11] bleibt 0 (Offsets 32..75)

  // DDS_PIXELFORMAT (Offset 76)
  view.setUint32(76, 32, true); // dwSize
  view.setUint32(80, DDPF_RGB | DDPF_ALPHAPIXELS, true);
  view.setUint32(84, 0, true); // dwFourCC
  view.setUint32(88, 32, true); // dwRGBBitCount
  view.setUint32(92, 0x00ff0000, true); // R-Maske
  view.setUint32(96, 0x0000ff00, true); // G-Maske
  view.setUint32(100, 0x000000ff, true); // B-Maske
  view.setUint32(104, 0xff000000, true); // A-Maske

  view.setUint32(108, DDSCAPS_TEXTURE | DDSCAPS_COMPLEX | DDSCAPS_MIPMAP, true); // dwCaps
  // dwCaps2..4 und dwReserved2 bleiben 0

  out.set(packBgra(levels), headerSize);
  return out;
}

const DDSD_LINEARSIZE = 0x80000;
const DDPF_ALPHA = 0x2;
const DDPF_FOURCC = 0x4;
const DDPF_LUMINANCE = 0x20000;

/** FourCC-Werte für Blockformate in DDS-Dateien. */
const DDS_FOURCC: Partial<Record<TextureFormat, string>> = {
  DXT1: 'DXT1',
  DXT3: 'DXT3',
  DXT5: 'DXT5',
  ATI1: 'ATI1',
  ATI2: 'ATI2',
};

/**
 * Schreibt eine Textur (mit allen vorhandenen Mip-Stufen) als DDS, damit man sie in Bildprogrammen
 * öffnen kann. Unterstützt A8R8G8B8, A8, L8, DXT1, DXT3, DXT5, ATI1 und ATI2.
 */
export function writeDdsTexture(texture: Pick<YtdTexture, 'width' | 'height' | 'levels' | 'format' | 'data'>): Uint8Array {
  const { width, height, levels, format, data } = texture;
  const headerSize = 4 + 124;
  const out = new Uint8Array(headerSize + data.length);
  const view = new DataView(out.buffer);

  view.setUint32(0, DDS_MAGIC, true);
  view.setUint32(4, 124, true);
  const fourCc = DDS_FOURCC[format];
  const firstLevelSize = mipSize(format, width, height);
  view.setUint32(8, DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_PIXELFORMAT | DDSD_MIPMAPCOUNT | (fourCc ? DDSD_LINEARSIZE : DDSD_PITCH), true);
  view.setUint32(12, height, true);
  view.setUint32(16, width, true);
  view.setUint32(20, fourCc ? firstLevelSize : rowStride(format, width), true);
  view.setUint32(28, levels, true);

  view.setUint32(76, 32, true);
  if (fourCc) {
    view.setUint32(80, DDPF_FOURCC, true);
    for (let i = 0; i < 4; i++) out[84 + i] = fourCc.charCodeAt(i);
  } else if (format === 'A8R8G8B8') {
    view.setUint32(80, DDPF_RGB | DDPF_ALPHAPIXELS, true);
    view.setUint32(88, 32, true);
    view.setUint32(92, 0x00ff0000, true);
    view.setUint32(96, 0x0000ff00, true);
    view.setUint32(100, 0x000000ff, true);
    view.setUint32(104, 0xff000000, true);
  } else if (format === 'A8') {
    view.setUint32(80, DDPF_ALPHA, true);
    view.setUint32(88, 8, true);
    view.setUint32(104, 0xff, true);
  } else if (format === 'L8') {
    view.setUint32(80, DDPF_LUMINANCE, true);
    view.setUint32(88, 8, true);
    view.setUint32(92, 0xff, true);
  } else {
    throw new Error(`Das Format ${format} kann nicht als DDS geschrieben werden.`);
  }
  view.setUint32(108, DDSCAPS_TEXTURE | (levels > 1 ? DDSCAPS_COMPLEX | DDSCAPS_MIPMAP : 0), true);
  out.set(data, headerSize);
  return out;
}

// --- Lesen ----------------------------------------------------------------------------------------------

export interface DdsTexture {
  width: number;
  height: number;
  /** Anzahl der vollständig vorhandenen Mip-Stufen (mindestens 1). */
  levels: number;
  /**
   * Anzahl der Mip-Stufen laut Dateikopf. Größer als `levels`, wenn der Exporter die kleinsten Stufen
   * unvollständig geschrieben hat (CodeWalker kürzt bei Blockformaten die Stufen unter 4x4 Pixel).
   */
  declaredLevels: number;
  format: TextureFormat;
  /** Mip-Kette der vollständigen Stufen ab Stufe 0 im Spielformat (ohne DDS-Kopf). */
  data: Uint8Array;
}

const BLOCK_COMPRESSED: ReadonlySet<TextureFormat> = new Set(['DXT1', 'DXT3', 'DXT5', 'ATI1', 'ATI2', 'BC7']);

const DDSCAPS2_CUBEMAP = 0x200;
const DDSCAPS2_VOLUME = 0x200000;

/** DXGI-Formate (DX10-Kopf), die wir kennen: [Format im Spiel, Byte-Reihenfolge der Pixel]. */
const DXGI_FORMATS = new Map<number, [TextureFormat, 'bgra' | 'rgba' | 'bgrx' | null]>([
  [71, ['DXT1', null]],
  [72, ['DXT1', null]],
  [74, ['DXT3', null]],
  [75, ['DXT3', null]],
  [77, ['DXT5', null]],
  [78, ['DXT5', null]],
  [80, ['ATI1', null]],
  [81, ['ATI1', null]],
  [83, ['ATI2', null]],
  [84, ['ATI2', null]],
  [98, ['BC7', null]],
  [99, ['BC7', null]],
  [87, ['A8R8G8B8', 'bgra']],
  [91, ['A8R8G8B8', 'bgra']],
  [88, ['A8R8G8B8', 'bgrx']],
  [93, ['A8R8G8B8', 'bgrx']],
  [28, ['A8R8G8B8', 'rgba']],
  [29, ['A8R8G8B8', 'rgba']],
  [61, ['L8', null]],
  [65, ['A8', null]],
]);

const FOURCC_FORMATS: Record<string, TextureFormat> = {
  DXT1: 'DXT1',
  DXT3: 'DXT3',
  DXT5: 'DXT5',
  ATI1: 'ATI1',
  BC4U: 'ATI1',
  ATI2: 'ATI2',
  BC5U: 'ATI2',
};

/** Wandelt 32- und 24-Bit-Pixel in die Byte-Reihenfolge B, G, R, A des Spiels um. */
function toBgra(src: Uint8Array, pixels: number, bytesPerPixel: 3 | 4, order: 'bgra' | 'rgba' | 'bgrx'): Uint8Array {
  const out = new Uint8Array(pixels * 4);
  const swap = order === 'rgba';
  for (let i = 0; i < pixels; i++) {
    const s = i * bytesPerPixel;
    const b = src[s + (swap ? 2 : 0)]!;
    const g = src[s + 1]!;
    const r = src[s + (swap ? 0 : 2)]!;
    out[i * 4] = b;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = r;
    out[i * 4 + 3] = bytesPerPixel === 4 && order !== 'bgrx' ? src[s + 3]! : 255;
  }
  return out;
}

/**
 * Liest eine DDS-Datei (2D-Textur, auch mit DX10-Kopf) und gibt sie im Spielformat zurück.
 * Blockformate werden unverändert übernommen, 24- und 32-Bit-Farbformate nach A8R8G8B8 umgeordnet.
 * Würfelkarten, Volumen- und Array-Texturen werden abgelehnt.
 */
export function readDds(file: Uint8Array): DdsTexture {
  if (file.length < 128) throw new Error('Die Datei ist zu kurz für eine DDS-Datei.');
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (view.getUint32(0, true) !== DDS_MAGIC) throw new Error('Keine DDS-Datei (Kennung stimmt nicht).');
  if (view.getUint32(4, true) !== 124) throw new Error('Unbekannte DDS-Kopfgröße.');

  const flags = view.getUint32(8, true);
  const height = view.getUint32(12, true);
  const width = view.getUint32(16, true);
  const mipCount = flags & DDSD_MIPMAPCOUNT ? Math.max(1, view.getUint32(28, true)) : 1;
  const pfFlags = view.getUint32(80, true);
  const bitCount = view.getUint32(88, true);
  const masks = [92, 96, 100, 104].map((o) => view.getUint32(o, true));
  const caps2 = view.getUint32(112, true);

  if (caps2 & DDSCAPS2_CUBEMAP) throw new Error('Würfelkarten (Cubemaps) werden nicht unterstützt.');
  if (caps2 & DDSCAPS2_VOLUME) throw new Error('Volumentexturen werden nicht unterstützt.');
  if (width < 1 || height < 1 || width > 16384 || height > 16384) throw new Error(`Ungültige Größe ${width}x${height}.`);

  let offset = 128;
  let format: TextureFormat;
  let order: 'bgra' | 'rgba' | 'bgrx' | null = null;
  let sourceBytes = 4;

  if (pfFlags & DDPF_FOURCC) {
    const fourCc = String.fromCharCode(file[84]!, file[85]!, file[86]!, file[87]!);
    if (fourCc === 'DX10') {
      if (file.length < 148) throw new Error('Der DX10-Kopf der DDS-Datei fehlt.');
      const dxgi = view.getUint32(128, true);
      const dimension = view.getUint32(132, true);
      const misc = view.getUint32(136, true);
      const arraySize = view.getUint32(140, true);
      if (dimension !== 3 || arraySize !== 1 || misc & 0x4) throw new Error('Nur einfache 2D-Texturen werden unterstützt.');
      const known = DXGI_FORMATS.get(dxgi);
      if (!known) throw new Error(`DXGI-Format ${dxgi} wird nicht unterstützt.`);
      [format, order] = known;
      offset = 148;
    } else {
      const known = FOURCC_FORMATS[fourCc];
      if (!known) throw new Error(`Pixelformat „${fourCc}“ wird nicht unterstützt.`);
      format = known;
    }
  } else if (pfFlags & DDPF_RGB) {
    const [r, g, b, a] = masks as [number, number, number, number];
    if (bitCount === 32 && r === 0x00ff0000 && g === 0x0000ff00 && b === 0x000000ff) {
      format = 'A8R8G8B8';
      order = a === 0 || !(pfFlags & DDPF_ALPHAPIXELS) ? 'bgrx' : 'bgra';
    } else if (bitCount === 32 && r === 0x000000ff && g === 0x0000ff00 && b === 0x00ff0000) {
      format = 'A8R8G8B8';
      order = 'rgba';
      if (a === 0 || !(pfFlags & DDPF_ALPHAPIXELS)) throw new Error('RGBX-Pixel ohne Alpha werden nicht unterstützt.');
    } else if (bitCount === 24 && r === 0x00ff0000 && g === 0x0000ff00 && b === 0x000000ff) {
      format = 'A8R8G8B8';
      order = 'bgrx';
      sourceBytes = 3;
    } else {
      throw new Error('Dieses unkomprimierte Pixelformat wird nicht unterstützt (erwartet 24 oder 32 Bit RGB).');
    }
  } else if (pfFlags & DDPF_LUMINANCE && bitCount === 8) {
    format = 'L8';
  } else if (pfFlags & DDPF_ALPHA && bitCount === 8) {
    format = 'A8';
  } else {
    throw new Error('Dieses Pixelformat wird nicht unterstützt.');
  }
  if (format === 'A8R8G8B8' && order === null) order = 'bgra';

  const maxLevels = Math.floor(Math.log2(Math.max(width, height))) + 1;
  const levels = Math.min(mipCount, maxLevels);

  // Ein DX10-Kopf mit BGRA/RGBA liefert die Quellbytes je Pixel gleich 4.
  const storedFormat = order ? 'A8R8G8B8' : format;
  const sizeFor = (n: number) => mipChainSizeFor(storedFormat, width, height, n, order ? sourceBytes : undefined);
  const available = file.length - offset;

  // Fehlende Bytes am Ende verzeiht nur der Fall, dass bei Blockformaten die Stufen unter einem Block fehlen.
  let usable = levels;
  while (usable > 1 && available < sizeFor(usable)) usable--;
  const droppedOnlyTiny = Array.from({ length: levels - usable }, (_, i) => usable + i).every(
    (i) => Math.min(Math.max(1, width >> i), Math.max(1, height >> i)) < 4,
  );
  if (available < sizeFor(usable) || (usable < levels && !(BLOCK_COMPRESSED.has(format) && droppedOnlyTiny))) {
    throw new Error(`Die DDS-Datei ist unvollständig (${available} statt ${sizeFor(levels)} Bytes Pixeldaten).`);
  }
  const payload = file.subarray(offset, offset + sizeFor(usable));

  if (!order || (order === 'bgra' && sourceBytes === 4)) {
    return { width, height, levels: usable, declaredLevels: levels, format, data: payload.slice() };
  }
  // Umordnen Stufe für Stufe (bei 24 Bit oder anderer Byte-Reihenfolge)
  const parts: Uint8Array[] = [];
  let cursor = 0;
  let w = width;
  let h = height;
  for (let i = 0; i < usable; i++) {
    const pixels = w * h;
    parts.push(toBgra(payload.subarray(cursor, cursor + pixels * sourceBytes), pixels, sourceBytes as 3 | 4, order));
    cursor += pixels * sourceBytes;
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
  }
  const data = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    data.set(p, o);
    o += p.length;
  }
  return { width, height, levels: usable, declaredLevels: levels, format, data };
}

/** Größe der Mip-Kette im Quellformat; bei 24-Bit-Pixeln `bytesPerPixel` = 3. */
function mipChainSizeFor(format: TextureFormat, width: number, height: number, levels: number, bytesPerPixel?: number): number {
  let total = 0;
  let w = width;
  let h = height;
  for (let i = 0; i < levels; i++) {
    total += bytesPerPixel !== undefined ? w * h * bytesPerPixel : mipSize(format, w, h);
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
  }
  return total;
}

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}
