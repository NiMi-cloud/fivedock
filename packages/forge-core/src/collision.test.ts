import { describe, expect, it } from 'vitest';
import { boxCollision, computeCollision, convexHull, decomposeBoxes, meshCollision } from './collision.ts';
import type { CollisionMesh } from './collision.ts';
import type { ModelData } from './model.ts';

/** Prüft, dass jedes Dreieck von der Mitte weg zeigt (nach außen) und das Netz geschlossen ist. */
function expectOutwardAndClosed(mesh: CollisionMesh) {
  const p = mesh.positions;
  const n = p.length / 3;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    cx += p[i * 3]!;
    cy += p[i * 3 + 1]!;
    cz += p[i * 3 + 2]!;
  }
  cx /= n;
  cy /= n;
  cz /= n;

  const edges = new Map<string, number>();
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t]!, mesh.indices[t + 1]!, mesh.indices[t + 2]!];
    const ax = p[a * 3]!;
    const ay = p[a * 3 + 1]!;
    const az = p[a * 3 + 2]!;
    const ux = p[b * 3]! - ax;
    const uy = p[b * 3 + 1]! - ay;
    const uz = p[b * 3 + 2]! - az;
    const vx = p[c * 3]! - ax;
    const vy = p[c * 3 + 1]! - ay;
    const vz = p[c * 3 + 2]! - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const mx = (ax + p[b * 3]! + p[c * 3]!) / 3 - cx;
    const my = (ay + p[b * 3 + 1]! + p[c * 3 + 1]!) / 3 - cy;
    const mz = (az + p[b * 3 + 2]! + p[c * 3 + 2]!) / 3 - cz;
    expect(nx * mx + ny * my + nz * mz).toBeGreaterThan(0);

    for (const [u, v] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
      edges.set(`${u}>${v}`, (edges.get(`${u}>${v}`) ?? 0) + 1);
    }
  }
  // Geschlossen und konsistent: jede gerichtete Kante kommt einmal vor, ihre Gegenkante auch.
  for (const [key, count] of edges) {
    expect(count).toBe(1);
    const [u, v] = key.split('>');
    expect(edges.has(`${v}>${u}`)).toBe(true);
  }
}

function cubePoints(): Float32Array {
  const pts: number[] = [];
  for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) pts.push(x, y, z);
  return new Float32Array(pts);
}

describe('boxCollision', () => {
  it('liefert 8 Ecken und 12 Dreiecke mit nach außen zeigenden Normalen', () => {
    const mesh = boxCollision({ min: [-1, -2, 0], max: [1, 2, 3] });
    expect(mesh.positions.length / 3).toBe(8);
    expect(mesh.indices.length / 3).toBe(12);
    expectOutwardAndClosed(mesh);
  });
});

describe('convexHull', () => {
  it('ergibt für einen Würfel 8 Ecken und 12 Dreiecke', () => {
    const hull = convexHull(cubePoints())!;
    expect(hull.positions.length / 3).toBe(8);
    expect(hull.indices.length / 3).toBe(12);
    expectOutwardAndClosed(hull);
  });

  it('ignoriert Punkte im Inneren', () => {
    const inner = [0.5, 0.5, 0.5, 0.2, 0.7, 0.4, 0.9, 0.1, 0.6];
    const pts = new Float32Array([...cubePoints(), ...inner]);
    const hull = convexHull(pts)!;
    expect(hull.positions.length / 3).toBe(8);
    expectOutwardAndClosed(hull);
  });

  it('bildet eine Kugel aus vielen Punkten als geschlossene konvexe Hülle', () => {
    const pts: number[] = [];
    const rings = 12;
    const segs = 20;
    for (let r = 0; r <= rings; r++) {
      const phi = (Math.PI * r) / rings;
      for (let s = 0; s < segs; s++) {
        const theta = (2 * Math.PI * s) / segs;
        pts.push(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi));
      }
    }
    const hull = convexHull(new Float32Array(pts))!;
    expect(hull).not.toBeNull();
    expectOutwardAndClosed(hull);
    // Alle Hüllpunkte liegen auf der Einheitskugel.
    for (let i = 0; i < hull.positions.length; i += 3) {
      expect(Math.hypot(hull.positions[i]!, hull.positions[i + 1]!, hull.positions[i + 2]!)).toBeCloseTo(1, 4);
    }
  });

  it('gibt null zurück, wenn alle Punkte in einer Ebene liegen', () => {
    const flat = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0.5, 0.5, 0]);
    expect(convexHull(flat)).toBeNull();
  });

  it('gibt null zurück bei zu wenigen Punkten', () => {
    expect(convexHull(new Float32Array([0, 0, 0, 1, 1, 1]))).toBeNull();
  });
});

