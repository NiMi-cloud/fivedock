/**
 * Fahrzeug- und Modelldateien lesen: YFT (Fragment, Legacy Version 162) und YDR (Drawable, Version 165).
 *
 * Gelesen wird die höchste Detailstufe des Haupt-Drawables mit Geometrie (Eckpunkte, Indizes), Shadern (mit Texturnamen),
 * Skelett (Knochennamen und Lage). Kind-Drawables der Physik (abbrechende Teile) werden nicht gelesen; bei Fahrzeugen
 * stecken Karosserie, Türen und Anbauteile im Haupt-Drawable und gehören über die Knochengewichte der Eckpunkte zu ihren Knochen.
 *
 * Alle Feldpositionen wurden aus Beobachtung an echten Dateien gewonnen und gegen die XML-Ausgabe von CodeWalker geprüft
 * (spikes/09-vehicle/verify-yft.ts). Eigene YDR-Dateien dienen den Tests.
 */

import { deflateSync } from 'fflate';
import { joaat } from './jenkins.ts';
import { Memory, YftReadError } from './memory.ts';
import { SLOT_BLEND_INDICES, SLOT_BLEND_WEIGHTS, SLOT_COLOUR0, SLOT_NORMAL, SLOT_POSITION, SLOT_TEXCOORD0, halfToFloat, readLayout } from './vertex-layout.ts';
import { SYSTEM_BASE, parseResource } from './rsc7.ts';
import { SHADER_PRESET_NAMES } from './shader-names.ts';

export type Vec3 = [number, number, number];

export interface YftBone {
  index: number;
  name: string;
  tag: number;
  /** Index des Elternknochens, -1 für die Wurzel. */
  parent: number;
  /** Lage im Fahrzeug (Grundstellung). */
  position: Vec3;
}

export interface YftShaderTexture {
  /** Name des Parameters, zum Beispiel "DiffuseSampler", sonst "hash_XXXXXXXX". */
  param: string;
  /** Name der Textur im YTD. */
  name: string;
}

export interface YftShader {
  /** Name der Voreinstellung ohne Endung (zum Beispiel "vehicle_paint3"), sonst "hash_XXXXXXXX". */
  preset: string;
  presetHash: number;
  nameHash: number;
  renderBucket: number;
  textures: YftShaderTexture[];
}

export interface YftGeometry {
  /** Index in `Yft.shaders`. */
  shader: number;
  /** Index des Modells, zu dem die Geometrie gehört. */
  model: number;
  vertexCount: number;
  positions: Float32Array;
  normals: Float32Array | null;
  /** Texturkoordinaten, je Satz zwei Werte je Eckpunkt. Index 0 ist TexCoord0. */
  uvs: Array<Float32Array | null>;
  /** Farbe als vier Bytes je Eckpunkt in der Reihenfolge der Datei. */
  colors: Uint8Array | null;
  blendIndices: Uint8Array | null;
  blendWeights: Uint8Array | null;
  /** Übersetzt Blend-Indizes in Knochenindizes (leer: Indizes sind schon Knochenindizes). */
  boneIds: Uint16Array;
  /** Dreiecksliste. */
  indices: Uint32Array;
}

export interface Yft {
  name: string;
  boundsMin: Vec3;
  boundsMax: Vec3;
  bones: YftBone[];
  shaders: YftShader[];
  geometries: YftGeometry[];
}

export { YftReadError };

// --- Namen -----------------------------------------------------------------------------------------------

const hexName = (hash: number) => `hash_${hash.toString(16).toUpperCase().padStart(8, '0')}`;

const PRESET_BY_HASH = new Map<number, string>();
for (const name of SHADER_PRESET_NAMES) {
  PRESET_BY_HASH.set(joaat(`${name}.sps`), name);
  PRESET_BY_HASH.set(joaat(name), name);
}

/** Parameternamen der Fahrzeug-Shader, die in Dateien als Hash stehen. */
const PARAM_NAMES = [
  'DiffuseSampler', 'DiffuseSampler2', 'BumpSampler', 'SpecSampler', 'DirtSampler', 'DamageSampler', 'PlateBgSampler',
  'PlateBgBumpSampler', 'FontSampler', 'FontNormalSampler', 'matDiffuseColor', 'matDiffuseColor2', 'dirtColor', 'dirtLevelMod',
  'specularIntensityMult', 'specularFalloffMult', 'specularFresnel', 'specMapIntMask', 'bumpiness', 'reflectivePower',
  'emissiveMultiplier', 'envEffScale', 'envEffTexTileUV', 'envEffThickness', 'diffuse2SpecMod', 'dimmerSetPacked',
];
const PARAM_BY_HASH = new Map(PARAM_NAMES.map((n) => [joaat(n), n]));

