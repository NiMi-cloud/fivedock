/**
 * YTD (Texture Dictionary) schreiben, Legacy-Format (Version 13), das FiveM lädt.
 *
 * Aufbau im Systemspeicher (jeweils ein Block):
 *   TextureDictionary (64 B)   Wurzelobjekt, Adresse 0x50000000
 *   ResourcePagesInfo (20 B)   Seitenzahlen
 *   Hash-Array (4 B je Textur) sortiert aufsteigend
 *   Zeiger-Array (8 B je Textur) in derselben Reihenfolge
 *   Texture (144 B) + Name (C-String) je Textur
 * Im Grafikspeicher liegt je Textur ein Block mit der Mip-Kette (Stufe 0 zuerst, ohne Lücken).
 *
 * Die Feldpositionen wurden gegen Referenzdateien (CodeWalker-Ausgabe) geprüft, siehe ytd.test.ts
 * und spikes/03-ytd-verify.
 */

import { joaat } from './jenkins.ts';
import { BlockWriter, GRAPHICS_BASE, ResourceBlock, SYSTEM_BASE, buildResource, parseResource } from './rsc7.ts';

export const YTD_VERSION = 13;

export type TextureFormat = 'A8R8G8B8' | 'A8' | 'L8' | 'DXT1' | 'DXT3' | 'DXT5' | 'ATI1' | 'ATI2' | 'BC7';

/** Zahlenwerte, die im Spiel für das Format stehen (D3DFMT-Werte beziehungsweise FourCC). */
export const TEXTURE_FORMAT_ID: Record<TextureFormat, number> = {
  A8R8G8B8: 21,
  A8: 28,
  L8: 50,
  DXT1: 0x31545844,
  DXT3: 0x33545844,
  DXT5: 0x35545844,
  ATI1: 0x31495441,
  ATI2: 0x32495441,
  BC7: 0x20374342,
};

/** Verwendungszweck einer Textur (untere 5 Bit der Nutzungsdaten). */
export const TEXTURE_USAGE = {
  UNKNOWN: 0,
  DEFAULT: 1,
  DIFFUSE: 20,
  DETAIL: 21,
  NORMAL: 22,
  SPECULAR: 23,
  EMISSIVE: 24,
  TINTPALETTE: 25,
} as const;

export const TEXTURE_USAGE_FLAG_NOT_HALF = 1;

const BLOCK_FORMATS: Partial<Record<TextureFormat, number>> = {
  DXT1: 8,
  ATI1: 8,
  DXT3: 16,
  DXT5: 16,
  ATI2: 16,
  BC7: 16,
};

const PIXEL_BYTES: Partial<Record<TextureFormat, number>> = { A8R8G8B8: 4, A8: 1, L8: 1 };

/** Bytes pro Bildzeile (bei Blockformaten pro Blockzeile). */
export function rowStride(format: TextureFormat, width: number): number {
  const blockBytes = BLOCK_FORMATS[format];
  if (blockBytes !== undefined) return Math.max(1, Math.ceil(width / 4)) * blockBytes;
  return width * (PIXEL_BYTES[format] ?? 4);
}

/** Größe einer einzelnen Mip-Stufe in Bytes. */
export function mipSize(format: TextureFormat, width: number, height: number): number {
  const blockBytes = BLOCK_FORMATS[format];
  if (blockBytes !== undefined) return Math.max(1, Math.ceil(width / 4)) * Math.max(1, Math.ceil(height / 4)) * blockBytes;
  return width * height * (PIXEL_BYTES[format] ?? 4);
}

/** Gesamtgröße der Mip-Kette ab Stufe 0. */
export function mipChainSize(format: TextureFormat, width: number, height: number, levels: number): number {
  let total = 0;
  let w = width;
  let h = height;
  for (let i = 0; i < levels; i++) {
    total += mipSize(format, w, h);
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
  }
  return total;
}

