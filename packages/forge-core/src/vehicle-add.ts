/**
 * Anbauteile für ein Fahrzeug: aus der Beschreibung der Teile (zum Beispiel ein Lichtbalken mit Maßen, Material und Sirenen) entsteht
 * der Änderungsplan für die Modelldatei (neue Knochen, neue Geometrien). Gerechnet wird je Modelldatei einzeln, denn Knochenzahl und
 * Material-Nummern sind für jede Datei die der Datei selbst (normale und Hochdetail-Fassung sind meist gleich, müssen es aber nicht sein).
 */

import { type EditPlan, type EditResult, type NewBone, editYft, readYft } from '@toolkit/rage-formats';
import type { AddMeshRequest, ShaderClone, Yft } from '@toolkit/rage-formats';
import { type LightbarSpec, buildLightbar, lightbarBones } from './lightbar.ts';
import type { MeshPart, TextureSource } from './model.ts';

export interface AddedLightbar {
  /** Beliebige, eindeutige Kennung (nur für die Oberfläche). */
  id: string;
  kind: 'lightbar';
  spec: LightbarSpec;
  /** Material (Shader-Nummer) für Wanne, Rippen und Füße. */
  housingShader: number;
  /** Material für die Linsen; ohne Angabe das des Gehäuses. */
  lensShader: number | null;
  /** Sirenen-Knochen für die Leuchtmodule anlegen. */
  sirens: boolean;
  /** Knochen, an dem der Balken hängt. */
  parentBone: number;
}

/** Ein eigenes 3D-Modell (GLB, OBJ, FBX ...) als Anbauteil. Seine Materialien werden Materialien des Fahrzeugs zugeordnet (einfarbig). */
export interface AddedModel {
  id: string;
  kind: 'model';
  /** Name zur Anzeige, meist der Dateiname. */
  name: string;
  /** Teile im GTA-Koordinatensystem (Z oben, Y vorn), Mitte bei x = y = 0, Unterkante bei z = 0, in Metern. */
  parts: MeshPart[];
  /** Grundfarbe je Material des Modells ("#rrggbb"), nur für die Vorschau. */
  colors: string[];
  /** Je Material des Modells das Material (Shader-Nummer) des Fahrzeugs. */
  materials: number[];
  /** Texturen des Modells (RGBA). */
  textures: TextureSource[];
  /** Welche Textur ein Material im Modell hat (Nummer in `textures`), sonst null. */
  sourceTextures: Array<number | null>;
  /**
   * Je Material des Modells: Nummer der eigenen Textur in `textures`, wenn das Material sie tragen soll, sonst null. Das Material wird dann
   * als Kopie des zugeordneten Fahrzeug-Materials mit dieser Textur als Haupttextur angelegt und die Texturkoordinaten des Modells bleiben.
   */
  materialTextures: Array<number | null>;
  /** Drehung in Grad um die Achsen x, y, z (in dieser Reihenfolge angewandt). */
  rotation: [number, number, number];
  /** Größenfaktor, 1 = Maße des Modells. */
  scale: number;
  /** Lage der Mitte der Unterkante im Fahrzeug. */
  position: [number, number, number];
  /** Knochen, an dem das Teil hängt. */
  parentBone: number;
}

export type AddedPart = AddedLightbar | AddedModel;

const MAX_VERTICES = 65535;

export interface PlacedPart {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** Index in `AddedModel.materials`. */
  materialIndex: number;
}

/** Wendet Größe, Drehung (x, dann y, dann z) und Lage auf die Teile des Modells an. */
export function placeModelParts(model: Pick<AddedModel, 'parts' | 'rotation' | 'scale' | 'position'>): PlacedPart[] {
  const [rx, ry, rz] = model.rotation.map((d) => (d * Math.PI) / 180) as [number, number, number];
  const [cx, sx] = [Math.cos(rx), Math.sin(rx)];
  const [cy, sy] = [Math.cos(ry), Math.sin(ry)];
  const [cz, sz] = [Math.cos(rz), Math.sin(rz)];
  const rotate = (x: number, y: number, z: number): [number, number, number] => {
    // um x
    const y1 = y * cx - z * sx;
    const z1 = y * sx + z * cx;
    // um y
    const x2 = x * cy + z1 * sy;
    const z2 = -x * sy + z1 * cy;
    // um z
    return [x2 * cz - y1 * sz, x2 * sz + y1 * cz, z2];
  };
  return model.parts.map((part) => {
    const positions = new Float32Array(part.positions.length);
    const normals = new Float32Array(part.normals.length);
    for (let i = 0; i + 2 < part.positions.length; i += 3) {
      const [x, y, z] = rotate(part.positions[i]! * model.scale, part.positions[i + 1]! * model.scale, part.positions[i + 2]! * model.scale);
      positions[i] = x + model.position[0];
      positions[i + 1] = y + model.position[1];
      positions[i + 2] = z + model.position[2];
      const [nx, ny, nz] = rotate(part.normals[i] ?? 0, part.normals[i + 1] ?? 0, part.normals[i + 2] ?? 1);
      normals[i] = nx;
      normals[i + 1] = ny;
      normals[i + 2] = nz;
    }
    return { positions, normals, uvs: part.uvs, indices: part.indices, materialIndex: part.materialIndex };
  });
}

