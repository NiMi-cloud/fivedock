import { buildTestYft, buildYdr, defaultShader, readYdr, readYft } from '@toolkit/rage-formats';
import { describe, expect, it } from 'vitest';
import type { TextureSource } from './model.ts';
import { buildVehicleParts } from './vehicle.ts';
import { applyAddedParts, planAddedParts } from './vehicle-add.ts';
import { donorModel, donorToAddedModel, targetMaterialFor } from './vehicle-transplant.ts';

const texture = (name: string, rgba: [number, number, number, number]): TextureSource => ({
  name,
  width: 4,
  height: 4,
  rgba: Uint8Array.from({ length: 64 }, (_, i) => rgba[i % 4]!),
});

describe('Spender-Teile', () => {
  const donor = readYft(buildTestYft({ meshTexture: true }));
  const donorParts = buildVehicleParts(donor).parts;
  const target = readYft(buildTestYft());
  const targetParts = buildVehicleParts(target).parts;

  it('donorModel liest nur die benutzten Eckpunkte und fasst gleiche Materialien zusammen', () => {
    const model = donorModel(donor, donorParts);
    expect(model.parts.length).toBeGreaterThan(0);
    for (const part of model.parts) {
      expect(part.positions.length).toBe((part.normals.length / 3) * 3);
      expect(part.uvs.length).toBe((part.positions.length / 3) * 2);
      const max = part.indices.reduce((m, i) => Math.max(m, i), 0);
      expect(max).toBeLessThan(part.positions.length / 3);
      expect(part.materialIndex).toBeLessThan(model.shaders.length);
    }
    expect(new Set(model.shaders).size).toBe(model.shaders.length);
  });

  it('donorToAddedModel setzt den Ursprung auf die Mitte der Unterkante und merkt sich die Lage', () => {
    const model = donorToAddedModel({ id: 'd', name: 'Spender', donor, parts: donorParts, textureOf: () => null, target, targetParts });
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const part of model.parts) {
      for (let i = 0; i + 2 < part.positions.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k]!, part.positions[i + k]!);
          max[k] = Math.max(max[k]!, part.positions[i + k]!);
        }
      }
    }
    expect(min[2]).toBeCloseTo(0, 5);
    expect((min[0]! + max[0]!) / 2).toBeCloseTo(0, 5);
    expect((min[1]! + max[1]!) / 2).toBeCloseTo(0, 5);
    // Mit der gespeicherten Lage liegt das Teil wieder dort, wo es im Spender war.
    const donorMin = Math.min(...donorParts.map((p) => p.boundsMin[2]));
    expect(model.position[2]).toBeCloseTo(donorMin, 5);
    expect(model.materials).toHaveLength(model.colors.length);
    expect(model.sourceTextures).toHaveLength(model.colors.length);
  });

  it('weist die Materialien nach Art zu und nimmt die Textur nur bei gewöhnlichen Materialien mit', () => {
    const presets = donor.shaders.map((s) => s.preset);
    const otherIndex = donorParts.findIndex((p) => !/^vehicle_(paint|vehglass|lightsemissive|tire)/.test(presets[p.shader] ?? ''));
    const picked = donorParts.filter((p) => !/^vehicle_(paint|vehglass|lightsemissive|tire)/.test(presets[p.shader] ?? ''));
    expect(otherIndex).toBeGreaterThanOrEqual(0);
    const name = donor.shaders[picked[0]!.shader]!.textures.find((t) => t.param === 'DiffuseSampler')!.name;
    const seen: string[] = [];
    const model = donorToAddedModel({
      id: 'd',
      name: 'Spender',
      donor,
      parts: picked,
      textureOf: (n) => {
        seen.push(n);
        return texture(n, [200, 100, 50, 255]);
      },
      target,
      targetParts,
    });
    expect(seen).toContain(name);
    expect(model.textures).toHaveLength(1);
    expect(model.materialTextures.some((t) => t === 0)).toBe(true);
    expect(model.colors[0]).toBe('#c86432');
    // gewöhnliche Spender-Materialien landen auf dem Gehäusematerial des eigenen Fahrzeugs
    expect(model.materials[0]).toBe(targetMaterialFor('other', target, targetParts));

    const paint = donorParts.filter((p) => /^vehicle_paint/.test(presets[p.shader] ?? ''));
    if (paint.length > 0) {
      const painted = donorToAddedModel({ id: 'p', name: 'Lack', donor, parts: paint, textureOf: () => texture('x', [1, 1, 1, 255]), target, targetParts });
      expect(painted.textures).toEqual([]);
      expect(painted.materialTextures.every((t) => t === null)).toBe(true);
      expect(painted.materials[0]).toBe(targetMaterialFor('paint', target, targetParts));
    }
  });

  it('wirft bei leerer Auswahl einen Fehler', () => {
    expect(() => donorToAddedModel({ id: 'd', name: 'x', donor, parts: [], textureOf: () => null, target, targetParts })).toThrow();
  });

  it('das Ergebnis lässt sich als Anbauteil in das eigene Fahrzeug schreiben', () => {
    const picked = donorParts.filter((p) => !/^vehicle_(paint|vehglass|lightsemissive|tire)/.test(donor.shaders[p.shader]?.preset ?? ''));
    const model = donorToAddedModel({ id: 'd', name: 'Spender', donor, parts: picked, textureOf: (n) => texture(n, [90, 90, 90, 255]), target, targetParts });
    const file = buildTestYft({ meshTexture: true });
    const planned = planAddedParts(readYft(file), [model]);
    expect(planned.plan.meshes!.length).toBeGreaterThan(0);
    const result = applyAddedParts(file, [model]);
    const after = readYft(result.file);
    expect(after.geometries.length).toBeGreaterThan(readYft(file).geometries.length);
    expect(result.textures.length).toBe(1);
    expect(after.shaders.at(-1)!.textures[0]!.name).toBe(result.textures[0]!.name);
  });

  it('liest auch ein einzelnes Modell (YDR) als Spender und nimmt dessen Textur mit', () => {
    const file = buildYdr({
      name: 'quader',
      shaders: [defaultShader('quader_diffuse')],
      high: [{ geometries: [{
        positions: Float32Array.from([1, 2, 3, 2, 2, 3, 2, 3, 3, 1, 3, 3]),
        normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
        uvs: Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]),
        indices: [0, 1, 2, 0, 2, 3],
        shader: 0,
      }] }],
    });
    const ydr = readYdr(file);
    const parts = buildVehicleParts(ydr).parts;
    expect(parts).toHaveLength(1);
    const model = donorToAddedModel({ id: 'q', name: 'Quader', donor: ydr, parts, textureOf: (n) => (n === 'quader_diffuse' ? texture(n, [10, 20, 30, 255]) : null), target, targetParts });
    expect(model.textures.map((t) => t.name)).toEqual(['quader_diffuse']);
    expect(model.parts[0]!.indices.length).toBe(6);
    expect(model.position[0]).toBeCloseTo(1.5, 5);
    expect(model.position[1]).toBeCloseTo(2.5, 5);
    expect(model.position[2]).toBeCloseTo(3, 5);
  });
});
