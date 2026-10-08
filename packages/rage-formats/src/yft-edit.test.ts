import { describe, expect, it } from 'vitest';
import { editYft } from './drawable-edit.ts';
import { Memory } from './memory.ts';
import { GRAPHICS_BASE, SYSTEM_BASE, decodePageFlags, parseResource } from './rsc7.ts';
import { FIXTURE_TRIANGLE, buildTestYft } from './yft-fixture.ts';
import { readYft } from './yft.ts';

/** Ein Quadrat bei z = 0.9 mit Seitenlänge 0.2 um (x, y). */
function square(x: number, y: number) {
  const h = 0.1;
  return {
    positions: new Float32Array([x - h, y - h, 0.9, x + h, y - h, 0.9, x + h, y + h, 0.9, x - h, y + h, 0.9]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: [0, 1, 2, 0, 2, 3],
  };
}

/** Geometrien und Modelle je Detailstufe, gelesen über die Zeiger der Datei. */
function lists(file: Uint8Array) {
  const res = parseResource(file);
  const mem = new Memory(res.system, res.graphics);
  const drawable = mem.ptr(SYSTEM_BASE + 0x30);
  const out: Array<{ lod: number; models: Array<{ address: number; count: number; binding: number; shaders: number[]; geometries: number[]; bounds: number[] }> }> = [];
  for (let lod = 0; lod < 4; lod++) {
    const list = mem.ptr(drawable + 0x50 + lod * 8);
    if (!list) continue;
    const array = mem.ptr(list);
    const models = [];
    for (let m = 0; m < mem.u16(list + 8); m++) {
      const address = mem.ptr(array + m * 8);
      const count = mem.u16(address + 0x10);
      const geometryArray = mem.ptr(address + 8);
      const shaderMap = mem.ptr(address + 0x20);
      const bounds = mem.ptr(address + 0x18);
      models.push({
        address,
        count,
        binding: mem.u32(address + 0x28),
        shaders: Array.from({ length: count }, (_, g) => mem.u16(shaderMap + g * 2)),
        geometries: Array.from({ length: count }, (_, g) => mem.ptr(geometryArray + g * 8)),
        bounds: Array.from({ length: (count + 1) * 8 }, (_, k) => mem.f32(bounds + k * 4)),
      });
    }
    out.push({ lod, models });
  }
  return { mem, drawable, lods: out, res };
}

describe('Testdatei', () => {
  it('lässt sich lesen', () => {
    const yft = readYft(buildTestYft());
    expect(yft.bones.map((b) => b.name)).toEqual(['chassis', 'door_dside_f', 'siren1']);
    expect(yft.shaders.map((s) => s.preset)).toEqual(['vehicle_mesh', 'vehicle_lightsemissive']);
    expect(yft.geometries).toHaveLength(1);
    expect(Array.from(yft.geometries[0]!.positions)).toEqual(Array.from(Float32Array.from(FIXTURE_TRIANGLE)));
  });
});

describe('editYft: Teile', () => {
  it('fügt ein Teil in beide Detailstufen ein und lässt die vorhandene Geometrie unverändert', () => {
    const file = buildTestYft();
    const before = readYft(file);
    const result = editYft(file, { meshes: [{ mesh: square(0.2, 0.2), shader: 0, bone: 1 }], lods: [0, 1] });
    expect(result.added).toBe(1);
    expect(result.lods).toEqual([0, 1]);

    const after = readYft(result.file);
    expect(after.geometries).toHaveLength(2);
    expect(Array.from(after.geometries[0]!.positions)).toEqual(Array.from(before.geometries[0]!.positions));
    const added = after.geometries[1]!;
    expect(added.shader).toBe(0);
    expect(added.vertexCount).toBe(4);
    expect(Array.from(added.indices)).toEqual([0, 1, 2, 0, 2, 3]);
    expect(Array.from(added.positions.subarray(0, 3))).toEqual([expect.closeTo(0.1, 5), expect.closeTo(0.1, 5), expect.closeTo(0.9, 5)]);

    const l = lists(result.file);
    for (const lod of l.lods) {
      expect(lod.models[0]!.count).toBe(2);
      expect(lod.models[0]!.shaders).toEqual([0, 0]);
    }
    // beide Detailstufen teilen sich die neue Geometrie
    expect(l.lods[0]!.models[0]!.geometries[1]).toBe(l.lods[1]!.models[0]!.geometries[1]);
  });

  it('übernimmt Aufbau, Farbe und Texturkoordinate der Vorlage und bindet die Eckpunkte an den Knochen', () => {
    const result = editYft(buildTestYft(), { meshes: [{ mesh: square(0, 0), shader: 0, bone: 2 }] });
    const added = readYft(result.file).geometries[1]!;
    expect(Array.from(added.colors!.subarray(0, 4))).toEqual([255, 254, 131, 255]);
    expect(Array.from(added.uvs[0]!.subarray(0, 4))).toEqual([0.25, 0.75, 0.25, 0.75]);
    expect(Array.from(added.blendWeights!.subarray(0, 4))).toEqual([0, 0, 255, 0]);
    expect(Array.from(added.blendIndices!.subarray(0, 4))).toEqual([0, 0, 2, 0]);
    expect(added.boneIds).toHaveLength(3);
    // Normalen unverändert
    expect(Array.from(added.normals!.subarray(0, 3))).toEqual([0, 0, 1]);
  });

  it('legt die neuen Eckpunkt- und Indexdaten in den Grafikspeicher, wenn die Vorlage sie dort hat', () => {
    const file = buildTestYft({ graphicsData: true });
    const before = parseResource(file);
    const after = parseResource(editYft(file, { meshes: [{ mesh: square(0, 0), shader: 0, bone: 1 }] }).file);
    expect(after.graphics.length).toBeGreaterThan(before.graphics.length);
    // der alte Grafikspeicher bleibt Byte für Byte
    expect(Array.from(after.graphics.subarray(0, before.graphics.length))).toEqual(Array.from(before.graphics));
    expect(decodePageFlags(after.graphicsFlags).totalSize).toBe(after.graphics.length);
  });

  it('legt sie in den Systemspeicher, wenn die Vorlage sie dort hat (wie im Testfahrzeug)', () => {
    const file = buildTestYft({ graphicsData: false });
    const before = parseResource(file);
    expect(before.graphics.length).toBe(0);
    const after = parseResource(editYft(file, { meshes: [{ mesh: square(0, 0), shader: 0, bone: 1 }] }).file);
    expect(after.graphics.length).toBe(0);
    expect(after.system.length).toBeGreaterThan(before.system.length);
  });

  it('erweitert die Grenzen der Geometrie und der Datei', () => {
    const file = buildTestYft();
    const result = editYft(file, { meshes: [{ mesh: square(2, 3), shader: 0, bone: 1 }] });
    const yft = readYft(result.file);
    expect(yft.boundsMax[0]).toBeGreaterThanOrEqual(2.1 - 1e-5);
    expect(yft.boundsMax[1]).toBeGreaterThanOrEqual(3.1 - 1e-5);
    const l = lists(result.file);
    const model = l.lods[0]!.models[0]!;
    // Gesamtbox vorn, danach je Geometrie eine Box
    expect(model.bounds[4]).toBeCloseTo(2.1, 4); // max.x der Gesamtbox
    expect(model.bounds[8 + 4]).toBeCloseTo(0.4, 4); // max.x der alten Geometrie
    expect(model.bounds[16 + 4]).toBeCloseTo(2.1, 4); // max.x der neuen
  });

  it('ohne Vorlage für das Material gibt es eine verständliche Meldung', () => {
    expect(() => editYft(buildTestYft(), { meshes: [{ mesh: square(0, 0), shader: 1, bone: 1 }] })).toThrow(/benutzt dieses Material/);
    expect(() => editYft(buildTestYft(), { meshes: [{ mesh: square(0, 0), shader: 7, bone: 1 }] })).toThrow(/Material 7/);
  });

  it('weist Knochen außerhalb des Skeletts ab', () => {
    expect(() => editYft(buildTestYft(), { meshes: [{ mesh: square(0, 0), shader: 0, bone: 9 }] })).toThrow(/Knochen 9/);
  });

  it('die bearbeitete Datei lässt sich erneut bearbeiten', () => {
    let file = buildTestYft();
    for (let i = 0; i < 4; i++) file = editYft(file, { meshes: [{ mesh: square(i * 0.3, 0), shader: 0, bone: 1 }] }).file;
    const yft = readYft(file);
    expect(yft.geometries).toHaveLength(5);
    expect(Array.from(yft.geometries[4]!.positions.subarray(0, 3))[0]).toBeCloseTo(0.9 - 0.1, 4);
  });
});

describe('editYft: Knochen', () => {
  const plan = {
    bones: [
      { name: 'forge_lightbar', parent: 0, translation: [0, 0.2, 1] as [number, number, number] },
      { name: 'siren2', parent: 3, translation: [0.2, 0, 0.1] as [number, number, number] },
    ],
    meshes: [{ mesh: square(0, 0), shader: 0, bone: 3 }],
  };

  it('legt Knochen an und bindet ein Teil an einen davon', () => {
    const result = editYft(buildTestYft(), plan);
    expect(result.boneIndices).toEqual([3, 4]);
    expect(result.boneCount).toBe(5);
    const yft = readYft(result.file);
    expect(yft.bones.map((b) => b.name)).toEqual(['chassis', 'door_dside_f', 'siren1', 'forge_lightbar', 'siren2']);
    const added = yft.geometries[1]!;
    expect(Array.from(added.blendIndices!.subarray(0, 4))).toEqual([0, 0, 3, 0]);
    // Palette bis zum neuen Knochen verlängert, Nummer = Knochen
    expect(Array.from(added.boneIds)).toEqual([0, 1, 2, 3]);
  });

  it('zieht die Knochenzahl in der Bindung aller Modelle mit', () => {
    const result = editYft(buildTestYft(), plan);
    for (const lod of lists(result.file).lods) {
      const binding = lod.models[0]!.binding;
      expect(binding & 0xff).toBe(5);
      expect((binding >>> 8) & 0xff).toBe(1); // Skinning-Kennzeichen bleibt
    }
  });

  it('erweitert die Knochen-Matrizen des Fragments um Einheitsmatrizen', () => {
    const result = editYft(buildTestYft(), plan);
    const res = parseResource(result.file);
    const mem = new Memory(res.system, res.graphics);
    const at = mem.ptr(SYSTEM_BASE + 0xa8);
    expect(mem.u8(at + 0x10)).toBe(5);
    expect(mem.u8(at + 0x11)).toBe(5);
    for (let i = 0; i < 5; i++) {
      const row = Array.from({ length: 12 }, (_, k) => mem.f32(at + 32 + i * 48 + k * 4));
      expect(row).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
    }
  });

  it('ohne Knochen-Matrizen im Fragment bleibt alles andere gleich', () => {
    const result = editYft(buildTestYft({ boneTransforms: false }), plan);
    expect(readYft(result.file).bones).toHaveLength(5);
  });

  it('nur Knochen, ohne Teile', () => {
    const result = editYft(buildTestYft(), { bones: plan.bones });
    expect(result.added).toBe(0);
    expect(readYft(result.file).bones).toHaveLength(5);
    expect(lists(result.file).lods[0]!.models[0]!.binding & 0xff).toBe(5);
  });

  it('Flags und Seitenzahl stimmen mit der Größe der Daten überein', () => {
    const res = parseResource(editYft(buildTestYft(), plan).file);
    expect(decodePageFlags(res.systemFlags).totalSize).toBe(res.system.length);
    expect(decodePageFlags(res.graphicsFlags).totalSize).toBe(res.graphics.length);
    void GRAPHICS_BASE;
  });
});