export interface YtdTexture {
  /** Name ohne Endung. Wird für den Hash klein geschrieben. */
  name: string;
  width: number;
  height: number;
  /** Anzahl der Mip-Stufen (mindestens 1). */
  levels: number;
  format: TextureFormat;
  /** Mip-Kette ab Stufe 0, ohne DDS-Kopf. */
  data: Uint8Array;
  usage?: number;
  usageFlags?: number;
  /** Zusatzflags aus dem Spiel (Offset 0x44). Werden beim Lesen übernommen und unverändert zurückgeschrieben. */
  extraFlags?: number;
  /**
   * Unbekanntes 16-Bit-Feld im Texturkopf (Offset 0x32, bei CodeWalker "Unk32"). In den Texturen echter Fahrzeuge steht dort 128,
   * CodeWalker schreibt für neue Texturen 0. Wir übernehmen den gelesenen Wert unverändert, damit ein neu geschriebenes YTD
   * die nicht bearbeiteten Texturen nicht verändert.
   */
  unknown32?: number;
}

export interface BuildYtdOptions {
  /**
   * Erlaubt Texturgrößen, die keine Zweierpotenz sind. Neue Texturen sollen Zweierpotenzen bleiben;
   * die Option gibt es, damit bestehende Dateien unverändert zurückgeschrieben werden können.
   */
  allowNonPowerOfTwo?: boolean;
}

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

function validateTexture(t: YtdTexture, options: BuildYtdOptions): void {
  if (!/^[\x21-\x7e]+$/.test(t.name)) throw new Error(`Ungültiger Texturname "${t.name}" (nur sichtbare ASCII-Zeichen).`);
  if (options.allowNonPowerOfTwo) {
    if (!Number.isInteger(t.width) || !Number.isInteger(t.height) || t.width < 1 || t.height < 1) {
      throw new Error(`Textur ${t.name}: ungültige Größe ${t.width}x${t.height}.`);
    }
  } else if (!isPowerOfTwo(t.width) || !isPowerOfTwo(t.height)) {
    throw new Error(`Textur ${t.name}: ${t.width}x${t.height} ist keine Zweierpotenz.`);
  }
  if (t.width > 16384 || t.height > 16384) throw new Error(`Textur ${t.name}: zu groß.`);
  const maxLevels = Math.floor(Math.log2(Math.max(t.width, t.height))) + 1;
  if (!Number.isInteger(t.levels) || t.levels < 1 || t.levels > maxLevels) {
    throw new Error(`Textur ${t.name}: ${t.levels} Mip-Stufen sind ungültig (1 bis ${maxLevels}).`);
  }
  const expected = mipChainSize(t.format, t.width, t.height, t.levels);
  if (t.data.length !== expected) {
    throw new Error(`Textur ${t.name}: ${t.data.length} Bytes Pixeldaten, erwartet ${expected}.`);
  }
}

const DICTIONARY_SIZE = 64;
const PAGES_INFO_SIZE = 20;
const TEXTURE_SIZE = 144;

