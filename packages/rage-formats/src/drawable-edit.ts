/**
 * Neue Geometrie in ein bestehendes Fahrzeug (YFT) oder Drawable (YDR) einfügen.
 *
 * Eine neue Geometrie braucht: Geometrie-Block (152 Byte plus Knochenpalette), Vertex-Buffer-Objekt (128 Byte), Vertex-Deklaration
 * (16 Byte), Index-Buffer-Objekt (96 Byte), die Eckpunktdaten und die Indexdaten. Als Vorlage dient eine vorhandene Geometrie, die
 * dasselbe Material (denselben Shader) benutzt: Ihre Kopfdaten werden kopiert, nur Zeiger und Zahlen ändern sich. So passt der
 * Aufbau der Eckpunkte immer zum Shader.
 *
 * Das Modell der Detailstufe bekommt neue Felder (Geometriezeiger, Grenzen, Shader-Zuordnung), die als neue Blöcke angehängt werden
 * und im Modellkopf auf die neuen Felder zeigen. Alte Blöcke bleiben als ungenutzte Daten liegen. Shader, Skelett und alle anderen
 * Teile der Datei bleiben unverändert.
 */

import { Memory, YftReadError } from './memory.ts';
import { type NewBlock, ResourceEditor } from './resource-edit.ts';
import { GRAPHICS_BASE, SYSTEM_BASE } from './rsc7.ts';
import { type PaintConversion, type ShaderClone, cloneShaders, convertPaintShaders } from './shader-edit.ts';
import { type NewBone, addBones } from './skeleton-edit.ts';
import {
  SLOT_BLEND_INDICES,
  SLOT_BLEND_WEIGHTS,
  SLOT_COLOUR0,
  SLOT_COLOUR1,
  SLOT_TEXCOORD0,
  type VertexLayout,
  readLayout,
  writeVertices,
} from './vertex-layout.ts';

export interface NewMesh {
  /** 3 Werte je Eckpunkt, im Modellraum des Fahrzeugs (x rechts, y vorn, z oben, Meter). */
  positions: Float32Array;
  /** 3 Werte je Eckpunkt. */
  normals: Float32Array;
  /** Dreiecksliste (Eckpunktnummern, höchstens 65535 Eckpunkte). */
  indices: ArrayLike<number>;
  /** 2 Werte je Eckpunkt. Ohne Angabe nehmen alle Eckpunkte die Texturkoordinate, die die Vorlage am häufigsten benutzt. */
  uv0?: Float32Array;
  uv1?: Float32Array;
}

export interface AddMeshRequest {
  mesh: NewMesh;
  /** Nummer des Shaders (Materials) in der Shader-Gruppe der Datei. Mindestens eine vorhandene Geometrie muss ihn benutzen. */
  shader: number;
  /** Knochen, an den das Teil gebunden wird (Index im Skelett). */
  bone: number;
}

export interface AddMeshesOptions {
  /** Detailstufen, in die das Teil kommt (0 hoch, 1 mittel, 2 niedrig, 3 sehr niedrig). Standard: hoch und mittel. */
  lods?: number[];
}

export interface AddMeshesResult {
  file: Uint8Array;
  /** Anzahl der eingefügten Geometrien (je Teil eine, bei sehr großen Teilen mehrere; mehrere Detailstufen teilen sie sich). */
  added: number;
  /** Detailstufen, in denen mindestens ein Teil eingefügt wurde. */
  lods: number[];
}

const VERSION_YFT = 162;
const VERSION_YDR = 165;
const MAX_VERTICES = 65535;

const align = (n: number) => Math.ceil(n / 16) * 16;

/** Größe, auf die Eckpunkt- und Indexdaten einer neuen Geometrie höchstens kommen (kleiner, wenn die Seiten der Datei es verlangen). */
const CHUNK_BYTES = 96 * 1024;

/**
 * Teilt ein Netz in Stücke mit höchstens `maxVertices` Eckpunkten und `maxIndices` Indizes. Die Dreiecke bleiben in ihrer Reihenfolge,
 * Eckpunkte, die in mehreren Stücken gebraucht werden, kommen in jedem davon vor.
 */