describe('computeCollision', () => {
  const model: ModelData = {
    name: 'm',
    parts: [
      {
        name: 'a',
        positions: cubePoints(),
        normals: new Float32Array(24),
        uvs: new Float32Array(16),
        indices: new Uint32Array([0, 1, 2]),
        materialIndex: 0,
      },
      {
        name: 'b',
        positions: new Float32Array([5, 5, 5, 6, 5, 5, 5, 6, 5]),
        normals: new Float32Array(9),
        uvs: new Float32Array(6),
        indices: new Uint32Array([0, 1, 2]),
        materialIndex: 0,
      },
    ],
    materials: [{ name: 'm', baseColor: [1, 1, 1, 1], textureIndex: null }],
    textures: [],
  };

  it('none liefert null', () => {
    expect(computeCollision(model, 'none')).toBeNull();
  });

  it('box deckt alle Teile ab', () => {
    const box = computeCollision(model, 'box')!;
    const xs = Array.from({ length: box.positions.length / 3 }, (_, i) => box.positions[i * 3]!);
    expect(Math.max(...xs)).toBe(6);
    expect(Math.min(...xs)).toBe(0);
  });

  it('mesh verschiebt die Indizes der Teile korrekt', () => {
    const mesh = meshCollision(model);
    expect(mesh.positions.length / 3).toBe(8 + 3);
    expect([...mesh.indices]).toEqual([0, 1, 2, 8, 9, 10]);
  });

  it('hull fällt bei flachen Modellen auf die Box zurück', () => {
    const flat: ModelData = {
      ...model,
      parts: [{ ...model.parts[0]!, positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) }],
    };
    const hull = computeCollision(flat, 'hull')!;
    expect(hull.positions.length / 3).toBe(8);
  });
});

/** Modell aus achsenparallelen Quadern (je 12 Dreiecke). */
function solidBoxes(boxes: Array<[number, number, number, number, number, number]>): ModelData {
  const parts = boxes.map(([x0, y0, z0, x1, y1, z1], i) => {
    const positions = new Float32Array([
      x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0,
      x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1,
    ]);
    const indices = new Uint32Array([
      0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
    ]);
    return { name: `b${i}`, positions, normals: new Float32Array(24), uvs: new Float32Array(16), indices, materialIndex: 0 };
  });
  return { name: 'm', parts, materials: [{ name: 'm', baseColor: [1, 1, 1, 1], textureIndex: null }], textures: [] };
}

const volume = (b: { min: number[]; max: number[] }) => (b.max[0]! - b.min[0]!) * (b.max[1]! - b.min[1]!) * (b.max[2]! - b.min[2]!);
const contains = (boxes: { min: number[]; max: number[] }[], x: number, y: number, z: number) =>
  boxes.some((b) => x >= b.min[0]! && x <= b.max[0]! && y >= b.min[1]! && y <= b.max[1]! && z >= b.min[2]! && z <= b.max[2]!);

describe('decomposeBoxes', () => {
  it('ein einzelner Quader ergibt eine Box in Größe des Quaders (Innenraum wird gefüllt)', () => {
    const boxes = decomposeBoxes(solidBoxes([[0, 0, 0, 2, 1, 1]]));
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.min).toEqual([0, 0, 0]);
    expect(boxes[0]!.max).toEqual([2, 1, 1]);
  });

  it('eine U-Form lässt die Lücke frei', () => {
    // Boden und zwei Pfosten, dazwischen 2 m Luft
    const model = solidBoxes([
      [0, 0, 0, 4, 1, 1], // Boden
      [0, 0, 1, 1, 1, 3], // linker Pfosten
      [3, 0, 1, 4, 1, 3], // rechter Pfosten
    ]);
    const boxes = decomposeBoxes(model);
    expect(boxes.length).toBeGreaterThan(1);
    expect(boxes.length).toBeLessThanOrEqual(16);
    expect(contains(boxes, 0.5, 0.5, 2)).toBe(true); // im Pfosten
    expect(contains(boxes, 3.5, 0.5, 2)).toBe(true);
    expect(contains(boxes, 2, 0.5, 0.5)).toBe(true); // im Boden
    expect(contains(boxes, 2, 0.5, 2)).toBe(false); // in der Lücke
  });

  it('die Boxen decken das Modell ab, ragen aber kaum darüber hinaus', () => {
    const model = solidBoxes([
      [0, 0, 0, 3, 1, 1],
      [0, 0, 1, 1, 1, 2],
    ]); // L-Form, Volumen 4
    const boxes = decomposeBoxes(model);
    const total = boxes.reduce((s, b) => s + volume(b), 0);
    expect(total).toBeGreaterThanOrEqual(3.9);
    expect(total).toBeLessThan(4.6);
    for (const [x, y, z] of [[0.2, 0.5, 0.5], [2.8, 0.5, 0.5], [0.5, 0.5, 1.8]] as const) expect(contains(boxes, x, y, z)).toBe(true);
    expect(contains(boxes, 2, 0.5, 1.8)).toBe(false); // freie Ecke der L-Form
  });

  it('hält die Höchstzahl ein und fällt zuletzt auf eine Box zurück', () => {
    const model = solidBoxes([
      [0, 0, 0, 4, 1, 1],
      [0, 0, 1, 1, 1, 3],
      [3, 0, 1, 4, 1, 3],
    ]);
    expect(decomposeBoxes(model, { maxBoxes: 2 }).length).toBeLessThanOrEqual(2);
    const one = decomposeBoxes(model, { maxBoxes: 1 });
    expect(one).toHaveLength(1);
    expect(one[0]!.min).toEqual([0, 0, 0]);
    expect(one[0]!.max).toEqual([4, 1, 3]);
  });

  it('computeCollision liefert für "boxes" ein geschlossenes Netz aller Boxen', () => {
    const mesh = computeCollision(solidBoxes([[0, 0, 0, 4, 1, 1], [0, 0, 1, 1, 1, 3], [3, 0, 1, 4, 1, 3]]), 'boxes')!;
    expect(mesh.indices.length % 36).toBe(0);
    expect(mesh.positions.length / 3 % 8).toBe(0);
  });
});
