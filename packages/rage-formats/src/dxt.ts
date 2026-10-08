/**
 * Blockkompression für Texturen: BC1 (DXT1) und BC3 (DXT5).
 *
 * Beide Formate teilen das Bild in 4x4-Blöcke. BC1 speichert pro Block zwei Farben (RGB565) und 2 Bit je Pixel
 * (8 Byte), BC3 ergänzt davor einen Alphablock aus zwei Werten und 3 Bit je Pixel (16 Byte).
 * Die Formate sind von Microsoft öffentlich dokumentiert ("Block Compression", Direct3D).
 *
 * Der Encoder wählt die Endpunkte entlang der Hauptachse der Farbwolke (Hauptkomponentenanalyse) und ordnet
 * jedem Pixel den nächsten Palettenwert zu. Die Qualität ist für Spieltexturen gut und die Laufzeit gering.
 */

import { downsampleBox } from './dds.ts';
import type { RgbaImage } from './dds.ts';

const expand5 = (v: number) => (v << 3) | (v >> 2);
const expand6 = (v: number) => (v << 2) | (v >> 4);

function to565(r: number, g: number, b: number): number {
  const r5 = Math.min(31, Math.max(0, Math.round((r * 31) / 255)));
  const g6 = Math.min(63, Math.max(0, Math.round((g * 63) / 255)));
  const b5 = Math.min(31, Math.max(0, Math.round((b * 31) / 255)));
  return (r5 << 11) | (g6 << 5) | b5;
}

function from565(c: number): [number, number, number] {
  return [expand5((c >> 11) & 31), expand6((c >> 5) & 63), expand5(c & 31)];
}

/** Liest einen 4x4-Block (RGBA) aus dem Bild, Ränder werden wiederholt. */
function readBlock(image: RgbaImage, bx: number, by: number, out: Uint8Array): void {
  for (let y = 0; y < 4; y++) {
    const sy = Math.min(image.height - 1, by * 4 + y);
    for (let x = 0; x < 4; x++) {
      const sx = Math.min(image.width - 1, bx * 4 + x);
      const s = (sy * image.width + sx) * 4;
      out.set(image.data.subarray(s, s + 4), (y * 4 + x) * 4);
    }
  }
}

/** Hauptachse der Farbwolke (normiert) per Potenzverfahren. */
function principalAxis(colors: number[][], mean: [number, number, number]): [number, number, number] {
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const c of colors) {
    const dx = c[0]! - mean[0];
    const dy = c[1]! - mean[1];
    const dz = c[2]! - mean[2];
    xx += dx * dx; xy += dx * dy; xz += dx * dz;
    yy += dy * dy; yz += dy * dz; zz += dz * dz;
  }
  let v: [number, number, number] = [1, 1, 1];
  // Startvektor: Achse mit der größten Varianz, damit das Verfahren nicht auf einer Nebenachse hängen bleibt.
  if (xx >= yy && xx >= zz) v = [1, 0.1, 0.1];
  else if (yy >= zz) v = [0.1, 1, 0.1];
  else v = [0.1, 0.1, 1];
  for (let i = 0; i < 8; i++) {
    const nx = xx * v[0] + xy * v[1] + xz * v[2];
    const ny = xy * v[0] + yy * v[1] + yz * v[2];
    const nz = xz * v[0] + yz * v[1] + zz * v[2];
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return [0, 0, 0];
    v = [nx / len, ny / len, nz / len];
  }
  return v;
}

/**
 * Kodiert einen 4x4-Block als BC1 (8 Byte) in `out` ab `offset`.
 * `useAlpha`: Pixel mit Alpha unter 128 werden als durchsichtig kodiert (3-Farben-Modus).
 */