export function splitMesh(mesh: NewMesh, maxVertices: number, maxIndices: number): NewMesh[] {
  const vertexCount = mesh.positions.length / 3;
  if (vertexCount <= maxVertices && mesh.indices.length <= maxIndices) return [mesh];
  const pieces: NewMesh[] = [];
  let map = new Map<number, number>();
  let order: number[] = [];
  let indices: number[] = [];
  const flush = () => {
    if (indices.length === 0) return;
    const positions = new Float32Array(order.length * 3);
    const normals = new Float32Array(order.length * 3);
    const uv0 = mesh.uv0 ? new Float32Array(order.length * 2) : undefined;
    const uv1 = mesh.uv1 ? new Float32Array(order.length * 2) : undefined;
    order.forEach((old, n) => {
      positions.set(mesh.positions.subarray(old * 3, old * 3 + 3), n * 3);
      normals.set(mesh.normals.subarray(old * 3, old * 3 + 3), n * 3);
      if (uv0) uv0.set(mesh.uv0!.subarray(old * 2, old * 2 + 2), n * 2);
      if (uv1) uv1.set(mesh.uv1!.subarray(old * 2, old * 2 + 2), n * 2);
    });
    pieces.push({ positions, normals, indices, ...(uv0 ? { uv0 } : {}), ...(uv1 ? { uv1 } : {}) });
    map = new Map();
    order = [];
    indices = [];
  };
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    const tri = [mesh.indices[t]!, mesh.indices[t + 1]!, mesh.indices[t + 2]!];
    const fresh = new Set(tri.filter((v) => !map.has(v))).size;
    if (order.length + fresh > maxVertices || indices.length + 3 > maxIndices) flush();
    for (const v of tri) {
      let n = map.get(v);
      if (n === undefined) {
        n = order.length;
        map.set(v, n);
        order.push(v);
      }
      indices.push(n);
    }
  }
  flush();
  return pieces;
}

interface ModelInfo {
  address: number;
  geometryArray: number;
  count: number;
  boundsPointer: number;
  shaderMap: number;
  /** Geometrien: Adresse und Shader-Nummer */
  geometries: Array<{ address: number; shader: number }>;
}

interface LodInfo {
  lod: number;
  /** Adresse der Zeigerliste (Kopf mit Zeiger, Anzahl). */
  list: number;
  array: number;
  models: ModelInfo[];
}

function readLods(mem: Memory, drawable: number): LodInfo[] {
  const lods: LodInfo[] = [];
  for (let lod = 0; lod < 4; lod++) {
    const list = mem.ptr(drawable + 0x50 + lod * 8);
    if (!list) continue;
    const array = mem.ptr(list);
    const count = mem.u16(list + 8);
    const models: ModelInfo[] = [];
    for (let m = 0; m < count; m++) {
      const address = mem.ptr(array + m * 8);
      if (!address) continue;
      const geometryArray = mem.ptr(address + 0x08);
      const geometryCount = mem.u16(address + 0x10);
      const shaderMap = mem.ptr(address + 0x20);
      const geometries: ModelInfo['geometries'] = [];
      for (let g = 0; g < geometryCount; g++) {
        geometries.push({ address: mem.ptr(geometryArray + g * 8), shader: shaderMap ? mem.u16(shaderMap + g * 2) : 0 });
      }
      models.push({ address, geometryArray, count: geometryCount, boundsPointer: mem.ptr(address + 0x18), shaderMap, geometries });
    }
    lods.push({ lod, list, array, models });
  }
  return lods;
}

