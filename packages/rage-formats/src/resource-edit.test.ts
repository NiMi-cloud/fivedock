import { describe, expect, it } from 'vitest';
import { ResourceEditor, planExtension } from './resource-edit.ts';
import { GRAPHICS_BASE, ResourceBlock, SYSTEM_BASE, buildResource, decodePageFlags, parseResource } from './rsc7.ts';

/** Seiten-Flags aus Basisverschiebung und Seitenzahlen (256x ... 1x) bauen, so wie das Spiel sie liest. */
function flagsOf(shift: number, counts: number[]): number {
  return (
    (shift |
      (counts[0]! << 4) |
      (counts[1]! << 5) |
      (counts[2]! << 7) |
      (counts[3]! << 11) |
      (counts[4]! << 17) |
      (counts[5]! << 24) |
      (counts[6]! << 25) |
      (counts[7]! << 26) |
      (counts[8]! << 27)) >>>
    0
  );
}

describe('planExtension', () => {
  it('ohne neue Blöcke bleibt alles gleich', () => {
    const flags = flagsOf(4, [0, 0, 0, 29, 0, 0, 0, 0, 0]);
    const plan = planExtension(flags, SYSTEM_BASE, []);
    expect(plan.flags).toBe(flags);
    expect(plan.totalSize).toBe(29 * 0x40000);
  });

  it('hängt Seiten der kleinsten Klasse an, die vorhandenen bleiben', () => {
    // 29 Seiten à 32x (0x40000) wie in einer echten Fahrzeugdatei
    const flags = flagsOf(4, [0, 0, 0, 29, 0, 0, 0, 0, 0]);
    const plan = planExtension(flags, SYSTEM_BASE, [1000, 70000, 5000]);
    const info = decodePageFlags(plan.flags);
    expect(info.counts[3]).toBe(29);
    expect(info.counts[4]).toBeGreaterThanOrEqual(1);
    expect(info.totalSize).toBe(plan.totalSize);
    expect(info.totalSize).toBeGreaterThan(29 * 0x40000);
    for (const a of plan.addresses) {
      expect(a).toBeGreaterThanOrEqual(SYSTEM_BASE + 29 * 0x40000);
      expect(a % 16).toBe(0);
    }
  });

  it('kein neuer Block liegt über einer Seitengrenze und die Blöcke überlappen nicht', () => {
    const flags = flagsOf(4, [0, 0, 0, 3, 0, 0, 0, 0, 0]);
    const sizes = Array.from({ length: 40 }, (_, i) => 3000 + i * 997);
    const plan = planExtension(flags, SYSTEM_BASE, sizes);
    const info = decodePageFlags(plan.flags);
    const main = 3 * 0x40000;
    const page = 0x20000; // 16x bei Basis 0x2000
    const spans = sizes.map((s, i) => [plan.addresses[i]! - SYSTEM_BASE, plan.addresses[i]! - SYSTEM_BASE + s] as const).sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < spans.length; i++) {
      const [start, end] = spans[i]!;
      expect(Math.floor((start - main) / page)).toBe(Math.floor((end - 1 - main) / page));
      if (i > 0) expect(start).toBeGreaterThanOrEqual(spans[i - 1]![1]);
    }
    expect(info.totalSize).toBeGreaterThanOrEqual(spans[spans.length - 1]![1]);
  });

  it('löst kleine Endseiten auf und behält die alten Daten an ihrem Platz', () => {
    // 2 Seiten à 16x (Basis 0x200 = 0x2000 je Seite) + 4x + 1x
    const flags = flagsOf(0, [0, 0, 0, 0, 2, 0, 1, 0, 1]);
    const plan = planExtension(flags, SYSTEM_BASE, [500, 3000]);
    const info = decodePageFlags(plan.flags);
    expect(info.counts.slice(5)).toEqual([0, 0, 0, 0]);
    expect(info.counts[4]).toBeGreaterThanOrEqual(3);
    // Der neue Bereich beginnt hinter den alten Endseiten (4x + 1x = 5 * 0x200 = 0xA00)
    const oldTotal = 2 * 0x2000 + 0xa00;
    for (const a of plan.addresses) expect(a - SYSTEM_BASE).toBeGreaterThanOrEqual(oldTotal);
    expect(info.totalSize).toBeGreaterThan(oldTotal);
  });

  it('wählt größere Seiten, wenn ein Block nicht in die kleinste passt', () => {
    const flags = flagsOf(4, [0, 0, 0, 2, 0, 0, 0, 0, 0]); // 2 × 32x
    const plan = planExtension(flags, SYSTEM_BASE, [0x30000]); // größer als eine 16x-Seite (0x20000)
    const info = decodePageFlags(plan.flags);
    expect(info.counts[3]).toBe(3);
    expect(plan.addresses[0]).toBe(SYSTEM_BASE + 2 * 0x40000);
  });

  it('fasst alte Hauptseiten zu einer größeren zusammen, wenn ein neuer Block in keine kleine Seite passt', () => {
    // 3 Seiten à 16x (je 0x2000): ein Block von 0x9000 passt in keine davon
    const flags = flagsOf(0, [0, 0, 0, 0, 3, 0, 0, 0, 0]);
    const plan = planExtension(flags, SYSTEM_BASE, [0x9000]);
    const info = decodePageFlags(plan.flags);
    expect(info.totalSize).toBe(plan.totalSize);
    // der Block liegt hinter den alten Daten (3 * 0x2000), nichts Altes wird verschoben
    expect(plan.addresses[0]! - SYSTEM_BASE).toBeGreaterThanOrEqual(3 * 0x2000);
    // und er liegt vollständig in einer Seite des neuen Aufbaus
    const classSizes = info.counts.flatMap((count, i) => Array.from({ length: count }, () => info.baseSize * 2 ** (8 - i)));
    let start = 0;
    const bounds = classSizes.map((size) => {
      const range: [number, number] = [start, start + size];
      start += size;
      return range;
    });
    const at = plan.addresses[0]! - SYSTEM_BASE;
    expect(bounds.some(([from, to]) => at >= from && at + 0x9000 <= to)).toBe(true);
    // die alten drei Seiten sind nur zusammengefasst, keine Grenze innerhalb der alten Daten ist neu: die alten Blöcke lagen in 0 - 0x6000,
    // die erste neue Seite beginnt bei 0 und umfasst sie ganz
    expect(bounds[0]![0]).toBe(0);
    expect(bounds[0]![1]).toBeGreaterThanOrEqual(3 * 0x2000);
  });

  it('behält große alte Seiten, wenn ein größerer Block sie nicht braucht aufzulösen', () => {
    const flags = flagsOf(4, [0, 0, 0, 2, 0, 0, 0, 0, 0]);
    const plan = planExtension(flags, SYSTEM_BASE, [0x20000]);
    expect(plan.addresses[0]).toBe(SYSTEM_BASE + 2 * 0x40000);
  });

  it('einen leeren Bereich baut es neu auf', () => {
    const plan = planExtension(0, GRAPHICS_BASE, [100000, 60]);
    const info = decodePageFlags(plan.flags);
    expect(info.totalSize).toBe(plan.totalSize);
    expect(info.totalSize).toBeGreaterThanOrEqual(100000);
    for (const a of plan.addresses) expect(a).toBeGreaterThanOrEqual(GRAPHICS_BASE);
  });

  it('meldet, wenn die Seitenzahl nicht reicht', () => {
    const flags = flagsOf(0, [0, 0, 0, 0, 127, 0, 0, 0, 0]);
    expect(() => planExtension(flags, SYSTEM_BASE, [0x2000])).toThrow(/erweitern/);
  });
});