/** Das, was `editYft` als Netz annimmt. */
type NewMeshLike = AddMeshRequest['mesh'];

/**
 * Fasst die Teile eines Modells nach Fahrzeug-Material zusammen (eine Geometrie je Material, bei mehr als 65535 Eckpunkten mehrere).
 * `shaderOf` liefert für ein Material des Modells die Shader-Nummer in der Datei.
 */
export function modelMeshes(
  placed: PlacedPart[],
  shaderOf: (materialIndex: number) => number,
  withUv: (materialIndex: number) => boolean = () => false,
): Array<{ shader: number; mesh: NewMeshLike }> {
  const byShader = new Map<number, PlacedPart[]>();
  for (const part of placed) {
    const shader = shaderOf(part.materialIndex);
    let list = byShader.get(shader);
    if (!list) byShader.set(shader, (list = []));
    list.push(part);
  }
  const out: Array<{ shader: number; mesh: NewMeshLike }> = [];
  for (const [shader, list] of byShader) {
    let chunk: PlacedPart[] = [];
    let vertices = 0;
    const flush = () => {
      if (chunk.length === 0) return;
      const positions = new Float32Array(vertices * 3);
      const normals = new Float32Array(vertices * 3);
      const indices: number[] = [];
      const uv = chunk.every((part) => withUv(part.materialIndex) && part.uvs.length === (part.positions.length / 3) * 2) ? new Float32Array(vertices * 2) : null;
      let offset = 0;
      for (const part of chunk) {
        const n = part.positions.length / 3;
        positions.set(part.positions, offset * 3);
        normals.set(part.normals, offset * 3);
        uv?.set(part.uvs, offset * 2);
        for (let i = 0; i + 2 < part.indices.length; i += 3) indices.push(part.indices[i]! + offset, part.indices[i + 1]! + offset, part.indices[i + 2]! + offset);
        offset += n;
      }
      if (indices.length > 0) out.push({ shader, mesh: uv ? { positions, normals, indices, uv0: uv } : { positions, normals, indices } });
      chunk = [];
      vertices = 0;
    };
    for (const part of list) {
      const n = part.positions.length / 3;
      if (n > MAX_VERTICES) throw new Error(`Ein Teil des Modells hat ${n} Eckpunkte, erlaubt sind ${MAX_VERTICES} je Geometrie. Teile das Modell in kleinere Stücke.`);
      if (vertices + n > MAX_VERTICES) flush();
      chunk.push(part);
      vertices += n;
    }
    flush();
  }
  return out;
}

export interface PlannedSiren {
  /** Nummer des Knochens `siren<Nummer>` und des Lichts in der Sirenen-Einstellung. */
  number: number;
  /** Lage im Fahrzeug. */
  position: [number, number, number];
}

/** Eine Textur, die in die Texturdateien des Fahrzeugs aufgenommen werden muss. */
export interface PlannedTexture {
  name: string;
  width: number;
  height: number;
  rgba: Uint8Array;
}

export interface PlanOptions {
  /** Namen von Texturen, die es schon gibt (in den Texturdateien des Fahrzeugs), damit neue Namen nicht kollidieren. */
  takenTextures?: Iterable<string>;
}

export interface AddedPlan {
  plan: EditPlan;
  /** Texturen für die neuen Materialien. */
  textures: PlannedTexture[];
  sirens: PlannedSiren[];
  /** Namen der neuen Knochen. */
  boneNames: string[];
}

function describeShader(yft: Yft, index: number): string {
  const shader = yft.shaders[index];
  const diffuse = shader?.textures.find((t) => t.param === 'DiffuseSampler')?.name;
  return `${(shader?.preset ?? '?').replace(/^vehicle_/, '')}${diffuse ? ` / ${diffuse}` : ''}`;
}

