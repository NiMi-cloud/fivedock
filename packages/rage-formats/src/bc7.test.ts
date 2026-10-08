import { describe, expect, it } from 'vitest';
import { decodeBc7, decodeBc7Block } from './bc7.ts';
import { decodeTexture } from './texture-decode.ts';
import type { YtdTexture } from './ytd.ts';

const fromHex = (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex'));

/**
 * Je ein Block pro Modus mit den Pixeln, die Pillow (ein unabhängiger Dekodierer) daraus macht. Die vollständige Gegenprobe mit
 * 32.768 Zufallsblöcken und echten Fahrzeugtexturen steht in spikes/07-texture-lab/verify-bc7.ts.
 */
const FIXTURES = [
  { mode: 0, block: 'db74cefd7d440f6877e529b894982ec0', pixels: '74fd11ff4237bdffe7a5b5ffe77321ff7efb1bff4c35bdffe7978bffe7978bff91f62eff4237bdffe7814bffe79077ff74fd11ff3939bdffe7a5b5ffe79077ff' },
  { mode: 1, block: '360ae2aa7aa69735077c853f8aad9639', pixels: '29d8c9ff2aebd7ff226672ff226672ff29d8c9ff28c6bbff29d8c9ff237980ffaba16bffb5d123ffaead59ffaead59ffb0b848ffb7dd11ffa9957cffb9e900ff' },
  { mode: 2, block: '2c661128c7ef30cdacd3ebef3779022c', pixels: '9cffefff2973a5ff10c6bdff20bbd0ff9cffefff2973a5ff42a5f7ff10c6bdff76d1d7ff9cffefffcecebdffcecebdff4fa1bdff76d1d7ffb8abd3ffcecebdff' },
  { mode: 3, block: 'd81f78a84728d27eae6405c53e689307', pixels: '32395cff792365ff40c70eff50da0aff0f4357ff562e60ff2fb211ff40c70eff1f9f15ff50da0aff40c70eff2fb211ff792365ff32395cff0f4357ff0f4357ff' },
  { mode: 4, block: '10566b858690b9d22dadc1f396a06dcb', pixels: 'b5d64208d6521808c0ab3465c0ab3415c0ab3465cb7d264bcb7d264bd652183ecb7d2608c0ab343ec0ab3458cb7d2658cb7d2658c0ab3458c0ab3422d6521858' },
  { mode: 5, block: '20942a9bbddbafdb87d92c7d1fd903d0', pixels: '53d9a0ef28d976f628d976efabd9f7eb28d976efabd9f7f280d9cdef53d9a0f680d9cdf653d9a0eb53d9a0eb80d9cdeb80d9cdebabd9f7ebabd9f7ef80d9cdf6' },
  { mode: 6, block: 'c07350514e690ec31a9368f53979c22c', pixels: 'b6504936ca205116bf3a4d27a1804156a675434eb05f463fb650493682ca3486a1804156bf3a4d27a1804156ab6a4447c42e4f2092a53a6e92a53a6ec42e4f20' },
  { mode: 7, block: '801753c248cd848d67d5665d4e757b38', pixels: '5eaaa8971c48449e282d5189282d518958bf988058bf988034145d75282d51895eaaa89751d38a6934145d75106138b26596b6ae51d38a695eaaa897106138b2' },
];

/** Schreibt Bitfelder (Breite, Wert) von unten nach oben in 16 Byte. */
function pack(fields: Array<[number, number]>): Uint8Array {
  const out = new Uint8Array(16);
  let position = 0;
  for (const [width, value] of fields) {
    for (let i = 0; i < width; i++) {
      out[position >> 3]! |= ((value >> i) & 1) << (position & 7);
      position++;
    }
  }
  expect(position).toBeLessThanOrEqual(128);
  return out;
}

describe('decodeBc7Block', () => {
  for (const f of FIXTURES) {
    it(`Modus ${f.mode}: gleicher Block, gleiche Pixel wie der unabhängige Dekodierer`, () => {
      const out = new Uint8Array(64);
      decodeBc7Block(fromHex(f.block), 0, out);
      expect(Buffer.from(out).toString('hex')).toBe(f.pixels);
    });
  }

  it('Modus 6 von Hand: Endpunkte 0 und 255, Index 15 ergibt volle Farbe, der Ankerindex 7 ergibt Mittelgrau', () => {
    // 7 Bit Modus (Bit 6 gesetzt = Modus 6), je 7 Bit R0 R1 G0 G1 B0 B1 A0 A1, P-Bits 0 und 1, danach Indizes (Anker 3 Bit, Rest 4 Bit)
    const fields: Array<[number, number]> = [
      [7, 1 << 6],
      [7, 0], [7, 127], // R
      [7, 0], [7, 127], // G
      [7, 0], [7, 127], // B
      [7, 0], [7, 127], // A
      [1, 0], [1, 1], // P-Bits: Endpunkt 0 → 0, Endpunkt 1 → 255
      [3, 7], // Ankerpixel
      ...Array.from({ length: 15 }, (): [number, number] => [4, 15]),
    ];
    const out = new Uint8Array(64);
    decodeBc7Block(pack(fields), 0, out);
    // Gewicht 30 von 64 zwischen 0 und 255: (255 * 30 + 32) >> 6 = 120
    expect(Array.from(out.subarray(0, 4))).toEqual([120, 120, 120, 120]);
    expect(Array.from(out.subarray(4, 8))).toEqual([255, 255, 255, 255]);
    expect(Array.from(out.subarray(60, 64))).toEqual([255, 255, 255, 255]);
  });

  it('ein Block mit Modus 8 (erstes Byte 0) wird durchsichtiges Schwarz', () => {
    const out = new Uint8Array(64).fill(7);
    decodeBc7Block(new Uint8Array(16), 0, out);
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it('liest ab dem angegebenen Versatz', () => {
    const data = new Uint8Array(16 + 16);
    data.set(fromHex(FIXTURES[6]!.block), 16);
    const out = new Uint8Array(64);
    decodeBc7Block(data, 16, out);
    expect(Buffer.from(out).toString('hex')).toBe(FIXTURES[6]!.pixels);
  });
});

describe('decodeBc7', () => {
  it('setzt Blöcke zeilenweise zusammen und schneidet Bilder ab, deren Größe kein Vielfaches von 4 ist', () => {
    const blocks = new Uint8Array(4 * 16);
    for (let i = 0; i < 4; i++) blocks.set(fromHex(FIXTURES[i * 2]!.block), i * 16);
    const image = decodeBc7(blocks, 8, 8);
    expect(image).toMatchObject({ width: 8, height: 8 });
    // Pixel (4,0) gehört zum zweiten Block, Pixel (0,4) zum dritten
    const second = new Uint8Array(64);
    decodeBc7Block(blocks, 16, second);
    expect(Array.from(image.data.subarray(16, 20))).toEqual(Array.from(second.subarray(0, 4)));
    const third = new Uint8Array(64);
    decodeBc7Block(blocks, 32, third);
    expect(Array.from(image.data.subarray(4 * 8 * 4, 4 * 8 * 4 + 4))).toEqual(Array.from(third.subarray(0, 4)));

    const cropped = decodeBc7(blocks.subarray(0, 16), 3, 2);
    expect(cropped.data.length).toBe(3 * 2 * 4);
    const first = new Uint8Array(64);
    decodeBc7Block(blocks, 0, first);
    expect(Array.from(cropped.data.subarray(12, 16))).toEqual(Array.from(first.subarray(16, 20)));
  });
});

describe('decodeTexture mit BC7', () => {
  it('dekodiert eine BC7-Textur samt Mip-Stufen', () => {
    // 8 × 8 Stufe 0 (4 Blöcke), danach 4 × 4 (1 Block)
    const data = new Uint8Array(5 * 16);
    for (let i = 0; i < 5; i++) data.set(fromHex(FIXTURES[i]!.block), i * 16);
    const texture: YtdTexture = { name: 'bc7_test', width: 8, height: 8, levels: 2, format: 'BC7', data };
    expect(decodeTexture(texture, 0)).toMatchObject({ width: 8, height: 8 });
    const small = decodeTexture(texture, 1);
    expect(small).toMatchObject({ width: 4, height: 4 });
    expect(Buffer.from(small.data).toString('hex')).toBe(FIXTURES[4]!.pixels);
  });
});