/** Baut ein YTD mit den angegebenen Texturen. */
export function buildYtd(textures: YtdTexture[], options: BuildYtdOptions = {}): Uint8Array {
  if (textures.length === 0) throw new Error('Ein YTD braucht mindestens eine Textur.');
  if (textures.length > 0xffff) throw new Error('Zu viele Texturen.');
  textures.forEach((t) => validateTexture(t, options));

  const entries = textures
    .map((t) => ({ t, hash: joaat(t.name) }))
    .sort((a, b) => a.hash - b.hash);
  for (let i = 1; i < entries.length; i++) {
    if (entries[i]!.hash === entries[i - 1]!.hash) {
      throw new Error(`Texturnamen kollidieren: "${entries[i - 1]!.t.name}" und "${entries[i]!.t.name}" haben denselben Hash.`);
    }
  }
  const n = entries.length;

  const pagesInfo = new ResourceBlock(
    PAGES_INFO_SIZE,
    (w: BlockWriter, ctx) => {
      w.u8(8, ctx.systemPageCount);
      w.u8(9, ctx.graphicsPageCount);
    },
    'pagesInfo',
  );
  const hashArray = new ResourceBlock(
    4 * n,
    (w) => entries.forEach((e, i) => w.u32(i * 4, e.hash)),
    'hashes',
  );
  const textureBlocks: ResourceBlock[] = [];
  const nameBlocks: ResourceBlock[] = [];
  const dataBlocks: ResourceBlock[] = [];

  entries.forEach(({ t }) => {
    const name = new ResourceBlock(t.name.length + 1, (w) => w.cstring(0, t.name), `name:${t.name}`);
    const data = new ResourceBlock(t.data.length, (w) => w.copy(0, t.data), `pixels:${t.name}`);
    const stride = rowStride(t.format, t.width);
    const usage = (t.usage ?? TEXTURE_USAGE.DIFFUSE) & 0x1f;
    const usageFlags = t.usageFlags ?? TEXTURE_USAGE_FLAG_NOT_HALF;

    const texture = new ResourceBlock(
      TEXTURE_SIZE,
      (w) => {
        w.u32(0x04, 1);
        w.pointer(0x28, name);
        w.u16(0x30, 1);
        w.u16(0x32, t.unknown32 ?? 0);
        w.u32(0x40, (usage | (usageFlags << 5)) >>> 0);
        w.u32(0x44, t.extraFlags ?? 0);
        w.u16(0x50, t.width);
        w.u16(0x52, t.height);
        w.u16(0x54, 1); // Tiefe
        w.u16(0x56, stride);
        w.u32(0x58, TEXTURE_FORMAT_ID[t.format]);
        w.u8(0x5d, t.levels);
        w.pointer(0x70, data);
      },
      `texture:${t.name}`,
    );
    textureBlocks.push(texture);
    nameBlocks.push(name);
    dataBlocks.push(data);
  });

  const pointerArray = new ResourceBlock(
    8 * n,
    (w) => textureBlocks.forEach((b, i) => w.pointer(i * 8, b)),
    'texturePointers',
  );

  const root = new ResourceBlock(
    DICTIONARY_SIZE,
    (w) => {
      w.u32(0x04, 1);
      w.pointer(0x08, pagesInfo);
      w.u32(0x18, 1);
      // Liste der Namens-Hashes
      w.pointer(0x20, hashArray);
      w.u16(0x28, n);
      w.u16(0x2a, n);
      // Liste der Textur-Zeiger
      w.pointer(0x30, pointerArray);
      w.u16(0x38, n);
      w.u16(0x3a, n);
    },
    'textureDictionary',
  );

  return buildResource({
    version: YTD_VERSION,
    system: [root, pagesInfo, hashArray, pointerArray, ...textureBlocks, ...nameBlocks],
    graphics: dataBlocks,
  });
}

// --- Lesen ----------------------------------------------------------------------------------------------

const FORMAT_BY_ID = new Map<number, TextureFormat>(
  (Object.entries(TEXTURE_FORMAT_ID) as [TextureFormat, number][]).map(([format, id]) => [id, format]),
);

/** Liest einen Speicherbereich über virtuelle Adressen (System ab 0x50000000, Grafik ab 0x60000000). */
class AddressSpace {
  private readonly system: Uint8Array;
  private readonly graphics: Uint8Array;
  private readonly view: DataView;

  constructor(system: Uint8Array, graphics: Uint8Array) {
    this.system = system;
    this.graphics = graphics;
    this.view = new DataView(system.buffer, system.byteOffset, system.byteLength);
  }

  /** Versatz im Systemspeicher für eine Adresse, mit Prüfung gegen Zeiger ins Leere. */
  private systemOffset(address: number, size: number, what: string): number {
    const offset = address - SYSTEM_BASE;
    if (address < SYSTEM_BASE || offset + size > this.system.length) {
      throw new YtdReadError('corrupt', `Beschädigtes YTD: ${what} zeigt auf eine ungültige Adresse (0x${address.toString(16)}).`);
    }
    return offset;
  }

  u8(offset: number): number {
    return this.view.getUint8(offset);
  }

  u16(offset: number): number {
    return this.view.getUint16(offset, true);
  }

  u32(offset: number): number {
    return this.view.getUint32(offset, true);
  }

  /** 64-Bit-Zeiger. Die Adressen liegen unter 2^32, daher genügen die unteren 32 Bit plus Prüfung der oberen. */
  pointer(offset: number): number {
    const low = this.view.getUint32(offset, true);
    const high = this.view.getUint32(offset + 4, true);
    return high * 0x100000000 + low;
  }

  systemBlock(address: number, size: number, what: string): number {
    return this.systemOffset(address, size, what);
  }

  cstring(address: number, what: string): string {
    const start = this.systemOffset(address, 1, what);
    let end = start;
    while (end < this.system.length && this.system[end] !== 0) end++;
    return String.fromCharCode(...this.system.subarray(start, end));
  }

