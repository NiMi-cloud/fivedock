/**
 * RSC7-Container: so verpackt GTA V Resource-Dateien (YTD, YDR, YFT, YTYP ...).
 *
 * Aufbau der Datei:
 *   u32  Magic "RSC7" (0x37435352)
 *   u32  Version (je Dateityp, z. B. YTD 13, YDR 165, Meta 2)
 *   u32  Systemflags   = Seitenlayout des Systemspeichers  | (Version >> 4) << 28
 *   u32  Grafikflags   = Seitenlayout des Grafikspeichers  | (Version & 15) << 28
 *   ...  Rohes Deflate über (Systemseiten, danach Grafikseiten)
 *
 * Die Objekte liegen in "Blöcken". Zeiger zwischen Blöcken sind virtuelle 64-Bit-Adressen:
 * Systemspeicher beginnt bei 0x50000000, Grafikspeicher bei 0x60000000. Ein Block darf nicht über
 * eine Seitengrenze hinausragen. Im Systemspeicher liegt das Wurzelobjekt immer ganz vorn (Adresse 0x50000000).
 *
 * Seitenflags (Bits): 0-3 Basisverschiebung (Basisgröße = 0x200 << Wert), danach je Seitengröße die Anzahl
 * Seiten. Dieser Schreiber nutzt nur eine Seitengröße (Bits 17-23, Größe = Basisgröße << 4, bis 127 Seiten).
 */

import { deflateSync, inflateSync } from 'fflate';

export const RSC7_MAGIC = 0x37435352;
export const SYSTEM_BASE = 0x50000000;
export const GRAPHICS_BASE = 0x60000000;

const BLOCK_ALIGN = 16;
const MIN_PAGE_SIZE = 0x2000;
const MAX_PAGES = 63; // pro Speicherbereich; beide zusammen bleiben so unter dem Limit von 128

function align(value: number, to: number): number {
  return Math.ceil(value / to) * to;
}

/** Hilfsklasse zum Beschreiben eines Blocks (Little Endian). */
export class BlockWriter {
  readonly bytes: Uint8Array;
  readonly view: DataView;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  u8(offset: number, value: number): void {
    this.view.setUint8(offset, value);
  }

  u16(offset: number, value: number): void {
    this.view.setUint16(offset, value, true);
  }

  u32(offset: number, value: number): void {
    this.view.setUint32(offset, value >>> 0, true);
  }

  f32(offset: number, value: number): void {
    this.view.setFloat32(offset, value, true);
  }

  /** Schreibt eine 64-Bit-Zahl (nur Werte unter 2^53, reicht für Adressen). */
  u64(offset: number, value: number): void {
    this.view.setUint32(offset, value >>> 0, true);
    this.view.setUint32(offset + 4, Math.floor(value / 0x100000000) >>> 0, true);
  }

  /** Zeiger auf einen anderen Block (virtuelle Adresse) oder 0 für "kein Ziel". */
  pointer(offset: number, target: ResourceBlock | null): void {
    this.u64(offset, target ? target.address : 0);
  }

  copy(offset: number, data: Uint8Array): void {
    this.bytes.set(data, offset);
  }

  /** ASCII-Text mit abschließender Null. */
  cstring(offset: number, text: string): void {
    for (let i = 0; i < text.length; i++) this.bytes[offset + i] = text.charCodeAt(i) & 0x7f;
    this.bytes[offset + text.length] = 0;
  }
}

export interface BuildContext {
  /** Anzahl der Seiten im Systemspeicher (nach der Planung bekannt). */
  systemPageCount: number;
  graphicsPageCount: number;
}

export type BlockFill = (writer: BlockWriter, context: BuildContext) => void;

/** Ein zusammenhängender Datenblock mit fester Größe. Die Adresse wird bei der Planung vergeben. */
export class ResourceBlock {
  /** Virtuelle Adresse, erst nach `buildResource`-Planung gültig. */
  address = 0;
  readonly size: number;
  readonly fill: BlockFill;
  readonly label: string;

