/**
 * Bestehende RSC7-Dateien (YFT, YDR ...) erweitern, ohne ihren Inhalt neu aufzubauen.
 *
 * Alle Zeiger in einer Resource sind absolute virtuelle Adressen, und die Seiten eines Speicherbereichs liegen von der größten zur
 * kleinsten Seite lückenlos hintereinander. Neue Blöcke können deshalb ans Ende angehängt werden, ohne dass sich eine bestehende
 * Adresse ändert: Die bestehenden Seiten bleiben, die kleinen Endseiten (8x, 4x, 2x, 1x der Basisgröße) werden zusammen mit dem neuen
 * Bereich zu gleich großen neuen Seiten zusammengefasst. Kein Block (alt oder neu) liegt danach über einer Seitengrenze, die er
 * vorher nicht schon hatte.
 *
 * Der Editor führt die Änderungen erst in `finish()` aus: Neue Blöcke bekommen ihre Adresse, dann laufen die Füll- und
 * Änderungsfunktionen, und am Ende steht eine neue Datei mit unverändertem Kopf (Magic, Version), neuen Seiten-Flags und neu
 * verpacktem Inhalt.
 */

import { deflateSync } from 'fflate';
import { Memory, YftReadError } from './memory.ts';
import { BlockWriter, GRAPHICS_BASE, SYSTEM_BASE, decodePageFlags, parseResource } from './rsc7.ts';

const ALIGN = 16;

/** Höchste Seitenzahl je Größenklasse (256x, 128x, 64x, 32x, 16x), so viele Bits stehen in den Seiten-Flags dafür bereit. */
const CLASS_CAPACITY = [1, 3, 15, 63, 127];

const align = (n: number) => Math.ceil(n / ALIGN) * ALIGN;

export interface ExtensionPlan {
  /** Neue Seiten-Flags (die oberen vier Versionsbits bleiben erhalten). */
  flags: number;
  /** Gesamtgröße des Speicherbereichs nach der Erweiterung. */
  totalSize: number;
  /** Adressen der neuen Blöcke, in der Reihenfolge der übergebenen Größen. */
  addresses: number[];
}

/** Bits der Seiten-Flags aus Basisverschiebung und Seitenzahlen (256x ... 1x) zusammensetzen. */
function encodeFlags(shift: number, counts: number[]): number {
  return (
    shift |
    (counts[0]! << 4) |
    (counts[1]! << 5) |
    (counts[2]! << 7) |
    (counts[3]! << 11) |
    (counts[4]! << 17) |
    (counts[5]! << 24) |
    (counts[6]! << 25) |
    (counts[7]! << 26) |
    (counts[8]! << 27)
  ) >>> 0;
}

/**
 * Plant, wie ein Speicherbereich um neue Blöcke wächst. Bestehende Adressen bleiben gleich.
 * @param oldFlags Seiten-Flags des Bereichs vor der Erweiterung
 * @param base Basisadresse des Bereichs (SYSTEM_BASE oder GRAPHICS_BASE)
 * @param sizes Größen der neuen Blöcke in Byte
 */
