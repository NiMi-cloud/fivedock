import { describe, expect, it } from 'vitest';
import { buildYdr, defaultShader, simpleShader } from './ydr.ts';
import { joaat } from './jenkins.ts';
import { YftReadError, isPaintPreset, presetNameFromHash, readYdr, readYft, removeYdrTriangles, removeYftTriangles } from './yft.ts';

function quad(offset: number, shader: number) {
  const x = offset;
  return {
    positions: new Float32Array([x, 0, 0, x + 1, 0, 0, x + 1, 1, 0, x, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]),
    colors: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 9, 8, 7, 6]),
    indices: [0, 1, 2, 0, 2, 3],
    shader,
  };
}

describe('readYdr', () => {
  const file = buildYdr({
    name: 'readback',
    shaders: [defaultShader('tex_a'), simpleShader('cutout', 'tex_b')],
    high: [{ geometries: [quad(0, 0), quad(5, 1)] }],
  });

  it('liest Geometrien, Eckpunktdaten und Shader zurück', () => {
    const y = readYdr(file);
    expect(y.name).toBe('readback');
    expect(y.geometries).toHaveLength(2);
    expect(y.shaders.map((s) => s.preset)).toEqual(['default', 'cutout']);
    expect(y.shaders.map((s) => s.renderBucket)).toEqual([0, 3]);
    expect(y.shaders[0]!.textures).toEqual([{ param: 'DiffuseSampler', name: 'tex_a' }]);
    expect(y.shaders[1]!.textures[0]!.name).toBe('tex_b');

    const g = y.geometries[1]!;
    expect(g.shader).toBe(1);
    expect(g.vertexCount).toBe(4);
    expect(Array.from(g.positions.subarray(3, 6))).toEqual([6, 0, 0]);
    expect(Array.from(g.normals!.subarray(0, 3))).toEqual([0, 0, 1]);
    expect(Array.from(g.uvs[0]!.subarray(0, 4))).toEqual([0, 1, 1, 1]);
    expect(Array.from(g.colors!.subarray(12, 16))).toEqual([9, 8, 7, 6]);
    expect(Array.from(g.indices)).toEqual([0, 1, 2, 0, 2, 3]);
    expect(g.uvs[1]).toBeNull();
    expect(g.blendIndices).toBeNull();
  });

  it('liefert die Begrenzung des Drawables', () => {
    const y = readYdr(file);
    expect(y.boundsMin).toEqual([0, 0, 0]);
    expect(y.boundsMax).toEqual([6, 1, 0]);
    expect(y.bones).toEqual([]);
  });

  it('lehnt falsche Dateitypen und Beschädigtes mit Fehlercode ab', () => {
    const code = (f: () => unknown) => {
      try {
        f();
      } catch (e) {
        return e instanceof YftReadError ? e.code : 'andere';
      }
      return 'kein Fehler';
    };
    expect(code(() => readYft(file))).toBe('wrong-version'); // YDR ist kein YFT
    expect(code(() => readYdr(Uint8Array.from([0x46, 0x58, 0x41, 0x50, 0, 0, 0, 0])))).toBe('encrypted');
    expect(code(() => readYdr(new Uint8Array(40)))).toBe('not-rsc7');
    expect(code(() => readYdr(file.subarray(0, 30)))).toBe('corrupt');
  });
});

describe('Shader-Namen', () => {
  it('findet Voreinstellungen anhand des Hashes', () => {
    expect(presetNameFromHash(joaat('vehicle_paint3.sps'))).toBe('vehicle_paint3');
    expect(presetNameFromHash(joaat('default.sps'))).toBe('default');
    expect(presetNameFromHash(12345)).toBeNull();
  });

  it('erkennt Lack-Shader', () => {
    expect(isPaintPreset('vehicle_paint1')).toBe(true);
    expect(isPaintPreset('vehicle_paint9')).toBe(true);
    expect(isPaintPreset('vehicle_mesh')).toBe(false);
    expect(isPaintPreset('vehicle_vehglass')).toBe(false);
  });
});

describe('Dreiecke entfernen', () => {
  const file = buildYdr({
    name: 'edit',
    shaders: [defaultShader('tex_a')],
    high: [{ geometries: [quad(0, 0)] }],
    med: [{ geometries: [quad(0, 0)] }],
  });

  it('schiebt den Indexpuffer zusammen und passt die Zählung an, Eckpunkte bleiben', () => {
    // Zweites Dreieck (Index 1) von zwei entfernen, in beiden Detailstufen
    const result = removeYdrTriangles(file, ({ geometry }) => Uint8Array.from([0, 1].slice(0, geometry.indices.length / 3)));
    expect(result.removed).toBe(2);
    expect(result.byLod).toEqual([1, 1, 0, 0]);
    const after = readYdr(result.file);
    expect(Array.from(after.geometries[0]!.indices)).toEqual([0, 1, 2]);
    expect(after.geometries[0]!.vertexCount).toBe(4);
    expect(Array.from(after.geometries[0]!.positions)).toEqual(Array.from(readYdr(file).geometries[0]!.positions));
  });

  it('bekommt jede Geometrie mit Detailstufe und Nummer und ändert nichts bei null', () => {
    const seen: string[] = [];
    const result = removeYdrTriangles(file, ({ lod, index, shader }) => {
      seen.push(`${lod}:${index}:${shader.preset}`);
      return null;
    });
    expect(seen).toEqual(['0:0:default', '1:0:default']);
    expect(result.removed).toBe(0);
    expect(result.file).toBe(file);
  });

  it('lässt sich wiederholen: ein zweites Entfernen arbeitet auf dem Ergebnis', () => {
    const first = removeYdrTriangles(file, () => Uint8Array.from([1, 0]));
    const second = removeYdrTriangles(first.file, () => Uint8Array.from([1]));
    expect(readYdr(second.file).geometries[0]!.indices.length).toBe(0);
  });

  it('lehnt Dateien der falschen Art ab', () => {
    try {
      removeYftTriangles(file, () => null);
      throw new Error('kein Fehler');
    } catch (e) {
      expect(e).toBeInstanceOf(YftReadError);
      expect((e as YftReadError).code).toBe('wrong-version');
    }
  });
});