  constructor(size: number, fill: BlockFill, label = '') {
    if (!Number.isInteger(size) || size <= 0) throw new Error(`Ungültige Blockgröße ${size} (${label}).`);
    this.size = size;
    this.fill = fill;
    this.label = label;
  }
}

export interface PagePlan {
  base: number;
  pageSize: number;
  pageCount: number;
  /** Seitenflags ohne die oberen vier Versionsbits. */
  flags: number;
  blocks: ResourceBlock[];
}

/**
 * Verteilt Blöcke auf gleich große Seiten und vergibt ihre Adressen.
 * Der erste Block bleibt vorn (Wurzel), alle weiteren werden nach Größe absteigend sortiert.
 */
export type FlagStyle = 'standard' | 'meta';

/**
 * Kodierung der Seitenflags für `count` Seiten à 2^k Bytes.
 *  - standard: Anzahl im 7-Bit-Feld der Größenklasse "Basis << 4" (bis 127 Seiten).
 *  - meta: Gesamtgröße in Basiseinheiten als Binärzahl (Bits 27..24 und 23..17). So kodieren Meta-Dateien
 *    (YTYP, YMAP) ihre Seiten; sie werden in der Praxis damit geladen.
 */
function encodePageFlags(pageSize: number, pageCount: number, style: FlagStyle): number {
  if (style === 'standard') {
    const baseShift = Math.log2(pageSize / MIN_PAGE_SIZE);
    if (baseShift > 0xf) throw new Error('Die Daten sind zu groß für eine Resource-Datei.');
    return baseShift | (pageCount << 17);
  }
  const shift = Math.log2(pageSize / 0x200);
  if (shift > 0xf) throw new Error('Die Daten sind zu groß für eine Resource-Datei.');
  const n = pageCount;
  const high = n >> 4;
  if (high > 0x7f) throw new Error('Zu viele Seiten für eine Meta-Datei.');
  return (
    shift |
    ((n & 1) << 27) |
    (((n >> 1) & 1) << 26) |
    (((n >> 2) & 1) << 25) |
    (((n >> 3) & 1) << 24) |
    (high << 17)
  );
}

export function planPages(blocks: ResourceBlock[], base: number, style: FlagStyle = 'standard'): PagePlan {
  if (blocks.length === 0) return { base, pageSize: 0, pageCount: 0, flags: 0, blocks: [] };

  const [root, ...rest] = blocks;
  const ordered = [root!, ...rest.sort((a, b) => b.size - a.size)];
  const largest = Math.max(...ordered.map((b) => align(b.size, BLOCK_ALIGN)));

  let pageSize = MIN_PAGE_SIZE;
  while (pageSize < largest) pageSize *= 2;

  for (;;) {
    let cursor = 0; // Position innerhalb des gesamten Bereichs
    let pageCount = 1;
    for (const block of ordered) {
      const need = align(block.size, BLOCK_ALIGN);
      const pageStart = (pageCount - 1) * pageSize;
      if (cursor - pageStart + need > pageSize) {
        pageCount++;
        cursor = (pageCount - 1) * pageSize;
      }
      block.address = base + cursor;
      cursor += need;
    }

    if (pageCount <= MAX_PAGES) {
      return { base, pageSize, pageCount, flags: encodePageFlags(pageSize, pageCount, style), blocks: ordered };
    }
    pageSize *= 2;
  }
}

function render(plan: PagePlan, context: BuildContext): Uint8Array {
  const out = new Uint8Array(plan.pageSize * plan.pageCount);
  for (const block of plan.blocks) {
    const start = block.address - plan.base;
    block.fill(new BlockWriter(out.subarray(start, start + block.size)), context);
  }
  return out;
}

export interface ResourceSpec {
  /** Dateityp-Version, z. B. 13 für YTD. */
  version: number;
  /** Systemblöcke. Der erste ist das Wurzelobjekt. */
  system: ResourceBlock[];
  graphics: ResourceBlock[];
  /** Kodierung der Seitenflags. Meta-Dateien (YTYP, YMAP) nutzen 'meta'. Standard: 'standard'. */
  flagStyle?: FlagStyle;
}

