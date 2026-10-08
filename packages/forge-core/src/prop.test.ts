import { joaat, parseResource } from '@toolkit/rage-formats';
import { describe, expect, it } from 'vitest';
import { buildGeometries } from './geometry.ts';
import type { ModelData } from './model.ts';
import { buildPropResource } from './prop.ts';
import { classifyAlpha, nearestPowerOfTwo, prepareTextures, resizeBilinear } from './texture.ts';

/** Würfel mit einer 6x6-Textur (keine Zweierpotenz) und einem zweiten, untexturierten Material. */
function crate(): ModelData {
  const h = 0.5;
  const corners: Array<[number, number, number]> = [
    [-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h],
  ];
  const positions = new Float32Array(corners.flat());
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
  const tex = new Uint8Array(6 * 6 * 4);
  for (let i = 0; i < 36; i++) tex.set([200, 120, 40, 255], i * 4);

  return {
    name: 'crate',
    parts: [
      { name: 'top', positions, normals, uvs, indices: new Uint32Array([0, 1, 2, 0, 2, 3]), materialIndex: 0 },
      { name: 'side', positions, normals, uvs, indices: new Uint32Array([0, 1, 2]), materialIndex: 1 },
    ],
    materials: [
      { name: 'wood', baseColor: [1, 1, 1, 1], textureIndex: 0 },
      { name: 'paint', baseColor: [1, 0, 0, 1], textureIndex: null },
    ],
    textures: [{ name: 'wood', width: 6, height: 6, rgba: tex }],
  };
}

describe('Texturen', () => {
  it('nearestPowerOfTwo wählt logarithmisch die nächste Zweierpotenz und begrenzt', () => {
    expect(nearestPowerOfTwo(64)).toBe(64);
    expect(nearestPowerOfTwo(100)).toBe(128);
    expect(nearestPowerOfTwo(90)).toBe(64);
    expect(nearestPowerOfTwo(3)).toBe(4);
    expect(nearestPowerOfTwo(5000)).toBe(2048);
    expect(nearestPowerOfTwo(5000, 4, 512)).toBe(512);
  });

  it('resizeBilinear erhält eine einfarbige Fläche', () => {
    const src = { width: 4, height: 4, data: new Uint8Array(4 * 4 * 4).fill(90) };
    const out = resizeBilinear(src, 8, 2);
    expect(out.width).toBe(8);
    expect(out.height).toBe(2);
    expect(new Set(out.data)).toEqual(new Set([90]));
  });

  it('komprimiert Texturen standardmäßig mit DXT1, bei Transparenz mit DXT5', () => {
    const opaque = prepareTextures(crate(), 'crate').ytd[0]!;
    expect(opaque.format).toBe('DXT1');
    expect(opaque.data.length).toBeLessThan(8 * 8 * 4);

    const m = crate();
    m.textures[0]!.rgba[3] = 100;
    expect(prepareTextures(m, 'crate').ytd[0]!.format).toBe('DXT5');
  });

  it('lässt sich auf unkomprimiert umstellen und begrenzt die Größe', () => {
    const raw = prepareTextures(crate(), 'crate', { compress: false });
    expect(raw.ytd[0]!.format).toBe('A8R8G8B8');

    const big = crate();
    big.textures[0] = { name: 'big', width: 64, height: 64, rgba: new Uint8Array(64 * 64 * 4).fill(255) };
    const capped = prepareTextures(big, 'crate', { maxSize: 16 });
    expect(capped.ytd[0]).toMatchObject({ width: 16, height: 16 });
  });

  it('prepareTextures skaliert auf Zweierpotenzen und benennt eindeutig', () => {
    const t = prepareTextures(crate(), 'crate', { compress: false });
    expect(t.ytd.map((x) => x.name)).toEqual(['crate_diffuse', 'crate_col0']);
    expect(t.ytd[0]).toMatchObject({ width: 8, height: 8, format: 'A8R8G8B8' });
    expect(t.materialTexture).toEqual(['crate_diffuse', 'crate_col0']);
    expect(t.warnings.join(' ')).toMatch(/6x6 wurde auf 8x8/);
    // einfarbige Ersatztextur ist 4x4 und enthält die Grundfarbe rot (B, G, R, A)
    expect(t.ytd[1]).toMatchObject({ width: 4, height: 4 });
    expect([...t.ytd[1]!.data.subarray(0, 4)]).toEqual([0, 0, 255, 255]);
  });

  it('erkennt Transparenz', () => {
    const m = crate();
    m.textures[0]!.rgba[3] = 100;
    expect(prepareTextures(m, 'crate').hasAlpha).toBe(true);
    expect(prepareTextures(crate(), 'crate').hasAlpha).toBe(false);
  });
});

