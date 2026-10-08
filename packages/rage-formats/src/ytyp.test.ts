import { describe, expect, it } from 'vitest';
import { joaat, joaatLiteral } from './jenkins.ts';
import { SYSTEM_BASE, parseResource } from './rsc7.ts';
import { buildYtyp } from './ytyp.ts';
import type { Archetype } from './ytyp.ts';

function prop(name: string, extra: Partial<Archetype> = {}): Archetype {
  return {
    name,
    bbMin: [-0.5, -0.5, -0.5],
    bbMax: [0.5, 0.5, 0.5],
    bsCentre: [0, 0, 0],
    bsRadius: 0.8660254,
    textureDictionary: name,
    physicsDictionary: name,
    ...extra,
  };
}

/** Liest die Meta-Struktur zurück (Gegenstück zum Schreiber, nur für Tests). */
function read(file: Uint8Array) {
  const parsed = parseResource(file);
  const sys = new DataView(parsed.system.buffer, parsed.system.byteOffset, parsed.system.byteLength);
  const at = (offset: number) => offset - SYSTEM_BASE;
  const ptr = (offset: number) => at(sys.getUint32(offset, true));

  const structCount = sys.getUint16(0x48, true);
  const enumCount = sys.getUint16(0x4a, true);
  const blockCount = sys.getUint16(0x4c, true);
  const blocksAt = ptr(0x30);
  const blocks = Array.from({ length: blockCount }, (_, i) => ({
    hash: sys.getUint32(blocksAt + i * 16, true),
    length: sys.getInt32(blocksAt + i * 16 + 4, true),
    offset: ptr(blocksAt + i * 16 + 8),
  }));
  return { parsed, sys, structCount, enumCount, blocks, ptr };
}

describe('Hash-Funktionen für Meta-Dateien', () => {
  it('joaatLiteral unterscheidet Groß- und Kleinschreibung, joaat nicht', () => {
    expect(joaatLiteral('lodDist')).toBe(0xbf74dfa7);
    expect(joaatLiteral('lodDist')).not.toBe(joaatLiteral('loddist'));
    expect(joaat('lodDist')).toBe(joaat('loddist'));
    expect(joaatLiteral('CMapTypes')).toBe(0xd98bb561);
    expect(joaatLiteral('CBaseArchetypeDef')).toBe(0x82d6fc83);
  });

  it('der Modellname "forge_cube" ergibt den Hash aus dem Referenz-YTYP', () => {
    expect(joaat('forge_cube')).toBe(0x81b9f54a);
  });
});

