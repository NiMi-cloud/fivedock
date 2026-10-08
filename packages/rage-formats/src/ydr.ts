/**
 * YDR (Drawable) schreiben, Legacy-Format (Version 165), das FiveM lädt.
 *
 * Nur ein Speicherbereich: Wie in Referenzdateien liegen auch Vertex- und Indexdaten im Systemspeicher,
 * es gibt keine Grafikseiten. Aufbau, jeder Punkt ein Block (Größen in Bytes):
 *
 *   Drawable (208)               Wurzel: Zeiger auf Shadergruppe, Modelle, Name, Kollision
 *   ResourcePagesInfo (20)
 *   ShaderGroup (64)             + Zeiger-Array (8 je Shader)
 *   ShaderFX (48 je Shader)      + Parameterblock (Köpfe, Vektoren, Hashes, Füllbereich)
 *   TextureBase (80 je Textur-Parameter) + Name (C-String)
 *   Modellblock                  je Detailstufe: Listenkopf (16), Zeiger (8 je Modell), Modelle
 *                                je Modell inline: Kopf (48), Shader-Zuordnung, Geometrie-Zeiger,
 *                                Begrenzungen (32 je Geometrie, bei mehreren zusätzlich eine gesamte),
 *                                Geometrien (152 je Stück)
 *   VertexBuffer (128), VertexDeclaration (16), IndexBuffer (96) je Geometrie
 *   Vertexdaten, Indexdaten
 *   Name des Drawables
 *
 * Alle Feldpositionen wurden gegen Referenzdateien geprüft (siehe ydr.test.ts und spikes/05-ydr).
 * Indizes sind 16 Bit breit: Eine Geometrie hat höchstens 65.535 Eckpunkte.
 */

import { buildCollisionBlocks } from './bounds.ts';
import type { CollisionSpec } from './bounds.ts';
import { joaat } from './jenkins.ts';
import { ResourceBlock, buildResource } from './rsc7.ts';
import type { BlockWriter } from './rsc7.ts';

export const YDR_VERSION = 165;

// Konstanten der Vtable-Felder (Typkennung am Anfang der Objekte), wie in Referenzdateien.
const VFT_DRAWABLE = 0x40573178;
const VFT_SHADER_GROUP = 1080113136;
const VFT_MODEL = 1080101528;
const VFT_GEOMETRY = 1080133528;
const VFT_VERTEX_BUFFER = 1080153080;
const VFT_INDEX_BUFFER = 1080152408;
const BOUND_SENTINEL = 0x7f800001;

const DRAWABLE_SIZE = 208;
const SHADER_GROUP_SIZE = 64;
const SHADER_FX_SIZE = 48;
const TEXTURE_BASE_SIZE = 80;
const GEOMETRY_SIZE = 152;
const VERTEX_BUFFER_SIZE = 128;
const VERTEX_DECL_SIZE = 16;
const INDEX_BUFFER_SIZE = 96;
const MODEL_HEADER_SIZE = 48;

/** Vertexformat "GTAV1" mit Position, Normale, Farbe und einer UV-Ebene: 36 Byte je Eckpunkt. */
const VERTEX_FLAGS_PNCT = 89;
const VERTEX_TYPES_GTAV1 = 0x7755555555996996n;
const VERTEX_STRIDE = 36;

export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];

export interface DrawableGeometry {
  /** x, y, z je Eckpunkt. */
  positions: Float32Array;
  /** x, y, z je Eckpunkt, normiert. */
  normals: Float32Array;
  /** r, g, b, a je Eckpunkt (0..255). Fehlt der Wert, wird Weiß verwendet. */
  colors?: Uint8Array;
  /** u, v je Eckpunkt. */
  uvs: Float32Array;
  /** Dreiecksliste, Werte unter 65.536. */
  indices: ArrayLike<number>;
  /** Index in `Drawable.shaders`. */
  shader: number;
}