describe('ResourceEditor', () => {
  const rootFill = (w: import('./rsc7.ts').BlockWriter) => {
    w.u32(0, 0xabcdef01);
    w.cstring(16, 'Wurzel');
  };

  function sample(): { file: Uint8Array; data: ResourceBlock } {
    const root = new ResourceBlock(64, rootFill, 'root');
    const data = new ResourceBlock(32, (w) => w.cstring(0, 'Daten'), 'data');
    const big = new ResourceBlock(5000, (w) => w.u32(0, 7), 'big');
    const file = buildResource({ version: 162, system: [root, data, big], graphics: [new ResourceBlock(256, (w) => w.u32(0, 99), 'g')] });
    return { file, data };
  }

  it('hängt Blöcke an und verändert einen Zeiger darauf, der Rest bleibt gleich', () => {
    const { file, data } = sample();
    const before = parseResource(file);
    const ed = ResourceEditor.open(file, 162, 'Test');
    const added = ed.block('system', 100, (w) => w.cstring(0, 'Neu'), 'neu');
    const gfxAdded = ed.block('graphics', 40, (w) => w.u32(0, 1234), 'gneu');
    ed.patch((mem) => {
      mem.setPtr(SYSTEM_BASE + 0x20, added.address);
      mem.setPtr(SYSTEM_BASE + 0x28, gfxAdded.address);
    });
    const out = ed.finish();

    const after = parseResource(out);
    expect(after.version).toBe(162);
    expect(after.system.length).toBeGreaterThan(before.system.length);
    expect(after.graphics.length).toBeGreaterThan(before.graphics.length);
    // alter Inhalt unverändert (bis auf die zwei geänderten Zeiger)
    const oldSys = before.system.slice();
    oldSys.set(after.system.subarray(0x20, 0x30), 0x20);
    expect(Array.from(after.system.subarray(0, before.system.length))).toEqual(Array.from(oldSys));
    expect(Array.from(after.graphics.subarray(0, before.graphics.length))).toEqual(Array.from(before.graphics));
    // neue Inhalte an den neuen Adressen
    const sysView = new DataView(after.system.buffer, after.system.byteOffset, after.system.byteLength);
    const target = Number(sysView.getBigUint64(0x20, true));
    expect(target).toBe(added.address);
    expect(String.fromCharCode(...after.system.subarray(target - SYSTEM_BASE, target - SYSTEM_BASE + 3))).toBe('Neu');
    const gTarget = Number(sysView.getBigUint64(0x28, true));
    const gView = new DataView(after.graphics.buffer, after.graphics.byteOffset, after.graphics.byteLength);
    expect(gView.getUint32(gTarget - GRAPHICS_BASE, true)).toBe(1234);
    // der Block vor dem Anhängen liegt noch dort, wo er war
    expect(data.address).toBeGreaterThan(0);
    expect(String.fromCharCode(...after.system.subarray(data.address - SYSTEM_BASE, data.address - SYSTEM_BASE + 5))).toBe('Daten');
  });

  it('ohne Änderungen entsteht eine gleichwertige Datei', () => {
    const { file } = sample();
    const out = ResourceEditor.open(file, 162, 'Test').finish();
    const a = parseResource(file);
    const b = parseResource(out);
    expect(b.systemFlags).toBe(a.systemFlags);
    expect(b.graphicsFlags).toBe(a.graphicsFlags);
    expect(Array.from(b.system)).toEqual(Array.from(a.system));
    expect(Array.from(b.graphics)).toEqual(Array.from(a.graphics));
  });

  it('lehnt falsche Versionen und Escrow-Dateien ab', () => {
    const { file } = sample();
    expect(() => ResourceEditor.open(file, 165, 'Drawable')).toThrow(/Version/);
    expect(() => ResourceEditor.open(Uint8Array.from([0x46, 0x58, 0x41, 0x50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 162, 'Fragment')).toThrow(/verschlüsselt/);
  });
});