/** Name der Shader-Voreinstellung zu einem Hash, sonst null. */
export function presetNameFromHash(hash: number): string | null {
  return PRESET_BY_HASH.get(hash) ?? null;
}

/** true für die Lack-Shader der Fahrzeuge (vehicle_paint1 bis vehicle_paint9). */
export function isPaintPreset(preset: string): boolean {
  return /^vehicle_paint\d+/.test(preset);
}

// --- Eckpunkte --------------------------------------------------------------------------------------------

function readVector(view: DataView, at: number, type: number, count: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < count; k++) {
    if (type === 1 || type === 3) out.push(halfToFloat(view.getUint16(at + k * 2, true)));
    else out.push(view.getFloat32(at + k * 4, true));
  }
  return out;
}

function readGeometry(mem: Memory, geometry: number, shader: number, model: number): YftGeometry {
  const vb = mem.ptr(geometry + 0x18);
  const ib = mem.ptr(geometry + 0x38);
  if (!vb || !ib) throw new YftReadError('corrupt', 'Geometrie ohne Eckpunkt- oder Indexpuffer.');

  const indexCount = mem.u32(geometry + 0x58);
  const vertexCount = mem.u32(vb + 0x18) || mem.u16(geometry + 0x60);
  const strideHint = mem.u16(vb + 0x08);
  const dataPointer = mem.ptr(vb + 0x10) || mem.ptr(vb + 0x20);
  const decl = mem.ptr(vb + 0x30);
  if (!dataPointer || !decl) throw new YftReadError('corrupt', 'Eckpunktpuffer ohne Daten.');

  const layout = readLayout(mem, decl, strideHint);
  const raw = mem.bytes(dataPointer, vertexCount * layout.stride);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

  const position = layout.slots[SLOT_POSITION];
  if (!position || position.type !== 6) throw new YftReadError('unsupported', 'Eckpunkte ohne Position als drei Gleitkommazahlen.');
  const positions = new Float32Array(vertexCount * 3);

  const normalSlot = layout.slots[SLOT_NORMAL];
  const normals = normalSlot ? new Float32Array(vertexCount * 3) : null;
  const uvSlots = layout.slots.slice(SLOT_TEXCOORD0, SLOT_TEXCOORD0 + 8);
  const uvs: Array<Float32Array | null> = uvSlots.map((s) => (s ? new Float32Array(vertexCount * 2) : null));
  const colourSlot = layout.slots[SLOT_COLOUR0];
  const colors = colourSlot ? new Uint8Array(vertexCount * 4) : null;
  const weightSlot = layout.slots[SLOT_BLEND_WEIGHTS];
  const indexSlot = layout.slots[SLOT_BLEND_INDICES];
  const blendWeights = weightSlot ? new Uint8Array(vertexCount * 4) : null;
  const blendIndices = indexSlot ? new Uint8Array(vertexCount * 4) : null;

  for (let v = 0; v < vertexCount; v++) {
    const at = v * layout.stride;
    positions.set(readVector(view, at + position.offset, 6, 3), v * 3);
    if (normals && normalSlot) {
      if (normalSlot.type === 10) {
        for (let k = 0; k < 3; k++) normals[v * 3 + k] = view.getInt8(at + normalSlot.offset + k) / 127;
      } else {
        normals.set(readVector(view, at + normalSlot.offset, normalSlot.type, 3), v * 3);
      }
    }
    uvSlots.forEach((s, i) => {
      if (s) uvs[i]!.set(readVector(view, at + s.offset, s.type, 2), v * 2);
    });
    if (colors && colourSlot) colors.set(raw.subarray(at + colourSlot.offset, at + colourSlot.offset + 4), v * 4);
    if (blendWeights && weightSlot) blendWeights.set(raw.subarray(at + weightSlot.offset, at + weightSlot.offset + 4), v * 4);
    if (blendIndices && indexSlot) blendIndices.set(raw.subarray(at + indexSlot.offset, at + indexSlot.offset + 4), v * 4);
  }

  const indexData = mem.ptr(ib + 0x10);
  const indexRaw = mem.bytes(indexData, indexCount * 2);
  const indexView = new DataView(indexRaw.buffer, indexRaw.byteOffset, indexRaw.byteLength);
  const indices = new Uint32Array(indexCount);
  for (let i = 0; i < indexCount; i++) {
    const value = indexView.getUint16(i * 2, true);
    if (value >= vertexCount) throw new YftReadError('corrupt', 'Index zeigt hinter das Ende der Eckpunkte.');
    indices[i] = value;
  }

  const boneIdsPointer = mem.ptr(geometry + 0x68);
  const boneIdsCount = mem.u16(geometry + 0x72);
  const boneIds = new Uint16Array(boneIdsPointer ? boneIdsCount : 0);
  for (let i = 0; i < boneIds.length; i++) boneIds[i] = mem.u16(boneIdsPointer + i * 2);

  return { shader, model, vertexCount, positions, normals, uvs, colors, blendIndices, blendWeights, boneIds, indices };
}