describe('Durchsichtigkeit', () => {
  /** 8x8-Textur, links deckend, rechts mit dem angegebenen Alpha. */
  const alphaTexture = (right: number) => {
    const rgba = new Uint8Array(8 * 8 * 4);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) rgba.set([200, 120, 40, x < 4 ? 255 : right], (y * 8 + x) * 4);
    return rgba;
  };
  const withTexture = (rgba: Uint8Array, mode?: 'opaque' | 'mask' | 'blend'): ModelData => {
    const m = crate();
    m.textures = [{ name: 'leaf', width: 8, height: 8, rgba }];
    m.materials = [{ name: 'leaf', baseColor: [1, 1, 1, 1], textureIndex: 0, ...(mode ? { alphaMode: mode } : {}) }];
    m.parts = m.parts.slice(0, 1);
    return m;
  };

  it('classifyAlpha unterscheidet deckend, scharfkantig und weich', () => {
    expect(classifyAlpha(alphaTexture(255))).toBe('none');
    expect(classifyAlpha(alphaTexture(0))).toBe('hard');
    expect(classifyAlpha(alphaTexture(128))).toBe('soft');
  });

  it('ohne Angabe im Modell entscheidet die Textur: deckend, Alpha-Test oder Überblendung', () => {
    expect(prepareTextures(withTexture(alphaTexture(255)), 'p').materialShader).toEqual(['opaque']);
    expect(prepareTextures(withTexture(alphaTexture(0)), 'p').materialShader).toEqual(['cutout']);
    expect(prepareTextures(withTexture(alphaTexture(128)), 'p').materialShader).toEqual(['alpha']);
  });

  it('die Angabe des Modells (glTF) hat Vorrang vor dem Alpha-Kanal', () => {
    const soft = alphaTexture(128);
    expect(prepareTextures(withTexture(soft, 'opaque'), 'p').materialShader).toEqual(['opaque']);
    expect(prepareTextures(withTexture(soft, 'mask'), 'p').materialShader).toEqual(['cutout']);
    expect(prepareTextures(withTexture(soft, 'blend'), 'p').materialShader).toEqual(['alpha']);
    // MASK oder BLEND ohne Alpha in der Textur ändert nichts
    expect(prepareTextures(withTexture(alphaTexture(255), 'mask'), 'p').materialShader).toEqual(['opaque']);
    expect(prepareTextures(withTexture(alphaTexture(255), 'blend'), 'p').materialShader).toEqual(['opaque']);
  });

  it('verwirft den Alpha-Kanal, wenn kein Material ihn braucht (DXT1 statt DXT5)', () => {
    const opaqueMode = prepareTextures(withTexture(alphaTexture(0), 'opaque'), 'p');
    expect(opaqueMode.ytd[0]!.format).toBe('DXT1');
    expect(opaqueMode.hasAlpha).toBe(false);
    const cutout = prepareTextures(withTexture(alphaTexture(0), 'mask'), 'p');
    expect(cutout.ytd[0]!.format).toBe('DXT5');
    expect(cutout.hasAlpha).toBe(true);
  });

  it('untexturierte Materialien: Deckkraft nur bei Überblendung', () => {
    const m = crate();
    m.materials = [{ name: 'glass', baseColor: [0.2, 0.5, 0.8, 0.4], textureIndex: null }];
    m.textures = [];
    m.parts = m.parts.slice(0, 1);
    const auto = prepareTextures(m, 'p');
    expect(auto.materialShader).toEqual(['alpha']);
    expect(auto.ytd[0]!.format).toBe('A8R8G8B8');
    expect(auto.ytd[0]!.data[3]).toBe(102); // 0,4 * 255 als Alpha der einfarbigen Textur

    m.materials = [{ name: 'glass', baseColor: [0.2, 0.5, 0.8, 0.4], textureIndex: null, alphaMode: 'opaque' }];
    const opaque = prepareTextures(m, 'p');
    expect(opaque.materialShader).toEqual(['opaque']);
    expect(opaque.ytd[0]!.data[3]).toBe(255);
  });

  it('eine Textur, die zwei Materialien teilen, behält Alpha, sobald eines es braucht', () => {
    const m = crate();
    m.textures = [{ name: 'leaf', width: 8, height: 8, rgba: alphaTexture(0) }];
    m.materials = [
      { name: 'a', baseColor: [1, 1, 1, 1], textureIndex: 0, alphaMode: 'opaque' },
      { name: 'b', baseColor: [1, 1, 1, 1], textureIndex: 0, alphaMode: 'mask' },
    ];
    const t = prepareTextures(m, 'p');
    expect(t.materialShader).toEqual(['opaque', 'cutout']);
    expect(t.ytd).toHaveLength(1);
    expect(t.ytd[0]!.format).toBe('DXT5');
  });

  it('die fertige Resource trägt die Shader-Datei und den Zeichen-Eimer der Materialien', async () => {
    const readFileNameHashes = async (model: ModelData) => {
      const res = await buildPropResource(model, { name: 'leafy', collision: 'box', lodLevels: 1 });
      const sys = parseResource(res.files.find((f) => f.path === 'stream/leafy.ydr')!.data).system;
      const view = new DataView(sys.buffer, sys.byteOffset, sys.byteLength);
      const has = (hash: number) => {
        for (let o = 0; o + 4 <= sys.length; o += 4) if (view.getUint32(o, true) === hash) return true;
        return false;
      };
      return { has, warnings: res.warnings };
    };
    const cutout = await readFileNameHashes(withTexture(alphaTexture(0)));
    expect(cutout.has(joaat('cutout.sps'))).toBe(true);
    expect(cutout.has(joaat('alpha.sps'))).toBe(false);
    expect(cutout.warnings.join(' ')).toMatch(/1 mit Alpha-Test/);

    const blended = await readFileNameHashes(withTexture(alphaTexture(128)));
    expect(blended.has(joaat('alpha.sps'))).toBe(true);
    expect(blended.warnings.join(' ')).toMatch(/1 mit Überblendung/);

    const solid = await readFileNameHashes(crate());
    expect(solid.has(joaat('default.sps'))).toBe(true);
    expect(solid.warnings.join(' ')).not.toMatch(/Durchsichtige/);
  });
});

