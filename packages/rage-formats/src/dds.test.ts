import { describe, expect, it } from 'vitest';
import { buildMipChain, downsampleBox, mipLevelCount, packBgra, writeDdsBgra } from './dds.ts';

function solid(width: number, height: number, rgba: [number, number, number, number]) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return { width, height, data };
}

describe('dds', () => {
  it('mipLevelCount zählt bis 1x1', () => {
    expect(mipLevelCount(64, 64)).toBe(7);
    expect(mipLevelCount(1, 1)).toBe(1);
    expect(mipLevelCount(256, 64)).toBe(9);
  });

  it('downsampleBox mittelt 2x2 Blöcke', () => {
    const src = {
      width: 2,
      height: 2,
      data: new Uint8Array([0, 0, 0, 255, 100, 100, 100, 255, 200, 200, 200, 255, 100, 100, 100, 255]),
    };
    const out = downsampleBox(src);
    expect(out.width).toBe(1);
    expect(out.height).toBe(1);
    expect([...out.data]).toEqual([100, 100, 100, 255]);
  });

  it('buildMipChain liefert alle Stufen bis 1x1', () => {
    const chain = buildMipChain(solid(8, 4, [1, 2, 3, 4]));
    expect(chain.map((l) => `${l.width}x${l.height}`)).toEqual(['8x4', '4x2', '2x1', '1x1']);
  });

  it('packBgra vertauscht Rot und Blau und lässt Alpha stehen', () => {
    const bytes = packBgra([solid(1, 1, [10, 20, 30, 40])]);
    expect([...bytes]).toEqual([30, 20, 10, 40]);
  });

  it('writeDdsBgra schreibt Kopf, Pixelformat und Größe korrekt', () => {
    const dds = writeDdsBgra(solid(64, 64, [10, 20, 30, 255]));
    const view = new DataView(dds.buffer);

    expect(view.getUint32(0, true)).toBe(0x20534444); // "DDS "
    expect(view.getUint32(4, true)).toBe(124);
    expect(view.getUint32(12, true)).toBe(64); // Höhe
    expect(view.getUint32(16, true)).toBe(64); // Breite
    expect(view.getUint32(28, true)).toBe(7); // Mip-Stufen
    expect(view.getUint32(88, true)).toBe(32); // Bits pro Pixel
    expect(view.getUint32(92, true)).toBe(0x00ff0000); // R-Maske

    const pixels = [64, 32, 16, 8, 4, 2, 1].reduce((s, n) => s + n * n, 0);
    expect(dds.length).toBe(128 + pixels * 4);
    expect([...dds.subarray(128, 132)]).toEqual([30, 20, 10, 255]);
  });

  it('writeDdsBgra lehnt Nicht-Zweierpotenzen ab', () => {
    expect(() => writeDdsBgra(solid(60, 64, [0, 0, 0, 255]))).toThrow(/Zweierpotenz/);
  });
});
