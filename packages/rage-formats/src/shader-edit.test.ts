import { describe, expect, it } from 'vitest';
import { editYft } from './drawable-edit.ts';
import { joaat } from './jenkins.ts';
import { Memory } from './memory.ts';
import { SYSTEM_BASE, parseResource } from './rsc7.ts';
import { buildTestYft } from './yft-fixture.ts';
import { readYft } from './yft.ts';

const PAINT3_ORDER = [
  'DiffuseSampler', 'DamageSampler', 'DiffuseSampler2', 'DirtSampler', 'SpecSampler', 'envEffTexTileUV', 'envEffScale', 'envEffThickness',
  'diffuse2SpecMod', 'reflectivePower', 'specular2Color_DirLerp', 'specMapIntMask', 'specularIntensityMult', 'specularFalloffMult',
  'specularFresnel', 'dirtColor', 'dirtLevelMod', 'matDiffuseColor2', 'matDiffuseColor', 'DamagedWheelOffsets', 'DamageTextureOffset',
  'DamageMultiplier', 'BoundRadius',
];
const KNOWN = new Map(PAINT3_ORDER.map((n) => [joaat(n), n]));

/** Rohe Parameterliste eines Shaders: Name, Typ, Nummer im Kopf, Vektorwerte oder Texturname. */
function rawParams(file: Uint8Array, shader: number) {
  const res = parseResource(file);
  const mem = new Memory(res.system, res.graphics);
  const drawable = mem.ptr(SYSTEM_BASE + 0x30);
  const group = mem.ptr(drawable + 0x10);
  const fx = mem.ptr(mem.ptr(group + 0x10) + shader * 8);
  const params = mem.ptr(fx);
  const count = mem.u8(fx + 0x10);
  let vectorBytes = 0;
  for (let p = 0; p < count; p++) vectorBytes += 16 * mem.u8(params + p * 16);
  const hashes = params + count * 16 + vectorBytes;
  const list = Array.from({ length: count }, (_, p) => {
    const type = mem.u8(params + p * 16);
    const pointer = mem.ptr(params + p * 16 + 8);
    return {
      name: KNOWN.get(mem.u32(hashes + p * 4)) ?? `?${mem.u32(hashes + p * 4)}`,
      type,
      number: mem.u8(params + p * 16 + 1),
      texture: type === 0 && pointer ? mem.cstring(mem.ptr(pointer + 0x28)) : null,
      vectors: type > 0 ? Array.from({ length: type }, (_, v) => Array.from({ length: 4 }, (_, k) => mem.f32(pointer + v * 16 + k * 4))) : [],
    };
  });
  return { list, fx: { size: mem.u16(fx + 0x14), data: mem.u16(fx + 0x16), textures: mem.u8(fx + 0x27), count, nameHash: mem.u32(fx + 8), fileHash: mem.u32(fx + 0x18) }, mem, params };
}

describe('Testdatei mit Lack', () => {
  it('hat ein paint2-Material mit der Parameterliste eines echten Shaders', () => {
    const yft = readYft(buildTestYft({ paint: 'paint2' }));
    expect(yft.shaders.map((s) => s.preset)).toEqual(['vehicle_mesh', 'vehicle_lightsemissive', 'vehicle_paint2']);
    expect(yft.shaders[2]!.textures).toEqual([
      { param: 'DiffuseSampler', name: 'body_diffuse' },
      { param: 'DirtSampler', name: 'body_dirt' },
      { param: 'SpecSampler', name: 'body_spec' },
    ]);
    expect(yft.geometries).toHaveLength(2);
    expect(yft.geometries[1]!.shader).toBe(2);
  });
});

