import type { Yft, YftGeometry } from '@toolkit/rage-formats';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIGHTBAR, LIGHTBAR_LIMITS, buildLightbar, freeSirenNumbers, lightbarBones, roofHeight, suggestLightbarMaterials, suggestRoofPosition } from './lightbar.ts';
import type { LightbarSpec } from './lightbar.ts';
import { buildVehicleParts } from './vehicle.ts';

const spec = (extra: Partial<LightbarSpec> = {}): LightbarSpec => ({ ...DEFAULT_LIGHTBAR, position: [0, -0.2, 1.21], ...extra });

function geometry(shader: number, positions: number[], indices: number[], bone = 0): YftGeometry {
  const count = positions.length / 3;
  const weights = new Uint8Array(count * 4);
  const blend = new Uint8Array(count * 4);
  for (let v = 0; v < count; v++) {
    weights[v * 4] = 255;
    blend[v * 4] = bone;
  }
  return {
    shader,
    model: 0,
    vertexCount: count,
    positions: Float32Array.from(positions),
    normals: new Float32Array(count * 3).fill(0.577),
    uvs: [new Float32Array(count * 2)],
    colors: null,
    blendIndices: blend,
    blendWeights: weights,
    boneIds: new Uint16Array(0),
    indices: Uint32Array.from(indices),
  };
}

function car(): Yft {
  const roof = geometry(0, [-0.5, -1, 1.2, 0.5, -1, 1.2, 0.5, 0.2, 1.2, -0.5, 0.2, 1.2, 0, 0, 1.45], [0, 1, 2, 0, 2, 3, 0, 1, 4]);
  const siren = geometry(2, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2], 3);
  const plastic = geometry(1, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
  return {
    name: 'testcar',
    boundsMin: [-1, -2, 0],
    boundsMax: [1, 2, 1.5],
    bones: [
      { index: 0, name: 'chassis', tag: 0, parent: -1, position: [0, 0, 0] },
      { index: 1, name: 'siren1', tag: 1, parent: 0, position: [0, 0, 1] },
      { index: 2, name: 'siren3', tag: 2, parent: 0, position: [0, 0, 1] },
      { index: 3, name: 'siren2', tag: 3, parent: 0, position: [0, 0, 1] },
    ],
    shaders: [
      { preset: 'vehicle_paint3', presetHash: 0, nameHash: 0, renderBucket: 0, textures: [] },
      { preset: 'vehicle_mesh', presetHash: 0, nameHash: 0, renderBucket: 0, textures: [{ param: 'DiffuseSampler', name: 'black' }] },
      { preset: 'vehicle_lightsemissive', presetHash: 0, nameHash: 0, renderBucket: 1, textures: [{ param: 'DiffuseSampler', name: 'siren_emis' }] },
      { preset: 'vehicle_mesh', presetHash: 0, nameHash: 0, renderBucket: 0, textures: [{ param: 'DiffuseSampler', name: 'fpiu_chrome' }] },
    ],
    geometries: [roof, plastic, siren],
  };
}