// --- Shader ------------------------------------------------------------------------------------------------

function readShaders(mem: Memory, group: number): YftShader[] {
  if (!group) return [];
  const array = mem.ptr(group + 0x10);
  const count = mem.u16(group + 0x18);
  const shaders: YftShader[] = [];
  for (let i = 0; i < count; i++) {
    const fx = mem.ptr(array + i * 8);
    if (!fx) {
      shaders.push({ preset: 'unbekannt', presetHash: 0, nameHash: 0, renderBucket: 0, textures: [] });
      continue;
    }
    const params = mem.ptr(fx);
    const nameHash = mem.u32(fx + 0x08);
    const paramCount = mem.u8(fx + 0x10);
    const presetHash = mem.u32(fx + 0x18);

    // Aufbau des Parameterblocks: Köpfe (16 Byte je Parameter), dann die Vektordaten, dann je Parameter ein Namens-Hash.
    let vectorBytes = 0;
    const types: number[] = [];
    for (let p = 0; p < paramCount; p++) {
      const type = mem.u8(params + p * 16);
      types.push(type);
      if (type > 0) vectorBytes += 16 * type;
    }
    const hashes = params + paramCount * 16 + vectorBytes;

    const textures: YftShaderTexture[] = [];
    for (let p = 0; p < paramCount; p++) {
      if (types[p] !== 0) continue;
      const texture = mem.ptr(params + p * 16 + 8);
      if (!texture) continue;
      const namePointer = mem.ptr(texture + 0x28);
      const hash = mem.u32(hashes + p * 4);
      textures.push({ param: PARAM_BY_HASH.get(hash) ?? hexName(hash), name: namePointer ? mem.cstring(namePointer) : '' });
    }
    shaders.push({
      preset: PRESET_BY_HASH.get(presetHash) ?? hexName(presetHash),
      presetHash,
      nameHash,
      renderBucket: mem.u8(fx + 0x11),
      textures,
    });
  }
  return shaders;
}

// --- Skelett -----------------------------------------------------------------------------------------------

function readBones(mem: Memory, skeleton: number): YftBone[] {
  if (!skeleton) return [];
  const bones = mem.ptr(skeleton + 0x20);
  const transforms = mem.ptr(skeleton + 0x30);
  const count = mem.u16(skeleton + 0x5e);
  const out: YftBone[] = [];
  for (let i = 0; i < count; i++) {
    const b = bones + i * 80;
    const namePointer = mem.ptr(b + 0x38);
    const position: Vec3 = transforms
      ? [mem.f32(transforms + i * 64 + 0x30), mem.f32(transforms + i * 64 + 0x34), mem.f32(transforms + i * 64 + 0x38)]
      : [mem.f32(b + 0x10), mem.f32(b + 0x14), mem.f32(b + 0x18)];
    out.push({
      index: i,
      name: namePointer ? mem.cstring(namePointer) : `bone_${i}`,
      tag: mem.u16(b + 0x44),
      parent: mem.i16(b + 0x32),
      position,
    });
  }
  return out;
}

// --- Drawable und Fragment ---------------------------------------------------------------------------------