/** Zähler: häufigster Wert einer Liste von 32-Bit-Zahlen. */
function mostCommon(values: number[]): number {
  const counts = new Map<number, number>();
  let best = values[0] ?? 0;
  let bestCount = 0;
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

interface Donor {
  address: number;
  vb: number;
  ib: number;
  decl: number;
  layout: VertexLayout;
  vertexCount: number;
  palette: number[];
  /** Zeiger auf die Eckpunktdaten liegt im Grafikspeicher */
  vertexInGraphics: boolean;
  indexInGraphics: boolean;
  blendWeights: [number, number, number, number];
  /** Kanal der Blend-Gewichte, der den vollen Wert trägt (sonst 0) */
  weightChannel: number;
  colour0: [number, number, number, number];
  colour1: [number, number, number, number];
  /** Pro Texturkoordinatensatz: häufigster Wert der Vorlage (u, v) */
  uvDefaults: Array<[number, number]>;
}

function inspectDonor(mem: Memory, geometry: number): Donor {
  const vb = mem.ptr(geometry + 0x18);
  const ib = mem.ptr(geometry + 0x38);
  if (!vb || !ib) throw new YftReadError('corrupt', 'Die Vorlage-Geometrie hat keinen Eckpunkt- oder Indexpuffer.');
  const decl = mem.ptr(vb + 0x30);
  const vertexCount = mem.u32(vb + 0x18) || mem.u16(geometry + 0x60);
  const dataPointer = mem.ptr(vb + 0x10) || mem.ptr(vb + 0x20);
  const layout = readLayout(mem, decl, mem.u16(vb + 0x08));
  const raw = mem.bytes(dataPointer, vertexCount * layout.stride);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

  const palettePointer = mem.ptr(geometry + 0x68);
  const paletteCount = mem.u16(geometry + 0x72);
  const palette: number[] = [];
  for (let i = 0; i < (palettePointer ? paletteCount : 0); i++) palette.push(mem.u16(palettePointer + i * 2));

  const read4 = (at: number): [number, number, number, number] => [raw[at]!, raw[at + 1]!, raw[at + 2]!, raw[at + 3]!];
  const packed = (at: number) => view.getUint32(at, true);
  const unpack = (value: number): [number, number, number, number] => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];

  let blendWeights: Donor['blendWeights'] = [255, 0, 0, 0];
  let weightChannel = 0;
  const w = layout.slots[SLOT_BLEND_WEIGHTS];
  if (w && vertexCount > 0) {
    blendWeights = read4(w.offset);
    const channel = blendWeights.findIndex((x) => x >= 250);
    weightChannel = channel < 0 ? 0 : channel;
    blendWeights = [0, 0, 0, 0];
    blendWeights[weightChannel] = 255;
  }

  const colour = (slot: number): [number, number, number, number] => {
    const s = layout.slots[slot];
    if (!s || vertexCount === 0) return [255, 255, 255, 255];
    const values: number[] = [];
    for (let v = 0; v < vertexCount; v++) values.push(packed(v * layout.stride + s.offset));
    return unpack(mostCommon(values));
  };

  const uvDefaults: Array<[number, number]> = [];
  for (let set = 0; set < 8; set++) {
    const s = layout.slots[SLOT_TEXCOORD0 + set];
    if (!s || vertexCount === 0) continue;
    const us: number[] = [];
    const vs: number[] = [];
    for (let v = 0; v < vertexCount; v++) {
      const at = v * layout.stride + s.offset;
      if (s.type === 5) {
        us.push(view.getFloat32(at, true));
        vs.push(view.getFloat32(at + 4, true));
      } else {
        us.push(halfOf(view.getUint16(at, true)));
        vs.push(halfOf(view.getUint16(at + 2, true)));
      }
    }
    const clean = (x: number) => (Math.abs(x) < 1e-20 ? 0 : x);
    uvDefaults[set] = [clean(median(us)), clean(median(vs))];
  }

  return {
    address: geometry,
    vb,
    ib,
    decl,
    layout,
    vertexCount,
    palette,
    vertexInGraphics: dataPointer >= GRAPHICS_BASE,
    indexInGraphics: mem.ptr(ib + 0x10) >= GRAPHICS_BASE,
    blendWeights,
    weightChannel,
    colour0: colour(SLOT_COLOUR0),
    colour1: colour(SLOT_COLOUR1),
    uvDefaults,
  };
}

function halfOf(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const frac = h & 0x3ff;
  if (exp === 0) return sign * 2 ** -14 * (frac / 1024);
  if (exp === 31) return 0;
  return sign * 2 ** (exp - 15) * (1 + frac / 1024);
}

interface Aabb {
  min: [number, number, number];
  max: [number, number, number];
}

function boundsOf(positions: Float32Array): Aabb {
  const min: Aabb['min'] = [Infinity, Infinity, Infinity];
  const max: Aabb['max'] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k]!;
      if (v < min[k]!) min[k] = v;
      if (v > max[k]!) max[k] = v;
    }
  }
  return { min, max };
}

interface Product {
  geometry: NewBlock;
  shader: number;
  aabb: Aabb;
}

