import { describe, expect, it } from 'vitest';
import type { Yft, YftGeometry } from '@toolkit/rage-formats';
import { boneLabel, buildVehicleParts, groupPartsByBone } from './vehicle.ts';

/** Geometrie aus Dreiecken; `bones` gibt je Eckpunkt den Knochen an (Gewicht 255 auf dem ersten Eintrag). */
function geometry(shader: number, triangles: number[][], bones: number[], boneIds: number[] = []): YftGeometry {
  const vertexCount = bones.length;
  const positions = new Float32Array(vertexCount * 3);
  for (let v = 0; v < vertexCount; v++) positions.set([v, bones[v]!, 0], v * 3);
  const blendIndices = new Uint8Array(vertexCount * 4);
  const blendWeights = new Uint8Array(vertexCount * 4);
  bones.forEach((b, v) => {
    blendIndices[v * 4] = boneIds.length > 0 ? boneIds.indexOf(b) : b;
    blendWeights[v * 4] = 255;
  });
  return {
    shader,
    model: 0,
    vertexCount,
    positions,
    normals: null,
    uvs: [],
    colors: null,
    blendIndices,
    blendWeights,
    boneIds: Uint16Array.from(boneIds),
    indices: Uint32Array.from(triangles.flat()),
  };
}

function vehicle(geometries: YftGeometry[]): Yft {
  const bone = (index: number, name: string) => ({ index, name, tag: index, parent: index === 0 ? -1 : 0, position: [0, 0, 0] as [number, number, number] });
  const shader = (preset: string) => ({ preset, presetHash: 0, nameHash: 0, renderBucket: 0, textures: [] });
  return {
    name: 'test',
    boundsMin: [0, 0, 0],
    boundsMax: [1, 1, 1],
    bones: [bone(0, 'chassis'), bone(1, 'bonnet'), bone(2, 'door_dside_f')],
    shaders: [shader('vehicle_paint3'), shader('vehicle_vehglass'), shader('vehicle_tire'), shader('vehicle_mesh')],
    geometries,
  };
}

describe('buildVehicleParts', () => {
  it('teilt eine Geometrie nach Knochen in Teile', () => {
    // Zwei Dreiecke folgen Knochen 1 (Haube), eines Knochen 2 (Tür)
    const g = geometry(0, [[0, 1, 2], [1, 2, 3], [4, 5, 6]], [1, 1, 1, 1, 2, 2, 2]);
    const { parts, counts } = buildVehicleParts(vehicle([g]));
    expect(parts).toHaveLength(2);
    const bonnet = parts.find((p) => p.bone === 'bonnet')!;
    expect(bonnet.triangleCount).toBe(2);
    expect(bonnet.category).toBe('paint');
    expect(bonnet.label.de).toBe('Motorhaube');
    expect(parts.find((p) => p.bone === 'door_dside_f')!.triangleCount).toBe(1);
    expect(counts.paint).toBe(2);
  });

  it('nimmt für Dreiecke mit gemischten Knochen die Mehrheit', () => {
    const g = geometry(0, [[0, 1, 2]], [1, 2, 2]);
    const { parts } = buildVehicleParts(vehicle([g]));
    expect(parts.map((p) => p.bone)).toEqual(['door_dside_f']);
  });

  it('übersetzt Blend-Indizes über die Knochenliste der Geometrie', () => {
    // Indizes 0 und 1 der Geometrie stehen für die Knochen 2 und 1
    const g = geometry(0, [[0, 0, 0], [1, 1, 1]], [2, 1], [2, 1]);
    const { parts } = buildVehicleParts(vehicle([g]));
    expect(parts.map((p) => p.bone).sort()).toEqual(['bonnet', 'door_dside_f']);
  });

  it('ordnet Materialien Kategorien zu und sortiert nach Kategorie und Größe', () => {
    const geometries = [
      geometry(3, [[0, 1, 2]], [0, 0, 0]), // sonstiges
      geometry(1, [[0, 1, 2]], [0, 0, 0]), // Glas
      geometry(0, [[0, 1, 2], [0, 1, 2]], [0, 0, 0]), // Lack, größer
      geometry(2, [[0, 1, 2]], [0, 0, 0]), // Reifen
    ];
    const { parts } = buildVehicleParts(vehicle(geometries));
    expect(parts.map((p) => p.category)).toEqual(['paint', 'glass', 'tire', 'other']);
  });

  it('berechnet die Begrenzung jedes Teils', () => {
    const g = geometry(0, [[0, 1, 2]], [1, 1, 1]);
    const p = buildVehicleParts(vehicle([g])).parts[0]!;
    expect(p.boundsMin).toEqual([0, 1, 0]);
    expect(p.boundsMax).toEqual([2, 1, 0]);
  });

  it('Fahrzeuge ohne Skinning gehören dem Fahrgestell', () => {
    const g = geometry(0, [[0, 1, 2]], [0, 0, 0]);
    g.blendIndices = null;
    g.blendWeights = null;
    expect(buildVehicleParts(vehicle([g])).parts[0]!.bone).toBe('chassis');
  });
});

describe('groupPartsByBone', () => {
  it('fasst mehrere Geometrien desselben Knochens zusammen', () => {
    const geometries = [geometry(0, [[0, 1, 2]], [1, 1, 1]), geometry(0, [[0, 1, 2], [0, 1, 2]], [1, 1, 1])];
    const groups = groupPartsByBone(buildVehicleParts(vehicle(geometries)).parts);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ bone: 'bonnet', triangleCount: 3 });
    expect(groups[0]!.parts).toHaveLength(2);
  });
});

describe('boneLabel', () => {
  it('kennt Standardknochen und zeigt unbekannte unverändert', () => {
    expect(boneLabel('door_pside_r').en).toBe('Rear right door');
    expect(boneLabel('misc_cone')).toEqual({ de: 'misc_cone', en: 'misc_cone' });
  });
});