export function planExtension(oldFlags: number, base: number, sizes: number[]): ExtensionPlan {
  const info = decodePageFlags(oldFlags);
  const keepBits = (oldFlags & 0xf0000000) >>> 0;
  if (sizes.length === 0) return { flags: oldFlags >>> 0, totalSize: info.totalSize, addresses: [] };

  const need = sizes.map(align);
  const order = need.map((_, i) => i).sort((a, b) => need[b]! - need[a]!);
  const largest = need[order[0]!]!;
  const empty = info.totalSize === 0;

  const attempt = (shift: number, counts: number[]): ExtensionPlan | null => {
    const unit = 0x200 * 2 ** shift;
    const classSize = (i: number) => unit * 2 ** (8 - i);
    // Alle Seiten von groß nach klein, so wie sie im Speicher aufeinander folgen.
    const pages: number[] = [];
    for (let i = 0; i <= 8; i++) for (let c = 0; c < counts[i]!; c++) pages.push(i);
    const tailPages = pages.filter((cls) => cls >= 5).length;

    // `dissolve` Seiten am Ende der Hauptseiten werden zusätzlich zu den Endseiten zusammengefasst, damit größere Blöcke Platz finden.
    // Das ändert keine Adresse: Alte Blöcke liegen danach in einer größeren Seite, über deren Grenzen keiner hinwegragt.
    for (let dissolve = 0; dissolve <= pages.length - tailPages; dissolve++) {
      const keptPages = pages.slice(0, pages.length - tailPages - dissolve);
      const mergedPages = pages.slice(pages.length - tailPages - dissolve);
      const main = keptPages.reduce((sum, cls) => sum + classSize(cls), 0);
      const merged = mergedPages.reduce((sum, cls) => sum + classSize(cls), 0);
      const smallestKept = keptPages.length > 0 ? Math.max(...keptPages) : -1;
      const keptCounts = new Array<number>(9).fill(0);
      for (const cls of keptPages) keptCounts[cls]!++;

      // Von der kleinsten Seitengröße (16x) aufwärts: die erste, in die der größte Block und der zusammengefasste Rest passen.
      for (let k = 4; k >= Math.max(smallestKept, 0); k--) {
        const pageSize = classSize(k);
        if (pageSize < largest || pageSize < merged) continue;
        let cursor = merged;
        const addresses = new Array<number>(sizes.length).fill(0);
        for (const i of order) {
          const n = need[i]!;
          const pageStart = Math.floor(cursor / pageSize) * pageSize;
          if (cursor + n > pageStart + pageSize) cursor = pageStart + pageSize;
          addresses[i] = base + main + cursor;
          cursor += n;
        }
        const added = Math.ceil(cursor / pageSize);
        if (keptCounts[k]! + added > CLASS_CAPACITY[k]!) continue;
        const next = keptCounts.slice();
        next[k] = next[k]! + added;
        return { flags: (keepBits | encodeFlags(shift, next)) >>> 0, totalSize: main + added * pageSize, addresses };
      }
    }
    return null;
  };
  if (!empty) {
    const plan = attempt(oldFlags & 0xf, info.counts);
    if (!plan) throw new YftReadError('unsupported', 'Der Speicher dieser Datei lässt sich nicht erweitern (zu viele Seiten oder zu großer Block).');
    return plan;
  }
  for (let shift = 0; shift <= 0xf; shift++) {
    const plan = attempt(shift, new Array<number>(9).fill(0));
    if (plan) return plan;
  }
  throw new YftReadError('unsupported', 'Die neuen Daten sind zu groß für eine Resource-Datei.');
}

export interface NewBlock {
  readonly segment: 'system' | 'graphics';
  readonly size: number;
  readonly label: string;
  /** Virtuelle Adresse, gültig ab dem Ablauf von `finish()` (also innerhalb der Füll- und Änderungsfunktionen). */
  address: number;
  readonly fill: (writer: BlockWriter) => void;
}

/** Eine geöffnete Resource, an die Blöcke angehängt und in der bestehende Felder geändert werden können. */
export class ResourceEditor {
  readonly version: number;
  /** Lesender Zugriff auf den ursprünglichen Inhalt (Kopie, wird nicht verändert). */
  readonly mem: Memory;

  private readonly header: Uint8Array;
  private readonly systemFlags: number;
  private readonly graphicsFlags: number;
  private readonly system: Uint8Array;
  private readonly graphics: Uint8Array;
  private readonly blocks: NewBlock[] = [];
  private readonly patches: Array<(mem: Memory) => void> = [];

  private constructor(file: Uint8Array, version: number, systemFlags: number, graphicsFlags: number, system: Uint8Array, graphics: Uint8Array) {
    this.header = file.slice(0, 16);
    this.version = version;
    this.systemFlags = systemFlags;
    this.graphicsFlags = graphicsFlags;
    this.system = system;
    this.graphics = graphics;
    this.mem = new Memory(system, graphics);
  }

