import { buildTestYft, readYft } from '@toolkit/rage-formats';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIGHTBAR, buildLightbar } from './lightbar.ts';
import { SIREN_PRESETS, buildSirenSetting, ensureSirenLights, newCarcols, presetLights, readSirenSettings } from './sirens.ts';
import { applyAddedParts, matchBone, matchShader, modelMeshes, placeModelParts, planAddedParts, retargetAdded } from './vehicle-add.ts';
import type { AddedLightbar, AddedModel } from './vehicle-add.ts';

const lightbar = (extra: Partial<AddedLightbar> = {}): AddedLightbar => ({
  id: 'a',
  kind: 'lightbar',
  spec: { ...DEFAULT_LIGHTBAR, position: [0, 0.2, 0.6], modules: 4 },
  housingShader: 0,
  lensShader: null,
  sirens: true,
  parentBone: 0,
  ...extra,
});

describe('planAddedParts', () => {
  const yft = readYft(buildTestYft());

  it('plant Balken-Knochen, Sirenen-Knochen und zwei Netze (Gehäuse, Linsen)', () => {
    const { plan, sirens, boneNames } = planAddedParts(yft, [lightbar()]);
    expect(boneNames).toEqual(['forge_lightbar', 'siren2', 'siren3', 'siren4', 'siren5']);
    expect(plan.bones![0]).toMatchObject({ name: 'forge_lightbar', parent: 0 });
    expect(plan.bones!.slice(1).every((b) => b.parent === 3)).toBe(true);
    expect(plan.meshes).toHaveLength(2);
    expect(plan.meshes!.every((m) => m.bone === 3)).toBe(true);
    expect(plan.meshes![1]!.shader).toBe(0); // Linse ohne eigenes Material: das des Gehäuses
    expect(sirens.map((s) => s.number)).toEqual([2, 3, 4, 5]);
    expect(sirens[0]!.position[0]).toBeLessThan(sirens[3]!.position[0]);
  });

  it('ohne Sirenen entstehen keine Knochen, die Teile hängen am Elternknochen', () => {
    const { plan, sirens } = planAddedParts(yft, [lightbar({ sirens: false, parentBone: 1 })]);
    expect(plan.bones).toEqual([]);
    expect(sirens).toEqual([]);
    expect(plan.meshes!.every((m) => m.bone === 1)).toBe(true);
  });

  it('mehrere Balken bekommen eigene Namen, Knochen-Nummern und Sirenen-Nummern', () => {
    const { plan, sirens, boneNames } = planAddedParts(yft, [lightbar({ id: 'a' }), lightbar({ id: 'b', spec: { ...DEFAULT_LIGHTBAR, modules: 2, position: [0, 1, 0.6] } })]);
    expect(boneNames.filter((n) => n.startsWith('forge_lightbar'))).toEqual(['forge_lightbar', 'forge_lightbar2']);
    expect(sirens.map((s) => s.number)).toEqual([2, 3, 4, 5, 6, 7]);
    const second = plan.bones!.find((b) => b.name === 'forge_lightbar2')!;
    expect(second.parent).toBe(0);
    // die Sirenen des zweiten Balkens hängen am zweiten Balken-Knochen (Index 3 + 5 = 8)
    expect(plan.bones!.filter((b) => b.parent === 8).map((b) => b.name)).toEqual(['siren6', 'siren7']);
    expect(plan.meshes!.map((m) => m.bone)).toEqual([3, 3, 8, 8]);
  });

  it('vergibt keinen Namen doppelt, wenn das Fahrzeug schon einen Balken-Knochen hat', () => {
    const edited = readYft(applyAddedParts(buildTestYft(), [lightbar()]).file);
    const { boneNames } = planAddedParts(edited, [lightbar()]);
    expect(boneNames[0]).toBe('forge_lightbar2');
  });
});