/** Baut alle Blöcke einer neuen Geometrie und liefert den Geometrie-Block. */
function buildGeometry(ed: ResourceEditor, donor: Donor, request: AddMeshRequest, boneCount: number): Product {
  const { mesh } = request;
  const vertexCount = mesh.positions.length / 3;
  if (!Number.isInteger(vertexCount) || vertexCount === 0) throw new Error('Das Teil hat keine Eckpunkte.');
  if (vertexCount > MAX_VERTICES) throw new Error(`Das Teil hat ${vertexCount} Eckpunkte, erlaubt sind ${MAX_VERTICES}.`);
  if (mesh.normals.length !== mesh.positions.length) throw new Error('Normalen und Positionen passen nicht zusammen.');
  const indexCount = mesh.indices.length;
  if (indexCount === 0 || indexCount % 3 !== 0) throw new Error('Das Teil braucht eine Dreiecksliste (Anzahl durch 3 teilbar).');
  for (let i = 0; i < indexCount; i++) {
    if (!(mesh.indices[i]! >= 0 && mesh.indices[i]! < vertexCount)) throw new Error('Ein Index zeigt außerhalb der Eckpunkte.');
  }

  // Nur Eckpunkte mit Blend-Indizes (Fahrzeuge) werden an einen Knochen gebunden; Props ohne Skelett haben keinen.
  let palette = donor.palette;
  let slotIndex = palette.indexOf(request.bone);
  if (donor.layout.slots[SLOT_BLEND_INDICES]) {
    if (!(request.bone >= 0 && request.bone < boneCount)) throw new Error(`Der Knochen ${request.bone} gibt es in dieser Datei nicht.`);
    if (slotIndex < 0) {
      // Die Palette übersetzt die Knochennummer im Eckpunkt in einen Knochen. Ist sie die Identität (0, 1, 2 ...), wird sie bis zum
      // Knochen verlängert, so bleiben Nummer und Knochen gleich; sonst kommt der Knochen hinten dazu.
      if (palette.every((v, i) => v === i)) {
        palette = Array.from({ length: request.bone + 1 }, (_, i) => i);
        slotIndex = request.bone;
      } else {
        palette = [...palette, request.bone];
        slotIndex = palette.length - 1;
      }
    }
  }
  const blendIndices: [number, number, number, number] = [0, 0, 0, 0];
  blendIndices[donor.weightChannel] = Math.max(slotIndex, 0);

  const uvs: Float32Array[] = [];
  const sets = donor.layout.slots.slice(SLOT_TEXCOORD0, SLOT_TEXCOORD0 + 8).map((s) => !!s);
  const lastSet = sets.lastIndexOf(true);
  for (let set = 0; set <= lastSet; set++) {
    const given = set === 0 ? mesh.uv0 : set === 1 ? mesh.uv1 : undefined;
    if (given) {
      if (given.length !== vertexCount * 2) throw new Error('Texturkoordinaten und Positionen passen nicht zusammen.');
      uvs.push(given);
    } else {
      const [u, v] = donor.uvDefaults[set] ?? [0, 0];
      const filled = new Float32Array(vertexCount * 2);
      for (let i = 0; i < vertexCount; i++) {
        filled[i * 2] = u;
        filled[i * 2 + 1] = v;
      }
      uvs.push(filled);
    }
  }

  const vertexBytes = writeVertices(donor.layout, {
    count: vertexCount,
    positions: mesh.positions,
    normals: mesh.normals,
    tangents: null,
    uvs,
    colour0: donor.colour0,
    colour1: donor.colour1,
    blendWeights: donor.blendWeights,
    blendIndices,
  });
  const indexBytes = new Uint8Array(indexCount * 2);
  const indexView = new DataView(indexBytes.buffer);
  for (let i = 0; i < indexCount; i++) indexView.setUint16(i * 2, mesh.indices[i]!, true);

  const mem = ed.mem;
  const donorGeometry = mem.bytes(donor.address, 152).slice();
  const donorVb = mem.bytes(donor.vb, 128).slice();
  const donorIb = mem.bytes(donor.ib, 96).slice();
  const donorDecl = mem.bytes(donor.decl, 16).slice();
  const vbDataPointers = [mem.ptr(donor.vb + 0x10), mem.ptr(donor.vb + 0x20)];

  const vertexData = ed.dataBlock(donor.vertexInGraphics ? 'graphics' : 'system', vertexBytes, 'Eckpunktdaten');
  const indexData = ed.dataBlock(donor.indexInGraphics ? 'graphics' : 'system', indexBytes, 'Indexdaten');
  const decl = ed.dataBlock('system', donorDecl, 'Vertex-Deklaration');

  const vb = ed.block(
    'system',
    128,
    (w) => {
      w.copy(0, donorVb);
      if (vbDataPointers[0]) w.u64(0x10, vertexData.address);
      w.u32(0x18, vertexCount);
      if (vbDataPointers[1]) w.u64(0x20, vertexData.address);
      w.u64(0x30, decl.address);
    },
    'Vertex-Buffer',
  );
  const ib = ed.block(
    'system',
    96,
    (w) => {
      w.copy(0, donorIb);
      w.u32(0x08, indexCount);
      w.u64(0x10, indexData.address);
    },
    'Index-Buffer',
  );

  const paletteOffset = 152 + (palette.length > 4 ? 8 : 0);
  const geometry = ed.block(
    'system',
    paletteOffset + palette.length * 2,
    (w) => {
      w.copy(0, donorGeometry);
      w.u64(0x18, vb.address);
      w.u64(0x38, ib.address);
      w.u32(0x58, indexCount);
      w.u32(0x5c, indexCount / 3);
      w.u16(0x60, vertexCount);
      w.u16(0x62, 3);
      w.u64(0x78, vertexData.address);
      if (palette.length > 0) {
        w.u64(0x68, geometry.address + paletteOffset);
        palette.forEach((id, i) => w.u16(paletteOffset + i * 2, id));
      }
      w.u16(0x72, palette.length);
    },
    'Geometrie',
  );
  return { geometry, shader: request.shader, aabb: boundsOf(mesh.positions) };
}

