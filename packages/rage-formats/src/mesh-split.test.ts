import { describe, expect, it } from 'vitest';
import { type NewMesh, editYft, splitMesh } from './drawable-edit.ts';
import { ResourceEditor } from './resource-edit.ts';
import { buildTestYft } from './yft-fixture.ts';
import { readYft } from './yft.ts';

/** Gitter aus n x n Eckpunkten über dem Dach (z = 0.9), Dreiecke gegen den Uhrzeigersinn von oben. */
function grid(n: number): NewMesh {
  const positions = new Float32Array(n * n * 3);
  const normals = new Float32Array(n * n * 3);
  const uv0 = new Float32Array(n * n * 2);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = y * n + x;
      positions.set([x * 0.01 - 0.4, y * 0.01 - 0.4, 0.9], v * 3);
      normals.set([0, 0, 1], v * 3);
      uv0.set([x / (n - 1), y / (n - 1)], v * 2);
    }
  }
  const indices: number[] = [];
  for (let y = 0; y + 1 < n; y++) {
    for (let x = 0; x + 1 < n; x++) {
      const a = y * n + x;
      indices.push(a, a + 1, a + n + 1, a, a + n + 1, a + n);
    }
  }
  return { positions, normals, indices, uv0 };
}

const corners = (m: NewMesh, t: number) =>
  [0, 1, 2]
    .map((k) => {
      const v = m.indices[t * 3 + k]!;
      return `${m.positions[v * 3]!.toFixed(4)},${m.positions[v * 3 + 1]!.toFixed(4)},${m.uv0 ? m.uv0[v * 2]!.toFixed(3) : ''}`;
    })
    .join('|');

describe('splitMesh', () => {
  it('lässt kleine Netze unverändert', () => {
    const mesh = grid(4);
    expect(splitMesh(mesh, 1000, 1000)).toEqual([mesh]);
  });

  it('teilt große Netze, ohne Dreiecke zu verlieren oder zu ändern', () => {
    const mesh = grid(60);
    const pieces = splitMesh(mesh, 500, 3000);
    expect(pieces.length).toBeGreaterThan(5);
    for (const piece of pieces) {
      expect(piece.positions.length / 3).toBeLessThanOrEqual(500);
      expect(piece.indices.length).toBeLessThanOrEqual(3000);
      expect(piece.normals.length).toBe(piece.positions.length);
      expect(piece.uv0!.length).toBe((piece.positions.length / 3) * 2);
      for (let i = 0; i < piece.indices.length; i++) expect(piece.indices[i]!).toBeLessThan(piece.positions.length / 3);
    }
    const before: string[] = [];
    for (let t = 0; t < mesh.indices.length / 3; t++) before.push(corners(mesh, t));
    const after: string[] = [];
    for (const piece of pieces) for (let t = 0; t < piece.indices.length / 3; t++) after.push(corners(piece, t));
    expect(after).toEqual(before);
  });

  it('hält auch die Indexgrenze ein', () => {
    const pieces = splitMesh(grid(30), 60000, 300);
    expect(pieces.every((p) => p.indices.length <= 300)).toBe(true);
    expect(pieces.reduce((sum, p) => sum + p.indices.length, 0)).toBe(29 * 29 * 6);
  });
});

describe('ResourceEditor.fits', () => {
  it('sagt, ob Blöcke in die Seiten der Datei passen, auch zusammen mit schon angelegten', () => {
    const ed = ResourceEditor.open(buildTestYft(), 162, 'Fragment');
    expect(ed.fits('system', [])).toBe(true);
    expect(ed.fits('system', [64, 1024])).toBe(true);
    expect(ed.fits('system', [1 << 30])).toBe(false);
    expect(ed.fits('graphics', [1 << 30])).toBe(false);
  });
});
describe('große Teile in ein Fahrzeug einfügen', () => {
  it('teilt ein Netz mit 6400 Eckpunkten in mehrere Geometrien, die sich alle lesen lassen', () => {
    const mesh = grid(80);
    const before = readYft(buildTestYft());
    const result = editYft(buildTestYft(), { meshes: [{ mesh, shader: 0, bone: 0 }] });
    expect(result.added).toBeGreaterThan(1);
    const after = readYft(result.file);
    const added = after.geometries.slice(before.geometries.length);
    expect(added.length).toBeGreaterThan(1);
    expect(added.reduce((sum, g) => sum + g.indices.length / 3, 0)).toBe(mesh.indices.length / 3);
    expect(added.every((g) => g.shader === 0)).toBe(true);
  });
});