describe('applyAddedParts', () => {
  it('schreibt Knochen und Teile in die Modelldatei', () => {
    const applied = applyAddedParts(buildTestYft(), [lightbar()]);
    const yft = readYft(applied.file);
    expect(yft.bones.map((b) => b.name)).toEqual(['chassis', 'door_dside_f', 'siren1', 'forge_lightbar', 'siren2', 'siren3', 'siren4', 'siren5']);
    // Gehäuse und Linsen sind zwei neue Geometrien
    expect(yft.geometries).toHaveLength(3);
    const build = buildLightbar(lightbar().spec);
    expect(yft.geometries[1]!.vertexCount).toBe(build.housing.positions.length / 3);
    expect(yft.geometries[2]!.vertexCount).toBe(build.lens.positions.length / 3);
    expect(applied.sirens).toHaveLength(4);
  });

  it('meldet ein Material, das das Fahrzeug nicht benutzt', () => {
    expect(() => applyAddedParts(buildTestYft(), [lightbar({ housingShader: 1 })])).toThrow(/benutzt dieses Material/);
  });
});

describe('ensureSirenLights', () => {
  const carcols = () => newCarcols(buildSirenSetting({ id: 7, name: 'test', lights: presetLights('amber', [0, 0, 0]) }));

  it('legt fehlende Lichter an und gibt den gewählten Lichtern Farbe und Muster der Voreinstellung', () => {
    const text = ensureSirenLights(carcols(), 7, [{ number: 4, x: -0.5 }, { number: 5, x: 0.5 }], 'police-fast');
    const lights = readSirenSettings(text)[0]!.lights;
    expect(lights).toHaveLength(5);
    expect(lights[3]!.color).toBe('#ff0000');
    expect(lights[4]!.color).toBe('#0000ff');
    expect(lights[3]!.flash.sequencer).not.toBe(lights[4]!.flash.sequencer);
    // die ersten drei bleiben, wie sie waren
    expect(lights[0]!.color).toBe('#ff8000');
  });

  it('ändert ohne neue Lichter nur die genannten', () => {
    const text = ensureSirenLights(carcols(), 7, [{ number: 2, x: -1 }], 'police-double');
    const lights = readSirenSettings(text)[0]!.lights;
    expect(lights).toHaveLength(3);
    expect(lights.map((l) => l.color)).toEqual(['#ff8000', '#ff0000', '#ff8000']);
  });

  it('meldet eine unbekannte Sirene', () => {
    expect(() => ensureSirenLights(carcols(), 99, [{ number: 1, x: 0 }], 'amber')).toThrow(/99/);
    expect(Object.keys(SIREN_PRESETS)).toContain('police-fast');
  });
});

describe('Material und Knochen über Dateien hinweg', () => {
  /** Dieselbe Datei, aber mit vertauschter Reihenfolge der Materialien und Knochen (wie bei Hochdetail-Fassungen). */
  function shuffled() {
    const yft = readYft(buildTestYft());
    const copy = { ...yft, shaders: [yft.shaders[1]!, yft.shaders[0]!], bones: [yft.bones[0]!, yft.bones[2]!, yft.bones[1]!].map((b, i) => ({ ...b, index: i })) };
    copy.geometries = yft.geometries.map((g) => ({ ...g, shader: g.shader === 0 ? 1 : 0 }));
    return copy;
  }

  it('matchShader findet das Material mit gleichem Aussehen unter neuer Nummer', () => {
    const a = readYft(buildTestYft());
    const b = shuffled();
    expect(matchShader(a, 0, b)).toBe(1);
    expect(matchShader(a, 0, a)).toBe(0);
    // Material, das in der Zieldatei von keinem Teil benutzt wird, gilt als nicht vorhanden
    expect(matchShader(a, 1, b)).toBeNull();
    expect(matchShader(a, 7, b)).toBeNull();
  });

  it('matchShader verlangt gleiche Haupttextur', () => {
    const a = readYft(buildTestYft());
    a.shaders[0] = { ...a.shaders[0]!, textures: [{ param: 'DiffuseSampler', name: 'black' }] };
    const b = readYft(buildTestYft());
    b.shaders[0] = { ...b.shaders[0]!, textures: [{ param: 'DiffuseSampler', name: 'other' }] };
    expect(matchShader(a, 0, b)).toBeNull();
    b.shaders[0] = { ...b.shaders[0]!, textures: [{ param: 'DiffuseSampler', name: 'BLACK' }] };
    expect(matchShader(a, 0, b)).toBe(0);
  });

  it('matchBone findet Knochen über den Namen', () => {
    const a = readYft(buildTestYft());
    const b = shuffled();
    expect(matchBone(a, 1, b)).toBe(2);
    expect(matchBone(a, 2, b)).toBe(1);
    expect(matchBone(a, 9, b)).toBeNull();
  });

  it('planAddedParts übersetzt Material und Elternknochen für die andere Datei', () => {
    const a = readYft(buildTestYft());
    const b = shuffled();
    const { plan } = planAddedParts(b, [lightbar({ housingShader: 0, parentBone: 1, sirens: true })], a);
    expect(plan.meshes![0]!.shader).toBe(1);
    expect(plan.bones![0]!.parent).toBe(2);
  });

  it('meldet verständlich, wenn das Material in der anderen Datei fehlt', () => {
    const a = readYft(buildTestYft());
    const b = shuffled();
    b.geometries = [];
    expect(() => planAddedParts(b, [lightbar()], a)).toThrow(/Material "mesh".*Gehäuse/);
    const c = shuffled();
    c.bones = c.bones.filter((x) => x.name !== 'door_dside_f');
    expect(() => planAddedParts(c, [lightbar({ parentBone: 1 })], a)).toThrow(/door_dside_f/);
  });
});

