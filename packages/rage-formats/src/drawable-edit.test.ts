import { describe, expect, it } from 'vitest';
import { addMeshesToYdr } from './drawable-edit.ts';
import { buildYdr, defaultShader } from './ydr.ts';
import type { Drawable, DrawableGeometry } from './ydr.ts';
import { readYdr } from './yft.ts';

function cube(): DrawableGeometry {
  const h = 0.5;
  const faces: Array<{ n: [number, number, number]; c: Array<[number, number, number]> }> = [
    { n: [0, 0, 1], c: [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]] },
    { n: [0, 0, -1], c: [[h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h]] },
    { n: [1, 0, 0], c: [[h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h]] },
    { n: [-1, 0, 0], c: [[-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h]] },
    { n: [0, 1, 0], c: [[-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h]] },
    { n: [0, -1, 0], c: [[-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h]] },
  ];
  const positions = new Float32Array(24 * 3);
  const normals = new Float32Array(24 * 3);
  const uvs = new Float32Array(24 * 2);
  const indices: number[] = [];
  faces.forEach((f, fi) => {
    f.c.forEach((p, i) => {
      positions.set(p, (fi * 4 + i) * 3);
      normals.set(f.n, (fi * 4 + i) * 3);
      uvs.set([i % 2, i < 2 ? 0 : 1], (fi * 4 + i) * 2);
    });
    const b = fi * 4;
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  return { positions, normals, uvs, indices, shader: 0 };
}

const drawable = (): Drawable => ({ name: 'forge_cube', shaders: [defaultShader('forge_cube_diffuse')], high: [{ geometries: [cube()] }] });

/** Ein Viereck in der Ebene z = height, von (x0, y0) bis (x1, y1). */
function quad(x0: number, y0: number, x1: number, y1: number, height: number) {
  return {
    positions: new Float32Array([x0, y0, height, x1, y0, height, x1, y1, height, x0, y1, height]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: [0, 1, 2, 0, 2, 3],
  };
}

describe('addMeshesToYdr', () => {
  it('fügt eine Geometrie hinzu, die sich wieder lesen lässt, und lässt die alte unverändert', () => {
    const file = buildYdr(drawable());
    const before = readYdr(file);
    const result = addMeshesToYdr(file, [{ mesh: quad(1, 1, 2, 2, 0.75), shader: 0, bone: 0 }]);
    expect(result.added).toBe(1);
    expect(result.lods).toEqual([0]);

    const after = readYdr(result.file);
    expect(after.geometries).toHaveLength(2);
    expect(Array.from(after.geometries[0]!.positions)).toEqual(Array.from(before.geometries[0]!.positions));
    expect(Array.from(after.geometries[0]!.indices)).toEqual(Array.from(before.geometries[0]!.indices));

    const added = after.geometries[1]!;
    expect(added.shader).toBe(0);
    expect(added.vertexCount).toBe(4);
    expect(Array.from(added.positions)).toEqual([1, 1, 0.75, 2, 1, 0.75, 2, 2, 0.75, 1, 2, 0.75]);
    expect(Array.from(added.indices)).toEqual([0, 1, 2, 0, 2, 3]);
    expect(Array.from(added.normals ?? [])).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  });

  it('erweitert die Grenzen der Datei, wenn das Teil herausragt', () => {
    const file = buildYdr(drawable());
    const before = readYdr(file);
    const after = readYdr(addMeshesToYdr(file, [{ mesh: quad(1, 1, 3, 2, 0.75), shader: 0, bone: 0 }]).file);
    expect(after.boundsMax[0]).toBeGreaterThanOrEqual(3);
    expect(after.boundsMax[1]).toBeGreaterThanOrEqual(2);
    expect(after.boundsMin).toEqual(before.boundsMin);
  });

  it('nimmt mehrere Teile auf einmal und eigene Texturkoordinaten', () => {
    const file = buildYdr(drawable());
    const a = { ...quad(1, 1, 2, 2, 0.5), uv0: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]) };
    const b = quad(-3, -3, -2, -2, 0.25);
    const after = readYdr(addMeshesToYdr(file, [{ mesh: a, shader: 0, bone: 0 }, { mesh: b, shader: 0, bone: 0 }]).file);
    expect(after.geometries).toHaveLength(3);
    expect(Array.from(after.geometries[1]!.uvs[0]!)).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
    // ohne eigene Koordinaten gilt für alle Eckpunkte derselbe Wert (hier der Vorlage)
    const uv = Array.from(after.geometries[2]!.uvs[0]!);
    expect(new Set(uv.filter((_, i) => i % 2 === 0)).size).toBe(1);
    expect(new Set(uv.filter((_, i) => i % 2 === 1)).size).toBe(1);
  });

  it('kann dieselbe Datei mehrfach hintereinander erweitern', () => {
    let file = buildYdr(drawable());
    for (let i = 0; i < 3; i++) file = addMeshesToYdr(file, [{ mesh: quad(i, i, i + 1, i + 1, 0.5), shader: 0, bone: 0 }]).file;
    expect(readYdr(file).geometries).toHaveLength(4);
  });

  it('weist ungültige Eingaben ab', () => {
    const file = buildYdr(drawable());
    expect(() => addMeshesToYdr(file, [{ mesh: quad(0, 0, 1, 1, 0), shader: 5, bone: 0 }])).toThrow(/Material/);
    expect(() => addMeshesToYdr(file, [{ mesh: { ...quad(0, 0, 1, 1, 0), indices: [0, 1, 9] }, shader: 0, bone: 0 }])).toThrow(/Index/);
    expect(() => addMeshesToYdr(file, [{ mesh: { ...quad(0, 0, 1, 1, 0), indices: [0, 1] }, shader: 0, bone: 0 }])).toThrow(/Dreiecksliste/);
    expect(() => addMeshesToYdr(file, [{ mesh: { positions: new Float32Array(0), normals: new Float32Array(0), indices: [] }, shader: 0, bone: 0 }])).toThrow(/Eckpunkte/);
  });

  it('lehnt eine Datei der falschen Art ab', () => {
    expect(() => addMeshesToYdr(Uint8Array.from([1, 2, 3]), [])).toThrow();
  });
});
