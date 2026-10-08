import { DEFAULT_LIGHTBAR, readZip, setHandlingValue, setVehicleFlags } from '@toolkit/forge-core';
import type { AddedLightbar, AddedModel } from '@toolkit/forge-core';
import { buildTestYft, buildYtd, readYft, readYtd } from '@toolkit/rage-formats';
import { describe, expect, it } from 'vitest';
import { buildEditedResource } from './export-resource.ts';

const text = (s: string) => new TextEncoder().encode(s);
const rsc7 = () => Uint8Array.from([0x52, 0x53, 0x43, 0x37, 1, 2, 3, 4]);

const VEHICLES = `<CVehicleModelInfo__InitDataList><InitDatas><Item>
  <modelName>testcar</modelName><txdName>testcar</txdName><handlingId>TESTCAR</handlingId><gameName>TESTCAR</gameName>
  <flags>FLAG_HAS_LIVERY</flags>
</Item></InitDatas></CVehicleModelInfo__InitDataList>`;
const HANDLING = `<CHandlingDataMgr><HandlingData><Item type="CHandlingData"><handlingName>TESTCAR</handlingName><fMass value="2000.000000" /></Item></HandlingData></CHandlingDataMgr>`;

const files = {
  'stream/testcar.yft': rsc7(),
  'stream/testcar.ytd': rsc7(),
  'vehicles.meta': text(VEHICLES),
  'handling.meta': text(HANDLING),
};

const yft = { name: 'testcar', boundsMin: [0, 0, 0], boundsMax: [1, 1, 1], bones: [], shaders: [], geometries: [] } as never;