export function encodeBc1Block(block: Uint8Array, out: Uint8Array, offset: number, useAlpha: boolean): void {
  const opaque: number[][] = [];
  const isTransparent: boolean[] = [];
  let anyTransparent = false;
  for (let i = 0; i < 16; i++) {
    const clear = useAlpha && block[i * 4 + 3]! < 128;
    isTransparent.push(clear);
    if (clear) anyTransparent = true;
    else opaque.push([block[i * 4]!, block[i * 4 + 1]!, block[i * 4 + 2]!]);
  }

  let c0 = 0;
  let c1 = 0;

  if (opaque.length === 0) {
    // Ganz durchsichtiger Block: beide Farben schwarz, alle Pixel zeigen auf "transparent".
    c0 = 0;
    c1 = 0;
  } else {
    const mean: [number, number, number] = [0, 0, 0];
    for (const c of opaque) { mean[0] += c[0]!; mean[1] += c[1]!; mean[2] += c[2]!; }
    mean[0] /= opaque.length; mean[1] /= opaque.length; mean[2] /= opaque.length;

    const axis = principalAxis(opaque, mean);
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of opaque) {
      const t = (c[0]! - mean[0]) * axis[0] + (c[1]! - mean[1]) * axis[1] + (c[2]! - mean[2]) * axis[2];
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    const clamp = (v: number) => Math.min(255, Math.max(0, v));
    const p0 = [clamp(mean[0] + axis[0] * lo), clamp(mean[1] + axis[1] * lo), clamp(mean[2] + axis[2] * lo)];
    const p1 = [clamp(mean[0] + axis[0] * hi), clamp(mean[1] + axis[1] * hi), clamp(mean[2] + axis[2] * hi)];
    c0 = to565(p1[0]!, p1[1]!, p1[2]!); // heller Endpunkt zuerst
    c1 = to565(p0[0]!, p0[1]!, p0[2]!);
  }

  // Reihenfolge entscheidet über den Modus: c0 > c1 = vier Farben, c0 <= c1 = drei Farben plus transparent.
  if (anyTransparent) {
    if (c0 > c1) [c0, c1] = [c1, c0];
  } else if (c0 < c1) {
    [c0, c1] = [c1, c0];
  } else if (c0 === c1 && c0 !== 0xffff) {
    // Gleiche Endpunkte würden den Dreifarbenmodus auslösen. Mit einem helleren c0 bleibt es der Vierfarbenmodus.
    c0 = Math.min(0xffff, c0 + 1);
  }

  const p0 = from565(c0);
  const p1 = from565(c1);
  const palette: Array<[number, number, number]> = [p0, p1];
  if (c0 > c1) {
    palette.push(
      [Math.round((2 * p0[0] + p1[0]) / 3), Math.round((2 * p0[1] + p1[1]) / 3), Math.round((2 * p0[2] + p1[2]) / 3)],
      [Math.round((p0[0] + 2 * p1[0]) / 3), Math.round((p0[1] + 2 * p1[1]) / 3), Math.round((p0[2] + 2 * p1[2]) / 3)],
    );
  } else {
    palette.push([Math.round((p0[0] + p1[0]) / 2), Math.round((p0[1] + p1[1]) / 2), Math.round((p0[2] + p1[2]) / 2)]);
  }

  let indices = 0;
  for (let i = 0; i < 16; i++) {
    let best = 0;
    if (isTransparent[i]) {
      best = 3;
    } else {
      let bestDist = Infinity;
      for (let k = 0; k < palette.length; k++) {
        const p = palette[k]!;
        const dr = block[i * 4]! - p[0];
        const dg = block[i * 4 + 1]! - p[1];
        const db = block[i * 4 + 2]! - p[2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestDist) {
          bestDist = d;
          best = k;
        }
      }
    }
    indices |= best << (i * 2);
  }

  out[offset] = c0 & 0xff;
  out[offset + 1] = c0 >> 8;
  out[offset + 2] = c1 & 0xff;
  out[offset + 3] = c1 >> 8;
  out[offset + 4] = indices & 0xff;
  out[offset + 5] = (indices >>> 8) & 0xff;
  out[offset + 6] = (indices >>> 16) & 0xff;
  out[offset + 7] = (indices >>> 24) & 0xff;
}

/**
 * Kodiert einen einzelnen Kanal eines Blocks als 8-Byte-Einkanalblock (BC4, ebenso der Alphateil von BC3):
 * zwei Endwerte und 3 Bit je Pixel.
 */
export function encodeBc4Block(block: Uint8Array, out: Uint8Array, offset: number, channel: number): void {
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < 16; i++) {
    const a = block[i * 4 + channel]!;
    if (a < lo) lo = a;
    if (a > hi) hi = a;
  }
  // a0 > a1: acht Werte (a0, a1 und sechs dazwischen).
  const a0 = hi;
  const a1 = lo;
  const palette = [a0, a1];
  for (let k = 1; k <= 6; k++) palette.push(Math.round(((7 - k) * a0 + k * a1) / 7));

  let bits = 0n;
  for (let i = 0; i < 16; i++) {
    const a = block[i * 4 + channel]!;
    let best = 0;
    let bestDist = Infinity;
    for (let k = 0; k < 8; k++) {
      const d = Math.abs(a - palette[k]!);
      if (d < bestDist) {
        bestDist = d;
        best = k;
      }
    }
    bits |= BigInt(best) << BigInt(i * 3);
  }
  out[offset] = a0;
  out[offset + 1] = a1;
  for (let i = 0; i < 6; i++) out[offset + 2 + i] = Number((bits >> BigInt(i * 8)) & 0xffn);
}

