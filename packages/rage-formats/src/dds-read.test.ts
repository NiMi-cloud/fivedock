import { describe, expect, it } from 'vitest';
import { buildMipChain, packBgra, readDds, writeDdsTexture } from './dds.ts';
import type { RgbaImage } from './dds.ts';
import { encodeMipChain } from './dxt.ts';
import { mipChainSize } from './ytd.ts';
import type { YtdTexture } from './ytd.ts';

function gradient(width: number, height: number): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set([(x * 255) / (width - 1), (y * 255) / (height - 1), 77, 200].map(Math.round), (y * width + x) * 4);
  }
  return { width, height, data };
}

function block(format: 'DXT1' | 'DXT3' | 'DXT5' | 'ATI1' | 'ATI2'): YtdTexture {
  const { levels, data } = encodeMipChain(gradient(32, 16), format);
  return { name: 't', width: 32, height: 16, levels, format, data };
}

/** Baut einen rohen DDS-Kopf mit frei wählbaren Feldern. */
function header(opts: {
  width: number;
  height: number;
  mips?: number;
  pfFlags: number;
  fourCc?: string;
  bits?: number;
  masks?: [number, number, number, number];
  caps2?: number;
  dx10?: { dxgi: number; dimension?: number; misc?: number; array?: number };
}): Uint8Array {
  const size = opts.dx10 ? 148 : 128;
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x20534444, true);
  v.setUint32(4, 124, true);
  v.setUint32(8, 0x1 | 0x2 | 0x4 | 0x1000 | (opts.mips ? 0x20000 : 0), true);
  v.setUint32(12, opts.height, true);
  v.setUint32(16, opts.width, true);
  v.setUint32(28, opts.mips ?? 0, true);
  v.setUint32(76, 32, true);
  v.setUint32(80, opts.pfFlags, true);
  if (opts.fourCc) for (let i = 0; i < 4; i++) out[84 + i] = opts.fourCc.charCodeAt(i);
  v.setUint32(88, opts.bits ?? 0, true);
  (opts.masks ?? [0, 0, 0, 0]).forEach((m, i) => v.setUint32(92 + i * 4, m, true));
  v.setUint32(112, opts.caps2 ?? 0, true);
  if (opts.dx10) {
    v.setUint32(128, opts.dx10.dxgi, true);
    v.setUint32(132, opts.dx10.dimension ?? 3, true);
    v.setUint32(136, opts.dx10.misc ?? 0, true);
    v.setUint32(140, opts.dx10.array ?? 1, true);
  }
  return out;
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

