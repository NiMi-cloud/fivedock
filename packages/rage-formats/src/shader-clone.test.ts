import { describe, expect, it } from 'vitest';
import { editYft } from './drawable-edit.ts';
import { joaat } from './jenkins.ts';
import { Memory } from './memory.ts';
import { SYSTEM_BASE, parseResource } from './rsc7.ts';
import { buildTestYft } from './yft-fixture.ts';
import { readYft } from './yft.ts';

const quad = (uv: boolean) => ({
  positions: new Float32Array([0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
  indices: [0, 1, 2, 0, 2, 3],
  ...(uv ? { uv0: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]) } : {}),
});

/** Rohe Köpfe, Hashes und Texturen eines Shaders. */
function raw(file: Uint8Array, shader: number) {
  const res = parseResource(file);
  const mem = new Memory(res.system, res.graphics);
  const group = mem.ptr(mem.ptr(SYSTEM_BASE + 0x30) + 0x10);
  const fx = mem.ptr(mem.ptr(group + 0x10) + shader * 8);
  const params = mem.ptr(fx);
  const n = mem.u8(fx + 0x10);
  let vectorBytes = 0;
  for (let p = 0; p < n; p++) vectorBytes += 16 * mem.u8(params + p * 16);
  const hashes = params + n * 16 + vectorBytes;
  return {
    count: mem.u16(group + 0x18),
    n,
    heads: Array.from({ length: n }, (_, p) => `${mem.u8(params + p * 16)}/${mem.u8(params + p * 16 + 1)}`).join(' '),
    names: Array.from({ length: n }, (_, p) => mem.u32(hashes + p * 4)),
    textures: Array.from({ length: n }, (_, p) => {
      const pointer = mem.ptr(params + p * 16 + 8);
      return mem.u8(params + p * 16) === 0 && pointer ? mem.cstring(mem.ptr(pointer + 0x28)) : null;
    }),
    size: mem.u16(fx + 0x14),
    data: mem.u16(fx + 0x16),
    nameHash: mem.u32(fx + 8),
  };
}

describe('cloneShaders über editYft', () => {
  const file = () => buildTestYft({ meshTexture: true });

  it('legt Kopien am Ende der Shader-Liste an, mit eigener Haupttextur und sonst gleichen Parametern', () => {
    const out = editYft(file(), { shaders: [{ from: 0, textureName: 'toolbox_a' }, { from: 0, textureName: 'toolbox_b' }] });
    expect(out.shaderIndices).toEqual([2, 3]);
    const yft = readYft(out.file);
    expect(yft.shaders).toHaveLength(4);
    expect(yft.shaders.map((s) => s.preset)).toEqual(['vehicle_mesh', 'vehicle_lightsemissive', 'vehicle_mesh', 'vehicle_mesh']);
    expect(yft.shaders[0]!.textures).toEqual([{ param: 'DiffuseSampler', name: 'black' }, { param: 'BumpSampler', name: 'blank_normal' }]);
    expect(yft.shaders[2]!.textures).toEqual([{ param: 'DiffuseSampler', name: 'toolbox_a' }, { param: 'BumpSampler', name: 'blank_normal' }]);
    expect(yft.shaders[3]!.textures[0]).toEqual({ param: 'DiffuseSampler', name: 'toolbox_b' });
    const original = raw(file(), 0);
    const clone = raw(out.file, 2);
    expect(clone.count).toBe(4);
    expect(clone.heads).toBe(original.heads);
    expect(clone.names).toEqual(original.names);
    expect(clone.size).toBe(original.size);
    expect(clone.data).toBe(original.data);
    expect(clone.nameHash).toBe(joaat('vehicle_mesh'));
    // das Original bleibt unverändert
    expect(raw(out.file, 0).textures).toEqual(original.textures);
  });

  it('ein Teil mit einem neuen Material bekommt dessen Nummer, die Form der Eckpunkte stammt vom Vorbild', () => {
    const out = editYft(file(), { shaders: [{ from: 0, textureName: 'toolbox_a' }], meshes: [{ mesh: quad(true), shader: 2, bone: 1 }] });
    const yft = readYft(out.file);
    const added = yft.geometries[1]!;
    expect(added.shader).toBe(2);
    expect(Array.from(added.uvs[0]!)).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
    // die zweite Texturkoordinate der Vorlage bleibt der Vorlage-Wert
    expect(Array.from(added.uvs[1]!.subarray(0, 2))).toEqual([0, 1]);
    expect(added.vertexCount).toBe(4);
  });

  it('meldet ein Material, das es nicht gibt, oder eines ohne Haupttextur', () => {
    expect(() => editYft(file(), { shaders: [{ from: 9, textureName: 'x' }] })).toThrow(/Material 9/);
    // das Leuchtmaterial der Testdatei hat gar keine Parameter
    expect(() => editYft(file(), { shaders: [{ from: 1, textureName: 'x' }] })).toThrow(/keine Parameter/);
    expect(() => editYft(file(), { meshes: [{ mesh: quad(false), shader: 3, bone: 1 }] })).toThrow(/Material 3/);
  });

  it('lässt sich mit Teilen, Knochen und der Lack-Umstellung zusammen nutzen', () => {
    const out = editYft(buildTestYft({ meshTexture: true, paint: 'paint2' }), {
      paint: [{ shader: 2, textureName: 'car_livery' }],
      shaders: [{ from: 0, textureName: 'toolbox_a' }],
      bones: [{ name: 'forge_part', parent: 0, translation: [0, 0, 1] }],
      meshes: [{ mesh: quad(true), shader: 3, bone: 3 }],
    });
    const yft = readYft(out.file);
    expect(yft.shaders).toHaveLength(4);
    expect(yft.shaders[2]!.preset).toBe('vehicle_paint3');
    expect(yft.shaders[3]!.textures[0]!.name).toBe('toolbox_a');
    expect(yft.bones).toHaveLength(4);
    expect(yft.geometries.at(-1)!.shader).toBe(3);
  });
});