export interface DrawableModel {
  geometries: DrawableGeometry[];
  /** Bitmaske, welche Renderpässe das Modell nutzt. Standard 255. */
  renderMask?: number;
}

export type ShaderParam =
  | { name: string; type: 'texture'; texture: string | null }
  | { name: string; type: 'vector'; value: Vec4 }
  | { name: string; type: 'array'; values: Vec4[] };

export interface DrawableShader {
  /** Shadername ohne Endung, z. B. "default". */
  name: string;
  /** Dateiname mit Endung, z. B. "default.sps". */
  fileName: string;
  renderBucket?: number;
  params: ShaderParam[];
}

export interface Drawable {
  name: string;
  shaders: DrawableShader[];
  high: DrawableModel[];
  med?: DrawableModel[];
  low?: DrawableModel[];
  vlow?: DrawableModel[];
  /** Entfernungen (m), ab denen die jeweilige Stufe gezeichnet wird. Standard 9998. */
  lodDist?: { high?: number; med?: number; low?: number; vlow?: number };
  /** Eingebettete Kollision. Ohne Angabe läuft man durch das Prop hindurch. */
  collision?: CollisionSpec;
}

/**
 * Einfache Shader mit einer Diffuse-Textur. Sie teilen sich Name ("default" ist die Shaderdatei) und Parameter und
 * unterscheiden sich nur durch die Voreinstellung (`fileName`) und den Zeichen-Eimer (`renderBucket`).
 * Die Werte stammen aus Sollumz-Exporten und wurden gegen CodeWalker geprüft (spikes/05-ydr/verify-ydr.ts).
 */
export type SimpleShaderKind = 'opaque' | 'cutout' | 'alpha';

const SIMPLE_SHADERS: Record<SimpleShaderKind, { fileName: string; renderBucket: number }> = {
  opaque: { fileName: 'default.sps', renderBucket: 0 },
  /** Alpha-Test: Pixel sind entweder ganz da oder ganz weg (Zäune, Laub). */
  cutout: { fileName: 'cutout.sps', renderBucket: 3 },
  /** Echte Durchsichtigkeit mit Überblendung (Glas, Folie). */
  alpha: { fileName: 'alpha.sps', renderBucket: 1 },
};

export function simpleShader(kind: SimpleShaderKind, diffuseTexture: string | null): DrawableShader {
  const { fileName, renderBucket } = SIMPLE_SHADERS[kind];
  return { ...defaultShader(diffuseTexture), fileName, renderBucket };
}

/** Standardparameter des einfachen Shaders "default.sps" in der Reihenfolge, die Sollumz und das Spiel nutzen. */
export function defaultShader(diffuseTexture: string | null): DrawableShader {
  return {
    name: 'default',
    fileName: 'default.sps',
    renderBucket: 0,
    params: [
      { name: 'DiffuseSampler', type: 'texture', texture: diffuseTexture },
      { name: 'matMaterialColorScale', type: 'vector', value: [1, 0, 0, 1] },
      { name: 'HardAlphaBlend', type: 'vector', value: [1, 0, 0, 0] },
      { name: 'useTessellation', type: 'vector', value: [0, 0, 0, 0] },
      { name: 'wetnessMultiplier', type: 'vector', value: [1, 0, 0, 0] },
      { name: 'globalAnimUV1', type: 'vector', value: [0, 1, 0, 0] },
      { name: 'globalAnimUV0', type: 'vector', value: [1, 0, 0, 0] },
    ],
  };
}

// --- Hilfsfunktionen ---------------------------------------------------------------------------------

const pad16 = (n: number) => (16 - (n % 16)) % 16;
const align16 = (n: number) => n + pad16(n);

interface Aabb {
  min: Vec3;
  max: Vec3;
}

function geometryAabb(g: DrawableGeometry): Aabb {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < g.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = g.positions[i + k]!;
      if (v < min[k]!) min[k] = v;
      if (v > max[k]!) max[k] = v;
    }
  }
  return { min, max };
}

