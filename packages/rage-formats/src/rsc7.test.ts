import { describe, expect, it } from 'vitest';
import {
  GRAPHICS_BASE,
  RSC7_MAGIC,
  ResourceBlock,
  SYSTEM_BASE,
  buildResource,
  decodePageFlags,
  parseResource,
  planPages,
  versionFromFlags,
} from './rsc7.ts';

const noop = () => undefined;

describe('decodePageFlags', () => {
  it('liest die Flags des Referenz-YTD (CodeWalker-Ausgabe)', () => {
    // System: eine Seite à 0x2000, Grafik: eine Seite à 0x8000 (Basis 0x800).
    const sys = decodePageFlags(0x00020000);
    expect(sys.baseSize).toBe(0x200);
    expect(sys.counts[4]).toBe(1);
    expect(sys.totalSize).toBe(0x2000);

    const gfx = decodePageFlags(0xd0020002);
    expect(gfx.baseShift).toBe(2);
    expect(gfx.baseSize).toBe(0x800);
    expect(gfx.totalSize).toBe(0x8000);
  });

  it('versionFromFlags kehrt das Einbetten der Version um', () => {
    expect(versionFromFlags(0x00020000, 0xd0020002)).toBe(13);
    expect(versionFromFlags(0x50000000, 0xa0000000)).toBe(0x5a);
  });
});

describe('planPages', () => {
  it('legt den ersten Block an den Anfang des Systemspeichers', () => {
    const root = new ResourceBlock(64, noop);
    const other = new ResourceBlock(200, noop);
    const plan = planPages([root, other], SYSTEM_BASE);
    expect(root.address).toBe(SYSTEM_BASE);
    expect(other.address).toBeGreaterThan(SYSTEM_BASE);
    expect(plan.pageCount).toBe(1);
    expect(plan.pageSize).toBe(0x2000);
  });

  it('richtet Blöcke auf 16 Byte aus', () => {
    const a = new ResourceBlock(10, noop);
    const b = new ResourceBlock(10, noop);
    planPages([a, b], SYSTEM_BASE);
    expect(a.address % 16).toBe(0);
    expect(b.address % 16).toBe(0);
    expect(Math.abs(a.address - b.address)).toBeGreaterThanOrEqual(16);
  });

  it('lässt keinen Block über eine Seitengrenze ragen', () => {
    const blocks = Array.from({ length: 40 }, () => new ResourceBlock(1000, noop));
    const plan = planPages(blocks, GRAPHICS_BASE);
    expect(plan.pageCount).toBeGreaterThan(1);
    for (const block of blocks) {
      const start = block.address - GRAPHICS_BASE;
      const page = Math.floor(start / plan.pageSize);
      const end = start + block.size - 1;
      expect(Math.floor(end / plan.pageSize)).toBe(page);
    }
  });

  it('wählt die Seitengröße so, dass der größte Block hineinpasst', () => {
    const big = new ResourceBlock(0x5000, noop);
    const plan = planPages([new ResourceBlock(64, noop), big], SYSTEM_BASE);
    expect(plan.pageSize).toBeGreaterThanOrEqual(0x5000);
    expect(decodePageFlags(plan.flags).totalSize).toBe(plan.pageSize * plan.pageCount);
  });

  it('gibt für eine leere Liste einen leeren Plan zurück', () => {
    expect(planPages([], GRAPHICS_BASE).pageCount).toBe(0);
  });
});

describe('buildResource', () => {
  it('schreibt Kopf, Version und lesbare Seiten', () => {
    const root = new ResourceBlock(32, (w) => {
      w.u32(0, 0xdeadbeef);
      w.u32(4, 7);
    });
    const gfx = new ResourceBlock(8, (w) => w.u32(0, 0x01020304));
    const file = buildResource({ version: 165, system: [root], graphics: [gfx] });

    const view = new DataView(file.buffer);
    expect(view.getUint32(0, true)).toBe(RSC7_MAGIC);
    expect(view.getUint32(4, true)).toBe(165);
    expect(versionFromFlags(view.getUint32(8, true), view.getUint32(12, true))).toBe(165);

    const parsed = parseResource(file);
    expect(parsed.version).toBe(165);
    const sysView = new DataView(parsed.system.buffer, parsed.system.byteOffset, parsed.system.byteLength);
    expect(sysView.getUint32(0, true)).toBe(0xdeadbeef);
    expect(sysView.getUint32(4, true)).toBe(7);
    const gfxView = new DataView(parsed.graphics.buffer, parsed.graphics.byteOffset, parsed.graphics.byteLength);
    expect(gfxView.getUint32(0, true)).toBe(0x01020304);
  });

  it('lässt Blöcke einander per Zeiger finden', () => {
    const target = new ResourceBlock(16, (w) => w.u32(0, 0xcafebabe));
    const root = new ResourceBlock(16, (w) => w.pointer(0, target));
    const file = buildResource({ version: 13, system: [root, target], graphics: [] });
    const { system } = parseResource(file);
    const view = new DataView(system.buffer, system.byteOffset, system.byteLength);

    const ptr = view.getUint32(0, true);
    expect(ptr).toBeGreaterThanOrEqual(SYSTEM_BASE);
    expect(view.getUint32(4, true)).toBe(0); // obere 32 Bit der Adresse
    expect(view.getUint32(ptr - SYSTEM_BASE, true)).toBe(0xcafebabe);
  });

  it('verlangt ein Wurzelobjekt', () => {
    expect(() => buildResource({ version: 13, system: [], graphics: [] })).toThrow(/Systemobjekt/);
  });

  it('lehnt eine ungültige Version ab', () => {
    const root = new ResourceBlock(16, noop);
    expect(() => buildResource({ version: 999, system: [root], graphics: [] })).toThrow(/Version/);
  });

  it('parseResource lehnt Dateien ohne RSC7-Kopf ab', () => {
    expect(() => parseResource(new Uint8Array(32))).toThrow(/Magic/);
  });
});