describe('buildYtyp', () => {
  it('schreibt den Meta-Kopf wie die Referenz', () => {
    const file = buildYtyp('forge_cube', [prop('forge_cube')]);
    const { parsed, sys, structCount, enumCount, blocks } = read(file);

    expect(parsed.version).toBe(2);
    expect(sys.getUint32(0x00, true)).toBe(0x405bc808);
    expect(sys.getUint32(0x04, true)).toBe(1);
    expect(sys.getUint32(0x10, true)).toBe(0x50524430);
    expect(sys.getUint16(0x14, true)).toBe(0x79);
    expect(sys.getUint32(0x1c, true)).toBe(1); // Wurzelblock
    expect(structCount).toBe(2);
    expect(enumCount).toBe(1);
    expect(blocks.map((b) => b.hash)).toEqual([0xd98bb561, 0x82d6fc83, 0x7]);
    expect(blocks.map((b) => b.length)).toEqual([0x50, 0x90, 0x10]);
  });

  it('nutzt Meta-Seitenflags wie die Referenz (eine Seite à 0x2000)', () => {
    const file = buildYtyp('forge_cube', [prop('forge_cube')]);
    const view = new DataView(file.buffer);
    expect(view.getUint32(8, true)).toBe(0x08000004);
    expect(view.getUint32(12, true)).toBe(0x20000000);
  });

  it('schreibt die Archetyp-Felder an die geprüften Offsets', () => {
    const file = buildYtyp('forge_cube', [
      prop('forge_cube', { lodDist: 200, hdTextureDist: 100, bsRadius: 0.8660254, bbMin: [-1, -2, -3], bbMax: [4, 5, 6], bsCentre: [0, 0, 1] }),
    ]);
    const { sys, blocks } = read(file);
    const a = blocks[1]!.offset;

    expect(sys.getFloat32(a + 0x08, true)).toBe(200);
    expect(sys.getFloat32(a + 0x20, true)).toBe(-1);
    expect(sys.getFloat32(a + 0x24, true)).toBe(-2);
    expect(sys.getFloat32(a + 0x28, true)).toBe(-3);
    expect(sys.getFloat32(a + 0x30, true)).toBe(4);
    expect(sys.getFloat32(a + 0x38, true)).toBe(6);
    expect(sys.getFloat32(a + 0x48, true)).toBe(1);
    expect(sys.getFloat32(a + 0x50, true)).toBeCloseTo(0.8660254, 6);
    expect(sys.getFloat32(a + 0x54, true)).toBe(100);
    expect(sys.getUint32(a + 0x58, true)).toBe(0x81b9f54a); // name
    expect(sys.getUint32(a + 0x5c, true)).toBe(0x81b9f54a); // textureDictionary
    expect(sys.getUint32(a + 0x60, true)).toBe(0); // clipDictionary leer
    expect(sys.getUint32(a + 0x68, true)).toBe(0x81b9f54a); // physicsDictionary
    expect(sys.getUint32(a + 0x6c, true)).toBe(2); // ASSET_TYPE_DRAWABLE
    expect(sys.getUint32(a + 0x70, true)).toBe(0x81b9f54a); // assetName = Modellname
  });

  it('legt mehrere Archetypen hintereinander und verweist per (Offset << 12) | Block', () => {
    const names = ['prop_a', 'prop_b', 'prop_c'];
    const file = buildYtyp('pack', names.map((n) => prop(n)));
    const { sys, blocks } = read(file);

    expect(blocks[1]!.length).toBe(0x90 * 3);
    expect(blocks[2]!.length).toBe(32); // 3 Zeiger * 8 Byte, auf 16 aufgerundet

    const pointers = blocks[2]!.offset;
    expect(sys.getUint32(pointers + 0, true)).toBe(2);
    expect(sys.getUint32(pointers + 8, true)).toBe((0x90 << 12) | 2);
    expect(sys.getUint32(pointers + 16, true)).toBe((0x120 << 12) | 2);

    names.forEach((n, i) => expect(sys.getUint32(blocks[1]!.offset + i * 0x90 + 0x58, true)).toBe(joaat(n)));

    // CMapTypes: Zeiger auf Block 3, Anzahl und Kapazität, Name der Datei
    const root = blocks[0]!.offset;
    expect(sys.getUint32(root + 0x18, true)).toBe(3);
    expect(sys.getUint16(root + 0x20, true)).toBe(3);
    expect(sys.getUint16(root + 0x22, true)).toBe(3);
    expect(sys.getUint32(root + 0x28, true)).toBe(joaat('pack'));
  });

  it('trägt Typtabellen mit den geprüften Schlüsseln ein', () => {
    const { sys, ptr } = read(buildYtyp('x', [prop('x')]));
    const infos = ptr(0x20);
    expect(sys.getUint32(infos, true)).toBe(joaatLiteral('CBaseArchetypeDef'));
    expect(sys.getUint32(infos + 4, true)).toBe(0x8fbadaa4);
    expect(sys.getUint32(infos + 8, true)).toBe(0x400);
    expect(sys.getInt32(infos + 24, true)).toBe(0x90);
    expect(sys.getUint16(infos + 30, true)).toBe(17);
    expect(sys.getUint32(infos + 32, true)).toBe(joaatLiteral('CMapTypes'));
    expect(sys.getUint32(infos + 36, true)).toBe(0x9b8046d4);
    expect(sys.getUint16(infos + 62, true)).toBe(9);

    const enumInfo = ptr(0x28);
    expect(sys.getUint32(enumInfo, true)).toBe(joaatLiteral('rage__fwArchetypeDef__eAssetType'));
    expect(sys.getUint32(enumInfo + 4, true)).toBe(0x6f39632c);
    expect(sys.getInt32(enumInfo + 16, true)).toBe(5);
  });

  it('wirft bei fehlerhaften Eingaben', () => {
    expect(() => buildYtyp('x', [])).toThrow(/mindestens einen Archetyp/);
    expect(() => buildYtyp('mit leerzeichen', [prop('a')])).toThrow(/YTYP-Name/);
    expect(() => buildYtyp('x', [prop('doppelt'), prop('doppelt')])).toThrow(/doppelt/);
    expect(() => buildYtyp('x', [prop('a', { bsRadius: Number.NaN })])).toThrow(/Maße/);
  });
});