describe('retargetAdded', () => {
  it('übersetzt Material und Elternknochen auf die andere Datei, ohne die übrigen Angaben zu ändern', () => {
    const a = readYft(buildTestYft());
    const copy = { ...a, shaders: [a.shaders[1]!, a.shaders[0]!], bones: [a.bones[0]!, a.bones[2]!, a.bones[1]!].map((b, i) => ({ ...b, index: i })) };
    copy.geometries = a.geometries.map((g) => ({ ...g, shader: g.shader === 0 ? 1 : 0 }));
    const original = lightbar({ housingShader: 0, lensShader: null, parentBone: 1 });
    const [moved] = retargetAdded([original], a, copy);
    expect(moved).toMatchObject({ housingShader: 1, lensShader: null, parentBone: 2, id: original.id, sirens: true });
    expect((moved as AddedLightbar).spec).toEqual(original.spec);
  });

  it('lässt Nummern stehen, die sich nicht finden lassen, und ändert nichts für dieselbe Datei', () => {
    const a = readYft(buildTestYft());
    const original = lightbar({ housingShader: 1 }); // in der Zieldatei von keinem Teil benutzt
    expect((retargetAdded([original], a, readYft(buildTestYft()))[0] as AddedLightbar).housingShader).toBe(1);
    const list = [original];
    expect(retargetAdded(list, a, a)).toBe(list);
  });
});