describe('buildLightbar', () => {
  const build = buildLightbar(spec());

  it('baut Gehäuse und Linsen als gültige Netze', () => {
    for (const mesh of [build.housing, build.lens]) {
      const count = mesh.positions.length / 3;
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(65536);
      expect(mesh.normals.length).toBe(mesh.positions.length);
      expect(mesh.indices.length % 3).toBe(0);
      for (const i of Array.from(mesh.indices)) expect(i).toBeLessThan(count);
    }
  });

  it('die Dreiecke laufen gegen den Uhrzeigersinn und stimmen mit der Normalen überein (wie in den Spieldateien)', () => {
    for (const mesh of [build.housing, build.lens]) {
      for (let t = 0; t < mesh.indices.length / 3; t++) {
        const [a, b, c] = [mesh.indices[t * 3]!, mesh.indices[t * 3 + 1]!, mesh.indices[t * 3 + 2]!];
        const p = (i: number) => [mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!, mesh.positions[i * 3 + 2]!];
        const [pa, pb, pc] = [p(a), p(b), p(c)];
        const u = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!];
        const v = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!];
        const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
        const stored = [0, 1, 2].map((k) => mesh.normals[a * 3 + k]!);
        expect(n[0]! * stored[0]! + n[1]! * stored[1]! + n[2]! * stored[2]!).toBeGreaterThan(0);
        expect(Math.hypot(...stored)).toBeCloseTo(1, 4);
      }
    }
  });

  it('alles liegt in den gemeldeten Grenzen, und die Grenzen entsprechen den Maßen', () => {
    for (const mesh of [build.housing, build.lens]) {
      for (let i = 0; i < mesh.positions.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          expect(mesh.positions[i + k]!).toBeGreaterThanOrEqual(build.boundsMin[k]! - 1e-5);
          expect(mesh.positions[i + k]!).toBeLessThanOrEqual(build.boundsMax[k]! + 1e-5);
        }
      }
    }
    expect(build.boundsMax[0] - build.boundsMin[0]).toBeCloseTo(1.1);
    expect(build.boundsMax[1] - build.boundsMin[1]).toBeCloseTo(0.3);
    expect(build.boundsMin[2]).toBeCloseTo(1.21);
    expect(build.boundsMax[2] - build.boundsMin[2]).toBeCloseTo(0.1);
  });

  it('liefert ein Licht je Modul von links nach rechts, mittig über dem Gehäuse', () => {
    expect(build.lights).toHaveLength(6);
    const xs = build.lights.map((l) => l[0]);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(xs[0]! + xs[5]!).toBeCloseTo(0, 5);
    for (const light of build.lights) {
      expect(light[1]).toBeCloseTo(-0.2);
      expect(light[2]).toBeGreaterThan(1.21);
      expect(light[2]).toBeLessThan(1.31);
    }
  });

  it('hält Maße und Modulzahl in den Grenzen und kennt beide Stile', () => {
    expect(buildLightbar(spec({ modules: 0 })).lights).toHaveLength(LIGHTBAR_LIMITS.modules[0]);
    expect(buildLightbar(spec({ modules: 99 })).lights).toHaveLength(LIGHTBAR_LIMITS.modules[1]);
    const dome = buildLightbar(spec({ style: 'dome' }));
    const flat = buildLightbar(spec({ style: 'flat' }));
    expect(dome.lens.positions.length).toBe(flat.lens.positions.length);
    expect(Array.from(dome.lens.positions)).not.toEqual(Array.from(flat.lens.positions));
    expect(buildLightbar(spec({ feet: false })).housing.positions.length).toBeLessThan(buildLightbar(spec({ feet: true })).housing.positions.length);
  });
});

describe('roofHeight', () => {
  const yft = car();
  const { parts } = buildVehicleParts(yft);

  it('nimmt die Höhe der Lackfläche an der Stelle', () => {
    expect(roofHeight(yft, parts, -0.4, -0.5, 0.05, 0.05)).toBeCloseTo(1.2, 4);
  });

  it('fällt ohne Fläche an der Stelle auf die höchste Lackfläche zurück', () => {
    expect(roofHeight(yft, parts, 5, 5, 0.1, 0.1)).toBeCloseTo(1.45, 4);
  });

  it('liefert null ohne Lackteile', () => {
    expect(roofHeight(yft, [], 0, 0, 1, 1)).toBeNull();
  });
});

describe('suggestLightbarMaterials', () => {
  it('nimmt für das Gehäuse das schwarze Kunststoffmaterial und für die Linse das der Sirenen', () => {
    const yft = car();
    const { parts } = buildVehicleParts(yft);
    expect(suggestLightbarMaterials(yft, parts)).toEqual({ housing: 1, lens: 2 });
  });

  it('bevorzugt unter schwarzen Materialien das mit glatter Normalen-Textur', () => {
    const yft = car();
    yft.shaders[1] = { ...yft.shaders[1]!, textures: [{ param: 'DiffuseSampler', name: 'black' }, { param: 'BumpSampler', name: 'ridges_nrml' }] };
    yft.shaders[3] = { ...yft.shaders[3]!, textures: [{ param: 'DiffuseSampler', name: 'black' }, { param: 'BumpSampler', name: 'blank_normal' }] };
    yft.geometries.push(geometry(3, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]));
    expect(suggestLightbarMaterials(yft, buildVehicleParts(yft).parts).housing).toBe(3);
  });

  it('meldet fehlende Materialien als null', () => {
    const yft = car();
    yft.geometries = [yft.geometries[0]!];
    yft.shaders = [yft.shaders[0]!];
    expect(suggestLightbarMaterials(yft, buildVehicleParts(yft).parts)).toEqual({ housing: null, lens: null });
  });
});

