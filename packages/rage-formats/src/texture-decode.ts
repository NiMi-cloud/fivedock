/**
 * Pixel einer YTD-Textur in ein RGBA-Bild verwandeln (für Vorschau, Neu-Kodierung und Tests).
 */

import { decodeBc7 } from './bc7.ts';
import type { RgbaImage } from './dds.ts';
import { decodeBlocks } from './dxt.ts';
import type { BlockFormat } from './dxt.ts';
import { mipChainSize } from './ytd.ts';
import type { TextureFormat, YtdTexture } from './ytd.ts';

const BLOCK_FORMATS: ReadonlySet<TextureFormat> = new Set(['DXT1', 'DXT3', 'DXT5', 'ATI1', 'ATI2']);

/** Formate, die `decodeTexture` lesen kann (alle, die wir kennen). Neu kodieren können wir BC7 nicht, siehe `canRebuildMips`. */
export function canDecode(_format: TextureFormat): boolean {
  return true;
}

/** Breite einer Mip-Stufe. */
export function levelSize(texture: Pick<YtdTexture, 'width' | 'height'>, level: number): { width: number; height: number } {
  return { width: Math.max(1, texture.width >> level), height: Math.max(1, texture.height >> level) };
}

/**
 * Dekodiert eine Mip-Stufe (Standard 0 = volle Größe) als RGBA.
 * A8 und L8 werden als Grauwerte dargestellt, ATI1 als Grau, ATI2 ergänzt Blau als Normalenkomponente.
 */
export function decodeTexture(texture: YtdTexture, level = 0): RgbaImage {
  if (!Number.isInteger(level) || level < 0 || level >= texture.levels) {
    throw new Error(`Textur ${texture.name}: Mip-Stufe ${level} gibt es nicht (0 bis ${texture.levels - 1}).`);
  }
  if (!canDecode(texture.format)) {
    throw new Error(`Textur ${texture.name}: ${texture.format} kann noch nicht dekodiert werden.`);
  }
  const { width, height } = levelSize(texture, level);
  const offset = mipChainSize(texture.format, texture.width, texture.height, level);

  if (texture.format === 'BC7') return decodeBc7(texture.data, width, height, offset);

  if (BLOCK_FORMATS.has(texture.format)) {
    return decodeBlocks(texture.data, width, height, texture.format as BlockFormat, offset);
  }

  const out = new Uint8Array(width * height * 4);
  const src = texture.data;
  for (let i = 0; i < width * height; i++) {
    switch (texture.format) {
      case 'A8R8G8B8': {
        const p = offset + i * 4;
        out[i * 4] = src[p + 2]!;
        out[i * 4 + 1] = src[p + 1]!;
        out[i * 4 + 2] = src[p]!;
        out[i * 4 + 3] = src[p + 3]!;
        break;
      }
      case 'A8': {
        const a = src[offset + i]!;
        out.set([a, a, a, 255], i * 4);
        break;
      }
      default: {
        // L8
        const l = src[offset + i]!;
        out.set([l, l, l, 255], i * 4);
      }
    }
  }
  return { width, height, data: out };
}

/**
 * Kleinste Mip-Stufe, die mindestens `target` Pixel an der längeren Kante hat. Gut für Vorschaubilder,
 * weil so nicht die volle Auflösung dekodiert werden muss.
 */
export function levelForPreview(texture: Pick<YtdTexture, 'width' | 'height' | 'levels'>, target: number): number {
  let level = 0;
  while (level + 1 < texture.levels && Math.max(texture.width, texture.height) >> (level + 1) >= target) level++;
  return level;
}
