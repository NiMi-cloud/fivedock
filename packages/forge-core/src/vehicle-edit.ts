/**
 * Fahrzeug bearbeiten: Teile aus dem Modell entfernen (Abzeichen, Dachträger, Frontschutzbügel …).
 *
 * Ein Teil ist so beschrieben, dass es in jeder Detailstufe und auch im zweiten Modell eines Fahrzeugs (`_hi.yft`) wieder
 * erkannt wird: Knochen, Shader-Voreinstellung und Name der Diffuse-Textur. Die Dreiecke eines Teils werden aus dem Indexpuffer
 * entfernt, alles andere in der Datei bleibt, wie es ist (siehe `removeYftTriangles`).
 */

import { removeYdrTriangles, removeYftTriangles } from '@toolkit/rage-formats';
import type { Yft, YftEditResult, YftShader } from '@toolkit/rage-formats';
import { triangleBones } from './vehicle.ts';
import type { VehiclePart } from './vehicle.ts';

export interface PartRule {
  /** Name des Knochens, dem das Teil folgt. */
  bone: string;
  /** Shader-Voreinstellung zum Beispiel "vehicle_mesh". */
  preset: string;
  /** Name der Diffuse-Textur, oder null, wenn der Shader keine hat. */
  texture: string | null;
}

/** Name der Diffuse-Textur (`DiffuseSampler`) eines Shaders. */
export function diffuseTextureOf(shader: Pick<YftShader, 'textures'>): string | null {
  return shader.textures.find((t) => t.param === 'DiffuseSampler' && t.name)?.name ?? null;
}

const sameTexture = (a: string | null, b: string | null) => (a === null || b === null ? a === b : a.toLowerCase() === b.toLowerCase());

/** Regel zu einem Teil des geladenen Fahrzeugs. */
export function ruleOfPart(yft: Yft, part: VehiclePart): PartRule {
  const shader = yft.shaders[part.shader];
  return { bone: part.bone, preset: shader?.preset ?? '', texture: shader ? diffuseTextureOf(shader) : null };
}

/** Entfernt alle Dreiecke, auf die eine der Regeln passt, aus allen Detailstufen. `kind` wählt YFT (Fahrzeug) oder YDR. */
export function removeParts(file: Uint8Array, rules: PartRule[], kind: 'yft' | 'ydr' = 'yft'): YftEditResult {
  const edit = kind === 'yft' ? removeYftTriangles : removeYdrTriangles;
  if (rules.length === 0) return { file, removed: 0, byLod: [0, 0, 0, 0] };
  return edit(file, ({ geometry, shader, bones }) => {
    const texture = diffuseTextureOf(shader);
    const candidates = rules.filter((r) => r.preset === shader.preset && sameTexture(r.texture, texture));
    if (candidates.length === 0) return null;
    const boneOfTriangle = triangleBones(geometry);
    const flags = new Uint8Array(boneOfTriangle.length);
    for (let t = 0; t < flags.length; t++) {
      const bone = bones[boneOfTriangle[t]!]?.name ?? `bone_${boneOfTriangle[t]}`;
      if (candidates.some((r) => r.bone === bone)) flags[t] = 1;
    }
    return flags;
  });
}

/** Hinweis für Teile, die aussehen wie Abzeichen, Logos oder Aufkleber (nach dem Namen ihrer Textur). */
export function looksLikeDecal(texture: string | null): boolean {
  return texture !== null && /badge|logo|decal|emblem|sticker|sign|stripe|lettering|text/i.test(texture);
}