/** Alphateil von BC3. */
export function encodeBc3AlphaBlock(block: Uint8Array, out: Uint8Array, offset: number): void {
  encodeBc4Block(block, out, offset, 3);
}

/** Explizites 4-Bit-Alpha von BC2 (DXT3): 8 Byte, zwei Pixel je Byte. */
function encodeBc2AlphaBlock(block: Uint8Array, out: Uint8Array, offset: number): void {
  for (let i = 0; i < 8; i++) {
    const a0 = Math.round((block[i * 8 + 3]! * 15) / 255);
    const a1 = Math.round((block[i * 8 + 7]! * 15) / 255);
    out[offset + i] = a0 | (a1 << 4);
  }
}

/** Blockformate, die dieses Modul kodieren und dekodieren kann. Die Namen entsprechen denen im YTD. */
export type BlockFormat = 'DXT1' | 'DXT3' | 'DXT5' | 'ATI1' | 'ATI2';

export const BLOCK_BYTES: Record<BlockFormat, number> = { DXT1: 8, ATI1: 8, DXT3: 16, DXT5: 16, ATI2: 16 };

export function isBlockFormat(format: string): format is BlockFormat {
  return format in BLOCK_BYTES;
}

/** Größe der kodierten Daten einer einzelnen Stufe. */
export function encodedSize(format: BlockFormat, width: number, height: number): number {
  const blocks = Math.max(1, Math.ceil(width / 4)) * Math.max(1, Math.ceil(height / 4));
  return blocks * BLOCK_BYTES[format];
}

/** Kodiert ein Bild in das gewählte Blockformat. */
export function encodeBlocks(image: RgbaImage, format: BlockFormat): Uint8Array {
  const bw = Math.max(1, Math.ceil(image.width / 4));
  const bh = Math.max(1, Math.ceil(image.height / 4));
  const blockBytes = BLOCK_BYTES[format];
  const out = new Uint8Array(bw * bh * blockBytes);
  const block = new Uint8Array(64);
  let o = 0;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      readBlock(image, bx, by, block);
      switch (format) {
        case 'DXT1':
          encodeBc1Block(block, out, o, true);
          break;
        case 'DXT3':
          encodeBc2AlphaBlock(block, out, o);
          encodeBc1Block(block, out, o + 8, false);
          break;
        case 'DXT5':
          encodeBc3AlphaBlock(block, out, o);
          encodeBc1Block(block, out, o + 8, false);
          break;
        case 'ATI1':
          encodeBc4Block(block, out, o, 0);
          break;
        case 'ATI2':
          encodeBc4Block(block, out, o, 0);
          encodeBc4Block(block, out, o + 8, 1);
          break;
      }
      o += blockBytes;
    }
  }
  return out;
}

/** Baut die Mip-Kette und kodiert jede Stufe. Gibt die Anzahl der Stufen und die zusammengefügten Daten zurück. */
export function encodeMipChain(image: RgbaImage, format: BlockFormat): { levels: number; data: Uint8Array } {
  const chain: RgbaImage[] = [image];
  while (chain[chain.length - 1]!.width > 1 || chain[chain.length - 1]!.height > 1) {
    chain.push(downsampleBox(chain[chain.length - 1]!));
  }
  const parts = chain.map((level) => encodeBlocks(level, format));
  const data = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    data.set(p, o);
    o += p.length;
  }
  return { levels: chain.length, data };
}

// --- Dekodieren (Tests und spätere Werkzeuge) -------------------------------------------------------