describe('convertPaintShaders', () => {
  const convert = (paint: 'paint1' | 'paint2' = 'paint2') => editYft(buildTestYft({ paint }), { paint: [{ shader: 2, textureName: 'testcar_livery' }] }).file;

  it('stellt den Lack auf paint3 um und gibt ihm die Livery-Textur', () => {
    const file = convert();
    const yft = readYft(file);
    expect(yft.shaders[2]!.preset).toBe('vehicle_paint3');
    expect(yft.shaders[2]!.textures.map((t) => `${t.param}=${t.name}`)).toEqual([
      'DiffuseSampler=body_diffuse',
      'DiffuseSampler2=testcar_livery',
      'DirtSampler=body_dirt',
      'SpecSampler=body_spec',
    ]);
    // andere Materialien bleiben
    expect(yft.shaders[0]!.preset).toBe('vehicle_mesh');
    expect(yft.shaders[1]!.preset).toBe('vehicle_lightsemissive');
  });

  it('die Parameterliste entspricht der eines echten paint3-Shaders (Namen, Typen, Reihenfolge)', () => {
    const { list } = rawParams(convert(), 2);
    expect(list.map((p) => p.name)).toEqual(PAINT3_ORDER);
    expect(list.map((p) => p.type)).toEqual(PAINT3_ORDER.map((n) => (/Sampler2?$/.test(n) ? 0 : n === 'DamagedWheelOffsets' ? 2 : 1)));
  });

  it('die Nummern in den Parameterköpfen folgen dem Schema echter Dateien', () => {
    const { list } = rawParams(convert(), 2);
    expect(list.filter((p) => p.type === 0).map((p) => p.number)).toEqual([0, 2, 3, 4, 5]);
    // Vektoren von hinten: 162, 163, 164, 165 (Feld zählt doppelt) 167 ... 180
    expect(list.filter((p) => p.type > 0).map((p) => p.number)).toEqual([180, 179, 178, 177, 176, 175, 174, 173, 172, 171, 170, 169, 168, 167, 165, 164, 163, 162]);
  });

  it('die neuen Vektoren haben die üblichen Werte, alte Werte bleiben', () => {
    const { list } = rawParams(convert(), 2);
    const get = (name: string) => list.find((p) => p.name === name)!;
    expect(get('diffuse2SpecMod').vectors[0]).toEqual([8, 0, 0, 0]);
    expect(get('matDiffuseColor2').vectors[0]).toEqual([1, 1, 1, 0]);
    expect(get('matDiffuseColor').vectors[0]).toEqual([2, 1, 1, 0]);
    expect(get('specularFalloffMult').vectors[0]![0]).toBe(50);
    expect(get('DamagedWheelOffsets').vectors).toHaveLength(2);
    expect(get('dirtColor').vectors[0]![0]).toBeCloseTo(0.231372, 5);
  });

  it('Größenangaben und Hashes im Shader stimmen', () => {
    const { fx } = rawParams(convert(), 2);
    expect(fx.count).toBe(23);
    expect(fx.textures).toBe(5);
    expect(fx.size).toBe(23 * 16 + 19 * 16); // Köpfe plus Vektordaten (19 Vektoren, ein Feld zählt doppelt)
    expect(fx.data).toBe(Math.ceil((32 + fx.size + 4 * 23) / 16) * 16);
    expect(fx.nameHash).toBe(joaat('vehicle_paint3'));
    expect(fx.fileHash).toBe(joaat('vehicle_paint3.sps'));
  });

  it('das neue Texturobjekt ist eine Kopie des Haupttextur-Objekts mit eigenem Namen', () => {
    const { list, mem, params } = rawParams(convert(), 2);
    expect(list[2]!.texture).toBe('testcar_livery');
    const pointer = (p: number) => mem.ptr(params + p * 16 + 8);
    const donor = mem.bytes(pointer(0), 80);
    const added = mem.bytes(pointer(2), 80);
    // alles außer dem Namenszeiger (0x28..0x2f) ist gleich
    for (let i = 0; i < 80; i++) if (i < 0x28 || i >= 0x30) expect(added[i]).toBe(donor[i]);
  });

  it('paint1 lässt sich ebenso umstellen', () => {
    expect(readYft(convert('paint1')).shaders[2]!.preset).toBe('vehicle_paint3');
  });

  it('lehnt andere Materialien und schon umgestellte ab', () => {
    const file = buildTestYft({ paint: 'paint2' });
    expect(() => editYft(file, { paint: [{ shader: 0, textureName: 'x' }] })).toThrow(/kein einfacher Lack/);
    expect(() => editYft(convert(), { paint: [{ shader: 2, textureName: 'x' }] })).toThrow(/kein einfacher Lack/);
    expect(() => editYft(file, { paint: [{ shader: 9, textureName: 'x' }] })).toThrow(/Material 9/);
  });

  it('doppelte Einträge für dasselbe Material zählen einmal', () => {
    const file = editYft(buildTestYft({ paint: 'paint2' }), { paint: [{ shader: 2, textureName: 'a' }, { shader: 2, textureName: 'b' }] }).file;
    expect(readYft(file).shaders[2]!.textures.some((t) => t.name === 'a')).toBe(true);
  });

  it('lässt sich mit neuen Teilen und Knochen in einem Schritt kombinieren', () => {
    const result = editYft(buildTestYft({ paint: 'paint2' }), {
      paint: [{ shader: 2, textureName: 'testcar_livery' }],
      bones: [{ name: 'forge_bar', parent: 0, translation: [0, 0, 1] }],
      meshes: [{ mesh: { positions: new Float32Array([0, 0, 1, 1, 0, 1, 0, 1, 1]), normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), indices: [0, 1, 2] }, shader: 0, bone: 3 }],
    });
    const yft = readYft(result.file);
    expect(yft.shaders[2]!.preset).toBe('vehicle_paint3');
    expect(yft.bones).toHaveLength(4);
    expect(yft.geometries).toHaveLength(3);
  });
});
