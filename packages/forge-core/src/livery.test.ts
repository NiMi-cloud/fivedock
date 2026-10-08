import { describe, expect, it } from 'vitest';
import type { Yft, YftGeometry } from '@toolkit/rage-formats';
import { analyzeLayout, availableUvSets, buildIslands, buildOutlines, buildUvLayout, liveryScope, pickLayoutGroup, suggestUvSet } from './livery.ts';
import type { LayoutGroup } from './livery.ts';
import type { VehiclePart } from './vehicle.ts';

/** Geometrie aus Rechtecken: je Rechteck (u0, v0, u1, v1) zwei Dreiecke und vier Eckpunkte. */
function quads(rects: number[][], uvSets: number): YftGeometry {
  const uv = new Float32Array(rects.length * 8);
  const indices: number[] = [];
  rects.forEach(([u0, v0, u1, v1], i) => {
    uv.set([u0!, v0!, u1!, v0!, u1!, v1!, u0!, v1!], i * 8);
    const o = i * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const uvs: Array<Float32Array | null> = [];
  for (let s = 0; s < uvSets; s++) uvs.push(uv);
  return {
    shader: 0,
    model: 0,
    vertexCount: rects.length * 4,
    positions: new Float32Array(rects.length * 12),
    normals: null,
    uvs,
    colors: null,
    blendIndices: null,
    blendWeights: null,
    boneIds: new Uint16Array(),
    indices: Uint32Array.from(indices),
  };
}

function vehicle(geometries: YftGeometry[], overlay = true): Yft {
  return {
    name: 'test',
    boundsMin: [0, 0, 0],
    boundsMax: [1, 1, 1],
    bones: [],
    shaders: [
      {
        preset: 'vehicle_paint3',
        presetHash: 0,
        nameHash: 0,
        renderBucket: 0,
        textures: overlay ? [{ param: 'DiffuseSampler2', name: 'test_sign_1' }] : [],
      },
    ],
    geometries,
  } as unknown as Yft;
}

function part(geometry: number, triangleCount: number): VehiclePart {
  return {
    id: `g${geometry}`,
    bone: 'bonnet',
    label: { de: 'Motorhaube', en: 'Hood' },
    category: 'paint',
    geometry,
    shader: 0,
    indices: Uint32Array.from({ length: triangleCount * 3 }, (_, i) => i),
    triangleCount,
    boundsMin: [0, 0, 0],
    boundsMax: [1, 1, 1],
  } as VehiclePart;
}

/** Nimmt die ersten `triangles` Dreiecke der Rechtecke als Teil, passend zu `quads`. */
function groupOf(key: string, geometry: number, rects: number): LayoutGroup {
  const p = part(geometry, rects * 2);
  const indices: number[] = [];
  for (let i = 0; i < rects; i++) indices.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  p.indices = Uint32Array.from(indices);
  return { key, parts: [p] };
}

describe('Livery-UV-Sätze', () => {
  it('findet UV-Sätze und schlägt UV1 vor, wenn der Shader eine zweite Textur hat', () => {
    const yft = vehicle([quads([[0, 0, 0.5, 0.5]], 2)]);
    const groups = [groupOf('a', 0, 1)];
    expect(availableUvSets(yft, groups)).toEqual([0, 1]);
    expect(suggestUvSet(yft, groups)).toBe(1);
  });

  it('bleibt bei UV0, wenn es nur einen Satz gibt', () => {
    const yft = vehicle([quads([[0, 0, 0.5, 0.5]], 1)], false);
    expect(suggestUvSet(yft, [groupOf('a', 0, 1)])).toBe(0);
  });

  it('nimmt ohne zweite Textur trotzdem einen vorhandenen UV1', () => {
    const yft = vehicle([quads([[0, 0, 0.5, 0.5]], 2)], false);
    expect(suggestUvSet(yft, [groupOf('a', 0, 1)])).toBe(1);
  });

  it('listet einen Satz, wenn ihn mindestens eine Geometrie hat, und überspringt die anderen im Blatt', () => {
    const yft = vehicle([quads([[0, 0, 0.5, 0.5]], 1), quads([[0.5, 0.5, 1, 1]], 2)]);
    const groups = [groupOf('a', 0, 1), groupOf('b', 1, 1)];
    expect(availableUvSets(yft, groups)).toEqual([0, 1]);
    const layout = buildUvLayout(yft, groups, 1);
    expect(layout.spans.map((s) => s.key)).toEqual(['b']);
    expect(layout.triangles.length).toBe(12);
  });
});

describe('liveryScope', () => {
  const twoShaders = (): Yft => {
    const yft = vehicle([quads([[0, 0, 0.5, 0.5]], 2), quads([[0.5, 0.5, 1, 1]], 1)]);
    yft.shaders.push({ preset: 'vehicle_paint2', presetHash: 0, nameHash: 0, renderBucket: 0, textures: [{ param: 'DiffuseSampler', name: 'unterboden' }] } as Yft['shaders'][number]);
    return yft;
  };

  it('nimmt nur Teile mit Livery-Ebene und nennt die Textur', () => {
    const yft = twoShaders();
    const withLayer = groupOf('karosserie', 0, 1);
    const underbody = groupOf('unterboden', 1, 1);
    underbody.parts[0]!.shader = 1;
    const scope = liveryScope(yft, [withLayer, underbody]);
    expect(scope.hasLayer).toBe(true);
    expect(scope.groups.map((g) => g.key)).toEqual(['karosserie']);
    expect(scope.textures).toEqual(['test_sign_1']);
  });

  it('trennt gemischte Gruppen: Teile ohne Livery-Ebene fallen heraus', () => {
    const yft = twoShaders();
    const mixed: LayoutGroup = { key: 'haube', parts: [groupOf('x', 0, 1).parts[0]!, { ...groupOf('y', 1, 1).parts[0]!, shader: 1 }] };
    const scope = liveryScope(yft, [mixed]);
    expect(scope.groups).toHaveLength(1);
    expect(scope.groups[0]!.parts).toHaveLength(1);
    expect(scope.groups[0]!.parts[0]!.geometry).toBe(0);
  });

  it('nimmt alle Lack-Gruppen, wenn keine Livery-Ebene da ist', () => {
    const yft = vehicle([quads([[0, 0, 0.5, 0.5]], 1)], false);
    const groups = [groupOf('a', 0, 1)];
    const scope = liveryScope(yft, groups);
    expect(scope.hasLayer).toBe(false);
    expect(scope.groups).toBe(groups);
    expect(scope.textures).toEqual([]);
  });
});

describe('buildUvLayout', () => {
  it('liefert Dreiecke und Grenzen je Gruppe', () => {
    const yft = vehicle([quads([[0.1, 0.2, 0.4, 0.5]], 2), quads([[0.5, 0.5, 0.9, 0.8]], 2)]);
    const layout = buildUvLayout(yft, [groupOf('links', 0, 1), groupOf('rechts', 1, 1)], 1);
    expect(layout.triangles.length).toBe(24);
    expect(layout.spans).toHaveLength(2);
    expect(layout.spans[0]).toMatchObject({ key: 'links', start: 0, count: 2 });
    expect(layout.spans[0]!.min[0]).toBeCloseTo(0.1, 5);
    expect(layout.spans[0]!.max[1]).toBeCloseTo(0.5, 5);
    expect(layout.spans[1]).toMatchObject({ key: 'rechts', start: 2, count: 2 });
    // Erstes Dreieck des ersten Rechtecks: (u0,v0) (u1,v0) (u1,v1)
    expect(Array.from(layout.triangles.slice(0, 6)).map((x) => +x.toFixed(3))).toEqual([0.1, 0.2, 0.4, 0.2, 0.4, 0.5]);
  });
});

describe('analyzeLayout', () => {
  it('misst die belegte Fläche eines Rechtecks', () => {
    const yft = vehicle([quads([[0.25, 0.25, 0.75, 0.75]], 2)]);
    const report = analyzeLayout(buildUvLayout(yft, [groupOf('a', 0, 1)], 1), 256);
    expect(report.coverage).toBeCloseTo(0.25, 2);
    expect(report.overlap).toBe(0);
    expect(report.outside).toBe(0);
    expect(report.pairs).toEqual([]);
  });

  it('erkennt Überlagerung zwischen zwei Gruppen und benennt das Paar', () => {
    const yft = vehicle([quads([[0, 0, 0.5, 0.5]], 2), quads([[0.25, 0.25, 0.75, 0.75]], 2)]);
    const report = analyzeLayout(buildUvLayout(yft, [groupOf('links', 0, 1), groupOf('rechts', 1, 1)], 1), 256);
    // Beide Quadrate 0,25 groß, gemeinsam 0,0625 → 0,0625 / (0,5 − 0,0625) ≈ 14 % der belegten Fläche
    expect(report.overlap).toBeCloseTo(0.0625 / 0.4375, 2);
    expect(report.pairs).toHaveLength(1);
    expect(new Set([report.pairs[0]!.a, report.pairs[0]!.b])).toEqual(new Set(['links', 'rechts']));
    expect(report.pairs[0]!.fraction).toBeCloseTo(report.overlap, 2);
  });

  it('zählt gespiegelte Flächen derselben Gruppe als Überlappung, aber nicht als Paar', () => {
    const yft = vehicle([quads([[0.1, 0.1, 0.4, 0.4], [0.1, 0.1, 0.4, 0.4]], 2)]);
    const report = analyzeLayout(buildUvLayout(yft, [groupOf('tuer', 0, 2)], 1), 256);
    expect(report.overlap).toBeCloseTo(1, 2);
    expect(report.pairs).toEqual([]);
  });

  it('zählt Dreiecke außerhalb des Blatts und Dreiecke ohne Fläche', () => {
    const yft = vehicle([quads([[0.5, 0.5, 1.2, 0.9]], 2)]);
    const geo = yft.geometries[0]!;
    geo.uvs[1] = Float32Array.from([0.5, 0.5, 1.2, 0.5, 1.2, 0.9, 0.5, 0.9, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3]);
    geo.indices = Uint32Array.from([0, 1, 2, 0, 2, 3, 4, 5, 6]);
    const p = part(0, 3);
    p.indices = geo.indices;
    const report = analyzeLayout(buildUvLayout(yft, [{ key: 'a', parts: [p] }], 1), 128);
    expect(report.outside).toBe(2);
    expect(report.degenerate).toBe(1);
    expect(report.triangles).toBe(2);
  });
});

describe('buildOutlines', () => {
  it('liefert für ein Rechteck nur die vier Außenkanten ohne Diagonale', () => {
    const yft = vehicle([quads([[0.1, 0.1, 0.4, 0.4]], 2)]);
    const outlines = buildOutlines(buildUvLayout(yft, [groupOf('a', 0, 1)], 1));
    expect(outlines).toHaveLength(1);
    expect(outlines[0]!.edges.length / 4).toBe(4);
  });

  it('lässt Kanten weg, die zwei Rechtecke einer Gruppe teilen', () => {
    // Zwei Rechtecke nebeneinander: 4 + 4 − 2 gemeinsame Kanten = 6 Außenkanten (die gemeinsame Seite fällt weg)
    const yft = vehicle([quads([[0, 0, 0.2, 0.2], [0.2, 0, 0.4, 0.2]], 2)]);
    const outlines = buildOutlines(buildUvLayout(yft, [groupOf('a', 0, 2)], 1));
    expect(outlines[0]!.edges.length / 4).toBe(6);
  });
});

describe('pickLayoutGroup', () => {
  it('findet die Gruppe unter einem Punkt, auch bei Dreiecken beider Umlaufrichtungen', () => {
    const yft = vehicle([quads([[0.1, 0.1, 0.4, 0.4]], 2), quads([[0.6, 0.6, 0.9, 0.9]], 2)]);
    const layout = buildUvLayout(yft, [groupOf('links', 0, 1), groupOf('rechts', 1, 1)], 1);
    expect(pickLayoutGroup(layout, 0.2, 0.3)).toBe('links');
    expect(pickLayoutGroup(layout, 0.35, 0.15)).toBe('links');
    expect(pickLayoutGroup(layout, 0.8, 0.7)).toBe('rechts');
    expect(pickLayoutGroup(layout, 0.5, 0.5)).toBeNull();
    expect(pickLayoutGroup(layout, 1.5, 0.5)).toBeNull();
  });

  it('gibt bei Überlagerung die zuletzt gezeichnete Gruppe zurück', () => {
    const yft = vehicle([quads([[0, 0, 0.5, 0.5]], 2), quads([[0.25, 0.25, 0.75, 0.75]], 2)]);
    const layout = buildUvLayout(yft, [groupOf('unten', 0, 1), groupOf('oben', 1, 1)], 1);
    expect(pickLayoutGroup(layout, 0.3, 0.3)).toBe('oben');
    expect(pickLayoutGroup(layout, 0.1, 0.1)).toBe('unten');
  });
});

describe('Nadel-Dreiecke', () => {
  it('lässt Striche und Punkte aus dem Blatt weg und zählt sie', () => {
    const yft = vehicle([quads([[0.1, 0.1, 0.4, 0.4]], 2)]);
    const geo = yft.geometries[0]!;
    // Zusätzlicher Eckpunkt weit weg, der mit zwei Ecken des Rechtecks einen sehr dünnen Strich bildet
    geo.uvs[1] = Float32Array.from([...geo.uvs[1]!, 0.95, 0.1001]);
    geo.indices = Uint32Array.from([...geo.indices, 0, 1, 4]);
    const p = part(0, 3);
    p.indices = geo.indices;
    const layout = buildUvLayout(yft, [{ key: 'a', parts: [p] }], 1);
    expect(layout.dropped).toBe(1);
    expect(layout.triangles.length / 6).toBe(2);
    expect(layout.spans[0]!.count).toBe(2);
    expect(layout.spans[0]!.max[0]).toBeCloseTo(0.4, 5);
  });
});

describe('buildIslands', () => {
  it('trennt zwei Flächen einer Gruppe und gibt Schwerpunkt und Grenzen an', () => {
    const yft = vehicle([quads([[0.1, 0.1, 0.3, 0.3], [0.6, 0.5, 0.9, 0.7]], 2)]);
    const islands = buildIslands(buildUvLayout(yft, [groupOf('karosserie', 0, 2)], 1));
    expect(islands).toHaveLength(2);
    const sorted = [...islands].sort((a, b) => a.min[0] - b.min[0]);
    expect(sorted[0]!.centroid[0]).toBeCloseTo(0.2, 3);
    expect(sorted[0]!.centroid[1]).toBeCloseTo(0.2, 3);
    expect(sorted[0]!.area).toBeCloseTo(0.04, 4);
    expect(sorted[1]!.min[0]).toBeCloseTo(0.6, 5);
    expect(sorted[1]!.max[1]).toBeCloseTo(0.7, 5);
    expect(sorted[1]!.triangles).toBe(2);
    expect(islands.every((i) => i.key === 'karosserie')).toBe(true);
  });

  it('verbindet Dreiecke, die einen Eckpunkt teilen, auch über Geometrie-Grenzen der Gruppe', () => {
    // Zwei Rechtecke, die sich an der Kante berühren: eine Fläche
    const yft = vehicle([quads([[0, 0, 0.2, 0.2], [0.2, 0, 0.4, 0.2]], 2)]);
    expect(buildIslands(buildUvLayout(yft, [groupOf('a', 0, 2)], 1))).toHaveLength(1);
  });
});

describe('Eigenüberlagerung je Gruppe', () => {
  it('nennt Gruppen mit viel Mehrfachbelegung und lässt saubere Gruppen weg', () => {
    const yft = vehicle([quads([[0.1, 0.1, 0.4, 0.4], [0.1, 0.1, 0.4, 0.4]], 2), quads([[0.6, 0.6, 0.9, 0.9]], 2)]);
    const report = analyzeLayout(buildUvLayout(yft, [groupOf('doppelt', 0, 2), groupOf('sauber', 1, 1)], 1), 256);
    expect(report.selfOverlaps.map((g) => g.key)).toEqual(['doppelt']);
    expect(report.selfOverlaps[0]!.overlap).toBeGreaterThan(0.95);
    expect(report.selfOverlaps[0]!.coverage).toBeCloseTo(0.09, 2);
  });
});

describe('Sichtbarkeit von Dreiecken', () => {
  /** Ein Dreieck aus drei UV-Punkten in einer Geometrie, ein Teil, ein UV1-Satz. */
  const single = (uv: number[]) => {
    const yft = vehicle([quads([[0, 0, 0.1, 0.1]], 2)]);
    yft.geometries[0]!.uvs[1] = Float32Array.from(uv);
    const p = part(0, 1);
    p.indices = Uint32Array.from([0, 1, 2]);
    return buildUvLayout(yft, [{ key: 'a', parts: [p] }], 1);
  };

  it('behält ein dünnes, aber kurzes Dreieck', () => {
    const layout = single([0.2, 0.2, 0.25, 0.2, 0.25, 0.2005]);
    expect(layout.dropped).toBe(0);
    expect(layout.triangles.length / 6).toBe(1);
  });

  it('wirft ein langes, extrem dünnes Dreieck weg, das nur einen Strich quer über das Blatt zeigt', () => {
    const layout = single([0, 0, 0.6, 0.6, 0.6003, 0.6]);
    expect(layout.dropped).toBe(1);
    expect(layout.spans).toEqual([]);
  });

  it('wirft ein auf eine Linie zusammengezogenes Dreieck weg', () => {
    const layout = single([0.1, 0.1, 0.2, 0.1, 0.3, 0.1]);
    expect(layout.dropped).toBe(1);
  });
});
