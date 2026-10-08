import { describe, expect, it } from 'vitest';
import { estimateExport } from './estimate.ts';
import type { ModelData } from './model.ts';

function model(textureSize: number, alpha = 255): ModelData {
  const rgba = new Uint8Array(textureSize * textureSize * 4).fill(255);
  for (let p = 3; p < rgba.length; p += 4) rgba[p] = alpha;
  return {
    name: 'm',
    parts: [
      {
        name: 'p',
        positions: new Float32Array(9),
        normals: new Float32Array(9),
        uvs: new Float32Array(6),
        indices: new Uint32Array([0, 1, 2]),
        materialIndex: 0,
      },
    ],
    materials: [{ name: 'm', baseColor: [1, 1, 1, 1], textureIndex: 0 }],
    textures: [{ name: 't', width: textureSize, height: textureSize, rgba }],
  };
}

describe('estimateExport', () => {
  it('rechnet DXT1 mit einer vollständigen Mip-Kette', () => {
    const e = estimateExport(model(2048));
    expect(e.textures[0]).toMatchObject({ width: 2048, height: 2048, format: 'DXT1' });
    // 2048x2048 DXT1: 2 MiB Basisstufe, die Mip-Kette fügt ein Drittel hinzu (zusammen etwa 2,67 MiB)
    expect(e.textureBytes).toBeGreaterThan(2.6 * 1024 * 1024);
    expect(e.textureBytes).toBeLessThan(2.75 * 1024 * 1024);
  });

  it('unkomprimiert ist es etwa achtmal so groß', () => {
    const packed = estimateExport(model(1024), { compressTextures: true }).textureBytes;
    const raw = estimateExport(model(1024), { compressTextures: false }).textureBytes;
    expect(raw / packed).toBeGreaterThan(7.5);
    expect(raw / packed).toBeLessThan(8.5);
  });

  it('Transparenz erhöht den Bedarf (DXT5)', () => {
    const opaque = estimateExport(model(256));
    const alpha = estimateExport(model(256, 100));
    expect(alpha.textures[0]!.format).toBe('DXT5');
    expect(alpha.textureBytes).toBeCloseTo(opaque.textureBytes * 2, -2);
  });

  it('begrenzt die Texturgröße', () => {
    const e = estimateExport(model(2048), { maxTextureSize: 512 });
    expect(e.textures[0]).toMatchObject({ width: 512, height: 512 });
  });

  it('zählt Eckpunkte (36 Byte) und Indizes (2 Byte) für das Netz', () => {
    const e = estimateExport(model(16));
    expect(e.meshBytes).toBe(3 * 36 + 3 * 2);
    expect(e.totalBytes).toBe(e.textureBytes + e.meshBytes);
  });
});