describe('readDds', () => {
  it('liest, was writeDdsTexture schreibt (alle Blockformate)', () => {
    for (const format of ['DXT1', 'DXT3', 'DXT5', 'ATI1', 'ATI2'] as const) {
      const tex = block(format);
      const back = readDds(writeDdsTexture(tex));
      expect(back).toMatchObject({ width: 32, height: 16, levels: tex.levels, declaredLevels: tex.levels, format });
      expect(Buffer.compare(Buffer.from(back.data), Buffer.from(tex.data))).toBe(0);
    }
  });

  it('liest unkomprimierte BGRA-Texturen mit Mip-Kette', () => {
    const chain = buildMipChain(gradient(16, 16));
    const tex: YtdTexture = { name: 't', width: 16, height: 16, levels: chain.length, format: 'A8R8G8B8', data: packBgra(chain) };
    const back = readDds(writeDdsTexture(tex));
    expect(back.format).toBe('A8R8G8B8');
    expect(back.levels).toBe(5);
    expect(Buffer.compare(Buffer.from(back.data), Buffer.from(tex.data))).toBe(0);
  });

  it('liest L8 und A8', () => {
    for (const format of ['L8', 'A8'] as const) {
      const tex: YtdTexture = { name: 't', width: 4, height: 4, levels: 1, format, data: Uint8Array.from({ length: 16 }, (_, i) => i * 16) };
      const back = readDds(writeDdsTexture(tex));
      expect(back.format).toBe(format);
      expect(Array.from(back.data)).toEqual(Array.from(tex.data));
    }
  });

  it('versteht die Kennungen BC4U und BC5U als ATI1 und ATI2', () => {
    const data = new Uint8Array(mipChainSize('ATI1', 8, 8, 1));
    expect(readDds(concat(header({ width: 8, height: 8, pfFlags: 4, fourCc: 'BC4U' }), data)).format).toBe('ATI1');
    expect(readDds(concat(header({ width: 8, height: 8, pfFlags: 4, fourCc: 'BC5U' }), new Uint8Array(mipChainSize('ATI2', 8, 8, 1)))).format).toBe('ATI2');
  });

  it('versteht den DX10-Kopf (BC7, BC1 sRGB, BGRA)', () => {
    const bc7 = readDds(concat(header({ width: 8, height: 8, pfFlags: 4, fourCc: 'DX10', dx10: { dxgi: 98 } }), new Uint8Array(mipChainSize('BC7', 8, 8, 1)).fill(5)));
    expect(bc7).toMatchObject({ format: 'BC7', width: 8, height: 8, levels: 1 });
    expect(bc7.data.length).toBe(64);
    const bc1 = readDds(concat(header({ width: 4, height: 4, pfFlags: 4, fourCc: 'DX10', dx10: { dxgi: 72 } }), new Uint8Array(8)));
    expect(bc1.format).toBe('DXT1');
    const bgra = readDds(concat(header({ width: 2, height: 2, pfFlags: 4, fourCc: 'DX10', dx10: { dxgi: 87 } }), Uint8Array.from({ length: 16 }, (_, i) => i)));
    expect(bgra.format).toBe('A8R8G8B8');
    expect(Array.from(bgra.data.subarray(0, 4))).toEqual([0, 1, 2, 3]);
  });

  it('ordnet RGBA-Pixel in BGRA um', () => {
    const rgba = readDds(
      concat(header({ width: 1, height: 1, pfFlags: 0x41, bits: 32, masks: [0xff, 0xff00, 0xff0000, 0xff000000] }), Uint8Array.from([10, 20, 30, 40])),
    );
    expect(Array.from(rgba.data)).toEqual([30, 20, 10, 40]);
  });

  it('macht aus 24-Bit-RGB und X8R8G8B8 undurchsichtige BGRA-Pixel', () => {
    const rgb24 = readDds(concat(header({ width: 2, height: 1, pfFlags: 0x40, bits: 24, masks: [0xff0000, 0xff00, 0xff, 0] }), Uint8Array.from([1, 2, 3, 4, 5, 6])));
    expect(Array.from(rgb24.data)).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
    const x8 = readDds(concat(header({ width: 1, height: 1, pfFlags: 0x40, bits: 32, masks: [0xff0000, 0xff00, 0xff, 0] }), Uint8Array.from([9, 8, 7, 0])));
    expect(Array.from(x8.data)).toEqual([9, 8, 7, 255]);
  });

  it('begrenzt die Mip-Zahl auf das, was die Größe zulässt', () => {
    const bytes = mipChainSize('DXT1', 8, 8, 4);
    const dds = readDds(concat(header({ width: 8, height: 8, mips: 12, pfFlags: 4, fourCc: 'DXT1' }), new Uint8Array(bytes)));
    expect(dds.levels).toBe(4);
  });

  it('verzeiht gekürzte Stufen unter einem Block (so schreibt CodeWalker) und meldet die Kopfangabe', () => {
    const tex: YtdTexture = (() => {
      const { levels, data } = encodeMipChain(gradient(64, 64), 'DXT1');
      return { name: 't', width: 64, height: 64, levels, format: 'DXT1', data };
    })();
    const full = writeDdsTexture(tex);
    // 2744 Byte Pixeldaten, CodeWalker liefert 2730: die Stufen 2x2 und 1x1 sind unvollständig.
    const cut = full.subarray(0, 128 + 2730);
    const back = readDds(cut);
    expect(back.declaredLevels).toBe(7);
    expect(back.levels).toBe(5);
    expect(Buffer.compare(Buffer.from(back.data), Buffer.from(tex.data.subarray(0, 2728)))).toBe(0);
  });

  it('verzeiht fehlende Daten nicht, wenn echte Stufen betroffen sind', () => {
    const tex: YtdTexture = (() => {
      const { levels, data } = encodeMipChain(gradient(64, 64), 'DXT1');
      return { name: 't', width: 64, height: 64, levels, format: 'DXT1', data };
    })();
    for (const bytes of [2100, 1000]) {
      // Stufe 1 (32x32) beziehungsweise ein Teil der größten Stufe fehlt: das ist keine Kürzung der kleinsten Stufen
      expect(() => readDds(writeDdsTexture(tex).subarray(0, 128 + bytes))).toThrow(/unvollständig/);
    }
    // Unkomprimierte Texturen müssen vollständig sein
    const bgra = writeDdsTexture({ width: 4, height: 4, levels: 3, format: 'A8R8G8B8', data: new Uint8Array(64 + 16 + 4) });
    expect(() => readDds(bgra.subarray(0, bgra.length - 2))).toThrow(/unvollständig/);
  });

  it('lehnt ungeeignete Dateien mit verständlicher Meldung ab', () => {
    expect(() => readDds(new Uint8Array(10))).toThrow(/zu kurz/);
    expect(() => readDds(new Uint8Array(200))).toThrow(/Kennung/);
    expect(() => readDds(concat(header({ width: 4, height: 4, pfFlags: 4, fourCc: 'DXT1', caps2: 0x200 }), new Uint8Array(8)))).toThrow(/Würfel/);
    expect(() => readDds(concat(header({ width: 4, height: 4, pfFlags: 4, fourCc: 'DXT1', caps2: 0x200000 }), new Uint8Array(8)))).toThrow(/Volumen/);
    expect(() => readDds(concat(header({ width: 4, height: 4, pfFlags: 4, fourCc: 'DXT2' }), new Uint8Array(16)))).toThrow(/DXT2/);
    expect(() => readDds(concat(header({ width: 4, height: 4, pfFlags: 4, fourCc: 'DX10', dx10: { dxgi: 98, array: 6 } }), new Uint8Array(16)))).toThrow(/2D/);
    expect(() => readDds(concat(header({ width: 4, height: 4, pfFlags: 4, fourCc: 'DX10', dx10: { dxgi: 2 } }), new Uint8Array(16)))).toThrow(/DXGI/);
    expect(() => readDds(concat(header({ width: 8, height: 8, pfFlags: 4, fourCc: 'DXT1' }), new Uint8Array(8)))).toThrow(/unvollständig/);
  });
});
