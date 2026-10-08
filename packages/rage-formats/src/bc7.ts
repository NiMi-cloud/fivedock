/**
 * BC7-Dekodierer (Blockformat BPTC, 16 Byte je 4 × 4 Pixel). Nur Lesen: Wir erhalten BC7-Texturen unverändert, zeigen sie
 * aber an. Aufbau nach der BC7-Spezifikation, Gegenprobe mit einem unabhängigen Dekodierer (siehe bc7.test.ts und
 * spikes/07-texture-lab/verify-bc7.ts).
 */

import { PARTITIONS_2, PARTITIONS_3 } from './bc7-tables.ts';
import type { RgbaImage } from './dds.ts';

/** Farbbits je Kanal ohne P-Bit, Alphabits ohne P-Bit (0 = kein eigenes Alpha), je Modus 0 bis 7. */
const COLOR_BITS = [4, 6, 5, 7, 5, 7, 7, 5];
const ALPHA_BITS = [0, 0, 0, 0, 6, 8, 7, 5];
/** Modi mit je einem P-Bit je Endpunkt (0, 3, 6, 7) und mit einem je Teilmenge (1). */
const PBIT_PER_ENDPOINT = [true, false, false, true, false, false, true, true];

const WEIGHTS_2 = [0, 21, 43, 64];
const WEIGHTS_3 = [0, 9, 18, 27, 37, 46, 55, 64];
const WEIGHTS_4 = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64];

function weightsFor(bits: number): number[] {
  return bits === 2 ? WEIGHTS_2 : bits === 3 ? WEIGHTS_3 : WEIGHTS_4;
}

const interpolate = (a: number, b: number, weights: number[], index: number) => (a * (64 - weights[index]!) + b * weights[index]! + 32) >> 6;

/** Liest Bits von unten nach oben aus einem 16-Byte-Block. */
class BitReader {
  private readonly data: Uint8Array;
  private readonly start: number;
  private position = 0;

  constructor(data: Uint8Array, start: number) {
    this.data = data;
    this.start = start;
  }

  read(count: number): number {
    let value = 0;
    for (let i = 0; i < count; i++) {
      const byte = this.data[this.start + (this.position >> 3)]!;
      value |= ((byte >> (this.position & 7)) & 1) << i;
      this.position++;
    }
    return value;
  }
}

