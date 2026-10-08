import { buildYtd, readYtd } from '@toolkit/rage-formats';
import type { YtdTexture } from '@toolkit/rage-formats';
import { describe, expect, it } from 'vitest';
import { addTextures } from './texture-add.ts';

const small = (name: string): YtdTexture => ({ name, width: 4, height: 4, levels: 1, format: 'A8R8G8B8', data: new Uint8Array(64).fill(7) });
const rgba = (w: number, h: number, alpha = 255) => {
  const data = new Uint8Array(w * h * 4).fill(255);
  for (let i = 3; i < data.length; i += 4) data[i] = alpha;
  return data;
};

describe('addTextures', () => {
  it('nimmt Texturen auf, rundet die Größe auf Zweierpotenzen und lässt die alten unverändert', () => {
    const out = addTextures(buildYtd([small('a')]), [{ name: 'part_1', width: 100, height: 60, rgba: rgba(100, 60) }]);
    const textures = readYtd(out.ytd);
    expect(textures.map((t) => t.name).sort()).toEqual(['a', 'part_1']);
    const added = textures.find((t) => t.name === 'part_1')!;
    expect(added).toMatchObject({ width: 128, height: 64, format: 'DXT1' });
    expect(added.levels).toBeGreaterThan(1);
    expect(Array.from(textures.find((t) => t.name === 'a')!.data)).toEqual(Array.from(small('a').data));
  });

  it('nimmt DXT5, wenn Pixel durchsichtig sind', () => {
    const out = addTextures(buildYtd([small('a')]), [{ name: 'glass', width: 8, height: 8, rgba: rgba(8, 8, 100) }]);
    expect(readYtd(out.ytd).find((t) => t.name === 'glass')!.format).toBe('DXT5');
  });

  it('begrenzt die Größe und ersetzt eine gleichnamige Textur', () => {
    const out = addTextures(buildYtd([small('a'), small('b')]), [{ name: 'B', width: 512, height: 512, rgba: rgba(512, 512) }], { maxSize: 64 });
    const textures = readYtd(out.ytd);
    expect(textures).toHaveLength(2);
    expect(textures.find((t) => t.name === 'b')).toMatchObject({ width: 64, height: 64 });
  });

  it('ohne Texturen bleibt die Datei dieselbe', () => {
    const ytd = buildYtd([small('a')]);
    expect(addTextures(ytd, []).ytd).toBe(ytd);
  });
});
