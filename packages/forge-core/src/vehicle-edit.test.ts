import { describe, expect, it } from 'vitest';
import { buildYdr, defaultShader, readYdr } from '@toolkit/rage-formats';
import { diffuseTextureOf, looksLikeDecal, removeParts } from './vehicle-edit.ts';

function quad(offset: number, shader: number, triangles = 2) {
  const x = offset;
  return {
    positions: new Float32Array([x, 0, 0, x + 1, 0, 0, x + 1, 1, 0, x, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]),
    indices: triangles === 2 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2],
    shader,
  };
}

/** Drawable mit zwei Materialien (Karosserie und Abzeichen), in zwei Detailstufen. */
function car() {
  return buildYdr({
    name: 'testcar',
    shaders: [defaultShader('body_tex'), defaultShader('badge_tex')],
    high: [{ geometries: [quad(0, 0), quad(5, 1)] }],
    med: [{ geometries: [quad(0, 0), quad(5, 1)] }],
  });
}

describe('removeParts', () => {
  it('entfernt das Abzeichen aus allen Detailstufen und lässt die Karosserie unberührt', () => {
    const file = car();
    const result = removeParts(file, [{ bone: 'bone_0', preset: 'default', texture: 'badge_tex' }], 'ydr');
    expect(result.removed).toBe(4);
    expect(result.byLod).toEqual([2, 2, 0, 0]);

    const after = readYdr(result.file);
    expect(after.geometries).toHaveLength(2);
    const byTexture = new Map(after.geometries.map((g) => [after.shaders[g.shader]!.textures[0]!.name, g]));
    expect(byTexture.get('badge_tex')!.indices.length).toBe(0);
    expect(Array.from(byTexture.get('body_tex')!.indices)).toEqual([0, 1, 2, 0, 2, 3]);
    // Eckpunkte und Shader bleiben unverändert
    expect(byTexture.get('badge_tex')!.vertexCount).toBe(4);
    expect(after.shaders.map((s) => s.textures[0]!.name)).toEqual(['body_tex', 'badge_tex']);
  });

  it('vergleicht Texturnamen ohne Rücksicht auf Groß- und Kleinschreibung und trifft keine anderen Shader', () => {
    const file = car();
    expect(removeParts(file, [{ bone: 'bone_0', preset: 'default', texture: 'BADGE_TEX' }], 'ydr').removed).toBe(4);
    expect(removeParts(file, [{ bone: 'bone_0', preset: 'vehicle_mesh', texture: 'badge_tex' }], 'ydr').removed).toBe(0);
    expect(removeParts(file, [{ bone: 'bone_0', preset: 'default', texture: null }], 'ydr').removed).toBe(0);
    expect(removeParts(file, [{ bone: 'bone_7', preset: 'default', texture: 'badge_tex' }], 'ydr').removed).toBe(0);
  });

  it('ohne Treffer oder ohne Regeln kommt dieselbe Datei zurück', () => {
    const file = car();
    expect(removeParts(file, [], 'ydr').file).toBe(file);
    expect(removeParts(file, [{ bone: 'bone_0', preset: 'default', texture: 'gibt_es_nicht' }], 'ydr').file).toBe(file);
  });

  it('die bearbeitete Datei behält Kopf und Seiten-Flags', () => {
    const file = car();
    const result = removeParts(file, [{ bone: 'bone_0', preset: 'default', texture: 'badge_tex' }], 'ydr');
    expect(Array.from(result.file.subarray(0, 16))).toEqual(Array.from(file.subarray(0, 16)));
  });
});

describe('Hilfsfunktionen', () => {
  it('diffuseTextureOf nimmt DiffuseSampler und nicht andere Texturen', () => {
    expect(diffuseTextureOf({ textures: [{ param: 'DirtSampler', name: 'dreck' }, { param: 'DiffuseSampler', name: 'lack' }] })).toBe('lack');
    expect(diffuseTextureOf({ textures: [{ param: 'DirtSampler', name: 'dreck' }] })).toBeNull();
  });

  it('looksLikeDecal erkennt Abzeichen, Logos und Aufkleber am Texturnamen', () => {
    for (const name of ['fpiu_badges', 'LOGO_front', 'sticker1', 'police_decal', 'fpiu_sign_1']) expect(looksLikeDecal(name)).toBe(true);
    for (const name of ['fpiu_plastic', 'chrome', null]) expect(looksLikeDecal(name)).toBe(false);
  });
});