/** Dekodiert einen BC7-Block nach `out` (16 Pixel RGBA, zeilenweise). Ein ungültiger Block (Modus 8) ergibt durchsichtiges Schwarz. */
export function decodeBc7Block(data: Uint8Array, offset: number, out: Uint8Array): void {
  const bits = new BitReader(data, offset);
  let mode = 0;
  while (mode < 8 && bits.read(1) === 0) mode++;
  if (mode >= 8) {
    out.fill(0, 0, 64);
    return;
  }

  let partition = 0;
  let subsets = 1;
  if (mode === 0 || mode === 1 || mode === 2 || mode === 3 || mode === 7) {
    subsets = mode === 0 || mode === 2 ? 3 : 2;
    partition = bits.read(mode === 0 ? 4 : 6);
  }
  let rotation = 0;
  let indexSelect = 0;
  if (mode === 4 || mode === 5) {
    rotation = bits.read(2);
    if (mode === 4) indexSelect = bits.read(1);
  }

  const endpoints = subsets * 2;
  const colorBits = COLOR_BITS[mode]!;
  const alphaBits = ALPHA_BITS[mode]!;
  // endpoint[i] = [r, g, b, a]
  const ep: number[][] = Array.from({ length: endpoints }, () => [0, 0, 0, 255]);
  for (let channel = 0; channel < 3; channel++) for (let i = 0; i < endpoints; i++) ep[i]![channel] = bits.read(colorBits);
  if (alphaBits > 0) for (let i = 0; i < endpoints; i++) ep[i]![3] = bits.read(alphaBits);

  // P-Bits: unten an jede Komponente (und das Alpha, falls vorhanden) angehängt.
  const hasPBits = PBIT_PER_ENDPOINT[mode]! || mode === 1;
  if (hasPBits) {
    for (const e of ep) for (let k = 0; k < 4; k++) if (k < 3 || alphaBits > 0) e[k] = e[k]! << 1;
    if (mode === 1) {
      const first = bits.read(1);
      const second = bits.read(1);
      for (let k = 0; k < 3; k++) {
        ep[0]![k]! |= first;
        ep[1]![k]! |= first;
        ep[2]![k]! |= second;
        ep[3]![k]! |= second;
      }
    } else {
      for (const e of ep) {
        const p = bits.read(1);
        for (let k = 0; k < 4; k++) if (k < 3 || alphaBits > 0) e[k]! |= p;
      }
    }
  }
  // Auf 8 Bit erweitern: nach oben schieben und die obersten Bits in die freien unteren wiederholen.
  const precisionColor = colorBits + (hasPBits ? 1 : 0);
  const precisionAlpha = alphaBits + (hasPBits ? 1 : 0);
  for (const e of ep) {
    for (let k = 0; k < 3; k++) {
      e[k] = e[k]! << (8 - precisionColor);
      e[k] = e[k]! | (e[k]! >> precisionColor);
    }
    if (alphaBits > 0) {
      e[3] = e[3]! << (8 - precisionAlpha);
      e[3] = e[3]! | (e[3]! >> precisionAlpha);
    } else {
      e[3] = 255;
    }
  }

  const primaryBits = mode === 0 || mode === 1 ? 3 : mode === 6 ? 4 : 2;
  const secondaryBits = mode === 4 ? 3 : mode === 5 ? 2 : 0;
  const primaryWeights = weightsFor(primaryBits);
  const secondaryWeights = weightsFor(secondaryBits);
  const table = subsets === 3 ? PARTITIONS_3 : PARTITIONS_2;

  // Erster Durchgang: Farbindizes. Der Ankerpixel jeder Teilmenge hat ein Bit weniger.
  const subsetOf = new Uint8Array(16);
  const colorIndex = new Uint8Array(16);
  for (let p = 0; p < 16; p++) {
    const entry = subsets === 1 ? (p === 0 ? 128 : 0) : table[partition * 16 + p]!;
    subsetOf[p] = entry & 3;
    colorIndex[p] = bits.read(entry & 0x80 ? primaryBits - 1 : primaryBits);
  }

  // Zweiter Durchgang: Alphaindizes (Modi 4 und 5), Interpolieren und Kanäle tauschen.
  for (let p = 0; p < 16; p++) {
    const lo = ep[subsetOf[p]! * 2]!;
    const hi = ep[subsetOf[p]! * 2 + 1]!;
    let r: number;
    let g: number;
    let b: number;
    let a: number;
    if (secondaryBits === 0) {
      r = interpolate(lo[0]!, hi[0]!, primaryWeights, colorIndex[p]!);
      g = interpolate(lo[1]!, hi[1]!, primaryWeights, colorIndex[p]!);
      b = interpolate(lo[2]!, hi[2]!, primaryWeights, colorIndex[p]!);
      a = interpolate(lo[3]!, hi[3]!, primaryWeights, colorIndex[p]!);
    } else {
      const second = bits.read(p === 0 ? secondaryBits - 1 : secondaryBits);
      const colorUses = indexSelect === 0 ? [primaryWeights, colorIndex[p]!] : [secondaryWeights, second];
      const alphaUses = indexSelect === 0 ? [secondaryWeights, second] : [primaryWeights, colorIndex[p]!];
      r = interpolate(lo[0]!, hi[0]!, colorUses[0] as number[], colorUses[1] as number);
      g = interpolate(lo[1]!, hi[1]!, colorUses[0] as number[], colorUses[1] as number);
      b = interpolate(lo[2]!, hi[2]!, colorUses[0] as number[], colorUses[1] as number);
      a = interpolate(lo[3]!, hi[3]!, alphaUses[0] as number[], alphaUses[1] as number);
    }
    if (rotation === 1) [a, r] = [r, a];
    else if (rotation === 2) [a, g] = [g, a];
    else if (rotation === 3) [a, b] = [b, a];
    out[p * 4] = r;
    out[p * 4 + 1] = g;
    out[p * 4 + 2] = b;
    out[p * 4 + 3] = a;
  }
}

/** Dekodiert ein BC7-Bild ab `byteOffset` (Standard 0, die erste Stufe einer Mip-Kette). */
export function decodeBc7(data: Uint8Array, width: number, height: number, byteOffset = 0): RgbaImage {
  const bw = Math.max(1, Math.ceil(width / 4));
  const bh = Math.max(1, Math.ceil(height / 4));
  const out = new Uint8Array(width * height * 4);
  const block = new Uint8Array(64);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      decodeBc7Block(data, byteOffset + (by * bw + bx) * 16, block);
      for (let y = 0; y < 4 && by * 4 + y < height; y++) {
        for (let x = 0; x < 4 && bx * 4 + x < width; x++) {
          out.set(block.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 4), ((by * 4 + y) * width + bx * 4 + x) * 4);
        }
      }
    }
  }
  return { width, height, data: out };
}