  static open(file: Uint8Array, expectedVersion: number, what: string): ResourceEditor {
    if (file.length >= 4 && new DataView(file.buffer, file.byteOffset, file.byteLength).getUint32(0, true) === 0x50415846) {
      throw new YftReadError('encrypted', 'Die Datei ist verschlüsselt (Cfx.re-Escrow) und kann nicht bearbeitet werden.');
    }
    let res: ReturnType<typeof parseResource>;
    try {
      res = parseResource(file);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new YftReadError(message.includes('RSC7') ? 'not-rsc7' : 'corrupt', message);
    }
    if (res.version !== expectedVersion) {
      throw new YftReadError('wrong-version', `Keine ${what}-Datei (Version ${res.version}, erwartet ${expectedVersion}).`);
    }
    // Kopien, damit die Eingabe unberührt bleibt.
    return new ResourceEditor(file, res.version, res.systemFlags, res.graphicsFlags, res.system.slice(), res.graphics.slice());
  }

  /** Legt einen neuen Block an. `fill` beschreibt seinen Inhalt, sobald alle Adressen feststehen. */
  block(segment: 'system' | 'graphics', size: number, fill: (writer: BlockWriter) => void, label = ''): NewBlock {
    if (!Number.isInteger(size) || size <= 0) throw new Error(`Ungültige Blockgröße ${size} (${label}).`);
    const block: NewBlock = { segment, size, label, address: 0, fill };
    this.blocks.push(block);
    return block;
  }

  /** Legt einen neuen Block mit festen Bytes an. */
  dataBlock(segment: 'system' | 'graphics', data: Uint8Array, label = ''): NewBlock {
    return this.block(segment, data.length, (w) => w.copy(0, data), label);
  }

  /**
   * Prüft, ob zusätzlich zu den schon angelegten Blöcken noch Blöcke dieser Größen (Byte) in den Bereich passen. Ein Block darf keine
   * Seitengrenze überschreiten und die Zahl der Seiten ist begrenzt, große Blöcke müssen deshalb unter Umständen geteilt werden.
   */
  fits(segment: 'system' | 'graphics', sizes: number[]): boolean {
    const flags = segment === 'system' ? this.systemFlags : this.graphicsFlags;
    const base = segment === 'system' ? SYSTEM_BASE : GRAPHICS_BASE;
    const mine = this.blocks.filter((x) => x.segment === segment).map((x) => x.size);
    try {
      planExtension(flags, base, [...mine, ...sizes]);
      return true;
    } catch {
      return false;
    }
  }
  /** Eine Änderung an bestehendem Speicher; läuft in `finish()`, wenn die Adressen der neuen Blöcke feststehen. */
  patch(fn: (mem: Memory) => void): void {
    this.patches.push(fn);
  }

  /** Setzt die neue Datei zusammen: Seiten planen, Blöcke füllen, Änderungen anwenden, verpacken. */
  finish(): Uint8Array {
    const grow = (segment: 'system' | 'graphics', base: number, flags: number, data: Uint8Array) => {
      const mine = this.blocks.filter((b) => b.segment === segment);
      const plan = planExtension(flags, base, mine.map((b) => b.size));
      mine.forEach((b, i) => {
        b.address = plan.addresses[i]!;
      });
      const total = Math.max(plan.totalSize, data.length);
      const out = new Uint8Array(total);
      out.set(data, 0);
      return { flags: plan.flags, data: out };
    };
    const sys = grow('system', SYSTEM_BASE, this.systemFlags, this.system);
    const gfx = grow('graphics', GRAPHICS_BASE, this.graphicsFlags, this.graphics);

    for (const block of this.blocks) {
      const out = block.segment === 'system' ? sys.data : gfx.data;
      const start = block.address - (block.segment === 'system' ? SYSTEM_BASE : GRAPHICS_BASE);
      block.fill(new BlockWriter(out.subarray(start, start + block.size)));
    }
    const mem = new Memory(sys.data, gfx.data);
    for (const patch of this.patches) patch(mem);

    const all = new Uint8Array(sys.data.length + gfx.data.length);
    all.set(sys.data, 0);
    all.set(gfx.data, sys.data.length);
    const packed = deflateSync(all, { level: 6 });

    const out = new Uint8Array(16 + packed.length);
    out.set(this.header, 0);
    const view = new DataView(out.buffer);
    view.setUint32(8, sys.flags, true);
    view.setUint32(12, gfx.flags, true);
    out.set(packed, 16);
    return out;
  }
}