/** Findet die Vorlage: die erste Geometrie in der angegebenen Reihenfolge der Detailstufen, die den Shader nutzt. */
function findDonor(lods: LodInfo[], order: number[], shader: number): number | null {
  for (const lod of order) {
    const info = lods.find((l) => l.lod === lod);
    if (!info) continue;
    for (const model of info.models) {
      const found = model.geometries.find((g) => g.shader === shader && g.address !== 0);
      if (found) return found.address;
    }
  }
  return null;
}

function addMeshes(
  ed: ResourceEditor,
  drawable: number,
  requests: AddMeshRequest[],
  options: AddMeshesOptions,
  boneCount: number,
  binding: BindingUpdate | null,
  aliases: ReadonlyMap<number, number>,
): { added: number; lods: number[] } {
  const mem = ed.mem;
  const group = mem.ptr(drawable + 0x10);
  if (!group) throw new YftReadError('corrupt', 'Die Datei hat keine Shader-Gruppe.');
  const shaderCount = mem.u16(group + 0x18);

  const lods = readLods(mem, drawable);
  const wanted = (options.lods ?? [0, 1]).slice().sort((a, b) => a - b);
  const targets = lods.filter((l) => wanted.includes(l.lod) && l.models.length > 0);
  if (targets.length === 0) throw new YftReadError('unsupported', 'Die Datei hat keine passende Detailstufe mit Modell.');

  const prepared = requests.map((request) => {
    if (!(request.shader >= 0 && request.shader < shaderCount + aliases.size)) throw new Error(`Das Material ${request.shader} gibt es in dieser Datei nicht.`);
    // Neue Materialien (Kopien) haben dieselbe Eckpunktform wie ihr Vorbild.
    const donorAddress = findDonor(lods, [...wanted, 0, 1, 2, 3], aliases.get(request.shader) ?? request.shader);
    if (donorAddress === null) throw new Error('Kein Teil des Fahrzeugs benutzt dieses Material, es dient als Vorlage und muss vorkommen.');
    return { request, donor: inspectDonor(mem, donorAddress) };
  });

  // Große Netze in mehrere Geometrien teilen: Ein Datenblock darf keine Seitengrenze überschreiten und die Seitenzahl der Datei ist begrenzt.
  // Es wird mit großen Stücken begonnen und halbiert, bis alles in die Seiten der Datei passt.
  let planned: Array<{ request: AddMeshRequest; donor: Donor }> = [];
  for (let budget = CHUNK_BYTES; ; budget = Math.floor(budget / 2)) {
    planned = [];
    const sizes: Record<'system' | 'graphics', number[]> = { system: [], graphics: [] };
    for (const { request, donor } of prepared) {
      const maxVertices = Math.min(MAX_VERTICES, Math.max(3, Math.floor(budget / donor.layout.stride)));
      const maxIndices = Math.max(3, Math.floor(budget / 2 / 3) * 3);
      for (const piece of splitMesh(request.mesh, maxVertices, maxIndices)) {
        planned.push({ request: { ...request, mesh: piece }, donor });
        sizes[donor.vertexInGraphics ? 'graphics' : 'system'].push(align((piece.positions.length / 3) * donor.layout.stride));
        sizes[donor.indexInGraphics ? 'graphics' : 'system'].push(align(piece.indices.length * 2));
        // Deklaration, Vertex-Buffer, Index-Buffer und Geometrie mit Palette
        sizes.system.push(16, 128, 96, 400);
      }
    }
    if ((ed.fits('system', sizes.system) && ed.fits('graphics', sizes.graphics)) || budget <= 2048) break;
  }
  const products: Product[] = planned.map(({ request, donor }) => buildGeometry(ed, donor, request, boneCount));
  // Je Modell (jedes nur einmal, auch wenn Detailstufen es teilen) neue Felder bauen.
  const rebuilt = new Map<number, NewBlock>();
  for (const lod of targets) {
    lod.models.forEach((model, index) => {
      let header = rebuilt.get(model.address);
      if (!header) {
        header = rebuildModel(ed, model, products, binding);
        rebuilt.set(model.address, header);
      }
      const target = header;
      ed.patch((m) => m.setPtr(lod.array + index * 8, target.address));
    });
  }

  // Grenzen der Datei erweitern, falls das Teil herausragt.
  const total = products.reduce<Aabb>(
    (acc, p) => ({
      min: [Math.min(acc.min[0], p.aabb.min[0]), Math.min(acc.min[1], p.aabb.min[1]), Math.min(acc.min[2], p.aabb.min[2])],
      max: [Math.max(acc.max[0], p.aabb.max[0]), Math.max(acc.max[1], p.aabb.max[1]), Math.max(acc.max[2], p.aabb.max[2])],
    }),
    { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] },
  );
  ed.patch((m) => {
    for (let k = 0; k < 3; k++) {
      if (total.min[k]! < m.f32(drawable + 0x30 + k * 4)) m.setF32(drawable + 0x30 + k * 4, total.min[k]!);
      if (total.max[k]! > m.f32(drawable + 0x40 + k * 4)) m.setF32(drawable + 0x40 + k * 4, total.max[k]!);
    }
    const center = [m.f32(drawable + 0x20), m.f32(drawable + 0x24), m.f32(drawable + 0x28)];
    let radius = m.f32(drawable + 0x2c);
    for (const x of [total.min[0], total.max[0]]) {
      for (const y of [total.min[1], total.max[1]]) {
        for (const z of [total.min[2], total.max[2]]) {
          radius = Math.max(radius, Math.hypot(x - center[0]!, y - center[1]!, z - center[2]!));
        }
      }
    }
    m.setF32(drawable + 0x2c, radius);
  });

  return { added: products.length, lods: targets.map((l) => l.lod) };
}

