import { describe, expect, it } from 'vitest';
import { buildMipChain, buildYtd, decodeTexture, encodeMipChain, packBgra, readYtd } from '@toolkit/rage-formats';
import type { RgbaImage, YtdTexture } from '@toolkit/rage-formats';
import { LiveryWriteError, checkLiveryImage, replaceLiveryTexture } from './livery-write.ts';

function solid(width: number, height: number, rgba: [number, number, number, number]): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return { width, height, data };
}

function bgraTexture(name: string, size: number, rgba: [number, number, number, number], levels?: number): YtdTexture {
  const chain = buildMipChain(solid(size, size, rgba)).slice(0, levels);
  return { name, width: size, height: size, levels: chain.length, format: 'A8R8G8B8', data: packBgra(chain) };
}

function dxt1Texture(name: string, size: number): YtdTexture {
  const { levels, data } = encodeMipChain(solid(size, size, [10, 120, 200, 255]), 'DXT1');
  return { name, width: size, height: size, levels, format: 'DXT1', data };
}

describe('replaceLiveryTexture', () => {
  const sign = bgraTexture('fpiu_sign_1', 64, [0, 0, 0, 0], 1);
  const other = dxt1Texture('fpiu_dirt', 32);
  const original = buildYtd([sign, other]);

  it('ersetzt nur die Livery-Textur, behält Namen, Größe und Format und lässt die anderen Texturen unverändert', () => {
    const painted = solid(64, 64, [200, 30, 30, 255]);
    const result = replaceLiveryTexture(original, 'FPIU_SIGN_1', painted);
    const back = readYtd(result.ytd);
    expect(back.map((t) => t.name).sort()).toEqual(['fpiu_dirt', 'fpiu_sign_1']);

    const newSign = back.find((t) => t.name === 'fpiu_sign_1')!;
    expect(newSign).toMatchObject({ width: 64, height: 64, format: 'A8R8G8B8' });
    const pixel = decodeTexture(newSign, 0).data;
    expect(Array.from(pixel.slice(0, 4))).toEqual([200, 30, 30, 255]);

    const dirtBefore = readYtd(original).find((t) => t.name === 'fpiu_dirt')!;
    const dirtAfter = back.find((t) => t.name === 'fpiu_dirt')!;
    expect(Buffer.compare(Buffer.from(dirtBefore.data), Buffer.from(dirtAfter.data))).toBe(0);
    expect(result.texture.name).toBe('fpiu_sign_1');
  });

  it('skaliert ein Bild anderer Größe auf die Größe der alten Textur', () => {
    const painted = solid(128, 128, [10, 200, 10, 255]);
    const result = replaceLiveryTexture(original, 'fpiu_sign_1', painted);
    expect(result.texture).toMatchObject({ width: 64, height: 64 });
    expect(Array.from(decodeTexture(result.texture, 0).data.slice(0, 4))).toEqual([10, 200, 10, 255]);
  });

  it('behält durchsichtige Stellen (Deckkraft) bei', () => {
    const painted = solid(64, 64, [255, 255, 255, 0]);
    painted.data.set([255, 0, 0, 255], 0);
    const result = replaceLiveryTexture(original, 'fpiu_sign_1', painted);
    const pixels = decodeTexture(result.texture, 0).data;
    expect(pixels[3]).toBe(255);
    expect(pixels[7]).toBe(0);
  });

  it('meldet eine fehlende Textur mit eigenem Fehlercode', () => {
    expect(() => replaceLiveryTexture(original, 'gibt_es_nicht', solid(64, 64, [0, 0, 0, 255]))).toThrow(LiveryWriteError);
    try {
      replaceLiveryTexture(original, 'gibt_es_nicht', solid(64, 64, [0, 0, 0, 255]));
    } catch (e) {
      expect((e as LiveryWriteError).code).toBe('texture-missing');
    }
  });
});

describe('checkLiveryImage', () => {
  const target = { width: 64, height: 64 };

  it('warnt nicht bei passender Größe und teiltransparentem Bild', () => {
    const image = solid(64, 64, [0, 0, 0, 0]);
    for (let i = 0; i < 1000; i++) image.data.set([200, 0, 0, 255], i * 4);
    expect(checkLiveryImage(image, target).warnings).toEqual([]);
  });

  it('warnt vor Bildern ohne Durchsicht, weil sie den Lack ganz überdecken', () => {
    expect(checkLiveryImage(solid(64, 64, [20, 20, 20, 255]), target).warnings).toContain('opaque');
  });

  it('warnt vor einem ganz leeren Bild', () => {
    expect(checkLiveryImage(solid(64, 64, [0, 0, 0, 0]), target).warnings).toContain('empty');
  });

  it('unterscheidet andere Größe (wird skaliert) von anderem Seitenverhältnis (wird verzerrt)', () => {
    const half = solid(32, 32, [0, 0, 0, 0]);
    half.data.set([1, 1, 1, 255], 0);
    expect(checkLiveryImage(half, target).warnings).toContain('resized');
    const wide = solid(128, 64, [0, 0, 0, 0]);
    wide.data.set([1, 1, 1, 255], 0);
    expect(checkLiveryImage(wide, target).warnings).toContain('aspect');
  });
});