function readDrawable(mem: Memory, drawable: number, name: string): Yft {
  const shaders = readShaders(mem, mem.ptr(drawable + 0x10));
  const bones = readBones(mem, mem.ptr(drawable + 0x18));
  const boundsMin: Vec3 = [mem.f32(drawable + 0x30), mem.f32(drawable + 0x34), mem.f32(drawable + 0x38)];
  const boundsMax: Vec3 = [mem.f32(drawable + 0x40), mem.f32(drawable + 0x44), mem.f32(drawable + 0x48)];

  const geometries: YftGeometry[] = [];
  const list = mem.ptr(drawable + 0x50); // höchste Detailstufe
  if (list) {
    const array = mem.ptr(list);
    const modelCount = mem.u16(list + 8);
    for (let m = 0; m < modelCount; m++) {
      const model = mem.ptr(array + m * 8);
      if (!model) continue;
      const geometryArray = mem.ptr(model + 0x08);
      const geometryCount = mem.u16(model + 0x10);
      const shaderMap = mem.ptr(model + 0x20);
      for (let g = 0; g < geometryCount; g++) {
        const geometry = mem.ptr(geometryArray + g * 8);
        if (!geometry) continue;
        const shader = shaderMap ? mem.u16(shaderMap + g * 2) : 0;
        geometries.push(readGeometry(mem, geometry, shader, m));
      }
    }
  }
  return { name, boundsMin, boundsMax, bones, shaders, geometries };
}

function open(file: Uint8Array, expectedVersion: number, what: string): Memory {
  if (file.length >= 4 && new DataView(file.buffer, file.byteOffset, file.byteLength).getUint32(0, true) === 0x50415846) {
    throw new YftReadError('encrypted', 'Die Datei ist verschlüsselt (Cfx.re-Escrow) und kann nicht gelesen werden.');
  }
  let res: ReturnType<typeof parseResource>;
  try {
    res = parseResource(file);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new YftReadError(message.includes('RSC7') ? 'not-rsc7' : 'corrupt', message);
  }
  if (res.version !== expectedVersion) {
    throw new YftReadError('wrong-version', `Keine ${what}-Datei (Version ${res.version}, erwartet ${expectedVersion}).`);
  }
  return new Memory(res.system, res.graphics);
}

/** Liest ein Fahrzeug oder Fragment (YFT, Legacy Version 162). */
export function readYft(file: Uint8Array): Yft {
  const mem = open(file, 162, 'Fragment');
  const drawable = mem.ptr(SYSTEM_BASE + 0x30);
  if (!drawable) throw new YftReadError('corrupt', 'Das Fragment enthält kein Drawable.');
  const namePointer = mem.ptr(SYSTEM_BASE + 0x58);
  return readDrawable(mem, drawable, namePointer ? mem.cstring(namePointer) : '');
}

/** Liest ein Drawable (YDR, Legacy Version 165) mit derselben Struktur wie `readYft`. */
export function readYdr(file: Uint8Array): Yft {
  const mem = open(file, 165, 'Drawable');
  const namePointer = mem.ptr(SYSTEM_BASE + 0xa8);
  return readDrawable(mem, SYSTEM_BASE, namePointer ? mem.cstring(namePointer) : '');
}

// --- Dreiecke entfernen ------------------------------------------------------------------------------------

export interface YftEditTarget {
  /** Detailstufe: 0 hoch, 1 mittel, 2 niedrig, 3 sehr niedrig. */
  lod: number;
  /** Nummer der Geometrie innerhalb dieser Detailstufe (in der Reihenfolge der Datei). */
  index: number;
  geometry: YftGeometry;
  shader: YftShader;
  bones: YftBone[];
}

export interface YftEditResult {
  file: Uint8Array;
  /** Entfernte Dreiecke insgesamt. */
  removed: number;
  /** Entfernte Dreiecke je Detailstufe (vier Werte). */
  byLod: number[];
}

/**
 * Entfernt Dreiecke aus allen Detailstufen eines Fahrzeugs (YFT). `decide` bekommt jede Geometrie und liefert je Dreieck 1
 * (entfernen) oder 0 (behalten), oder null für „nichts ändern“.
 *
 * Die Datei wird an Ort und Stelle geändert: Der Indexpuffer der Geometrie wird zusammengeschoben, die Zahl der Indizes im
 * Puffer und in der Geometrie angepasst, der freie Rest mit Nullen gefüllt. Eckpunkte, Shader, Skelett und alle Zeiger bleiben, wie
 * sie sind, die Datei hat danach dieselbe Größe im Speicher und dieselben Seiten-Flags wie vorher.
 */