describe('buildGeometries', () => {
  it('fasst Teile je Material zusammen', () => {
    const geometries = buildGeometries(crate(), (m) => m);
    expect(geometries).toHaveLength(2);
    expect(geometries[0]!.shader).toBe(0);
    expect(geometries[0]!.indices.length).toBe(6);
    expect(geometries[1]!.indices.length).toBe(3);
    expect(geometries[0]!.positions.length / 3).toBe(4);
  });

  it('teilt Geometrien über 65.535 Eckpunkte und behält alle Dreiecke', () => {
    const triangles = 30000; // 90.000 Eckpunkte, jedes Dreieck mit eigenen
    const positions = new Float32Array(triangles * 3 * 3);
    const normals = new Float32Array(triangles * 3 * 3).fill(0);
    for (let i = 0; i < triangles * 3; i++) normals[i * 3 + 2] = 1;
    const uvs = new Float32Array(triangles * 3 * 2);
    const indices = new Uint32Array(triangles * 3).map((_, i) => i);
    const model: ModelData = {
      name: 'big',
      parts: [{ name: 'p', positions, normals, uvs, indices, materialIndex: 0 }],
      materials: [{ name: 'm', baseColor: [1, 1, 1, 1], textureIndex: null }],
      textures: [],
    };
    const geometries = buildGeometries(model, () => 0);
    expect(geometries.length).toBeGreaterThan(1);
    for (const g of geometries) expect(g.positions.length / 3).toBeLessThanOrEqual(65535);
    expect(geometries.reduce((s, g) => s + g.indices.length / 3, 0)).toBe(triangles);
  });

  it('unterscheidet gleichnamige Teile', () => {
    const base = crate();
    const a = { ...base.parts[0]!, name: 'mesh', indices: new Uint32Array([0, 1, 2]) };
    const b = {
      ...base.parts[0]!,
      name: 'mesh',
      positions: base.parts[0]!.positions.map((v) => v + 5),
      indices: new Uint32Array([0, 1, 2]),
    };
    const g = buildGeometries({ ...base, parts: [a, b] }, () => 0);
    expect(g).toHaveLength(1);
    expect(g[0]!.positions.length / 3).toBe(6); // nicht zusammengelegt, weil verschiedene Teile
  });

  it('normiert Normalen und ersetzt Null-Normalen', () => {
    const base = crate();
    base.parts[0]!.normals = new Float32Array([0, 0, 5, 0, 0, 0, 0, 3, 0, 4, 0, 0]);
    const g = buildGeometries({ ...base, parts: [base.parts[0]!] }, () => 0)[0]!;
    expect([...g.normals.subarray(0, 3)]).toEqual([0, 0, 1]);
    expect([...g.normals.subarray(3, 6)]).toEqual([0, 0, 1]); // war 0
    expect([...g.normals.subarray(6, 9)]).toEqual([0, 1, 0]);
  });
});