/** Baut die komplette Datei: Kopf plus komprimierte Seiten. */
export function buildResource(spec: ResourceSpec): Uint8Array {
  if (!Number.isInteger(spec.version) || spec.version < 0 || spec.version > 0xff) {
    throw new Error(`Ungültige Version ${spec.version}.`);
  }
  if (spec.system.length === 0) throw new Error('Eine Resource braucht mindestens ein Systemobjekt.');

  const style = spec.flagStyle ?? 'standard';
  const sys = planPages(spec.system, SYSTEM_BASE, style);
  const gfx = planPages(spec.graphics, GRAPHICS_BASE, style);
  const context: BuildContext = { systemPageCount: sys.pageCount, graphicsPageCount: gfx.pageCount };

  const sysData = render(sys, context);
  const gfxData = render(gfx, context);
  const all = new Uint8Array(sysData.length + gfxData.length);
  all.set(sysData, 0);
  all.set(gfxData, sysData.length);

  const compressed = deflateSync(all, { level: 9 });

  const out = new Uint8Array(16 + compressed.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, RSC7_MAGIC, true);
  view.setUint32(4, spec.version, true);
  view.setUint32(8, (sys.flags | (((spec.version >> 4) & 0xf) << 28)) >>> 0, true);
  view.setUint32(12, (gfx.flags | ((spec.version & 0xf) << 28)) >>> 0, true);
  out.set(compressed, 16);
  return out;
}

// --- Lesen (für Tests und spätere Werkzeuge wie Retexture/Optimiser) -----------------------------------

export interface PageFlagsInfo {
  baseShift: number;
  baseSize: number;
  /** Seitenanzahl je Größenklasse, von der größten (Basis << 8) zur kleinsten (Basis << 0). */
  counts: number[];
  /** Gesamtgröße aller Seiten in Bytes. */
  totalSize: number;
}

/** Zerlegt Seitenflags. Die oberen vier Bits (Versionsanteil) werden ignoriert. */
export function decodePageFlags(flags: number): PageFlagsInfo {
  const baseShift = flags & 0xf;
  const baseSize = 0x200 << baseShift;
  const counts = [
    (flags >>> 4) & 0x1,
    (flags >>> 5) & 0x3,
    (flags >>> 7) & 0xf,
    (flags >>> 11) & 0x3f,
    (flags >>> 17) & 0x7f,
    (flags >>> 24) & 0x1,
    (flags >>> 25) & 0x1,
    (flags >>> 26) & 0x1,
    (flags >>> 27) & 0x1,
  ];
  let totalSize = 0;
  counts.forEach((count, i) => {
    totalSize += count * (baseSize * 2 ** (8 - i));
  });
  return { baseShift, baseSize, counts, totalSize };
}

export interface ParsedResource {
  version: number;
  systemFlags: number;
  graphicsFlags: number;
  system: Uint8Array;
  graphics: Uint8Array;
}

export function parseResource(file: Uint8Array): ParsedResource {
  if (file.length < 16) throw new Error('Datei ist zu kurz für einen RSC7-Kopf.');
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (view.getUint32(0, true) !== RSC7_MAGIC) throw new Error('Kein RSC7-Kopf (Magic stimmt nicht).');

  const version = view.getUint32(4, true);
  const systemFlags = view.getUint32(8, true);
  const graphicsFlags = view.getUint32(12, true);
  const sysSize = decodePageFlags(systemFlags).totalSize;
  const gfxSize = decodePageFlags(graphicsFlags).totalSize;

  const data = inflateSync(file.subarray(16), { out: new Uint8Array(sysSize + gfxSize) });
  if (data.length !== sysSize + gfxSize) {
    throw new Error(`Entpackte Größe ${data.length} passt nicht zu den Flags (${sysSize + gfxSize}).`);
  }
  return { version, systemFlags, graphicsFlags, system: data.subarray(0, sysSize), graphics: data.subarray(sysSize) };
}

/** Version aus den oberen Bits der Flags rekonstruieren (Gegenstück zum Schreiben). */
export function versionFromFlags(systemFlags: number, graphicsFlags: number): number {
  return (((systemFlags >>> 28) & 0xf) << 4) | ((graphicsFlags >>> 28) & 0xf);
}