describe('buildEditedResource', () => {
  it('baut eine Resource mit den geänderten Meta-Dateien und lässt die übrigen Dateien unverändert', () => {
    const metaFiles = {
      'vehicles.meta': text(setVehicleFlags(VEHICLES, 'testcar', ['FLAG_HAS_LIVERY', 'FLAG_HAS_BULLETPROOF_GLASS'])),
      'handling.meta': text(setHandlingValue(HANDLING, 'TESTCAR', 'fMass', 1500)),
    };
    const result = buildEditedResource({ files, yft, parts: [], removed: new Set(), yftPaths: ['stream/testcar.yft'], metaFiles, resourceName: 'testcar' });
    const zip = readZip(result.zip);
    expect(Object.keys(zip).sort()).toEqual(['testcar/data/handling.meta', 'testcar/data/vehicles.meta', 'testcar/fxmanifest.lua', 'testcar/stream/testcar.ytd', 'testcar/stream/testcar.yft'].sort());
    expect(new TextDecoder().decode(zip['testcar/data/vehicles.meta'])).toContain('FLAG_HAS_BULLETPROOF_GLASS');
    expect(new TextDecoder().decode(zip['testcar/data/handling.meta'])).toContain('1500.000000');
    expect(Array.from(zip['testcar/stream/testcar.yft']!)).toEqual(Array.from(files['stream/testcar.yft']));
    expect(new TextDecoder().decode(zip['testcar/fxmanifest.lua'])).toContain("data_file 'VEHICLE_METADATA_FILE' 'data/vehicles.meta'");
    expect(result.removedTriangles).toBe(0);
    expect(result.changedMetas).toEqual(['vehicles.meta', 'handling.meta']);
  });

  it('legt mit einem Anzeigenamen eine vehicle_names.lua an', () => {
    const result = buildEditedResource({ files, yft, parts: [], removed: new Set(), yftPaths: ['stream/testcar.yft'], metaFiles: {}, resourceName: 'x', displayName: ' Streifenwagen ' });
    const zip = readZip(result.zip);
    expect(new TextDecoder().decode(zip['x/vehicle_names.lua'])).toContain("AddTextEntry('TESTCAR', 'Streifenwagen')");
    expect(new TextDecoder().decode(zip['x/fxmanifest.lua'])).toContain("client_script 'vehicle_names.lua'");
  });

  it('neu angelegte Dateien (zum Beispiel carcols.meta) kommen in die Resource', () => {
    const carcols = '<CVehicleModelInfoVarGlobal><Sirens></Sirens></CVehicleModelInfoVarGlobal>';
    const result = buildEditedResource({ files, yft, parts: [], removed: new Set(), yftPaths: ['stream/testcar.yft'], metaFiles: { 'data/carcols.meta': text(carcols) }, resourceName: 'testcar' });
    const zip = readZip(result.zip);
    expect(new TextDecoder().decode(zip['testcar/data/carcols.meta'])).toBe(carcols);
    expect(new TextDecoder().decode(zip['testcar/fxmanifest.lua'])).toContain("data_file 'CARCOLS_FILE' 'data/carcols.meta'");
  });

  it('baut Anbauteile in alle Modelldateien ein und meldet Dateien, in die sie nicht passen', () => {
    const bar: AddedLightbar = {
      id: 'a',
      kind: 'lightbar',
      spec: { ...DEFAULT_LIGHTBAR, modules: 3, position: [0, 0.2, 0.6] },
      housingShader: 0,
      lensShader: null,
      sirens: true,
      parentBone: 0,
    };
    const good = buildTestYft();
    const hi = buildTestYft({ boneNames: ['chassis'], boneParents: [-1] });
    const pack = { ...files, 'stream/testcar.yft': good, 'stream/testcar_hi.yft': hi };
    const reference = readYft(good);
    const result = buildEditedResource({ files: pack, yft: reference, parts: [], removed: new Set(), yftPaths: ['stream/testcar.yft', 'stream/testcar_hi.yft'], metaFiles: {}, resourceName: 'testcar', added: [bar] });
    expect(result.addedModels).toEqual(['testcar.yft', 'testcar_hi.yft']);
    const zip = readZip(result.zip);
    const after = readYft(zip['testcar/stream/testcar.yft']!);
    expect(after.geometries).toHaveLength(3);
    expect(after.bones.map((b) => b.name)).toContain('forge_lightbar');
    expect(after.bones.filter((b) => /^siren/.test(b.name))).toHaveLength(4);
    // die zweite Datei hat ein eigenes, kleineres Skelett und wird für sich geplant
    expect(readYft(zip['testcar/stream/testcar_hi.yft']!).bones.map((b) => b.name)[1]).toBe('forge_lightbar');

    const broken = buildEditedResource({ files: pack, yft: reference, parts: [], removed: new Set(), yftPaths: ['stream/testcar.yft'], metaFiles: {}, resourceName: 'testcar', added: [{ ...bar, housingShader: 1 }] });
    expect(broken.addedModels).toEqual([]);
    expect(broken.addedFailures).toHaveLength(1);
    expect(broken.addedFailures[0]!.file).toBe('testcar.yft');
    expect(broken.addedFailures[0]!.message).toMatch(/Material/);
  });

  it('nimmt Texturen eigener Modelle in die Texturdateien (normal und +hi) auf und baut das Material ein', () => {
    const model: AddedModel = {
      id: 'm',
      kind: 'model',
      name: 'Werkzeug.glb',
      parts: [{
        name: 'q',
        positions: Float32Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
        normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
        uvs: Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]),
        indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
        materialIndex: 0,
      }],
      colors: ['#ffffff'],
      materials: [0],
      textures: [{ name: 'farbe', width: 8, height: 8, rgba: new Uint8Array(8 * 8 * 4).fill(180) }],
      sourceTextures: [0],
      materialTextures: [0],
      rotation: [0, 0, 0],
      scale: 1,
      position: [0, 0, 1],
      parentBone: 0,
    };
    const old = { name: 'alt', width: 4, height: 4, levels: 1, format: 'A8R8G8B8' as const, data: new Uint8Array(64).fill(9) };
    const pack = { ...files, 'stream/testcar.yft': buildTestYft({ meshTexture: true }), 'stream/testcar.ytd': buildYtd([old]), 'stream/testcar+hi.ytd': buildYtd([old]) };
    const reference = readYft(pack['stream/testcar.yft']!);
    const result = buildEditedResource({ files: pack, yft: reference, parts: [], removed: new Set(), yftPaths: ['stream/testcar.yft'], metaFiles: {}, resourceName: 'testcar', added: [model] });
    expect(result.addedFailures).toEqual([]);
    expect(result.texturedFiles.sort()).toEqual(['testcar+hi.ytd', 'testcar.ytd']);
    const zip = readZip(result.zip);
    for (const name of ['testcar/stream/testcar.ytd', 'testcar/stream/testcar+hi.ytd']) {
      const names = readYtd(zip[name]!).map((t) => t.name).sort();
      expect(names).toEqual(['alt', 'werkzeug_1']);
    }
    const yft = readYft(zip['testcar/stream/testcar.yft']!);
    expect(yft.shaders.at(-1)!.textures[0]).toEqual({ param: 'DiffuseSampler', name: 'werkzeug_1' });
    expect(yft.geometries.at(-1)!.shader).toBe(yft.shaders.length - 1);
  });
});