describe('buildPropResource', () => {
  it('liefert alle Dateien einer lauffähigen Resource', async () => {
    const { files } = await buildPropResource(crate(), { name: 'crate', collision: 'box', lodLevels: 1 });
    expect(files.map((f) => f.path).sort()).toEqual([
      'README.txt',
      'client.lua',
      'fxmanifest.lua',
      'stream/crate.ydr',
      'stream/crate.ytd',
      'stream/crate.ytyp',
    ]);
  });

  it('schreibt ein gültiges Manifest mit der ytyp-Anmeldung', async () => {
    const { files } = await buildPropResource(crate(), { name: 'crate', collision: 'box', lodLevels: 1 });
    const manifest = new TextDecoder().decode(files.find((f) => f.path === 'fxmanifest.lua')!.data);
    expect(manifest).toContain("fx_version 'cerulean'");
    expect(manifest).toContain("game 'gta5'");
    expect(manifest).toContain("data_file 'DLC_ITYP_REQUEST' 'stream/crate.ytyp'");
    expect(manifest).toContain("'stream/crate.ytyp'");
    expect(manifest).toContain("client_script 'client.lua'");
  });

  it('erzeugt lesbare Binärdateien mit den richtigen Versionen', async () => {
    const { files } = await buildPropResource(crate(), { name: 'crate', collision: 'box', lodLevels: 1 });
    const get = (p: string) => files.find((f) => f.path === p)!.data;
    expect(parseResource(get('stream/crate.ydr')).version).toBe(165);
    expect(parseResource(get('stream/crate.ytd')).version).toBe(13);
    expect(parseResource(get('stream/crate.ytyp')).version).toBe(2);
  });

  it('trägt den Modellnamen als Hash in der YTYP ein', async () => {
    const { files } = await buildPropResource(crate(), { name: 'crate', collision: 'box', lodLevels: 1 });
    const ytyp = parseResource(files.find((f) => f.path === 'stream/crate.ytyp')!.data).system;
    const view = new DataView(ytyp.buffer, ytyp.byteOffset, ytyp.byteLength);
    let found = false;
    for (let i = 0; i + 4 <= ytyp.length; i += 4) {
      if (view.getUint32(i, true) === joaat('crate')) found = true;
    }
    expect(found).toBe(true);
  });

  it('lässt die Kollision bei "none" weg', async () => {
    const withBox = await buildPropResource(crate(), { name: 'crate', collision: 'box', lodLevels: 1 });
    const without = await buildPropResource(crate(), { name: 'crate', collision: 'none', lodLevels: 1 });
    const size = (r: typeof withBox) => r.files.find((f) => f.path === 'stream/crate.ydr')!.data.length;
    expect(size(without)).toBeLessThan(size(withBox));

    const ydr = parseResource(without.files.find((f) => f.path === 'stream/crate.ydr')!.data).system;
    expect(new DataView(ydr.buffer, ydr.byteOffset).getUint32(0xc8, true)).toBe(0);
  });

  it('meldet noch nicht verfügbare Optionen und zu kleine Modelle statt sie zu verschweigen', async () => {
    const hull = await buildPropResource(crate(), { name: 'crate', collision: 'hull', lodLevels: 3 });
    expect(hull.warnings.join(' ')).toMatch(/Hülle/);
    expect(hull.warnings.join(' ')).toMatch(/Detailstufen lohnen sich/);
    const readme = new TextDecoder().decode(hull.files.find((f) => f.path === 'README.txt')!.data);
    expect(readme).toContain('/spawn_crate');
  });

  it('lehnt ungültige Namen und fehlerhafte Modelle ab', async () => {
    await expect(buildPropResource(crate(), { name: 'Mit Leerzeichen', collision: 'box', lodLevels: 1 })).rejects.toThrow(/Modellname/);
    await expect(buildPropResource(crate(), { name: '', collision: 'box', lodLevels: 1 })).rejects.toThrow(/Modellname/);
    const broken = crate();
    broken.parts[0]!.indices = new Uint32Array([0, 1, 99]);
    await expect(buildPropResource(broken, { name: 'crate', collision: 'box', lodLevels: 1 })).rejects.toThrow(/fehlerhaft/);
  });

  describe('Detailstufen', () => {
    /** Dicht unterteilte Platte, damit sich LODs lohnen (3200 Dreiecke). */
    function dense(): ModelData {
      const n = 40;
      const w = n + 1;
      const positions = new Float32Array(w * w * 3);
      const normals = new Float32Array(w * w * 3);
      const uvs = new Float32Array(w * w * 2);
      for (let y = 0; y < w; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          positions.set([x / n, y / n, 0.05 * Math.sin((x / n) * Math.PI)], i * 3);
          normals.set([0, 0, 1], i * 3);
          uvs.set([x / n, y / n], i * 2);
        }
      }
      const idx: number[] = [];
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const a = y * w + x;
          idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
        }
      }
      return {
        name: 'plate',
        parts: [{ name: 'p', positions, normals, uvs, indices: Uint32Array.from(idx), materialIndex: 0 }],
        materials: [{ name: 'm', baseColor: [0.5, 0.5, 0.5, 1], textureIndex: null }],
        textures: [],
      };
    }

    const modelLists = (ydr: Uint8Array) => {
      const sys = parseResource(ydr).system;
      const v = new DataView(sys.buffer, sys.byteOffset, sys.byteLength);
      return { v, med: v.getUint32(0x58, true), low: v.getUint32(0x60, true), vlow: v.getUint32(0x68, true) };
    };

    it('schreibt bei einer Stufe nur die höchste', async () => {
      const r = await buildPropResource(dense(), { name: 'plate', collision: 'none', lodLevels: 1 });
      const m = modelLists(r.files.find((f) => f.path === 'stream/plate.ydr')!.data);
      expect(m.med).toBe(0);
      expect(m.low).toBe(0);
    });

    it('schreibt bei zwei Stufen zusätzlich eine niedrige mit gestaffelten Entfernungen', async () => {
      const one = await buildPropResource(dense(), { name: 'plate', collision: 'none', lodLevels: 1 });
      const two = await buildPropResource(dense(), { name: 'plate', collision: 'none', lodLevels: 2 });
      const ydr = two.files.find((f) => f.path === 'stream/plate.ydr')!.data;
      const m = modelLists(ydr);
      expect(m.med).toBe(0);
      expect(m.low).toBeGreaterThan(0);
      expect(m.v.getFloat32(0x70, true)).toBeLessThan(m.v.getFloat32(0x78, true)); // hoch endet vor niedrig
      expect(m.v.getUint32(0x88, true)).toBe(0xff00);
      // Die Datei enthält mehr Modelldaten, aber deutlich weniger als die doppelte Menge.
      const size = (r: typeof one) => r.files.find((f) => f.path === 'stream/plate.ydr')!.data.length;
      expect(size(two)).toBeGreaterThan(size(one));
      expect(size(two)).toBeLessThan(size(one) * 1.6);
    });

    it('schreibt bei drei Stufen hoch, mittel und niedrig', async () => {
      const r = await buildPropResource(dense(), { name: 'plate', collision: 'none', lodLevels: 3 });
      const m = modelLists(r.files.find((f) => f.path === 'stream/plate.ydr')!.data);
      expect(m.med).toBeGreaterThan(0);
      expect(m.low).toBeGreaterThan(0);
      const high = m.v.getFloat32(0x70, true);
      const med = m.v.getFloat32(0x74, true);
      const low = m.v.getFloat32(0x78, true);
      expect(high).toBeLessThan(med);
      expect(med).toBeLessThan(low);
    });
  });
});