/** Ein Name, den noch kein Knochen trägt: base, base2, base3 ... */
function uniqueName(base: string, taken: Set<string>): string {
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base}${n}`;
  taken.add(name.toLowerCase());
  return name;
}

/**
 * Das Material `index` des Fahrzeugs `from` in der Datei `to` finden. Material-Nummern sind je Datei verschieden (die Hochdetail-Fassung
 * ordnet sie oft anders), deshalb zählt das Aussehen: gleiche Voreinstellung (Shader) und gleiche Texturen. Gibt es das Material in `to`
 * nicht in dieser Form, zählt die Voreinstellung mit der gleichen Haupttextur; sonst wird `null` geliefert.
 */
export function matchShader(from: Yft, index: number, to: Yft): number | null {
  if (from === to) return index;
  const source = from.shaders[index];
  if (!source) return null;
  const diffuse = (sh: Yft['shaders'][number]) => sh.textures.find((t) => t.param === 'DiffuseSampler')?.name.toLowerCase() ?? '';
  const key = (sh: Yft['shaders'][number]) => sh.textures.map((t) => `${t.param}=${t.name.toLowerCase()}`).sort().join('|');
  const used = new Set(to.geometries.map((g) => g.shader));
  let best: number | null = null;
  let bestScore = 0;
  to.shaders.forEach((candidate, i) => {
    if (candidate.preset !== source.preset || !used.has(i)) return;
    let score = 0;
    if (key(candidate) === key(source)) score += 100;
    if (diffuse(candidate) === diffuse(source)) score += 10;
    if (candidate.renderBucket === source.renderBucket) score += 1;
    // bei gleichem Aussehen bleibt es beim gleichen Eintrag (innerhalb derselben Datei ändert sich so nichts)
    if (i === index) score += 0.5;
    // ohne gleiche Haupttextur kein Treffer (ein anderes Material der gleichen Art sähe anders aus)
    if (diffuse(candidate) !== diffuse(source)) return;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Den Knochen `index` des Fahrzeugs `from` in der Datei `to` finden (über den Namen). */
export function matchBone(from: Yft, index: number, to: Yft): number | null {
  if (from === to) return index;
  const name = from.bones[index]?.name.toLowerCase();
  if (name === undefined) return null;
  return to.bones.find((b) => b.name.toLowerCase() === name)?.index ?? null;
}

/**
 * Übersetzt Material- und Knochen-Nummern der Teile von einem Fahrzeug (`from`) auf ein anderes (`to`), zum Beispiel wenn die Oberfläche von der
 * normalen zur Hochdetail-Datei wechselt. Was sich nicht finden lässt, behält seine Nummer; beim Einbauen meldet `planAddedParts` es dann.
 */
export function retargetAdded(added: AddedPart[], from: Yft, to: Yft): AddedPart[] {
  if (from === to) return added;
  return added.map((part): AddedPart => {
    const parentBone = matchBone(from, part.parentBone, to) ?? part.parentBone;
    if (part.kind === 'model') return { ...part, materials: part.materials.map((m) => matchShader(from, m, to) ?? m), parentBone };
    return {
      ...part,
      housingShader: matchShader(from, part.housingShader, to) ?? part.housingShader,
      lensShader: part.lensShader === null ? null : (matchShader(from, part.lensShader, to) ?? part.lensShader),
      parentBone,
    };
  });
}

/** Name für die Textur eines Modell-Materials: <Modell>_<Nummer>, bei Kollision mit Zahl. */
function textureNameFor(modelName: string, materialIndex: number, taken: Set<string>): string {
  const plain = modelName.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const slug = plain.replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20) || 'part';
  const base = `${slug}_${materialIndex + 1}`;
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
  taken.add(name);
  return name;
}

/**
 * Plan für die Modelldatei, die `yft` beschreibt. Material- und Knochen-Nummern der Teile gelten für das Fahrzeug `reference` (das, was die
 * Oberfläche zeigt) und werden für `yft` über Aussehen und Namen übersetzt.
 */
export function planAddedParts(yft: Yft, added: AddedPart[], reference: Yft = yft, options: PlanOptions = {}): AddedPlan {
  const bones: NewBone[] = [];
  const meshes: AddMeshRequest[] = [];
  const clones: ShaderClone[] = [];
  const textures: PlannedTexture[] = [];
  const takenTextures = new Set<string>();
  for (const name of options.takenTextures ?? []) takenTextures.add(name.toLowerCase());
  for (const shader of yft.shaders) for (const t of shader.textures) takenTextures.add(t.name.toLowerCase());
  /** Kopien je (Textur, Vorbild-Material), damit dieselbe Textur nur einmal angelegt wird. */
  const cloneOf = new Map<string, number>();
  const sirens: PlannedSiren[] = [];
  const takenSirens = new Set<number>();
  const takenNames = new Set(yft.bones.map((b) => b.name.toLowerCase()));
  let firstIndex = yft.bones.length;

  for (const original of added) {
    if (original.kind === 'model') {
      const parent = matchBone(reference, original.parentBone, yft);
      if (parent === null) throw new Error(`Der Knochen "${reference.bones[original.parentBone]?.name ?? original.parentBone}" gibt es in dieser Modelldatei nicht.`);
      const shaders = original.materials.map((m) => {
        const mapped = matchShader(reference, m, yft);
        if (mapped === null) throw new Error(`Das Material "${describeShader(reference, m)}" gibt es in dieser Modelldatei nicht.`);
        return mapped;
      });
      // Eigene Texturen: Das Material des Fahrzeugs wird kopiert und bekommt die Textur des Modells als Haupttextur.
      const finalShader = shaders.slice();
      const own = new Set<number>();
      original.materialTextures.forEach((textureIndex, i) => {
        const texture = textureIndex === null || textureIndex === undefined ? undefined : original.textures[textureIndex];
        if (!texture || shaders[i] === undefined) return;
        const key = `${original.id}:${textureIndex}:${shaders[i]}`;
        let index = cloneOf.get(key);
        if (index === undefined) {
          const name = textureNameFor(original.name, i, takenTextures);
          clones.push({ from: shaders[i]!, textureName: name });
          textures.push({ name, width: texture.width, height: texture.height, rgba: texture.rgba });
          index = yft.shaders.length + clones.length - 1;
          cloneOf.set(key, index);
        }
        finalShader[i] = index;
        own.add(i);
      });
      for (const piece of modelMeshes(placeModelParts(original), (materialIndex) => finalShader[materialIndex] ?? finalShader[0] ?? 0, (materialIndex) => own.has(materialIndex))) {
        meshes.push({ mesh: piece.mesh, shader: piece.shader, bone: parent });
      }
      continue;
    }
    const housing = matchShader(reference, original.housingShader, yft);
    if (housing === null) throw new Error(`Das Material "${describeShader(reference, original.housingShader)}" (Gehäuse) gibt es in dieser Modelldatei nicht.`);
    let lens: number | null = null;
    if (original.lensShader !== null) {
      lens = matchShader(reference, original.lensShader, yft);
      if (lens === null) throw new Error(`Das Material "${describeShader(reference, original.lensShader)}" (Linsen) gibt es in dieser Modelldatei nicht.`);
    }
    const parent = matchBone(reference, original.parentBone, yft);
    if (parent === null) throw new Error(`Der Knochen "${reference.bones[original.parentBone]?.name ?? original.parentBone}" gibt es in dieser Modelldatei nicht.`);
    const part: AddedPart = { ...original, housingShader: housing, lensShader: lens, parentBone: parent };
    const build = buildLightbar(part.spec);
    const result = lightbarBones(yft, build, part.spec, {
      parentBone: part.parentBone,
      name: uniqueName('forge_lightbar', takenNames),
      firstIndex,
      takenSirens,
      withSirens: part.sirens,
    });
    bones.push(...result.bones);
    firstIndex += result.bones.length;
    for (const bone of result.bones.slice(1)) takenNames.add(bone.name.toLowerCase());
    result.sirens.forEach((number, i) => {
      takenSirens.add(number);
      sirens.push({ number, position: build.lights[i]! });
    });
    meshes.push({ mesh: build.housing, shader: part.housingShader, bone: result.barBone });
    meshes.push({ mesh: build.lens, shader: part.lensShader ?? part.housingShader, bone: result.barBone });
  }
  return { plan: { bones, meshes, shaders: clones, lods: [0, 1, 2] }, textures, sirens, boneNames: bones.map((b) => b.name) };
}

export interface AppliedParts {
  file: Uint8Array;
  /** Texturen, die in die Texturdateien des Fahrzeugs gehören. */
  textures: PlannedTexture[];
  sirens: PlannedSiren[];
  result: EditResult;
}

/**
 * Wendet die Anbauteile auf eine Modelldatei (YFT) an. `reference` ist das Fahrzeug, für das die Material- und Knochen-Nummern der Teile gelten
 * (Standard: die Datei selbst). Wirft mit einer verständlichen Meldung, wenn ein Teil nicht passt.
 */
export function applyAddedParts(file: Uint8Array, added: AddedPart[], reference?: Yft, options: PlanOptions = {}): AppliedParts {
  const yft = readYft(file);
  const planned = planAddedParts(yft, added, reference ?? yft, options);
  const result = editYft(file, planned.plan);
  return { file: result.file, textures: planned.textures, sirens: planned.sirens, result };
}
