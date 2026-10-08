import { describe, expect, it } from 'vitest';
import { boundsSize, computeBounds, modelStats, validateModel } from './model.ts';
import type { ModelData } from './model.ts';
import { DEFAULT_GAME_SPACE, sanitizePropName, toGameSpace } from './transform.ts';

/** Ein Quader 2 breit (x), 4 hoch (y), 6 tief (z) mit dem Mittelpunkt im Ursprung, Y oben. */
function box(): ModelData {
  const hx = 1;
  const hy = 2;
  const hz = 3;
  const positions = new Float32Array([
    -hx, -hy, -hz, hx, -hy, -hz, hx, hy, -hz, -hx, hy, -hz,
    -hx, -hy, hz, hx, -hy, hz, hx, hy, hz, -hx, hy, hz,
  ]);
  return {
    name: 'box',
    parts: [
      {
        name: 'p',
        positions,
        normals: new Float32Array(positions.length),
        uvs: new Float32Array((positions.length / 3) * 2),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
        materialIndex: 0,
      },
    ],
    materials: [{ name: 'm', baseColor: [1, 1, 1, 1], textureIndex: null }],
    textures: [],
  };
}

describe('toGameSpace', () => {
  it('dreht Y-oben nach Z-oben: die Höhe (y=4) wird zur Z-Ausdehnung', () => {
    const out = toGameSpace(box(), { ...DEFAULT_GAME_SPACE, centerXY: false, groundZ: false });
    const size = boundsSize(computeBounds(out)!);
    expect(size[0]).toBeCloseTo(2);
    expect(size[1]).toBeCloseTo(6);
    expect(size[2]).toBeCloseTo(4);
  });

  it('belässt Z-oben-Modelle unverändert', () => {
    const out = toGameSpace(box(), { ...DEFAULT_GAME_SPACE, upAxis: 'z', centerXY: false, groundZ: false });
    const size = boundsSize(computeBounds(out)!);
    expect(size).toEqual([2, 4, 6].map((v) => expect.closeTo(v)));
  });

  it('skaliert gleichmäßig', () => {
    const out = toGameSpace(box(), { ...DEFAULT_GAME_SPACE, scale: 0.5, centerXY: false, groundZ: false });
    const size = boundsSize(computeBounds(out)!);
    expect(size[0]).toBeCloseTo(1);
    expect(size[2]).toBeCloseTo(2);
  });

  it('setzt die Unterkante auf Z=0 und zentriert X/Y', () => {
    const out = toGameSpace(box(), DEFAULT_GAME_SPACE);
    const b = computeBounds(out)!;
    expect(b.min[2]).toBeCloseTo(0);
    expect(b.min[0]).toBeCloseTo(-b.max[0]);
    expect(b.min[1]).toBeCloseTo(-b.max[1]);
  });

  it('behält die Dreiecksreihenfolge (echte Drehung, keine Spiegelung)', () => {
    const src = box();
    const out = toGameSpace(src, DEFAULT_GAME_SPACE);
    expect([...out.parts[0]!.indices]).toEqual([...src.parts[0]!.indices]);
    // Orientierung des ersten Dreiecks: Vorzeichen des Normalenvektors muss gleich bleiben.
    const nz = (m: ModelData) => {
      const p = m.parts[0]!.positions;
      const a = [p[0]!, p[1]!, p[2]!];
      const b = [p[3]!, p[4]!, p[5]!];
      const c = [p[6]!, p[7]!, p[8]!];
      const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
      const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
      return [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    };
    // Normale im Quellraum (Y oben) wird mit derselben Drehung transformiert: (x,y,z) -> (x,-z,y).
    const [sx, sy, sz] = nz(src) as [number, number, number];
    const [ox, oy, oz] = nz(out) as [number, number, number];
    expect(ox).toBeCloseTo(sx);
    expect(oy).toBeCloseTo(-sz);
    expect(oz).toBeCloseTo(sy);
  });

  it('lehnt ungültige Skalierung ab', () => {
    expect(() => toGameSpace(box(), { ...DEFAULT_GAME_SPACE, scale: 0 })).toThrow();
    expect(() => toGameSpace(box(), { ...DEFAULT_GAME_SPACE, scale: Number.NaN })).toThrow();
  });
});

describe('validateModel und modelStats', () => {
  it('akzeptiert ein gültiges Modell', () => {
    expect(validateModel(box())).toEqual([]);
    expect(modelStats(box())).toEqual({ vertices: 8, triangles: 2, materials: 1, textures: 0 });
  });

  it('meldet Indizes außerhalb der Vertexliste', () => {
    const m = box();
    m.parts[0]!.indices = new Uint32Array([0, 1, 99]);
    expect(validateModel(m).join(' ')).toMatch(/Index 99/);
  });

  it('meldet ein leeres Modell', () => {
    expect(validateModel({ name: 'x', parts: [], materials: [], textures: [] })).toContain('Das Modell enthält keine Dreiecke.');
  });
});

describe('sanitizePropName', () => {
  it.each([
    ['Toolbox Red.glb', 'toolbox_red'],
    ['  Mein Möbel!! ', 'mein_mobel'],
    ['a--b', 'a_b'],
    ['', 'my_prop'],
    ['###', 'my_prop'],
  ])('%s -> %s', (input, expected) => {
    expect(sanitizePropName(input)).toBe(expected);
  });

  it('kürzt auf 40 Zeichen', () => {
    expect(sanitizePropName('x'.repeat(100))).toHaveLength(40);
  });
});