/** Baut für ein Modell einen neuen Kopf samt neuen Feldern (Geometriezeiger, Grenzen, Shader-Zuordnung) mit den zusätzlichen Geometrien. */
function rebuildModel(ed: ResourceEditor, model: ModelInfo, products: Product[], binding: BindingUpdate | null): NewBlock {
  const mem = ed.mem;
  const oldCount = model.count;
  const newCount = oldCount + products.length;

  const header = mem.bytes(model.address, 48).slice();
  const oldPointers = model.geometries.map((g) => g.address);
  const oldShaders = model.geometries.map((g) => g.shader);

  // Alte Grenzen: bei mehr als einer Geometrie steht vorn die Gesamtbox, sonst nur die der einen Geometrie.
  const readBox = (index: number): Uint8Array => mem.bytes(model.boundsPointer + index * 32, 32).slice();
  const oldBoxes: Uint8Array[] = [];
  for (let g = 0; g < oldCount; g++) oldBoxes.push(readBox(oldCount > 1 ? g + 1 : g));

  const boxOf = (aabb: Aabb): Uint8Array => {
    const b = new Uint8Array(32);
    const v = new DataView(b.buffer);
    // wie bei den vorhandenen Geometrien: w wiederholt x
    v.setFloat32(0, aabb.min[0], true);
    v.setFloat32(4, aabb.min[1], true);
    v.setFloat32(8, aabb.min[2], true);
    v.setFloat32(12, aabb.min[0], true);
    v.setFloat32(16, aabb.max[0], true);
    v.setFloat32(20, aabb.max[1], true);
    v.setFloat32(24, aabb.max[2], true);
    v.setFloat32(28, aabb.max[0], true);
    return b;
  };
  const allBoxes = [...oldBoxes, ...products.map((p) => boxOf(p.aabb))];

  // Gesamtbox aus allen Einzelboxen
  const total: Aabb = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const box of allBoxes) {
    const v = new DataView(box.buffer, box.byteOffset, box.byteLength);
    for (let k = 0; k < 3; k++) {
      total.min[k] = Math.min(total.min[k]!, v.getFloat32(k * 4, true));
      total.max[k] = Math.max(total.max[k]!, v.getFloat32(16 + k * 4, true));
    }
  }
  const totalBox = new Uint8Array(32);
  {
    const v = new DataView(totalBox.buffer);
    for (let k = 0; k < 3; k++) {
      v.setFloat32(k * 4, total.min[k]!, true);
      v.setFloat32(16 + k * 4, total.max[k]!, true);
    }
    v.setFloat32(12, 1, true);
    v.setFloat32(28, 1, true);
  }

  const pointerArray = ed.block(
    'system',
    newCount * 8,
    (w) => {
      oldPointers.forEach((p, i) => w.u64(i * 8, p));
      products.forEach((p, i) => w.u64((oldCount + i) * 8, p.geometry.address));
    },
    'Geometriezeiger',
  );
  const bounds = ed.block(
    'system',
    (newCount + 1) * 32,
    (w) => {
      w.copy(0, totalBox);
      allBoxes.forEach((box, i) => w.copy((i + 1) * 32, box));
    },
    'Grenzen',
  );
  const shaderMap = ed.block(
    'system',
    align(newCount * 2),
    (w) => {
      oldShaders.forEach((s, i) => w.u16(i * 2, s));
      products.forEach((p, i) => w.u16((oldCount + i) * 2, p.shader));
    },
    'Shader-Zuordnung',
  );
  return ed.block(
    'system',
    48,
    (w) => {
      w.copy(0, header);
      if (binding && header[0x28] === binding.from) w.u8(0x28, binding.to);
      w.u64(0x08, pointerArray.address);
      w.u16(0x10, newCount);
      w.u16(0x12, newCount);
      w.u64(0x18, bounds.address);
      w.u64(0x20, shaderMap.address);
      w.u16(0x2e, newCount);
    },
    'Modell',
  );
}

