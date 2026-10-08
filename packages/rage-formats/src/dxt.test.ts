import { describe, expect, it } from 'vitest';
import { decodeBlocks, encodeBlocks, encodeMipChain, encodedSize } from './dxt.ts';
import type { RgbaImage } from './dds.ts';
import { mipChainSize } from './ytd.ts';

function image(width: number, height: number, f: (x: number, y: number) => [number, number, number, number]): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(f(x, y), (y * width + x) * 4);
  return { width, height, data };
}

/** Spitzen-Signal-Rausch-Verhältnis über RGB. */
function psnr(a: RgbaImage, b: RgbaImage): number {
  let mse = 0;
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const d = a.data[i + c]! - b.data[i + c]!;
      mse += d * d;
      n++;
    }
  }
  mse /= n;
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

describe('Größen', () => {
  it('BC1 ist 8 Byte, BC3 16 Byte je 4x4-Block, mindestens ein Block', () => {
    expect(encodedSize('DXT1', 64, 64)).toBe(16 * 16 * 8);
    expect(encodedSize('DXT5', 64, 64)).toBe(16 * 16 * 16);
    expect(encodedSize('DXT1', 1, 1)).toBe(8);
    expect(encodedSize('DXT5', 2, 2)).toBe(16);
  });

  it('die Mip-Kette hat genau die Größe, die das YTD erwartet', () => {
    const img = image(64, 32, () => [10, 20, 30, 255]);
    const dxt1 = encodeMipChain(img, 'DXT1');
    expect(dxt1.levels).toBe(7);
    expect(dxt1.data.length).toBe(mipChainSize('DXT1', 64, 32, 7));
    const dxt5 = encodeMipChain(img, 'DXT5');
    expect(dxt5.data.length).toBe(mipChainSize('DXT5', 64, 32, 7));
  });
});

describe('BC1 (DXT1)', () => {
  it('gibt einfarbige Flächen nahezu exakt wieder', () => {
    const img = image(16, 16, () => [200, 100, 50, 255]);
    const out = decodeBlocks(encodeBlocks(img, 'DXT1'), 16, 16, 'DXT1');
    for (let i = 0; i < out.data.length; i += 4) {
      expect(Math.abs(out.data[i]! - 200)).toBeLessThanOrEqual(5);
      expect(Math.abs(out.data[i + 1]! - 100)).toBeLessThanOrEqual(3);
      expect(Math.abs(out.data[i + 2]! - 50)).toBeLessThanOrEqual(5);
      expect(out.data[i + 3]).toBe(255);
    }
  });

  it('bildet einen Farbverlauf mit hoher Qualität ab', () => {
    const img = image(64, 64, (x, y) => [x * 4, y * 4, 128, 255]);
    const out = decodeBlocks(encodeBlocks(img, 'DXT1'), 64, 64, 'DXT1');
    expect(psnr(img, out)).toBeGreaterThan(34);
  });

  it('erhält ein scharfes Schachbrett', () => {
    const img = image(32, 32, (x, y) => (((x >> 2) + (y >> 2)) % 2 === 0 ? [240, 240, 240, 255] : [20, 20, 20, 255]));
    const out = decodeBlocks(encodeBlocks(img, 'DXT1'), 32, 32, 'DXT1');
    expect(psnr(img, out)).toBeGreaterThan(38);
  });

  it('kodiert Durchsichtigkeit mit 1 Bit', () => {
    const img = image(8, 8, (x) => (x < 4 ? [255, 0, 0, 255] : [0, 255, 0, 0]));
    const out = decodeBlocks(encodeBlocks(img, 'DXT1'), 8, 8, 'DXT1');
    expect(out.data[3]).toBe(255); // linke Seite deckend
    expect(out.data[4 * 4 + 3]).toBe(0); // rechte Seite durchsichtig
  });

  it('kommt mit Bildern zurecht, die kleiner als ein Block sind', () => {
    const img = image(2, 2, (x, y) => [x * 100, y * 100, 0, 255]);
    const data = encodeBlocks(img, 'DXT1');
    expect(data.length).toBe(8);
    const out = decodeBlocks(data, 2, 2, 'DXT1');
    expect(out.data.length).toBe(16);
  });
});

