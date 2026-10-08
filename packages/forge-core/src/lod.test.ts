import type { DrawableGeometry } from '@toolkit/rage-formats';
import { describe, expect, it } from 'vitest';
import { MIN_TRIANGLES_FOR_LOD, lodPlan, simplifyGeometries, simplifyGeometry, triangleCount } from './lod.ts';

/** Ein fein unterteiltes ebenes Gitter in der XY-Ebene, mit leichter Wölbung. */
function grid(n: number): DrawableGeometry {
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
  const indices: number[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const a = y * w + x;
      indices.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
    }
  }
  return { positions, normals, uvs, indices: Uint16Array.from(indices), shader: 0 };
}

describe('lodPlan', () => {
  it('liefert je nach Stufenzahl die passenden Vorgaben', () => {
    expect(lodPlan(1)).toEqual({});
    expect(lodPlan(2).low?.ratio).toBeCloseTo(0.25);
    expect(lodPlan(2).med).toBeUndefined();
    expect(lodPlan(3).med?.ratio).toBeCloseTo(0.5);
    expect(lodPlan(3).low?.ratio).toBeCloseTo(0.15);
  });

  it('Mindestgröße für Detailstufen ist positiv', () => {
    expect(MIN_TRIANGLES_FOR_LOD).toBeGreaterThan(0);
  });
});

describe('simplifyGeometry', () => {
  it('reduziert die Dreiecke deutlich und erhält die Gestalt', async () => {
    const g = grid(40); // 3200 Dreiecke
    const lod = await simplifyGeometry(g, { ratio: 0.25, error: 0.1 });
    const before = g.indices.length / 3;
    const after = lod.indices.length / 3;
    expect(after).toBeLessThan(before * 0.4);
    expect(after).toBeGreaterThan(0);

    // Alle Indizes zeigen auf vorhandene Eckpunkte.
    const vertexCount = lod.positions.length / 3;
    for (const i of Array.from(lod.indices)) expect(i).toBeLessThan(vertexCount);
    // Normalen und UVs wurden mitgeführt.
    expect(lod.normals.length).toBe(lod.positions.length);
    expect(lod.uvs.length).toBe((lod.positions.length / 3) * 2);

    // Die Ausdehnung bleibt erhalten (Gitter 1x1).
    let maxX = 0;
    let maxY = 0;
    for (let i = 0; i < lod.positions.length; i += 3) {
      maxX = Math.max(maxX, lod.positions[i]!);
      maxY = Math.max(maxY, lod.positions[i + 1]!);
    }
    expect(maxX).toBeCloseTo(1, 1);
    expect(maxY).toBeCloseTo(1, 1);
  });

  it('lässt kleine Modelle unverändert', async () => {
    const g = grid(2); // 8 Dreiecke
    expect(await simplifyGeometry(g, { ratio: 0.25, error: 0.1 })).toBe(g);
  });

  it('behält Shader und Farben bei', async () => {
    const g = grid(40);
    g.shader = 3;
    g.colors = new Uint8Array((g.positions.length / 3) * 4).fill(200);
    const lod = await simplifyGeometry(g, { ratio: 0.25, error: 0.1 });
    expect(lod.shader).toBe(3);
    expect(lod.colors?.length).toBe((lod.positions.length / 3) * 4);
    expect(new Set(lod.colors)).toEqual(new Set([200]));
  });

  it('simplifyGeometries bearbeitet jede Geometrie einzeln', async () => {
    const lods = await simplifyGeometries([grid(40), grid(30)], { ratio: 0.3, error: 0.1 });
    expect(lods).toHaveLength(2);
    expect(triangleCount(lods)).toBeLessThan(triangleCount([grid(40), grid(30)]) * 0.5);
  });
});
