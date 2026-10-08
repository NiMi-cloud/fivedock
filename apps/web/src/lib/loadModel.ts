import type { MaterialSource, MeshPart, ModelData, TextureSource } from '@toolkit/forge-core';
import * as THREE from 'three';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

export type SourceFormat = 'glb' | 'gltf' | 'obj' | 'fbx' | 'dae';

export interface LoadedModel {
  model: ModelData;
  format: SourceFormat;
  fileName: string;
}

const MODEL_EXTENSIONS: SourceFormat[] = ['glb', 'gltf', 'fbx', 'obj', 'dae'];

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

function baseName(path: string): string {
  const clean = path.split('?')[0] ?? path;
  const last = clean.split(/[\\/]/).pop() ?? clean;
  try {
    return decodeURIComponent(last).toLowerCase();
  } catch {
    return last.toLowerCase();
  }
}

/** Sucht unter den abgelegten Dateien die Modelldatei (in fester Reihenfolge der Formate). */
export function findModelFile(files: File[]): File | null {
  for (const ext of MODEL_EXTENSIONS) {
    const hit = files.find((f) => extensionOf(f.name) === ext);
    if (hit) return hit;
  }
  return null;
}

/**
 * Liest die abgelegten Dateien. Weitere Dateien (Texturen, MTL, .bin) werden über ihren Dateinamen
 * gefunden, wenn das Modell sie referenziert.
 */
export async function loadModelFiles(files: File[]): Promise<LoadedModel> {
  const main = findModelFile(files);
  if (!main) throw new Error('Keine unterstützte Modelldatei gefunden (GLB, glTF, OBJ, FBX oder DAE).');

  const format = extensionOf(main.name) as SourceFormat;
  const blobUrls = new Map<string, string>();
  for (const f of files) {
    if (f !== main) blobUrls.set(f.name.toLowerCase(), URL.createObjectURL(f));
  }

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => blobUrls.get(baseName(url)) ?? url);

  try {
    let root: THREE.Object3D;
    switch (format) {
      case 'glb':
      case 'gltf': {
        const loader = new GLTFLoader(manager);
        const data = format === 'glb' ? await main.arrayBuffer() : await main.text();
        const gltf = await loader.parseAsync(data, '');
        root = gltf.scene;
        break;
      }
      case 'obj': {
        const loader = new OBJLoader(manager);
        const mtlFile = files.find((f) => extensionOf(f.name) === 'mtl');
        if (mtlFile) {
          const mtl = new MTLLoader(manager).parse(await mtlFile.text(), '');
          mtl.preload();
          loader.setMaterials(mtl);
        }
        root = loader.parse(await main.text());
        break;
      }
      case 'fbx': {
        root = new FBXLoader(manager).parse(await main.arrayBuffer(), '');
        break;
      }
      case 'dae': {
        const collada = new ColladaLoader(manager).parse(await main.text(), '');
        if (!collada) throw new Error('Die DAE-Datei ist ungültig.');
        root = collada.scene;
        break;
      }
    }

    const nameStem = main.name.replace(/\.[^.]+$/, '');
    const model = objectToModel(root, nameStem, format);
    return { model, format, fileName: main.name };
  } finally {
    // Die Blob-URLs werden erst nach dem Lesen freigegeben, Texturen sind dann bereits dekodiert.
    setTimeout(() => blobUrls.forEach((u) => URL.revokeObjectURL(u)), 10_000);
  }
}

// --- Umwandlung Object3D -> ModelData ---------------------------------------------------------

type PixelSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageData;

function imageSize(image: PixelSource): { width: number; height: number } {
  if (image instanceof ImageData) return { width: image.width, height: image.height };
  const img = image as HTMLImageElement;
  const width = (img as unknown as { naturalWidth?: number }).naturalWidth || img.width;
  const height = (img as unknown as { naturalHeight?: number }).naturalHeight || img.height;
  return { width, height };
}

function imageToRgba(image: PixelSource): { width: number; height: number; rgba: Uint8Array } | null {
  const { width, height } = imageSize(image);
  if (!width || !height) return null;
  if (image instanceof ImageData) return { width, height, rgba: new Uint8Array(image.data.buffer.slice(0)) };

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image as CanvasImageSource, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  return { width, height, rgba: new Uint8Array(data.buffer.slice(0)) };
}

interface Builder {
  materials: MaterialSource[];
  textures: TextureSource[];
  materialIds: Map<string, number>;
  textureIds: Map<unknown, number>;
  /** true bei glTF: Dort steht der Alpha-Modus (OPAQUE, MASK, BLEND) ausdrücklich in der Datei. */
  explicitAlpha: boolean;
}

function textureIndex(builder: Builder, texture: THREE.Texture | null | undefined, fallbackName: string): number | null {
  if (!texture || !texture.image) return null;
  const key = texture.image as unknown;
  const known = builder.textureIds.get(key);
  if (known !== undefined) return known;

  const px = imageToRgba(texture.image as PixelSource);
  if (!px) return null;
  const index = builder.textures.length;
  builder.textures.push({ name: texture.name || `${fallbackName}_diffuse`, ...px });
  builder.textureIds.set(key, index);
  return index;
}