  graphicsBlock(address: number, size: number, what: string): Uint8Array {
    const offset = address - GRAPHICS_BASE;
    if (address < GRAPHICS_BASE || offset + size > this.graphics.length) {
      throw new YtdReadError('corrupt', `Beschädigtes YTD: Pixeldaten von ${what} liegen außerhalb des Grafikspeichers.`);
    }
    return this.graphics.slice(offset, offset + size);
  }
}

export type YtdReadErrorCode = 'encrypted' | 'not-rsc7' | 'enhanced' | 'wrong-version' | 'unsupported-format' | 'corrupt';

/** Fehler beim Lesen eines YTD. Der Code erlaubt es Oberflächen, den Grund verständlich zu melden. */
export class YtdReadError extends Error {
  readonly code: YtdReadErrorCode;

  constructor(code: YtdReadErrorCode, message: string) {
    super(message);
    this.name = 'YtdReadError';
    this.code = code;
  }
}

/** Cfx.re-verschlüsselte Dateien (Escrow) beginnen mit "FXAP". */
const ENCRYPTED_MAGIC = 0x50415846;

/**
 * Liest ein YTD (Legacy, Version 13) und gibt die Texturen in der Reihenfolge der Datei zurück.
 * Die Pixeldaten werden kopiert, die Eingabe bleibt unberührt. Fehler sind `YtdReadError`.
 */
export function readYtd(file: Uint8Array): YtdTexture[] {
  if (file.length >= 4 && new DataView(file.buffer, file.byteOffset, file.byteLength).getUint32(0, true) === ENCRYPTED_MAGIC) {
    throw new YtdReadError('encrypted', 'Die Datei ist verschlüsselt (Cfx.re-Escrow) und kann nicht gelesen werden.');
  }
  let res: ReturnType<typeof parseResource>;
  try {
    res = parseResource(file);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new YtdReadError(message.includes('RSC7') ? 'not-rsc7' : 'corrupt', message);
  }
  if (res.version !== YTD_VERSION) {
    if (res.version === 5) {
      throw new YtdReadError('enhanced', 'Dieses YTD stammt aus GTA V Enhanced (Version 5). FiveM lädt nur das Legacy-Format (Version 13).');
    }
    throw new YtdReadError('wrong-version', `Keine Texture-Dictionary-Datei (Version ${res.version}, erwartet ${YTD_VERSION}).`);
  }
  const mem = new AddressSpace(res.system, res.graphics);
  if (res.system.length < DICTIONARY_SIZE) throw new YtdReadError('corrupt', 'Beschädigtes YTD: Wurzelobjekt fehlt.');

  const count = mem.u16(0x38);
  if (count === 0) return [];
  const pointers = mem.systemBlock(mem.pointer(0x30), count * 8, 'die Texturliste');

  const textures: YtdTexture[] = [];
  for (let i = 0; i < count; i++) {
    const textureOffset = mem.systemBlock(mem.pointer(pointers + i * 8), TEXTURE_SIZE, `Textur ${i}`);
    const name = mem.cstring(mem.pointer(textureOffset + 0x28), `der Name von Textur ${i}`);
    const width = mem.u16(textureOffset + 0x50);
    const height = mem.u16(textureOffset + 0x52);
    const formatId = mem.u32(textureOffset + 0x58);
    const levels = mem.u8(textureOffset + 0x5d);
    const format = FORMAT_BY_ID.get(formatId);
    if (!format) {
      throw new YtdReadError('unsupported-format', `Textur "${name}": Pixelformat 0x${formatId.toString(16)} wird nicht unterstützt.`);
    }
    if (width < 1 || height < 1 || levels < 1) throw new YtdReadError('corrupt', `Textur "${name}": ungültige Größe oder Mip-Anzahl.`);
    const usageData = mem.u32(textureOffset + 0x40);
    const data = mem.graphicsBlock(mem.pointer(textureOffset + 0x70), mipChainSize(format, width, height, levels), `"${name}"`);
    textures.push({
      name,
      width,
      height,
      levels,
      format,
      data,
      usage: usageData & 0x1f,
      usageFlags: usageData >>> 5,
      extraFlags: mem.u32(textureOffset + 0x44),
      unknown32: mem.u16(textureOffset + 0x32),
    });
  }
  return textures;
}