function decodeBc1Block(src: Uint8Array, o: number, out: Uint8Array, alpha: boolean): void {
  const c0 = src[o]! | (src[o + 1]! << 8);
  const c1 = src[o + 2]! | (src[o + 3]! << 8);
  const p0 = from565(c0);
  const p1 = from565(c1);
  const palette: Array<[number, number, number, number]> = [[...p0, 255], [...p1, 255]];
  if (c0 > c1 || !alpha) {
    if (c0 > c1) {
      palette.push([Math.round((2 * p0[0] + p1[0]) / 3), Math.round((2 * p0[1] + p1[1]) / 3), Math.round((2 * p0[2] + p1[2]) / 3), 255]);
      palette.push([Math.round((p0[0] + 2 * p1[0]) / 3), Math.round((p0[1] + 2 * p1[1]) / 3), Math.round((p0[2] + 2 * p1[2]) / 3), 255]);
    } else {
      palette.push([Math.round((p0[0] + p1[0]) / 2), Math.round((p0[1] + p1[1]) / 2), Math.round((p0[2] + p1[2]) / 2), 255]);
      palette.push([0, 0, 0, 255]);
    }
  } else {
    palette.push([Math.round((p0[0] + p1[0]) / 2), Math.round((p0[1] + p1[1]) / 2), Math.round((p0[2] + p1[2]) / 2), 255]);
    palette.push([0, 0, 0, 0]);
  }
  const bits = src[o + 4]! | (src[o + 5]! << 8) | (src[o + 6]! << 16) | (src[o + 7]! << 24);
  for (let i = 0; i < 16; i++) {
    const p = palette[(bits >>> (i * 2)) & 3]!;
    out.set(p, i * 4);
  }
}

/** Dekodiert einen 8-Byte-Einkanalblock (BC4, auch der Alphateil von BC3) in einen Kanal des 4x4-Blocks. */
function decodeBc4Block(src: Uint8Array, o: number, out: Uint8Array, channel: number): void {
  const a0 = src[o]!;
  const a1 = src[o + 1]!;
  const palette = [a0, a1];
  if (a0 > a1) {
    for (let k = 1; k <= 6; k++) palette.push(Math.round(((7 - k) * a0 + k * a1) / 7));
  } else {
    for (let k = 1; k <= 4; k++) palette.push(Math.round(((5 - k) * a0 + k * a1) / 5));
    palette.push(0, 255);
  }
  let bits = 0n;
  for (let i = 0; i < 6; i++) bits |= BigInt(src[o + 2 + i]!) << BigInt(i * 8);
  for (let i = 0; i < 16; i++) out[i * 4 + channel] = palette[Number((bits >> BigInt(i * 3)) & 7n)]!;
}

/**
 * Dekodiert ein blockkomprimiertes Bild ab `byteOffset` (Standard 0, also die erste Stufe einer Mip-Kette).
 * ATI1 ergibt ein Graubild, ATI2 (Normalenkarten) ergänzt die Blaukomponente aus Rot und Grün.
 */
export function decodeBlocks(data: Uint8Array, width: number, height: number, format: BlockFormat, byteOffset = 0): RgbaImage {
  const bw = Math.max(1, Math.ceil(width / 4));
  const bh = Math.max(1, Math.ceil(height / 4));
  const out = new Uint8Array(width * height * 4);
  const block = new Uint8Array(64);
  const blockBytes = BLOCK_BYTES[format];
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const o = byteOffset + (by * bw + bx) * blockBytes;
      block.fill(255);
      switch (format) {
        case 'DXT1':
          decodeBc1Block(data, o, block, true);
          break;
        case 'DXT3':
          decodeBc1Block(data, o + 8, block, false);
          for (let i = 0; i < 16; i++) {
            const nibble = (data[o + (i >> 1)]! >> ((i & 1) * 4)) & 15;
            block[i * 4 + 3] = nibble * 17;
          }
          break;
        case 'DXT5':
          decodeBc1Block(data, o + 8, block, false);
          decodeBc4Block(data, o, block, 3);
          break;
        case 'ATI1':
          decodeBc4Block(data, o, block, 0);
          for (let i = 0; i < 16; i++) {
            block[i * 4 + 1] = block[i * 4]!;
            block[i * 4 + 2] = block[i * 4]!;
          }
          break;
        case 'ATI2':
          decodeBc4Block(data, o, block, 0);
          decodeBc4Block(data, o + 8, block, 1);
          for (let i = 0; i < 16; i++) {
            const x = (block[i * 4]! / 255) * 2 - 1;
            const y = (block[i * 4 + 1]! / 255) * 2 - 1;
            block[i * 4 + 2] = Math.round(((Math.sqrt(Math.max(0, 1 - x * x - y * y)) + 1) / 2) * 255);
          }
          break;
      }
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const px = bx * 4 + x;
          const py = by * 4 + y;
          if (px < width && py < height) out.set(block.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 4), (py * width + px) * 4);
        }
      }
    }
  }
  return { width, height, data: out };
}
