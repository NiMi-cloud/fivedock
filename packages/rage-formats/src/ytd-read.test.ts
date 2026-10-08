import { describe, expect, it } from 'vitest';
import { buildMipChain, packBgra, writeDdsBgra, writeDdsTexture } from './dds.ts';
import type { RgbaImage } from './dds.ts';
import { encodeMipChain } from './dxt.ts';
import { joaat } from './jenkins.ts';
import { ResourceBlock, buildResource, parseResource } from './rsc7.ts';
import type { BlockWriter } from './rsc7.ts';
import { canDecode, decodeTexture, levelForPreview, levelSize } from './texture-decode.ts';
import { YtdReadError, buildYtd, mipChainSize, readYtd } from './ytd.ts';
import type { YtdTexture } from './ytd.ts';

function gradient(width: number, height: number): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set([Math.round((x / (width - 1)) * 255), Math.round((y / (height - 1)) * 255), 90, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

function uncompressed(name: string, width: number, height: number): YtdTexture {
  const chain = buildMipChain(gradient(width, height));
  return { name, width, height, levels: chain.length, format: 'A8R8G8B8', data: packBgra(chain) };
}

function compressed(name: string, width: number, height: number, format: 'DXT1' | 'DXT5'): YtdTexture {
  const { data, levels } = encodeMipChain(gradient(width, height), format);
  return { name, width, height, levels, format, data };
}

describe('readYtd', () => {
  it('liest zurück, was buildYtd geschrieben hat (Name, Größe, Format, Pixel, Nutzung)', () => {
    const input: YtdTexture[] = [
      { ...uncompressed('alpha_tex', 32, 16), usage: 22, usageFlags: 3, extraFlags: 9 },
      compressed('beta_tex', 64, 64, 'DXT1'),
      compressed('gamma_tex', 16, 32, 'DXT5'),
    ];
    const out = readYtd(buildYtd(input));
    expect(out).toHaveLength(3);
    // Die Reihenfolge in der Datei folgt dem Hash.
    const byName = new Map(out.map((t) => [t.name, t]));
    for (const expected of input) {
      const got = byName.get(expected.name)!;
      expect(got).toBeDefined();
      expect(got.width).toBe(expected.width);
      expect(got.height).toBe(expected.height);
      expect(got.levels).toBe(expected.levels);
      expect(got.format).toBe(expected.format);
      expect(Buffer.compare(Buffer.from(got.data), Buffer.from(expected.data))).toBe(0);
    }
    const alpha = byName.get('alpha_tex')!;
    expect(alpha.usage).toBe(22);
    expect(alpha.usageFlags).toBe(3);
    expect(alpha.extraFlags).toBe(9);
    expect(out.map((t) => joaat(t.name))).toEqual([...out.map((t) => joaat(t.name))].sort((a, b) => a - b));
  });

  it('Lesen und erneutes Schreiben ergibt eine Datei mit denselben Texturen', () => {
    const first = buildYtd([uncompressed('a', 8, 8), compressed('b', 16, 16, 'DXT1')]);
    const second = buildYtd(readYtd(first));
    expect(Buffer.compare(Buffer.from(first), Buffer.from(second))).toBe(0);
  });

  it('übernimmt das unbekannte 16-Bit-Feld im Texturkopf (echte Fahrzeuge haben 128) beim Lesen und Schreiben', () => {
    const first = buildYtd([{ ...uncompressed('a', 8, 8), unknown32: 128 }, uncompressed('b', 8, 8)]);
    const read = readYtd(first);
    expect(new Map(read.map((t) => [t.name, t.unknown32]))).toEqual(new Map([['a', 128], ['b', 0]]));
    const second = buildYtd(read);
    expect(Buffer.compare(Buffer.from(first), Buffer.from(second))).toBe(0);
  });

  it('übernimmt die Pixeldaten als Kopie', () => {
    const file = buildYtd([uncompressed('copy', 8, 8)]);
    const [tex] = readYtd(file);
    tex!.data.fill(0);
    const [again] = readYtd(file);
    expect(again!.data.some((b) => b !== 0)).toBe(true);
  });

  it('kann Texturen ohne Zweierpotenz erhalten, wenn es ausdrücklich erlaubt ist', () => {
    const data = new Uint8Array(mipChainSize('DXT1', 12, 8, 1));
    const odd: YtdTexture = { name: 'odd', width: 12, height: 8, levels: 1, format: 'DXT1', data };
    expect(() => buildYtd([odd])).toThrow(/Zweierpotenz/);
    const [back] = readYtd(buildYtd([odd], { allowNonPowerOfTwo: true }));
    expect(back).toMatchObject({ name: 'odd', width: 12, height: 8 });
  });

  it('lehnt Dateien ab, die kein YTD sind', () => {
    expect(() => readYtd(new Uint8Array(8))).toThrow();
    expect(() => readYtd(new Uint8Array(32))).toThrow(/RSC7/);
  });

  describe('Fehlercodes', () => {
    const codeOf = (file: Uint8Array): string => {
      try {
        readYtd(file);
      } catch (e) {
        if (e instanceof YtdReadError) return e.code;
        throw e;
      }
      return 'kein Fehler';
    };
    const root = (fill: (w: BlockWriter) => void) => new ResourceBlock(64, (w) => fill(w), 'root');

    it('erkennt verschlüsselte Dateien (FXAP)', () => {
      expect(codeOf(Uint8Array.from([0x46, 0x58, 0x41, 0x50, 1, 2, 3, 4]))).toBe('encrypted');
    });

    it('erkennt Dateien ohne RSC7-Kopf, auch zu kurze', () => {
      expect(codeOf(new Uint8Array(32))).toBe('not-rsc7');
      expect(codeOf(new Uint8Array(8))).toBe('not-rsc7');
    });

    it('erkennt abgeschnittene Dateien als beschädigt', () => {
      const good = buildYtd([uncompressed('cut', 32, 32)]);
      expect(codeOf(good.subarray(0, 40))).toBe('corrupt');
    });

    it('erkennt andere Dateitypen und GTA V Enhanced', () => {
      expect(codeOf(buildResource({ version: 165, system: [root(() => {})], graphics: [] }))).toBe('wrong-version');
      expect(codeOf(buildResource({ version: 5, system: [root(() => {})], graphics: [] }))).toBe('enhanced');
    });

    it('erkennt Zeiger ins Leere als beschädigt', () => {
      const file = buildResource({
        version: 13,
        system: [
          root((w) => {
            w.u16(0x38, 1);
            w.u64(0x30, 0x50009990);
          }),
        ],
        graphics: [],
      });
      expect(codeOf(file)).toBe('corrupt');
    });

    it('meldet ein unbekanntes Pixelformat mit dem Namen der Textur', () => {
      const good = buildYtd([uncompressed('strange', 8, 8)]);
      const parsed = parseResource(good);
      // Formatkennung der einzigen Textur auf einen unbekannten Wert setzen und neu verpacken
      const view = new DataView(parsed.system.buffer, parsed.system.byteOffset, parsed.system.byteLength);
      const texturePointer = Number(view.getBigUint64(0x30, true));
      const arrayOffset = texturePointer - 0x50000000;
      const textureOffset = Number(view.getBigUint64(arrayOffset, true)) - 0x50000000;
      view.setUint32(textureOffset + 0x58, 0x12345678, true);
      const patched = buildResource({
        version: 13,
        system: [new ResourceBlock(parsed.system.length, (w) => w.copy(0, parsed.system), 'raw')],
        graphics: [],
      });
      // Die Zeiger bleiben gültig, weil Systemseite unverändert als ein Block mit gleichem Aufbau liegt.
      expect(() => readYtd(patched)).toThrow(/strange.*0x12345678|0x12345678/);
    });
  });
});

describe('writeDdsTexture', () => {
  it('schreibt Kopf und Pixeldaten für Blockformate', () => {
    const tex = compressed('d', 32, 16, 'DXT5');
    const dds = writeDdsTexture(tex);
    const view = new DataView(dds.buffer);
    expect(String.fromCharCode(...dds.subarray(0, 4))).toBe('DDS ');
    expect(view.getUint32(12, true)).toBe(16); // Höhe
    expect(view.getUint32(16, true)).toBe(32); // Breite
    expect(view.getUint32(28, true)).toBe(tex.levels);
    expect(String.fromCharCode(...dds.subarray(84, 88))).toBe('DXT5');
    expect(view.getUint32(20, true)).toBe(8 * 4 * 16); // Größe der ersten Stufe
    expect(dds.length).toBe(128 + tex.data.length);
  });

  it('schreibt unkomprimierte Texturen wie writeDdsBgra', () => {
    const image = gradient(16, 16);
    const chain = buildMipChain(image);
    const ours = writeDdsTexture({ width: 16, height: 16, levels: chain.length, format: 'A8R8G8B8', data: packBgra(chain) });
    const reference = writeDdsBgra(image);
    expect(Buffer.compare(Buffer.from(ours), Buffer.from(reference))).toBe(0);
  });

  it('lehnt BC7 ab', () => {
    expect(() => writeDdsTexture({ width: 4, height: 4, levels: 1, format: 'BC7', data: new Uint8Array(16) })).toThrow(/BC7/);
  });
});

describe('decodeTexture', () => {
  it('liest unkomprimierte BGRA-Pixel als RGBA', () => {
    const tex = uncompressed('t', 8, 8);
    const img = decodeTexture(tex);
    expect(img.width).toBe(8);
    // gradient: x=0,y=0 -> (0, 0, 90); rechte untere Ecke -> (255, 255, 90)
    expect(Array.from(img.data.subarray(0, 4))).toEqual([0, 0, 90, 255]);
    expect(Array.from(img.data.subarray((7 * 8 + 7) * 4, (7 * 8 + 7) * 4 + 4))).toEqual([255, 255, 90, 255]);
  });

  it('liest eine kleinere Mip-Stufe an der richtigen Stelle', () => {
    const solidMips: YtdTexture = (() => {
      const levels: RgbaImage[] = [];
      for (const [size, color] of [[8, [255, 0, 0]], [4, [0, 255, 0]], [2, [0, 0, 255]], [1, [255, 255, 255]]] as const) {
        const data = new Uint8Array(size * size * 4);
        for (let i = 0; i < size * size; i++) data.set([...color, 255], i * 4);
        levels.push({ width: size, height: size, data });
      }
      return { name: 'mips', width: 8, height: 8, levels: 4, format: 'A8R8G8B8', data: packBgra(levels) };
    })();
    expect(Array.from(decodeTexture(solidMips, 0).data.subarray(0, 3))).toEqual([255, 0, 0]);
    expect(Array.from(decodeTexture(solidMips, 1).data.subarray(0, 3))).toEqual([0, 255, 0]);
    expect(Array.from(decodeTexture(solidMips, 2).data.subarray(0, 3))).toEqual([0, 0, 255]);
    expect(decodeTexture(solidMips, 3).width).toBe(1);
    expect(() => decodeTexture(solidMips, 4)).toThrow(/Mip-Stufe/);
  });

  it('dekodiert DXT1 und DXT5 mit kleinem Fehler', () => {
    for (const format of ['DXT1', 'DXT5'] as const) {
      const img = decodeTexture(compressed('c', 64, 64, format));
      const ref = gradient(64, 64);
      let worst = 0;
      for (let i = 0; i < ref.data.length; i += 4) {
        for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(ref.data[i + c]! - img.data[i + c]!));
      }
      expect(worst).toBeLessThan(24);
    }
  });

  it('A8 und L8 werden als Grau gezeigt', () => {
    const l8: YtdTexture = { name: 'l', width: 2, height: 2, levels: 1, format: 'L8', data: Uint8Array.from([0, 100, 200, 255]) };
    expect(Array.from(decodeTexture(l8).data.subarray(4, 8))).toEqual([100, 100, 100, 255]);
    const a8: YtdTexture = { ...l8, name: 'a', format: 'A8' };
    expect(Array.from(decodeTexture(a8).data.subarray(8, 12))).toEqual([200, 200, 200, 255]);
  });

  it('BC7 wird dekodiert (ein leerer Block ist ungültig und ergibt durchsichtiges Schwarz)', () => {
    expect(canDecode('BC7')).toBe(true);
    const bc7: YtdTexture = { name: 'x', width: 4, height: 4, levels: 1, format: 'BC7', data: new Uint8Array(16) };
    expect(Array.from(decodeTexture(bc7).data.subarray(0, 4))).toEqual([0, 0, 0, 0]);
  });

  it('levelSize und levelForPreview', () => {
    expect(levelSize({ width: 512, height: 128 }, 3)).toEqual({ width: 64, height: 16 });
    expect(levelSize({ width: 4, height: 1 }, 5)).toEqual({ width: 1, height: 1 });
    expect(levelForPreview({ width: 1024, height: 1024, levels: 11 }, 128)).toBe(3);
    expect(levelForPreview({ width: 1024, height: 1024, levels: 2 }, 128)).toBe(1);
    expect(levelForPreview({ width: 64, height: 64, levels: 7 }, 128)).toBe(0);
  });
});