describe('Knochen für den Lichtbalken', () => {
  it('findet freie Sirenen-Nummern', () => {
    expect(freeSirenNumbers(['chassis', 'siren1', 'siren3'], 3)).toEqual([2, 4, 5]);
    expect(freeSirenNumbers([], 25)).toHaveLength(20);
  });

  it('legt Balken- und Sirenen-Knochen mit Lage relativ zum Elternknochen an', () => {
    const yft = car();
    const s = spec();
    const build = buildLightbar(s);
    const result = lightbarBones(yft, build, s);
    expect(result.barBone).toBe(4);
    expect(result.sirens).toEqual([4, 5, 6, 7, 8, 9]);
    expect(result.bones).toHaveLength(7);
    expect(result.bones[0]).toEqual({ name: 'forge_lightbar', parent: 0, translation: [0, -0.2, 1.21] });
    expect(result.bones[1]!.name).toBe('siren4');
    expect(result.bones[1]!.parent).toBe(4);
    // Lage des Lichts = Balken + eigene Lage
    const light = build.lights[0]!;
    expect(result.bones[1]!.translation[0]).toBeCloseTo(light[0]);
    expect(result.bones[1]!.translation[2]).toBeCloseTo(light[2] - 1.21);
  });

  it('rechnet die Lage zum Elternknochen um, wenn dieser nicht im Ursprung liegt', () => {
    const yft = car();
    const s = spec();
    const result = lightbarBones(yft, buildLightbar(s), s, { parentBone: 1 });
    // Knochen 1 liegt bei (0, 0, 1)
    expect(result.bones[0]!.translation[0]).toBe(0);
    expect(result.bones[0]!.translation[1]).toBeCloseTo(-0.2);
    expect(result.bones[0]!.translation[2]).toBeCloseTo(0.21);
  });

  it('ohne Sirenen entstehen keine neuen Knochen, das Gehäuse hängt am Elternknochen', () => {
    const yft = car();
    const s = spec();
    expect(lightbarBones(yft, buildLightbar(s), s, { withSirens: false, parentBone: 2 })).toEqual({ bones: [], sirens: [], barBone: 2 });
  });

  it('berücksichtigt schon geplante Knochen und Sirenen-Nummern', () => {
    const yft = car();
    const s = spec({ modules: 2 });
    const result = lightbarBones(yft, buildLightbar(s), s, { firstIndex: 9, takenSirens: [4, 5], name: 'forge_lightbar2' });
    expect(result.barBone).toBe(9);
    expect(result.sirens).toEqual([6, 7]);
    expect(result.bones.map((b) => [b.name, b.parent])).toEqual([['forge_lightbar2', 0], ['siren6', 9], ['siren7', 9]]);
  });

  it('meldet, wenn nicht genug Sirenen-Nummern frei sind', () => {
    const yft = car();
    yft.bones.push(...Array.from({ length: 17 }, (_, i) => ({ index: 4 + i, name: `siren${i + 4}`, tag: 0, parent: 0, position: [0, 0, 0] as [number, number, number] })));
    const s = spec();
    expect(() => lightbarBones(yft, buildLightbar(s), s)).toThrow(/Sirenen-Nummern/);
  });
});

describe('suggestRoofPosition', () => {
  it('liegt mittig auf dem Dach in der Höhe der Lackfläche', () => {
    const yft = car();
    const { parts } = buildVehicleParts(yft);
    const pos = suggestRoofPosition(yft, parts, { length: 1.1, depth: 0.3 });
    expect(pos).not.toBeNull();
    expect(pos![0]).toBe(0);
    expect(pos![2]).toBeGreaterThanOrEqual(1.2 - 1e-4);
    expect(pos![2]).toBeLessThanOrEqual(1.45 + 1e-4);
  });

  it('ohne Lackteile gibt es keinen Vorschlag', () => {
    expect(suggestRoofPosition(car(), [], { length: 1, depth: 0.3 })).toBeNull();
  });
});