describe('eigene Modelle als Anbauteil', () => {
  /** Ein Dreieck mit Normale +z, Material 0, Ecken (1,0,0), (0,1,0), (0,0,1). */
  const triangle = (materialIndex = 0) => ({
    name: 't',
    positions: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array(6),
    indices: Uint32Array.from([0, 1, 2]),
    materialIndex,
  });
  const model = (extra: Partial<AddedModel> = {}): AddedModel => ({
    id: 'm',
    kind: 'model',
    name: 'Test',
    parts: [triangle()],
    colors: ['#808080'],
    materials: [0],
    textures: [],
    sourceTextures: [],
    materialTextures: [],
    rotation: [0, 0, 0],
    scale: 1,
    position: [0, 0, 0],
    parentBone: 0,
    ...extra,
  });

  it('placeModelParts wendet Größe, Drehung und Lage an', () => {
    const [same] = placeModelParts(model());
    expect(Array.from(same!.positions)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const [moved] = placeModelParts(model({ scale: 2, position: [10, 20, 30] }));
    expect(Array.from(moved!.positions)).toEqual([12, 20, 30, 10, 22, 30, 10, 20, 32]);
    // 90 Grad um z: x -> y, y -> -x
    const [yaw] = placeModelParts(model({ rotation: [0, 0, 90] }));
    expect(Array.from(yaw!.positions).map((v) => Math.round(v * 1e4) / 1e4)).toEqual([0, 1, 0, -1, 0, 0, 0, 0, 1]);
    // 90 Grad um x: y -> z, z -> -y; die Normale (0,0,1) wird (0,-1,0)
    const [pitch] = placeModelParts(model({ rotation: [90, 0, 0] }));
    expect(Array.from(pitch!.positions).map((v) => Math.round(v * 1e4) / 1e4)).toEqual([1, 0, 0, 0, 0, 1, 0, -1, 0]);
    expect(Array.from(pitch!.normals.subarray(0, 3)).map((v) => Math.round(v * 1e4) / 1e4)).toEqual([0, -1, 0]);
    // die Eingabe bleibt unverändert
    const input = model();
    placeModelParts({ ...input, scale: 5 });
    expect(Array.from(input.parts[0]!.positions)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('modelMeshes fasst Teile mit demselben Fahrzeug-Material zusammen', () => {
    const placed = placeModelParts(model({ parts: [triangle(0), triangle(1), triangle(2)] }));
    const pieces = modelMeshes(placed, (m) => (m === 1 ? 7 : 4));
    expect(pieces.map((p) => p.shader).sort()).toEqual([4, 7]);
    const merged = pieces.find((p) => p.shader === 4)!;
    expect(merged.mesh.positions.length / 3).toBe(6);
    expect(Array.from(merged.mesh.indices)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('modelMeshes teilt zu große Gruppen und lehnt zu große Einzelteile ab', () => {
    const big = (n: number) => ({ ...triangle(), positions: new Float32Array(n * 3), normals: new Float32Array(n * 3), uvs: new Float32Array(n * 2), indices: Uint32Array.from([0, 1, 2]) });
    const pieces = modelMeshes(placeModelParts(model({ parts: [big(40000), big(40000)] })), () => 3);
    expect(pieces).toHaveLength(2);
    expect(() => modelMeshes(placeModelParts(model({ parts: [big(70000)] })), () => 3)).toThrow(/Eckpunkte/);
  });

  it('planAddedParts macht aus einem Modell Netze am gewählten Knochen mit übersetztem Material', () => {
    const yft = readYft(buildTestYft());
    const { plan, sirens } = planAddedParts(yft, [model({ parts: [triangle(0), triangle(1)], materials: [0, 0], parentBone: 1 })]);
    expect(plan.meshes).toHaveLength(1);
    expect(plan.meshes![0]).toMatchObject({ shader: 0, bone: 1 });
    expect(plan.bones).toEqual([]);
    expect(sirens).toEqual([]);
  });

  it('ein Modell mit Material, das die Datei nicht benutzt, wird mit Meldung abgelehnt', () => {
    expect(() => applyAddedParts(buildTestYft(), [model({ materials: [1] })])).toThrow(/benutzt dieses Material/);
  });

  it('Modelle und Lichtbalken lassen sich zusammen einbauen', () => {
    const applied = applyAddedParts(buildTestYft(), [lightbar(), model({ position: [0, 0, 2] })]);
    const yft = readYft(applied.file);
    // Gehäuse und Linsen des Balkens plus eine Geometrie des Modells
    expect(yft.geometries).toHaveLength(4);
    const last = yft.geometries[3]!;
    expect(last.vertexCount).toBe(3);
    expect(Array.from(last.positions)).toEqual([1, 0, 2, 0, 1, 2, 0, 0, 3]);
  });

  it('retargetAdded übersetzt die Materialien eines Modells', () => {
    const a = readYft(buildTestYft());
    const copy = { ...a, shaders: [a.shaders[1]!, a.shaders[0]!] };
    copy.geometries = a.geometries.map((g) => ({ ...g, shader: g.shader === 0 ? 1 : 0 }));
    const [moved] = retargetAdded([model({ materials: [0, 1] })], a, copy);
    expect((moved as AddedModel).materials).toEqual([1, 1]);
  });
});

describe('eigene Modelle mit Texturen', () => {
  const tex = (name: string) => ({ name, width: 4, height: 4, rgba: new Uint8Array(64).fill(200) });
  const quad = () => ({
    name: 'q',
    positions: Float32Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
    materialIndex: 0,
  });
  const textured = (extra: Partial<AddedModel> = {}): AddedModel => ({
    id: 'm1',
    kind: 'model',
    name: 'Tool Box.glb',
    parts: [quad()],
    colors: ['#ffffff'],
    materials: [0],
    textures: [tex('paint')],
    sourceTextures: [0],
    materialTextures: [0],
    rotation: [0, 0, 0],
    scale: 1,
    position: [0, 0, 0],
    parentBone: 0,
    ...extra,
  });

  it('legt für ein Material mit eigener Textur eine Kopie des Fahrzeug-Materials und die Textur an', () => {
    const yft = readYft(buildTestYft({ meshTexture: true }));
    const { plan, textures } = planAddedParts(yft, [textured()]);
    expect(plan.shaders).toEqual([{ from: 0, textureName: 'tool_box_1' }]);
    expect(textures).toHaveLength(1);
    expect(textures[0]).toMatchObject({ name: 'tool_box_1', width: 4, height: 4 });
    // das Netz benutzt die neue Nummer (hinter den 2 vorhandenen Materialien) und bringt die Texturkoordinaten mit
    expect(plan.meshes![0]!.shader).toBe(2);
    expect(Array.from(plan.meshes![0]!.mesh.uv0 ?? [])).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
  });

  it('Materialien ohne eigene Textur bleiben einfarbig ohne Texturkoordinaten', () => {
    const yft = readYft(buildTestYft({ meshTexture: true }));
    const { plan, textures } = planAddedParts(yft, [textured({ materialTextures: [null] })]);
    expect(plan.shaders).toEqual([]);
    expect(textures).toEqual([]);
    expect(plan.meshes![0]!.shader).toBe(0);
    expect(plan.meshes![0]!.mesh.uv0).toBeUndefined();
  });

  it('vergibt keine Texturnamen doppelt: auch nicht gegen vorhandene Texturen', () => {
    const yft = readYft(buildTestYft({ meshTexture: true }));
    const { textures } = planAddedParts(yft, [textured()], yft, { takenTextures: ['TOOL_BOX_1', 'tool_box_1_2'] });
    expect(textures[0]!.name).toBe('tool_box_1_3');
  });

  it('macht aus Umlauten im Namen lesbare Texturnamen', () => {
    const yft = readYft(buildTestYft({ meshTexture: true }));
    const { textures } = planAddedParts(yft, [{ ...textured(), name: 'Stoßfänger Größe' }]);
    expect(textures[0]!.name).toBe('stossfaenger_groesse_1');
  });

  it('dieselbe Textur auf zwei Materialien mit demselben Fahrzeug-Material wird nur einmal angelegt', () => {
    const part = { ...quad(), materialIndex: 1 };
    const yft = readYft(buildTestYft({ meshTexture: true }));
    const { plan, textures } = planAddedParts(yft, [textured({ parts: [quad(), part], colors: ['#fff', '#fff'], materials: [0, 0], materialTextures: [0, 0] })]);
    expect(plan.shaders).toHaveLength(1);
    expect(textures).toHaveLength(1);
    expect(plan.meshes).toHaveLength(1);
  });

  it('applyAddedParts baut Material, Teil und Textur-Verweis in die Datei ein', () => {
    const applied = applyAddedParts(buildTestYft({ meshTexture: true }), [textured()]);
    const yft = readYft(applied.file);
    expect(yft.shaders).toHaveLength(3);
    expect(yft.shaders[2]!.textures[0]).toEqual({ param: 'DiffuseSampler', name: 'tool_box_1' });
    expect(yft.geometries.at(-1)!.shader).toBe(2);
    expect(Array.from(yft.geometries.at(-1)!.uvs[0]!)).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
    expect(applied.textures.map((t) => t.name)).toEqual(['tool_box_1']);
  });
});