function unionAabb(boxes: Aabb[]): Aabb {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    for (let k = 0; k < 3; k++) {
      if (b.min[k]! < min[k]!) min[k] = b.min[k]!;
      if (b.max[k]! > max[k]!) max[k] = b.max[k]!;
    }
  }
  return { min, max };
}

/** Begrenzungskugel um den Mittelpunkt der Box, Radius = weitester Eckpunkt. */
function boundingSphere(models: DrawableModel[], box: Aabb): { center: Vec3; radius: number } {
  const center: Vec3 = [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
  let r2 = 0;
  for (const m of models) {
    for (const g of m.geometries) {
      for (let i = 0; i + 2 < g.positions.length; i += 3) {
        const dx = g.positions[i]! - center[0];
        const dy = g.positions[i + 1]! - center[1];
        const dz = g.positions[i + 2]! - center[2];
        r2 = Math.max(r2, dx * dx + dy * dy + dz * dz);
      }
    }
  }
  return { center, radius: Math.sqrt(r2) };
}

function validate(d: Drawable): void {
  if (!/^[\x21-\x7e]+$/.test(d.name)) throw new Error(`Ungültiger Drawable-Name "${d.name}".`);
  if (d.shaders.length === 0) throw new Error('Ein Drawable braucht mindestens einen Shader.');
  if (d.high.length === 0) throw new Error('Ein Drawable braucht mindestens ein Modell in der höchsten Detailstufe.');
  for (const [level, models] of [['high', d.high], ['med', d.med], ['low', d.low], ['vlow', d.vlow]] as const) {
    for (const m of models ?? []) {
      if (m.geometries.length === 0) throw new Error(`Detailstufe ${level}: Ein Modell hat keine Geometrie.`);
      for (const g of m.geometries) {
        const vertexCount = g.positions.length / 3;
        if (!Number.isInteger(vertexCount) || vertexCount === 0) throw new Error('Geometrie ohne Eckpunkte.');
        if (vertexCount > 0xffff) throw new Error(`Eine Geometrie hat ${vertexCount} Eckpunkte, höchstens 65535 sind erlaubt. Das Modell muss geteilt werden.`);
        if (g.normals.length !== g.positions.length) throw new Error('Normalen passen nicht zu den Positionen.');
        if (g.uvs.length !== vertexCount * 2) throw new Error('UVs passen nicht zu den Positionen.');
        if (g.colors && g.colors.length !== vertexCount * 4) throw new Error('Farben passen nicht zu den Positionen.');
        if (g.indices.length === 0 || g.indices.length % 3 !== 0) throw new Error('Die Indexliste ist keine gültige Dreiecksliste.');
        for (let i = 0; i < g.indices.length; i++) {
          if (g.indices[i]! >= vertexCount) throw new Error(`Index ${g.indices[i]} zeigt hinter das Ende der Eckpunkte.`);
        }
        if (!Number.isInteger(g.shader) || g.shader < 0 || g.shader >= d.shaders.length) {
          throw new Error(`Shader-Index ${g.shader} existiert nicht.`);
        }
      }
    }
  }
}

// --- Shader ------------------------------------------------------------------------------------------------

function paramDataType(p: ShaderParam): number {
  return p.type === 'texture' ? 0 : p.type === 'vector' ? 1 : p.values.length;
}

/** Größe des Parameterblocks: Köpfe, Vektoren, Hashes plus Füllbereich (wie in Referenzdateien). */
function shaderParamSizes(params: ShaderParam[]) {
  let headersAndData = 0;
  for (const p of params) headersAndData += 16 + 16 * paramDataType(p);
  const baseSize = 32 + headersAndData + 4 * params.length;
  const dataSize = align16(baseSize);
  return { paramSize: headersAndData, dataSize, blockSize: baseSize + 4 * dataSize };
}

interface ShaderBlocks {
  fx: ResourceBlock;
  params: ResourceBlock;
  extras: ResourceBlock[];
}

function buildShaderBlocks(shader: DrawableShader): ShaderBlocks {
  const { params } = shader;
  const sizes = shaderParamSizes(params);
  const extras: ResourceBlock[] = [];

  // Je Textur-Parameter ein TextureBase-Objekt (Verweis auf die Textur im YTD) samt Name.
  const textureBlocks = new Map<number, ResourceBlock>();
  params.forEach((p, i) => {
    if (p.type !== 'texture' || p.texture === null) return;
    const texName = p.texture;
    const nameBlock = new ResourceBlock(texName.length + 1, (w) => w.cstring(0, texName), `texName:${texName}`);
    const texture = new ResourceBlock(
      TEXTURE_BASE_SIZE,
      (w) => {
        w.u32(0x04, 1);
        w.pointer(0x28, nameBlock);
        w.u16(0x30, 1);
        w.u16(0x32, 2);
      },
      `textureRef:${texName}`,
    );
    textureBlocks.set(i, texture);
    extras.push(texture, nameBlock);
  });

  const paramBlock = new ResourceBlock(
    sizes.blockSize,
    (w) => {
      // Köpfe, danach die Vektordaten in Parameterreihenfolge, danach die Hashes.
      let dataOffset = params.length * 16;
      // Registerhinweis der Vektoren: von hinten nach vorn ab 160 hochgezählt.
      const vectorHint = new Map<number, number>();
      let hint = 160;
      for (let i = params.length - 1; i >= 0; i--) {
        const dt = paramDataType(params[i]!);
        if (dt !== 0) {
          vectorHint.set(i, hint);
          hint += dt;
        }
      }

      params.forEach((p, i) => {
        const head = i * 16;
        const dt = paramDataType(p);
        w.u8(head, dt);
        if (p.type === 'texture') {
          w.u8(head + 1, i + 2);
          const tex = textureBlocks.get(i);
          w.pointer(head + 8, tex ?? null);
        } else {
          w.u8(head + 1, vectorHint.get(i)!);
          w.u64(head + 8, paramBlock.address + dataOffset);
          const vectors = p.type === 'vector' ? [p.value] : p.values;
          vectors.forEach((v, k) => v.forEach((x, c) => w.f32(dataOffset + k * 16 + c * 4, x)));
          dataOffset += 16 * dt;
        }
      });
      params.forEach((p, i) => w.u32(dataOffset + i * 4, joaat(p.name)));
      // Der Rest (Füllbereich) bleibt 0.
    },
    `shaderParams:${shader.name}`,
  );

  const textureCount = params.filter((p) => p.type === 'texture').length;
  const bucket = shader.renderBucket ?? 0;
  const fx = new ResourceBlock(
    SHADER_FX_SIZE,
    (w) => {
      w.pointer(0x00, paramBlock);
      w.u32(0x08, joaat(shader.name));
      w.u8(0x10, params.length);
      w.u8(0x11, bucket);
      w.u16(0x12, 32768);
      w.u16(0x14, sizes.paramSize);
      w.u16(0x16, sizes.dataSize);
      w.u32(0x18, joaat(shader.fileName));
      w.u32(0x20, ((1 << bucket) | 0xff00) >>> 0);
      w.u8(0x27, textureCount);
    },
    `shaderFx:${shader.name}`,
  );

  return { fx, params: paramBlock, extras };
}

// --- Modelle -----------------------------------------------------------------------------------------------

interface GeometryBlocks {
  vertexBuffer: ResourceBlock;
  vertexDecl: ResourceBlock;
  indexBuffer: ResourceBlock;
  vertexData: ResourceBlock;
  indexData: ResourceBlock;
  vertexCount: number;
  indexCount: number;
}

function buildGeometryBlocks(g: DrawableGeometry, label: string): GeometryBlocks {
  const vertexCount = g.positions.length / 3;
  const indexCount = g.indices.length;

  const vertexData = new ResourceBlock(
    vertexCount * VERTEX_STRIDE,
    (w) => {
      for (let v = 0; v < vertexCount; v++) {
        const at = v * VERTEX_STRIDE;
        w.f32(at, g.positions[v * 3]!);
        w.f32(at + 4, g.positions[v * 3 + 1]!);
        w.f32(at + 8, g.positions[v * 3 + 2]!);
        w.f32(at + 12, g.normals[v * 3]!);
        w.f32(at + 16, g.normals[v * 3 + 1]!);
        w.f32(at + 20, g.normals[v * 3 + 2]!);
        // Farbe: Bytes in der Reihenfolge R, G, B, A.
        for (let c = 0; c < 4; c++) w.u8(at + 24 + c, g.colors ? g.colors[v * 4 + c]! : 255);
        w.f32(at + 28, g.uvs[v * 2]!);
        w.f32(at + 32, g.uvs[v * 2 + 1]!);
      }
    },
    `vertices:${label}`,
  );
  const indexData = new ResourceBlock(
    indexCount * 2,
    (w) => {
      for (let i = 0; i < indexCount; i++) w.u16(i * 2, g.indices[i]!);
    },
    `indices:${label}`,
  );

  const vertexDecl = new ResourceBlock(
    VERTEX_DECL_SIZE,
    (w) => {
      w.u32(0, VERTEX_FLAGS_PNCT);
      w.u16(4, VERTEX_STRIDE);
      w.u8(7, 4); // Anzahl der Komponenten
      w.view.setBigUint64(8, VERTEX_TYPES_GTAV1, true);
    },
    `vertexDecl:${label}`,
  );
  const vertexBuffer = new ResourceBlock(
    VERTEX_BUFFER_SIZE,
    (w) => {
      w.u32(0x00, VFT_VERTEX_BUFFER);
      w.u32(0x04, 1);
      w.u16(0x08, VERTEX_STRIDE);
      w.pointer(0x10, vertexData);
      w.u32(0x18, vertexCount);
      w.pointer(0x20, vertexData);
      w.pointer(0x30, vertexDecl);
    },
    `vertexBuffer:${label}`,
  );
  const indexBuffer = new ResourceBlock(
    INDEX_BUFFER_SIZE,
    (w) => {
      w.u32(0x00, VFT_INDEX_BUFFER);
      w.u32(0x04, 1);
      w.u32(0x08, indexCount);
      w.pointer(0x10, indexData);
    },
    `indexBuffer:${label}`,
  );
  return { vertexBuffer, vertexDecl, indexBuffer, vertexData, indexData, vertexCount, indexCount };
}

/** Größe eines Modells samt eingebetteter Geometrien. */
function modelBlockLength(geometryCount: number): number {
  let off = MODEL_HEADER_SIZE;
  off += geometryCount * 2;
  off += geometryCount === 1 ? 6 : pad16(off);
  off += geometryCount * 8;
  off += pad16(off);
  off += (geometryCount + (geometryCount > 1 ? 1 : 0)) * 32;
  for (let i = 0; i < geometryCount; i++) {
    off += pad16(off);
    off += GEOMETRY_SIZE;
  }
  return off;
}

interface LevelPlan {
  models: DrawableModel[];
  blocks: GeometryBlocks[][];
  /** Anfang der Liste im Modellblock. */
  listOffset: number;
  /** Anfang jedes Modells im Modellblock. */
  modelOffsets: number[];
}

function planLevels(levels: Array<DrawableModel[] | undefined>, name: string) {
  const plans: Array<LevelPlan | null> = [];
  let off = 0;
  for (const [li, models] of levels.entries()) {
    if (!models || models.length === 0) {
      plans.push(null);
      continue;
    }
    off += pad16(off);
    const listOffset = off;
    off += 16 + models.length * 8;
    const modelOffsets: number[] = [];
    for (const m of models) {
      off += pad16(off);
      modelOffsets.push(off);
      off += modelBlockLength(m.geometries.length);
    }
    plans.push({
      models,
      blocks: models.map((m, mi) => m.geometries.map((g, gi) => buildGeometryBlocks(g, `${name}.${li}.${mi}.${gi}`))),
      listOffset,
      modelOffsets,
    });
  }
  return { plans, totalLength: off };
}

function writeModel(
  w: BlockWriter,
  at: number,
  base: number,
  model: DrawableModel,
  geomBlocks: GeometryBlocks[],
): void {
  const n = model.geometries.length;
  // Lage der eingebetteten Teile relativ zum Modellanfang.
  let off = MODEL_HEADER_SIZE;
  const shaderMapOff = off;
  off += n * 2;
  off += n === 1 ? 6 : pad16(off);
  const geomPtrOff = off;
  off += n * 8;
  off += pad16(off);
  const boundsOff = off;
  off += (n + (n > 1 ? 1 : 0)) * 32;
  const geomOffs: number[] = [];
  for (let i = 0; i < n; i++) {
    off += pad16(off);
    geomOffs.push(off);
    off += GEOMETRY_SIZE;
  }

  const abs = (o: number) => base + at + o;
  w.u32(at + 0x00, VFT_MODEL);
  w.u32(at + 0x04, 1);
  w.u64(at + 0x08, abs(geomPtrOff));
  w.u16(at + 0x10, n);
  w.u16(at + 0x12, n);
  w.u64(at + 0x18, abs(boundsOff));
  w.u64(at + 0x20, abs(shaderMapOff));
  w.u16(at + 0x2c, model.renderMask ?? 0xff); // RenderMask (niedriges Byte), Flags 0
  w.u16(at + 0x2e, n);

  const boxes = model.geometries.map(geometryAabb);
  const outer = n > 1 ? unionAabb(boxes) : null;
  const writeBox = (o: number, b: Aabb) => {
    b.min.forEach((v, k) => w.f32(at + o + k * 4, v));
    b.max.forEach((v, k) => w.f32(at + o + 16 + k * 4, v));
  };
  if (outer) writeBox(boundsOff, outer);

  model.geometries.forEach((g, i) => {
    w.u16(at + shaderMapOff + i * 2, g.shader);
    w.u64(at + geomPtrOff + i * 8, abs(geomOffs[i]!));
    writeBox(boundsOff + (outer ? (i + 1) * 32 : 0), boxes[i]!);

    const gb = geomBlocks[i]!;
    const go = at + geomOffs[i]!;
    w.u32(go + 0x00, VFT_GEOMETRY);
    w.u32(go + 0x04, 1);
    w.pointer(go + 0x18, gb.vertexBuffer);
    w.pointer(go + 0x38, gb.indexBuffer);
    w.u32(go + 0x58, gb.indexCount);
    w.u32(go + 0x5c, gb.indexCount / 3);
    w.u16(go + 0x60, gb.vertexCount);
    w.u16(go + 0x62, 3);
    w.u16(go + 0x70, VERTEX_STRIDE);
    w.pointer(go + 0x78, gb.vertexData);
  });
}

// --- Drawable ----------------------------------------------------------------------------------------------

/** Baut eine YDR-Datei, optional mit eingebetteter Kollision. */
export function buildYdr(drawable: Drawable): Uint8Array {
  validate(drawable);
  const collision = drawable.collision ? buildCollisionBlocks(drawable.collision) : null;

  const levels = [drawable.high, drawable.med, drawable.low, drawable.vlow];
  const shaderBlocks = drawable.shaders.map(buildShaderBlocks);

  const { plans, totalLength } = planLevels(levels, drawable.name);
  const geometryBlocks = plans.flatMap((p) => (p ? p.blocks.flat() : []));

  const modelsBlock = new ResourceBlock(
    totalLength,
    (w) => {
      const base = modelsBlock.address;
      for (const plan of plans) {
        if (!plan) continue;
        const header = plan.listOffset;
        w.u64(header, base + header + 16);
        w.u16(header + 8, plan.models.length);
        w.u16(header + 10, plan.models.length);
        plan.models.forEach((m, mi) => {
          const at = plan.modelOffsets[mi]!;
          w.u64(header + 16 + mi * 8, base + at);
          writeModel(w, at, base, m, plan.blocks[mi]!);
        });
      }
    },
    'models',
  );

  const pagesInfo = new ResourceBlock(
    20,
    (w, ctx) => {
      w.u8(8, ctx.systemPageCount);
      w.u8(9, ctx.graphicsPageCount);
    },
    'pagesInfo',
  );

  const shaderArray = new ResourceBlock(
    8 * drawable.shaders.length,
    (w) => shaderBlocks.forEach((s, i) => w.pointer(i * 8, s.fx)),
    'shaderPointers',
  );
  const shaderGroup = new ResourceBlock(
    SHADER_GROUP_SIZE,
    (w) => {
      w.u32(0x00, VFT_SHADER_GROUP);
      w.u32(0x04, 1);
      w.pointer(0x10, shaderArray);
      w.u16(0x18, drawable.shaders.length);
      w.u16(0x1a, drawable.shaders.length);
      w.u32(0x30, SHADER_GROUP_SIZE / 16);
    },
    'shaderGroup',
  );
  const nameBlock = new ResourceBlock(drawable.name.length + 1, (w) => w.cstring(0, drawable.name), 'drawableName');

  const allModels = levels.flatMap((l) => l ?? []);
  const box = unionAabb(allModels.flatMap((m) => m.geometries.map(geometryAabb)));
  const sphere = boundingSphere(drawable.high, box);
  const lod = drawable.lodDist ?? {};
  const levelFlags = (models: DrawableModel[] | undefined, flags: number) =>
    models && models.length > 0 ? ((0xff << 8) | flags) >>> 0 : 0;

  const root = new ResourceBlock(
    DRAWABLE_SIZE,
    (w) => {
      w.u32(0x00, VFT_DRAWABLE);
      w.u32(0x04, 1);
      w.pointer(0x08, pagesInfo);
      w.pointer(0x10, shaderGroup);
      sphere.center.forEach((v, k) => w.f32(0x20 + k * 4, v));
      w.f32(0x2c, sphere.radius);
      box.min.forEach((v, k) => w.f32(0x30 + k * 4, v));
      w.u32(0x3c, BOUND_SENTINEL);
      box.max.forEach((v, k) => w.f32(0x40 + k * 4, v));
      w.u32(0x4c, BOUND_SENTINEL);

      const base = modelsBlock.address;
      plans.forEach((plan, i) => {
        if (plan) w.u64(0x50 + i * 8, base + plan.listOffset);
      });
      w.f32(0x70, lod.high ?? 9998);
      w.f32(0x74, lod.med ?? 9998);
      w.f32(0x78, lod.low ?? 9998);
      w.f32(0x7c, lod.vlow ?? 9998);
      w.u32(0x80, levelFlags(drawable.high, 1));
      w.u32(0x84, levelFlags(drawable.med, 0));
      w.u32(0x88, levelFlags(drawable.low, 0));
      w.u32(0x8c, levelFlags(drawable.vlow, 0));
      w.u16(0x9a, Math.ceil(totalLength / 16));
      w.pointer(0xa0, modelsBlock);
      w.pointer(0xa8, nameBlock);
      w.pointer(0xc8, collision?.root ?? null);
    },
    'drawable',
  );

  const system: ResourceBlock[] = [
    root,
    pagesInfo,
    shaderGroup,
    shaderArray,
    ...shaderBlocks.flatMap((s) => [s.fx, s.params, ...s.extras]),
    modelsBlock,
    ...geometryBlocks.flatMap((g) => [g.vertexBuffer, g.vertexDecl, g.indexBuffer, g.vertexData, g.indexData]),
    ...(collision?.blocks ?? []),
    nameBlock,
  ];

  return buildResource({ version: YDR_VERSION, system, graphics: [] });
}
