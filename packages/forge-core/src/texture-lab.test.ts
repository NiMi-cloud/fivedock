import { describe, expect, it } from 'vitest';
import {
  buildMipChain,
  buildYtd,
  decodeTexture,
  encodeBlocks,
  encodeMipChain,
  mipChainSize,
  packBgra,
  readDds,
  readYtd,
  writeDdsTexture,
} from '@toolkit/rage-formats';
import type { BlockFormat, RgbaImage, TextureFormat, YtdTexture } from '@toolkit/rage-formats';
import { completeMips, optimizePack, optimizeTexture, retexture, retextureFromDds } from './texture-lab.ts';
import { readZip, writeZip } from './zip.ts';

function image(width: number, height: number, alpha = 255): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set([Math.round((x * 255) / Math.max(1, width - 1)), Math.round((y * 255) / Math.max(1, height - 1)), 80, alpha], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

function block(name: string, size: number, format: BlockFormat, extra: Partial<YtdTexture> = {}): YtdTexture {
  const { levels, data } = encodeMipChain(image(size, size), format);
  return { name, width: size, height: size, levels, format, data, ...extra };
}

function bgra(name: string, size: number, alpha = 255, extra: Partial<YtdTexture> = {}): YtdTexture {
  const chain = buildMipChain(image(size, size, alpha));
  return { name, width: size, height: size, levels: chain.length, format: 'A8R8G8B8', data: packBgra(chain), ...extra };
}

describe('optimizeTexture: Verkleinern', () => {
  it('lässt kleine Texturen unverändert (dasselbe Objekt)', () => {
    const t = block('small', 64, 'DXT1');
    const r = optimizeTexture(t, { maxSize: 64 });
    expect(r.action).toBe('unchanged');
    expect(r.texture).toBe(t);
  });

  it('lässt die obersten Mip-Stufen weg, ohne neu zu kodieren', () => {
    const t = block('big', 256, 'DXT5');
    const r = optimizeTexture(t, { maxSize: 64 });
    expect(r.action).toBe('resized');
    expect(r.texture).toMatchObject({ width: 64, height: 64, levels: t.levels - 2, format: 'DXT5', name: 'big' });
    // Genau die Stufe 2 der Quelle, Byte für Byte.
    const expected = t.data.subarray(mipChainSize('DXT5', 256, 256, 2));
    expect(Buffer.compare(Buffer.from(r.texture.data), Buffer.from(expected))).toBe(0);
    expect(r.texture.data.length).toBe(mipChainSize('DXT5', 64, 64, r.texture.levels));
    // und die Pixel stimmen mit der Stufe 2 der Quelle überein
    expect(Array.from(decodeTexture(r.texture, 0).data)).toEqual(Array.from(decodeTexture(t, 2).data));
  });

  it('erhält Verwendungszweck und Flags', () => {
    const t = block('flags', 128, 'DXT1', { usage: 22, usageFlags: 5, extraFlags: 7 });
    const r = optimizeTexture(t, { maxSize: 32 });
    expect(r.texture).toMatchObject({ usage: 22, usageFlags: 5, extraFlags: 7 });
  });

  it('halbiert nicht quadratische Texturen entlang der längeren Kante', () => {
    const chain = encodeMipChain(image(256, 64), 'DXT1');
    const t: YtdTexture = { name: 'wide', width: 256, height: 64, levels: chain.levels, format: 'DXT1', data: chain.data };
    const r = optimizeTexture(t, { maxSize: 64 });
    expect(r.texture).toMatchObject({ width: 64, height: 16 });
    expect(r.texture.data.length).toBe(mipChainSize('DXT1', 64, 16, r.texture.levels));
  });

  it('berechnet fehlende Mip-Stufen neu, wenn die Textur nur eine Stufe hat', () => {
    const src = image(128, 128);
    const t: YtdTexture = { name: 'flat', width: 128, height: 128, levels: 1, format: 'DXT1', data: encodeBlocks(src, 'DXT1') };
    const r = optimizeTexture(t, { maxSize: 32 });
    expect(r.action).toBe('resized');
    expect(r.texture).toMatchObject({ width: 32, height: 32, format: 'DXT1' });
    expect(r.texture.levels).toBe(6); // 32 -> 1
    expect(r.texture.data.length).toBe(mipChainSize('DXT1', 32, 32, 6));
  });

  it('lässt BC7 ohne Mip-Stufen unberührt und meldet das', () => {
    const t: YtdTexture = { name: 'b', width: 64, height: 64, levels: 1, format: 'BC7', data: new Uint8Array(mipChainSize('BC7', 64, 64, 1)) };
    const r = optimizeTexture(t, { maxSize: 16 });
    expect(r).toMatchObject({ action: 'unchanged', note: 'cannot-shrink' });
    expect(r.texture).toBe(t);
  });

  it('verkleinert BC7 mit Mip-Stufen durch Weglassen der oberen', () => {
    const levels = 7;
    const t: YtdTexture = { name: 'b7', width: 64, height: 64, levels, format: 'BC7', data: new Uint8Array(mipChainSize('BC7', 64, 64, levels)).fill(7) };
    const r = optimizeTexture(t, { maxSize: 16 });
    expect(r.action).toBe('resized');
    expect(r.texture).toMatchObject({ width: 16, height: 16, levels: 5, format: 'BC7' });
  });

  it('fasst Texturen ohne Zweierpotenz nicht an', () => {
    const t: YtdTexture = { name: 'odd', width: 96, height: 96, levels: 1, format: 'DXT1', data: new Uint8Array(mipChainSize('DXT1', 96, 96, 1)) };
    expect(optimizeTexture(t, { maxSize: 32 })).toMatchObject({ action: 'unchanged', note: 'not-power-of-two' });
  });

  it('rundet ein ungültiges Limit auf eine Zweierpotenz ab', () => {
    const t = block('lim', 256, 'DXT1');
    expect(optimizeTexture(t, { maxSize: 100 }).texture.width).toBe(64);
  });
});

describe('optimizeTexture: Umkomprimieren', () => {
  const formatOf = (r: { texture: { format: TextureFormat } }) => r.texture.format;

  it('wandelt undurchsichtiges A8R8G8B8 in DXT1 um', () => {
    const t = bgra('rgb', 64);
    const r = optimizeTexture(t, { maxSize: 64, compressUncompressed: true });
    expect(r.action).toBe('recompressed');
    expect(formatOf(r)).toBe('DXT1');
    expect(r.texture.data.length).toBeLessThan(t.data.length / 7);
  });

  it('wählt DXT5, wenn Transparenz vorkommt', () => {
    const r = optimizeTexture(bgra('a', 64, 100), { maxSize: 64, compressUncompressed: true });
    expect(formatOf(r)).toBe('DXT5');
  });

  it('verkleinert und komprimiert in einem Schritt', () => {
    const r = optimizeTexture(bgra('both', 128), { maxSize: 32, compressUncompressed: true });
    expect(r.action).toBe('resized-recompressed');
    expect(r.texture).toMatchObject({ width: 32, height: 32, format: 'DXT1' });
  });

  it('komprimiert unkomprimierte Texturen nur auf Wunsch', () => {
    const t = bgra('off', 64);
    expect(optimizeTexture(t, { maxSize: 64 }).texture).toBe(t);
  });

  it('lässt Normalenkarten unkomprimiert, verkleinert sie aber', () => {
    const normal = bgra('nrm', 64, 255, { usage: 22 });
    expect(optimizeTexture(normal, { maxSize: 64, compressUncompressed: true })).toMatchObject({ action: 'unchanged', note: 'normal-map-kept' });
    const shrunk = optimizeTexture(bgra('nrm2', 128, 255, { usage: 22 }), { maxSize: 64, compressUncompressed: true });
    expect(shrunk.action).toBe('resized');
    expect(shrunk.texture).toMatchObject({ width: 64, format: 'A8R8G8B8' });
  });

  it('komprimiert sehr kleine Texturen nicht', () => {
    expect(optimizeTexture(bgra('tiny', 4), { maxSize: 64, compressUncompressed: true })).toMatchObject({ action: 'unchanged', note: 'too-small-to-compress' });
  });
});

describe('retexture', () => {
  it('übernimmt Größe, Format, Namen und Verwendungszweck der alten Textur', () => {
    const original = block('car_body', 64, 'DXT5', { usage: 20, usageFlags: 1, extraFlags: 3 });
    const r = retexture(original, image(256, 256));
    expect(r.notes).toEqual([]);
    expect(r.texture).toMatchObject({ name: 'car_body', width: 64, height: 64, format: 'DXT5', usage: 20, usageFlags: 1, extraFlags: 3 });
    expect(r.texture.levels).toBe(7);
    expect(r.texture.data.length).toBe(mipChainSize('DXT5', 64, 64, 7));
  });

  it('ersetzt das Bild tatsächlich', () => {
    const original = block('t', 32, 'DXT1');
    const red: RgbaImage = { width: 32, height: 32, data: new Uint8Array(32 * 32 * 4) };
    for (let i = 0; i < 32 * 32; i++) red.data.set([200, 20, 20, 255], i * 4);
    const out = decodeTexture(retexture(original, red).texture);
    expect(Math.abs(out.data[0]! - 200)).toBeLessThan(10);
    expect(Math.abs(out.data[1]! - 20)).toBeLessThan(10);
  });

  it('stellt DXT1 auf DXT5 um, wenn das neue Bild Transparenz hat', () => {
    const r = retexture(block('t', 32, 'DXT1'), image(32, 32, 100));
    expect(r.texture.format).toBe('DXT5');
    expect(r.notes).toContain('alpha-needs-dxt5');
  });

  it('behält A8R8G8B8 bei', () => {
    const r = retexture(bgra('t', 16), image(16, 16));
    expect(r.texture.format).toBe('A8R8G8B8');
  });

  it('ersetzt BC7 durch DXT und meldet es', () => {
    const bc7: YtdTexture = { name: 'b', width: 16, height: 16, levels: 1, format: 'BC7', data: new Uint8Array(mipChainSize('BC7', 16, 16, 1)) };
    const r = retexture(bc7, image(16, 16));
    expect(r.texture.format).toBe('DXT1');
    expect(r.notes).toContain('bc7-replaced');
  });

  it('meldet ein abweichendes Seitenverhältnis', () => {
    const r = retexture(block('t', 64, 'DXT1'), image(128, 32));
    expect(r.notes).toContain('aspect-stretched');
    expect(r.texture).toMatchObject({ width: 64, height: 64 });
  });

  it('size "fit" nimmt die Größe des neuen Bildes (Zweierpotenz, begrenzt)', () => {
    const r = retexture(block('t', 64, 'DXT1'), image(256, 128), { size: 'fit' });
    expect(r.texture).toMatchObject({ width: 256, height: 128 });
    const capped = retexture(block('t', 64, 'DXT1'), image(256, 256), { size: 'fit', maxSize: 128 });
    expect(capped.texture.width).toBe(128);
  });

  it('Zielformat lässt sich vorgeben', () => {
    const r = retexture(block('t', 32, 'DXT1'), image(32, 32), { format: 'A8R8G8B8' });
    expect(r.texture.format).toBe('A8R8G8B8');
  });
});

describe('completeMips', () => {
  it('ergänzt eine fehlende Mip-Kette und lässt Stufe 0 unberührt', () => {
    const src = image(64, 64);
    const t: YtdTexture = { name: 'm', width: 64, height: 64, levels: 1, format: 'DXT1', data: encodeBlocks(src, 'DXT1') };
    const done = completeMips(t);
    expect(done.levels).toBe(7);
    expect(done.data.length).toBe(mipChainSize('DXT1', 64, 64, 7));
    expect(Buffer.compare(Buffer.from(done.data.subarray(0, t.data.length)), Buffer.from(t.data))).toBe(0);
    // Die neue Stufe 1 entspricht dem verkleinerten Bild
    const level1 = decodeTexture(done, 1);
    expect(level1.width).toBe(32);
    expect(Math.abs(level1.data[0]! - decodeTexture(t, 0).data[0]!)).toBeLessThan(20);
  });

  it('setzt eine gekürzte Kette ab der letzten vorhandenen Stufe fort', () => {
    const full = block('c', 64, 'DXT5');
    const cut: YtdTexture = { ...full, levels: 5, data: full.data.slice(0, mipChainSize('DXT5', 64, 64, 5)) };
    const done = completeMips(cut);
    expect(done.levels).toBe(7);
    expect(done.data.length).toBe(full.data.length);
    expect(Buffer.compare(Buffer.from(done.data.subarray(0, cut.data.length)), Buffer.from(cut.data))).toBe(0);
  });

  it('funktioniert auch für A8R8G8B8 und gibt vollständige Texturen unverändert zurück', () => {
    const chain = buildMipChain(image(16, 16));
    const single: YtdTexture = { name: 'b', width: 16, height: 16, levels: 1, format: 'A8R8G8B8', data: packBgra([chain[0]!]) };
    expect(completeMips(single).levels).toBe(5);
    const complete = bgra('c', 16);
    expect(completeMips(complete)).toBe(complete);
  });

  it('lässt BC7 unverändert', () => {
    const bc7: YtdTexture = { name: 'x', width: 16, height: 16, levels: 1, format: 'BC7', data: new Uint8Array(mipChainSize('BC7', 16, 16, 1)) };
    expect(completeMips(bc7)).toBe(bc7);
  });
});

describe('retextureFromDds', () => {
  const original = block('car_body', 64, 'DXT1', { usage: 20, usageFlags: 1, extraFlags: 3 });

  it('übernimmt die DDS-Daten ohne Neukodierung und behält Namen und Verwendung', () => {
    const dds = readDds(writeDdsTexture(block('x', 64, 'DXT5')));
    const r = retextureFromDds(original, dds);
    expect(r.notes).toEqual([]);
    expect(r.texture).toMatchObject({ name: 'car_body', width: 64, height: 64, levels: 7, format: 'DXT5', usage: 20, usageFlags: 1, extraFlags: 3 });
    expect(Buffer.compare(Buffer.from(r.texture.data), Buffer.from(dds.data))).toBe(0);
  });

  it('meldet eine andere Größe, nimmt das DDS aber so', () => {
    const r = retextureFromDds(original, readDds(writeDdsTexture(block('x', 128, 'DXT1'))));
    expect(r.notes).toContain('dds-size-differs');
    expect(r.texture).toMatchObject({ width: 128, height: 128 });
  });

  it('ergänzt die von CodeWalker gekürzten kleinsten Stufen', () => {
    const full = writeDdsTexture(block('x', 64, 'DXT1'));
    const dds = readDds(full.subarray(0, 128 + 2730));
    expect(dds.levels).toBe(5);
    const r = retextureFromDds(original, dds);
    expect(r.notes).toContain('mips-added');
    expect(r.texture.levels).toBe(7);
    expect(r.texture.data.length).toBe(mipChainSize('DXT1', 64, 64, 7));
  });

  it('ergänzt eine fehlende Kette bei einem DDS ohne Mips', () => {
    const single = writeDdsTexture({ width: 64, height: 64, levels: 1, format: 'DXT1', data: encodeBlocks(image(64, 64), 'DXT1') });
    const r = retextureFromDds(original, readDds(single));
    expect(r.texture.levels).toBe(7);
    expect(r.notes).toContain('mips-added');
  });

  it('meldet BC7 ohne Mips, ohne es zu verändern', () => {
    const bc7 = readDds(
      (() => {
        const header = new Uint8Array(148);
        const v = new DataView(header.buffer);
        v.setUint32(0, 0x20534444, true);
        v.setUint32(4, 124, true);
        v.setUint32(8, 0x1 | 0x2 | 0x4 | 0x1000, true);
        v.setUint32(12, 16, true);
        v.setUint32(16, 16, true);
        v.setUint32(76, 32, true);
        v.setUint32(80, 4, true);
        header.set([68, 88, 49, 48], 84); // "DX10"
        v.setUint32(128, 98, true);
        v.setUint32(132, 3, true);
        v.setUint32(140, 1, true);
        const out = new Uint8Array(148 + 256);
        out.set(header);
        return out;
      })(),
    );
    const r = retextureFromDds(original, bc7);
    expect(r.texture.format).toBe('BC7');
    expect(r.notes).toContain('mips-missing');
  });

  it('lehnt Größen ohne Zweierpotenz ab', () => {
    const odd = writeDdsTexture({ width: 12, height: 8, levels: 1, format: 'DXT1', data: new Uint8Array(mipChainSize('DXT1', 12, 8, 1)) });
    expect(() => retextureFromDds(original, readDds(odd))).toThrow(/Zweierpotenz/);
  });
});

describe('optimizePack', () => {
  const encoder = new TextEncoder();
  const lua = encoder.encode("fx_version 'cerulean'\ngame 'gta5'\n");

  async function pack() {
    const big = buildYtd([block('body', 256, 'DXT5'), block('glass', 128, 'DXT1')]);
    const small = buildYtd([block('tiny', 32, 'DXT1')]);
    return {
      big,
      small,
      files: {
        'fxmanifest.lua': lua,
        'stream/car.ytd': big,
        'stream/small.ytd': small,
        'stream/car.yft': new Uint8Array([1, 2, 3]),
        'stream/locked.ytd': Uint8Array.from([0x46, 0x58, 0x41, 0x50, 0, 0, 0, 0]), // "FXAP"
        'stream/broken.ytd': new Uint8Array(40),
      } as Record<string, Uint8Array>,
    };
  }

  it('optimiert große Texturen, lässt kleine Dateien byte-identisch und meldet Unlesbares', async () => {
    const { big, small, files } = await pack();
    const result = await optimizePack(files, { maxSize: 64 });

    const byPath = new Map(result.report.files.map((f) => [f.path, f]));
    expect(byPath.get('stream/car.ytd')!.status).toBe('optimized');
    expect(byPath.get('stream/small.ytd')!.status).toBe('unchanged');
    expect(byPath.get('stream/locked.ytd')).toMatchObject({ status: 'skipped', reason: 'encrypted' });
    expect(byPath.get('stream/broken.ytd')).toMatchObject({ status: 'skipped' });

    // Unveränderte und fremde Dateien bleiben exakt gleich.
    expect(result.files['stream/small.ytd']).toBe(small);
    expect(result.files['fxmanifest.lua']).toBe(lua);
    expect(result.files['stream/locked.ytd']).toBe(files['stream/locked.ytd']);
    expect(result.files['stream/car.ytd']).not.toBe(big);

    // Die neue Datei ist lesbar und kleiner.
    const textures = readYtd(result.files['stream/car.ytd']!);
    expect(textures.map((t) => [t.name, t.width]).sort()).toEqual([['body', 64], ['glass', 64]]);
    const car = byPath.get('stream/car.ytd')!;
    expect(car.pixelBytesAfter).toBeLessThan(car.pixelBytesBefore / 4);
    expect(car.fileBytesAfter).toBeLessThan(car.fileBytesBefore);

    expect(result.report.embeddedTextureFiles).toEqual(['stream/car.yft']);
    expect(result.report.totals.texturesTotal).toBe(3);
    expect(result.report.totals.texturesChanged).toBe(2);
  });

  it('meldet den Fortschritt', async () => {
    const { files } = await pack();
    const calls: [number, number][] = [];
    await optimizePack(files, { maxSize: 64 }, (done, total) => calls.push([done, total]));
    expect(calls[0]).toEqual([0, 4]);
    expect(calls[calls.length - 1]).toEqual([4, 4]);
  });

  it('Pfade werden unabhängig von der Groß- und Kleinschreibung der Endung erkannt', async () => {
    const files = { 'STREAM/X.YTD': buildYtd([block('a', 128, 'DXT1')]) };
    const result = await optimizePack(files, { maxSize: 32 });
    expect(result.report.files[0]!.status).toBe('optimized');
  });
});

describe('ZIP', () => {
  it('schreibt und liest Dateien einschließlich Ordnerstruktur', () => {
    const files = { 'a/b.txt': new TextEncoder().encode('hallo'), 'x.ytd': new Uint8Array([1, 2, 3, 4]) };
    const back = readZip(writeZip(files));
    expect(Object.keys(back).sort()).toEqual(['a/b.txt', 'x.ytd']);
    expect(new TextDecoder().decode(back['a/b.txt']!)).toBe('hallo');
    expect(Array.from(back['x.ytd']!)).toEqual([1, 2, 3, 4]);
  });

  it('lehnt Pfade mit ".." ab', () => {
    const zip = writeZip({ '../evil.txt': new Uint8Array([1]) });
    expect(() => readZip(zip)).toThrow(/Unzulässiger Pfad/);
  });
});