describe('BC2 (DXT3), BC4 (ATI1) und BC5 (ATI2)', () => {
  it('Größen: DXT3 und ATI2 16 Byte, ATI1 8 Byte je Block', () => {
    expect(encodedSize('DXT3', 16, 16)).toBe(16 * 16);
    expect(encodedSize('ATI2', 16, 16)).toBe(16 * 16);
    expect(encodedSize('ATI1', 16, 16)).toBe(16 * 8);
  });

  it('DXT3 bewahrt Alpha in 4 Bit und die Farbe', () => {
    const img = image(8, 8, (x) => [100, 150, 200, x < 4 ? 255 : 0]);
    const out = decodeBlocks(encodeBlocks(img, 'DXT3'), 8, 8, 'DXT3');
    expect(out.data[3]).toBe(255);
    expect(out.data[4 * 4 + 3]).toBe(0);
    expect(psnr(img, out)).toBeGreaterThan(35);
  });

  it('ATI1 gibt einen Grauverlauf wieder', () => {
    const img = image(32, 32, (x) => [x * 8, 0, 0, 255]);
    const out = decodeBlocks(encodeBlocks(img, 'ATI1'), 32, 32, 'ATI1');
    let maxErr = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      maxErr = Math.max(maxErr, Math.abs(img.data[i]! - out.data[i]!));
      expect(out.data[i + 1]).toBe(out.data[i]); // Grau
    }
    expect(maxErr).toBeLessThanOrEqual(24);
  });

  it('ATI2 erhält Rot und Grün und ergänzt Blau als Normalenkomponente', () => {
    const img = image(16, 16, (x, y) => [128 + x * 3, 128 + y * 3, 255, 255]);
    const out = decodeBlocks(encodeBlocks(img, 'ATI2'), 16, 16, 'ATI2');
    for (let i = 0; i < img.data.length; i += 4) {
      expect(Math.abs(img.data[i]! - out.data[i]!)).toBeLessThanOrEqual(8);
      expect(Math.abs(img.data[i + 1]! - out.data[i + 1]!)).toBeLessThanOrEqual(8);
    }
    // Flache Normale (x=y=0) ergibt z = 1 -> Blau ganz oben
    const flat = image(4, 4, () => [128, 128, 0, 255]);
    const f = decodeBlocks(encodeBlocks(flat, 'ATI2'), 4, 4, 'ATI2');
    expect(f.data[2]).toBeGreaterThan(250);
  });

  it('decodeBlocks liest eine spätere Stufe über byteOffset', () => {
    const img = image(8, 8, (x) => (x < 4 ? [255, 0, 0, 255] : [0, 0, 255, 255]));
    const chain = encodeMipChain(img, 'DXT1');
    const level1 = decodeBlocks(chain.data, 4, 4, 'DXT1', encodedSize('DXT1', 8, 8));
    expect(level1.data[0]).toBeGreaterThan(200); // links rot
    expect(level1.data[2 * 4 + 2]).toBeGreaterThan(200); // rechts blau
  });
});

describe('BC3 (DXT5)', () => {
  it('gibt Alpha-Verläufe mit kleinem Fehler wieder', () => {
    const img = image(32, 32, (x) => [100, 150, 200, Math.round((x / 31) * 255)]);
    const out = decodeBlocks(encodeBlocks(img, 'DXT5'), 32, 32, 'DXT5');
    let maxErr = 0;
    for (let i = 0; i < img.data.length; i += 4) maxErr = Math.max(maxErr, Math.abs(img.data[i + 3]! - out.data[i + 3]!));
    expect(maxErr).toBeLessThanOrEqual(20);
  });

  it('erhält deckende und durchsichtige Bereiche exakt', () => {
    const img = image(8, 8, (x) => [10, 20, 30, x < 4 ? 255 : 0]);
    const out = decodeBlocks(encodeBlocks(img, 'DXT5'), 8, 8, 'DXT5');
    expect(out.data[3]).toBe(255);
    expect(out.data[4 * 4 + 3]).toBe(0);
  });

  it('Farbteil bleibt von Alpha unberührt und verwendet den Vierfarbenmodus', () => {
    // Ein Verlauf in einer Richtung lässt sich mit zwei Endpunkten je Block gut abbilden.
    const img = image(16, 16, (x) => [x * 16, 40, 200 - x * 8, 128]);
    const out = decodeBlocks(encodeBlocks(img, 'DXT5'), 16, 16, 'DXT5');
    expect(psnr(img, out)).toBeGreaterThan(33);
  });
});