/** In den Modellköpfen steht (bei Modellen mit Skelett) im ersten Byte der Bindung die Zahl der Knochen: mit dem Skelett mitziehen. */
interface BindingUpdate {
  from: number;
  to: number;
}

export interface EditPlan {
  /** Neue Knochen, zum Beispiel Sirenen-Knochen. Teile dürfen sich über die Nummer (Anzahl vorhandener Knochen + Nummer in dieser Liste) an sie binden. */
  bones?: NewBone[];
  meshes?: AddMeshRequest[];
  /** Lack-Shader (paint1, paint2), die auf paint3 mit einer Livery-Ebene umgestellt werden. */
  paint?: PaintConversion[];
  /** Neue Materialien als Kopien vorhandener mit anderer Haupttextur. Ihre Nummern (Zahl der Materialien + Nummer in dieser Liste) können Teile in `meshes` benutzen. */
  shaders?: ShaderClone[];
  /** Detailstufen für die Teile (Standard: hoch und mittel). */
  lods?: number[];
}

export interface EditResult {
  file: Uint8Array;
  /** Indizes der neuen Knochen. */
  boneIndices: number[];
  /** Zahl der Knochen nach der Änderung. */
  boneCount: number;
  /** Nummern der neuen Materialien (siehe `EditPlan.shaders`). */
  shaderIndices: number[];
  /** Zahl der eingefügten Geometrien. */
  added: number;
  /** Detailstufen, in die Teile gekommen sind. */
  lods: number[];
}

/**
 * Das Fragment (YFT) hält je Knochen eine 3x4-Matrix (FragType + 0xA8: 32-Byte-Kopf, Anzahl in 0x10 und 0x11, danach 48 Byte je Knochen).
 * Bei neuen Knochen kommt je Knochen eine Einheitsmatrix dazu, so wie bei allen vorhandenen.
 */