function materialIndex(builder: Builder, material: THREE.Material | undefined): number {
  const mat = material ?? new THREE.MeshStandardMaterial();
  const known = builder.materialIds.get(mat.uuid);
  if (known !== undefined) return known;

  const withColor = mat as THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null };
  const rgb = { r: 1, g: 1, b: 1 };
  if (withColor.color) withColor.color.getRGB(rgb, THREE.SRGBColorSpace);

  const index = builder.materials.length;
  builder.materials.push({
    name: mat.name || `material_${index}`,
    baseColor: [rgb.r, rgb.g, rgb.b, mat.transparent ? mat.opacity : 1],
    textureIndex: textureIndex(builder, withColor.map, mat.name || `material_${index}`),
    // three.js setzt bei MASK alphaTest und bei BLEND transparent. Bei anderen Formaten entscheidet die Textur.
    ...(builder.explicitAlpha ? { alphaMode: mat.alphaTest > 0 ? ('mask' as const) : mat.transparent ? ('blend' as const) : ('opaque' as const) } : {}),
  });
  builder.materialIds.set(mat.uuid, index);
  return index;
}

/** Übernimmt nur die benutzten Eckpunkte und ordnet die Indizes neu. */
function buildPart(
  name: string,
  src: { positions: Float32Array; normals: Float32Array; uvs: Float32Array },
  indices: ArrayLike<number>,
  materialIdx: number,
): MeshPart | null {
  if (indices.length < 3) return null;
  const remap = new Map<number, number>();
  const order: number[] = [];
  const out = new Uint32Array(indices.length - (indices.length % 3));

  for (let i = 0; i < out.length; i++) {
    const old = indices[i]!;
    let mapped = remap.get(old);
    if (mapped === undefined) {
      mapped = order.length;
      remap.set(old, mapped);
      order.push(old);
    }
    out[i] = mapped;
  }

  const positions = new Float32Array(order.length * 3);
  const normals = new Float32Array(order.length * 3);
  const uvs = new Float32Array(order.length * 2);
  order.forEach((o, n) => {
    positions.set(src.positions.subarray(o * 3, o * 3 + 3), n * 3);
    normals.set(src.normals.subarray(o * 3, o * 3 + 3), n * 3);
    uvs.set(src.uvs.subarray(o * 2, o * 2 + 2), n * 2);
  });
  return { name, positions, normals, uvs, indices: out, materialIndex: materialIdx };
}

function objectToModel(root: THREE.Object3D, name: string, format: SourceFormat): ModelData {
  root.updateMatrixWorld(true);
  const defaultFlipV = format !== 'glb' && format !== 'gltf';
  const builder: Builder = { materials: [], textures: [], materialIds: new Map(), textureIds: new Map(), explicitAlpha: !defaultFlipV };
  const parts: MeshPart[] = [];

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;

    const geometry = mesh.geometry as THREE.BufferGeometry;
    const pos = geometry.getAttribute('position');
    if (!pos) return;
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    const nor = geometry.getAttribute('normal')!;
    const uv = geometry.getAttribute('uv');

    const world = mesh.matrixWorld;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(world);
    const mirrored = world.determinant() < 0;
    const count = pos.count;

    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const v = new THREE.Vector3();

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(world);
      positions.set([v.x, v.y, v.z], i * 3);
      v.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
      normals.set([v.x, v.y, v.z], i * 3);
    }

    const flipV = (materials[0] as THREE.Material & { map?: THREE.Texture | null } | undefined)?.map?.flipY ?? defaultFlipV;
    if (uv) {
      for (let i = 0; i < count; i++) {
        const u = uv.getX(i);
        const vv = uv.getY(i);
        uvs[i * 2] = u;
        uvs[i * 2 + 1] = flipV ? 1 - vv : vv;
      }
    }

    const index = geometry.getIndex();
    const all: number[] = [];
    if (index) {
      for (let i = 0; i < index.count; i++) all.push(index.getX(i));
    } else {
      for (let i = 0; i < count; i++) all.push(i);
    }

    const emit = (slice: number[], matIdx: number, suffix: string) => {
      const tris = mirrored ? swapWinding(slice) : slice;
      const part = buildPart(`${mesh.name || 'mesh'}${suffix}`, { positions, normals, uvs }, tris, matIdx);
      if (part) parts.push(part);
    };

    if (Array.isArray(mesh.material) && geometry.groups.length > 0) {
      geometry.groups.forEach((g, gi) => {
        const slice = all.slice(g.start, g.start + g.count);
        emit(slice, materialIndex(builder, materials[g.materialIndex ?? 0]), `_${gi}`);
      });
    } else {
      emit(all, materialIndex(builder, materials[0]), '');
    }
  });

  return { name, parts, materials: builder.materials, textures: builder.textures };
}

function swapWinding(indices: number[]): number[] {
  const out = indices.slice();
  for (let i = 0; i + 2 < out.length; i += 3) {
    const b = out[i + 1]!;
    out[i + 1] = out[i + 2]!;
    out[i + 2] = b;
  }
  return out;
}
