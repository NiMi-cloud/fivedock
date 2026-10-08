/**
 * Teile eines anderen Fahrzeugs (YFT) oder Modells (YDR) als Anbauteil übernehmen: Die gewählten Teile werden als Netze ausgelesen (nur die
 * benutzten Eckpunkte, mit Positionen, Normalen und der ersten Texturkoordinate) und je Material des Spenders zusammengefasst. Daraus macht die
 * Oberfläche ein `AddedModel`, das wie ein eigenes 3D-Modell eingebaut wird (Material des eigenen Fahrzeugs, wahlweise mit der Textur des Spenders).
 */

import type { Yft } from '@toolkit/rage-formats';
import { suggestLightbarMaterials, usedShaders } from './lightbar.ts';
import type { MeshPart, TextureSource } from './model.ts';
import type { AddedModel } from './vehicle-add.ts';
import { type PartCategory, type VehiclePart, categoryOf } from './vehicle.ts';

export interface DonorModel {
  /** Netze im Koordinatensystem des Spenders. `materialIndex` zeigt in `shaders`. */
  parts: MeshPart[];
  /** Shader-Nummern des Spenders, je Eintrag ein Material des Netzes. */
  shaders: number[];
}

/** Vorläufige Normalen aus den Dreiecken, wenn der Spender keine mitbringt. */
function faceNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const [a, b, c] = [indices[t]! * 3, indices[t + 1]! * 3, indices[t + 2]! * 3];
    const ux = positions[b]! - positions[a]!;
    const uy = positions[b + 1]! - positions[a + 1]!;
    const uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!;
    const vy = positions[c + 1]! - positions[a + 1]!;
    const vz = positions[c + 2]! - positions[a + 2]!;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) {
      normals[i] = normals[i]! + nx;
      normals[i + 1] = normals[i + 1]! + ny;
      normals[i + 2] = normals[i + 2]! + nz;
    }
  }
  for (let i = 0; i + 2 < normals.length; i += 3) {
    const len = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!) || 1;
    normals[i] = normals[i]! / len;
    normals[i + 1] = normals[i + 1]! / len;
    normals[i + 2] = normals[i + 2]! / len;
  }
  return normals;
}

/**
 * Liest die Teile `parts` des Spenders `yft` als Netze. Je Teil entsteht ein Netz mit den benutzten Eckpunkten; Teile mit demselben Material
 * des Spenders teilen sich einen Eintrag in `shaders`.
 */
export function donorModel(yft: Yft, parts: VehiclePart[]): DonorModel {
  const shaders: number[] = [];
  const out: MeshPart[] = [];
  for (const part of parts) {
    const g = yft.geometries[part.geometry];
    if (!g || part.indices.length === 0) continue;
    let materialIndex = shaders.indexOf(part.shader);
    if (materialIndex < 0) {
      shaders.push(part.shader);
      materialIndex = shaders.length - 1;
    }
    const map = new Map<number, number>();
    const used: number[] = [];
    const indices = new Uint32Array(part.indices.length);
    for (let i = 0; i < part.indices.length; i++) {
      const old = part.indices[i]!;
      let next = map.get(old);
      if (next === undefined) {
        next = used.length;
        map.set(old, next);
        used.push(old);
      }
      indices[i] = next;
    }
    const positions = new Float32Array(used.length * 3);
    const uvs = new Float32Array(used.length * 2);
    const uv = g.uvs[0];
    used.forEach((old, n) => {
      positions.set(g.positions.subarray(old * 3, old * 3 + 3), n * 3);
      if (uv) uvs.set(uv.subarray(old * 2, old * 2 + 2), n * 2);
    });
    let normals: Float32Array;
    if (g.normals) {
      normals = new Float32Array(used.length * 3);
      used.forEach((old, n) => normals.set(g.normals!.subarray(old * 3, old * 3 + 3), n * 3));
    } else {
      normals = faceNormals(positions, indices);
    }
    out.push({ name: part.bone, positions, normals, uvs, indices, materialIndex });
  }
  return { parts: out, shaders };
}