export function removeYftTriangles(file: Uint8Array, decide: (target: YftEditTarget) => ArrayLike<number> | null): YftEditResult {
  return editDrawableFile(file, 162, 'Fragment', (mem) => mem.ptr(SYSTEM_BASE + 0x30), decide);
}

/** Wie `removeYftTriangles`, für ein Drawable (YDR, Version 165). */
export function removeYdrTriangles(file: Uint8Array, decide: (target: YftEditTarget) => ArrayLike<number> | null): YftEditResult {
  return editDrawableFile(file, 165, 'Drawable', () => SYSTEM_BASE, decide);
}

function editDrawableFile(
  file: Uint8Array,
  version: number,
  what: string,
  locate: (mem: Memory) => number,
  decide: (target: YftEditTarget) => ArrayLike<number> | null,
): YftEditResult {
  let res: ReturnType<typeof parseResource>;
  try {
    res = parseResource(file);
  } catch (e) {
    throw new YftReadError('corrupt', e instanceof Error ? e.message : String(e));
  }
  if (res.version !== version) throw new YftReadError('wrong-version', `Keine ${what}-Datei (Version ${res.version}, erwartet ${version}).`);
  const mem = new Memory(res.system, res.graphics);
  const drawable = locate(mem);
  if (!drawable) throw new YftReadError('corrupt', `Die ${what}-Datei enthält kein Drawable.`);

  const shaders = readShaders(mem, mem.ptr(drawable + 0x10));
  const bones = readBones(mem, mem.ptr(drawable + 0x18));
  const byLod = [0, 0, 0, 0];
  const done = new Set<number>();

  for (let lod = 0; lod < 4; lod++) {
    const list = mem.ptr(drawable + 0x50 + lod * 8);
    if (!list) continue;
    const array = mem.ptr(list);
    const modelCount = mem.u16(list + 8);
    let index = 0;
    for (let m = 0; m < modelCount; m++) {
      const model = mem.ptr(array + m * 8);
      if (!model) continue;
      const geometryArray = mem.ptr(model + 0x08);
      const geometryCount = mem.u16(model + 0x10);
      const shaderMap = mem.ptr(model + 0x20);
      for (let g = 0; g < geometryCount; g++) {
        const address = mem.ptr(geometryArray + g * 8);
        if (!address) continue;
        const current = index++;
        // Teilen sich zwei Detailstufen dieselbe Geometrie, wird sie nur einmal bearbeitet.
        if (done.has(address)) continue;
        done.add(address);
        const shaderIndex = shaderMap ? mem.u16(shaderMap + g * 2) : 0;
        const geometry = readGeometry(mem, address, shaderIndex, m);
        const shader = shaders[shaderIndex];
        if (!shader) continue;
        const flags = decide({ lod, index: current, geometry, shader, bones });
        if (!flags) continue;

        const kept: number[] = [];
        for (let t = 0; t * 3 + 2 < geometry.indices.length; t++) {
          if (flags[t]) continue;
          kept.push(geometry.indices[t * 3]!, geometry.indices[t * 3 + 1]!, geometry.indices[t * 3 + 2]!);
        }
        const removed = (geometry.indices.length - kept.length) / 3;
        if (removed === 0) continue;

        const indexBuffer = mem.ptr(address + 0x38);
        const data = mem.bytes(mem.ptr(indexBuffer + 0x10), geometry.indices.length * 2);
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        for (let i = 0; i < geometry.indices.length; i++) view.setUint16(i * 2, i < kept.length ? kept[i]! : 0, true);
        mem.setU32(address + 0x58, kept.length);
        mem.setU32(address + 0x5c, kept.length / 3);
        mem.setU32(indexBuffer + 0x08, kept.length);
        byLod[lod]! += removed;
      }
    }
  }

  const removed = byLod.reduce((a, b) => a + b, 0);
  if (removed === 0) return { file, removed: 0, byLod };
  // Kopf unverändert (Magic, Version, Seiten-Flags), Inhalt neu verpackt.
  const packed = deflateSync(concat(res.system, res.graphics), { level: 9 });
  const out = new Uint8Array(16 + packed.length);
  out.set(file.subarray(0, 16), 0);
  out.set(packed, 16);
  return { file: out, removed, byLod };
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