function extendBoneTransforms(ed: ResourceEditor, fragment: number, oldCount: number, newCount: number): void {
  const mem = ed.mem;
  const at = mem.ptr(fragment + 0xa8);
  if (!at || newCount <= oldCount || newCount > 255) return;
  if (mem.u8(at + 0x10) !== oldCount) return; // gehört nicht zu den Knochen, dann bleibt es, wie es ist
  const old = mem.bytes(at, 32 + oldCount * 48).slice();
  const block = ed.block(
    'system',
    32 + newCount * 48,
    (w) => {
      w.copy(0, old);
      w.u8(0x10, newCount);
      w.u8(0x11, newCount);
      for (let i = oldCount; i < newCount; i++) {
        w.f32(32 + i * 48, 1);
        w.f32(32 + i * 48 + 20, 1);
        w.f32(32 + i * 48 + 40, 1);
      }
    },
    'Knochen-Matrizen',
  );
  ed.patch((m) => m.setPtr(fragment + 0xa8, block.address));
}

function runEdit(ed: ResourceEditor, drawable: number, plan: EditPlan, fragment: number | null): Omit<EditResult, 'file'> {
  const mem = ed.mem;
  const skeleton = mem.ptr(drawable + 0x18);
  const oldCount = skeleton ? mem.u16(skeleton + 0x5e) : 0;
  const bones = plan.bones?.length ? addBones(ed, drawable, plan.bones) : { indices: [] as number[], boneCount: oldCount };
  if (fragment !== null && bones.boneCount !== oldCount) extendBoneTransforms(ed, fragment, oldCount, bones.boneCount);
  const binding: BindingUpdate | null = bones.boneCount !== oldCount && oldCount <= 255 ? { from: oldCount, to: bones.boneCount } : null;

  if (plan.paint?.length) convertPaintShaders(ed, drawable, plan.paint);
  const shaderIndices = plan.shaders?.length ? cloneShaders(ed, drawable, plan.shaders) : [];
  const aliases = new Map<number, number>(shaderIndices.map((index, k) => [index, plan.shaders![k]!.from]));

  const meshResult = plan.meshes?.length
    ? addMeshes(ed, drawable, plan.meshes, { lods: plan.lods }, bones.boneCount, binding, aliases)
    : { added: 0, lods: [] as number[] };

  if (binding) {
    // Auch Modelle, die nicht neu gebaut wurden, brauchen die neue Knochenzahl in der Bindung.
    const models = readLods(mem, drawable).flatMap((l) => l.models.map((m) => m.address));
    ed.patch((m) => {
      for (const address of new Set(models)) {
        if (m.u8(address + 0x28) === binding.from) m.setU8(address + 0x28, binding.to);
      }
    });
  }
  return { boneIndices: bones.indices, boneCount: bones.boneCount, shaderIndices, added: meshResult.added, lods: meshResult.lods };
}

/** Ändert ein Fahrzeug (YFT, Version 162): neue Knochen und neue Teile. */
export function editYft(file: Uint8Array, plan: EditPlan): EditResult {
  const ed = ResourceEditor.open(file, VERSION_YFT, 'Fragment');
  const drawable = ed.mem.ptr(SYSTEM_BASE + 0x30);
  if (!drawable) throw new YftReadError('corrupt', 'Das Fragment enthält kein Drawable.');
  const result = runEdit(ed, drawable, plan, SYSTEM_BASE);
  return { ...result, file: ed.finish() };
}

/** Ändert ein Drawable (YDR, Version 165): neue Knochen und neue Teile. */
export function editYdr(file: Uint8Array, plan: EditPlan): EditResult {
  const ed = ResourceEditor.open(file, VERSION_YDR, 'Drawable');
  const result = runEdit(ed, SYSTEM_BASE, plan, null);
  return { ...result, file: ed.finish() };
}

/** Fügt einem Fahrzeug (YFT, Version 162) neue Teile hinzu. */
export function addMeshesToYft(file: Uint8Array, requests: AddMeshRequest[], options: AddMeshesOptions = {}): AddMeshesResult {
  const r = editYft(file, { meshes: requests, lods: options.lods });
  return { file: r.file, added: r.added, lods: r.lods };
}

/** Fügt einem Drawable (YDR, Version 165) neue Teile hinzu. */
export function addMeshesToYdr(file: Uint8Array, requests: AddMeshRequest[], options: AddMeshesOptions = {}): AddMeshesResult {
  const r = editYdr(file, { meshes: requests, lods: options.lods });
  return { file: r.file, added: r.added, lods: r.lods };
}
