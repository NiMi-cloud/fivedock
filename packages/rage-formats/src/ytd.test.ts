import { describe, expect, it } from 'vitest';
import { buildMipChain, packBgra } from './dds.ts';
import { joaat } from './jenkins.ts';
import { GRAPHICS_BASE, SYSTEM_BASE, parseResource } from './rsc7.ts';
import { TEXTURE_FORMAT_ID, buildYtd, mipChainSize, mipSize, rowStride } from './ytd.ts';
import type { YtdTexture } from './ytd.ts';

function checker(name: string, size: number): YtdTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const on = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
      const i = (y * size + x) * 4;
      data[i] = on ? 217 : 38;
      data[i + 1] = on ? 130 : 23;
      data[i + 2] = 51;
      data[i + 3] = 255;
    }
  }
  const chain = buildMipChain({ width: size, height: size, data });
  return { name, width: size, height: size, levels: chain.length, format: 'A8R8G8B8', data: packBgra(chain) };
}

/** Liest ein Texture-Objekt aus dem YTD zurück (Gegenstück zum Schreiber, nur für Tests). */
function readTextures(file: Uint8Array) {
  const parsed = parseResource(file);
  const sys = new DataView(parsed.system.buffer, parsed.system.byteOffset, parsed.system.byteLength);
  const gfx = new Uint8Array(parsed.graphics.buffer, parsed.graphics.byteOffset, parsed.graphics.byteLength);
  const sysOff = (addr: number) => addr - SYSTEM_BASE;
  const ptr = (off: number) => sys.getUint32(off, true); // niedrige 32 Bit reichen für unsere Adressen

  const count = sys.getUint16(0x28, true);
  const hashes = Array.from({ length: count }, (_, i) => sys.getUint32(sysOff(ptr(0x20)) + i * 4, true));
  const textures = Array.from({ length: count }, (_, i) => {
    const t = sysOff(ptr(sysOff(ptr(0x30)) + i * 8));
    let name = '';
    for (let o = sysOff(ptr(t + 0x28)); parsed.system[o] !== 0; o++) name += String.fromCharCode(parsed.system[o]!);
    const dataAddr = ptr(t + 0x70);
    return {
      name,
      usageData: sys.getUint32(t + 0x40, true),
      width: sys.getUint16(t + 0x50, true),
      height: sys.getUint16(t + 0x52, true),
      depth: sys.getUint16(t + 0x54, true),
      stride: sys.getUint16(t + 0x56, true),
      format: sys.getUint32(t + 0x58, true),
      levels: sys.getUint8(t + 0x5d),
      dataOffset: dataAddr - GRAPHICS_BASE,
    };
  });
  return { parsed, sys, gfx, hashes, textures, count };
}

describe('Größenberechnung', () => {
  it('A8R8G8B8: 4 Byte je Pixel', () => {
    expect(rowStride('A8R8G8B8', 64)).toBe(256);
    expect(mipSize('A8R8G8B8', 64, 64)).toBe(16384);
    // Die Kette des Referenz-YTD (64x64, 7 Stufen) ist 21.844 Byte groß.
    expect(mipChainSize('A8R8G8B8', 64, 64, 7)).toBe(21844);
  });

  it('Blockformate rechnen in 4x4-Blöcken, mindestens ein Block', () => {
    expect(mipSize('DXT1', 64, 64)).toBe(16 * 16 * 8);
    expect(mipSize('DXT5', 64, 64)).toBe(16 * 16 * 16);
    expect(mipSize('DXT1', 2, 2)).toBe(8);
    expect(mipSize('DXT1', 1, 1)).toBe(8);
    expect(rowStride('DXT1', 64)).toBe(128);
  });
});

describe('buildYtd', () => {
  it('schreibt die Werte, die auch das Referenz-YTD (CodeWalker) enthält', () => {
    const file = buildYtd([checker('forge_cube_diffuse', 64)]);
    const { parsed, sys, hashes, textures, count } = readTextures(file);

    expect(parsed.version).toBe(13);
    expect(sys.getUint32(0x04, true)).toBe(1);
    expect(sys.getUint32(0x18, true)).toBe(1);
    expect(count).toBe(1);
    expect(hashes).toEqual([0xc8b7adb7]);

    const t = textures[0]!;
    expect(t.name).toBe('forge_cube_diffuse');
    expect(t.usageData).toBe(0x34); // DIFFUSE (20) + NOT_HALF << 5
    expect(t.width).toBe(64);
    expect(t.height).toBe(64);
    expect(t.depth).toBe(1);
    expect(t.stride).toBe(256);
    expect(t.format).toBe(TEXTURE_FORMAT_ID.A8R8G8B8);
    expect(t.levels).toBe(7);
  });

  it('legt die Pixeldaten unverändert in den Grafikspeicher', () => {
    const tex = checker('crate', 32);
    const { gfx, textures } = readTextures(buildYtd([tex]));
    const stored = gfx.subarray(textures[0]!.dataOffset, textures[0]!.dataOffset + tex.data.length);
    expect([...stored]).toEqual([...tex.data]);
  });

  it('sortiert Texturen nach Namens-Hash aufsteigend und hält Zeiger in derselben Reihenfolge', () => {
    const names = ['zeta', 'alpha', 'mid_texture', 'b'];
    const { hashes, textures } = readTextures(buildYtd(names.map((n) => checker(n, 8))));

    const sorted = [...hashes].sort((a, b) => a - b);
    expect(hashes).toEqual(sorted);
    textures.forEach((t, i) => expect(joaat(t.name)).toBe(hashes[i]));
    expect(textures.map((t) => t.name).sort()).toEqual([...names].sort());
  });

  it('gibt jeder Textur einen eigenen, nicht überlappenden Datenblock', () => {
    const a = checker('a_tex', 16);
    const b = checker('b_tex', 16);
    const { gfx, textures } = readTextures(buildYtd([a, b]));
    for (const t of textures) {
      const src = t.name === 'a_tex' ? a : b;
      expect([...gfx.subarray(t.dataOffset, t.dataOffset + src.data.length)]).toEqual([...src.data]);
    }
    const [t0, t1] = textures.slice().sort((x, y) => x.dataOffset - y.dataOffset) as [(typeof textures)[0], (typeof textures)[0]];
    expect(t1.dataOffset).toBeGreaterThanOrEqual(t0.dataOffset + a.data.length);
  });

  it('kommt mit größeren Texturen zurecht (Seitengröße wächst mit)', () => {
    const file = buildYtd([checker('big', 512)]);
    const { parsed, textures } = readTextures(file);
    expect(textures[0]!.width).toBe(512);
    expect(parsed.graphics.length).toBeGreaterThanOrEqual(mipChainSize('A8R8G8B8', 512, 512, 10));
  });

  it('lehnt Fehler in den Eingaben ab', () => {
    expect(() => buildYtd([])).toThrow(/mindestens eine Textur/);
    expect(() => buildYtd([{ ...checker('x', 8), name: 'mit leerzeichen' }])).toThrow(/Texturname/);
    expect(() => buildYtd([{ ...checker('x', 8), data: new Uint8Array(10) }])).toThrow(/Pixeldaten/);
    expect(() => buildYtd([{ ...checker('x', 8), levels: 9 }])).toThrow(/Mip-Stufen/);
    expect(() => buildYtd([checker('same', 8), checker('same', 8)])).toThrow(/kollidieren/);
    expect(() => buildYtd([{ ...checker('x', 8), width: 6 }])).toThrow(/Zweierpotenz/);
  });
});