/** Material des eigenen Fahrzeugs, das für ein Spender-Material der Art `kind` als Vorlage dient. */
export function targetMaterialFor(kind: PartCategory, target: Yft, targetParts: VehiclePart[]): number {
  const used = [...usedShaders(target)].sort((a, b) => a - b);
  const suggestion = suggestLightbarMaterials(target, targetParts);
  const housing = suggestion.housing ?? used[0] ?? 0;
  const byCategory = (category: PartCategory) => {
    // das am häufigsten benutzte Material dieser Art
    const counts = new Map<number, number>();
    for (const g of target.geometries) {
      if (categoryOf(target.shaders[g.shader]?.preset ?? '') === category) counts.set(g.shader, (counts.get(g.shader) ?? 0) + g.indices.length / 3);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
  };
  switch (kind) {
    case 'paint':
      return byCategory('paint') ?? housing;
    case 'glass':
      return byCategory('glass') ?? suggestion.lens ?? housing;
    case 'light':
      return suggestion.lens ?? housing;
    case 'tire':
      return byCategory('tire') ?? housing;
    default:
      return housing;
  }
}

const PREVIEW_COLORS: Record<PartCategory, string> = { paint: '#aab0b8', glass: '#7fa3b8', light: '#f0c060', tire: '#2a2c31', other: '#30343c' };

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

/** Mittlere Farbe einer Textur (nur deckende Bildpunkte), für die einfarbige Vorschau. */
function averageColor(texture: TextureSource): string | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const step = Math.max(1, Math.floor((texture.width * texture.height) / 4096));
  for (let p = 0; p < texture.width * texture.height; p += step) {
    const a = texture.rgba[p * 4 + 3]!;
    if (a < 128) continue;
    r += texture.rgba[p * 4]!;
    g += texture.rgba[p * 4 + 1]!;
    b += texture.rgba[p * 4 + 2]!;
    n++;
  }
  return n > 0 ? hex(r / n, g / n, b / n) : null;
}

export interface DonorRequest {
  id: string;
  /** Anzeigename des Spenders. */
  name: string;
  /** Spender und die gewählten Teile. */
  donor: Yft;
  parts: VehiclePart[];
  /** Liefert die Textur des Spenders mit diesem Namen (RGBA), oder null. */
  textureOf: (name: string) => TextureSource | null;
  /** Das eigene Fahrzeug, in das die Teile kommen. */
  target: Yft;
  targetParts: VehiclePart[];
}

/**
 * Macht aus den gewählten Teilen des Spenders ein Anbauteil: Die Netze behalten ihre Lage im Spender (Mitte der Unterkante als Ursprung,
 * `position` setzt sie dorthin zurück). Lack, Glas und Licht des Spenders bekommen die entsprechenden Materialien des eigenen Fahrzeugs,
 * alles andere das schwarze Gehäusematerial, und zwar mit der Textur des Spenders, wenn er eine hat.
 */
export function donorToAddedModel(request: DonorRequest): AddedModel {
  const { parts, shaders } = donorModel(request.donor, request.parts);
  if (parts.length === 0) throw new Error('Keine Dreiecke gewählt.');

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    for (let i = 0; i + 2 < part.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const x = part.positions[i + k]!;
        if (x < min[k]!) min[k] = x;
        if (x > max[k]!) max[k] = x;
      }
    }
  }
  const origin: [number, number, number] = [(min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, min[2]!];
  for (const part of parts) {
    for (let i = 0; i + 2 < part.positions.length; i += 3) {
      part.positions[i] = part.positions[i]! - origin[0];
      part.positions[i + 1] = part.positions[i + 1]! - origin[1];
      part.positions[i + 2] = part.positions[i + 2]! - origin[2];
    }
  }

  const textures: TextureSource[] = [];
  const colors: string[] = [];
  const materials: number[] = [];
  const sourceTextures: Array<number | null> = [];
  for (const shaderIndex of shaders) {
    const shader = request.donor.shaders[shaderIndex];
    const kind = categoryOf(shader?.preset ?? '');
    materials.push(targetMaterialFor(kind, request.target, request.targetParts));
    // Die Textur nur bei Teilen ohne Lack, Glas, Licht und Reifen: Dort ist sie das, was das Teil ausmacht (Lack kommt vom Fahrzeug).
    let textureIndex: number | null = null;
    let color = PREVIEW_COLORS[kind];
    if (kind === 'other') {
      const name = shader?.textures.find((t) => t.param === 'DiffuseSampler')?.name ?? '';
      const source = name ? request.textureOf(name) : null;
      if (source) {
        const known = textures.findIndex((t) => t.name.toLowerCase() === source.name.toLowerCase());
        textureIndex = known >= 0 ? known : textures.push(source) - 1;
        color = averageColor(source) ?? color;
      }
    }
    colors.push(color);
    sourceTextures.push(textureIndex);
  }

  return {
    id: request.id,
    kind: 'model',
    name: request.name,
    parts,
    colors,
    materials,
    textures,
    sourceTextures,
    materialTextures: sourceTextures.slice(),
    rotation: [0, 0, 0],
    scale: 1,
    position: origin,
    parentBone: 0,
  };
}
