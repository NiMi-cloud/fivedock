import { mipChainSize } from '@toolkit/rage-formats';
import type { TextureFormat } from '@toolkit/rage-formats';
import { modelStats } from './model.ts';
import type { ModelData } from './model.ts';
import { nearestPowerOfTwo } from './texture.ts';

export interface TextureEstimate {
  name: string;
  width: number;
  height: number;
  format: TextureFormat;
  bytes: number;
}

export interface ExportEstimate {
  textures: TextureEstimate[];
  textureBytes: number;
  meshBytes: number;
  totalBytes: number;
}

function hasTransparency(rgba: Uint8Array): boolean {
  for (let p = 3; p < rgba.length; p += 4) if (rgba[p]! < 250) return true;
  return false;
}

/**
 * Schätzt, wie viel Speicher die Resource im Spiel braucht, ohne sie zu bauen.
 * Texturen dominieren fast immer: Eine unkomprimierte 2048er-Textur belegt über 20 MB, mit DXT1 etwa 2,7 MB.
 */
export function estimateExport(
  model: ModelData,
  options: { maxTextureSize?: number; compressTextures?: boolean } = {},
): ExportEstimate {
  const max = options.maxTextureSize ?? 2048;
  const compress = options.compressTextures ?? true;

  const textures: TextureEstimate[] = model.textures.map((t, i) => {
    const width = nearestPowerOfTwo(t.width, 4, max);
    const height = nearestPowerOfTwo(t.height, 4, max);
    const levels = Math.floor(Math.log2(Math.max(width, height))) + 1;
    const format: TextureFormat = compress && width >= 8 && height >= 8 ? (hasTransparency(t.rgba) ? 'DXT5' : 'DXT1') : 'A8R8G8B8';
    return { name: t.name || `texture_${i}`, width, height, format, bytes: mipChainSize(format, width, height, levels) };
  });

  const textureBytes = textures.reduce((s, t) => s + t.bytes, 0);
  const stats = modelStats(model);
  const meshBytes = stats.vertices * 36 + stats.triangles * 3 * 2;
  return { textures, textureBytes, meshBytes, totalBytes: textureBytes + meshBytes };
}
