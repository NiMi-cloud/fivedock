/**
 * Livery-Ebene für Fahrzeuge anlegen, die keine haben: Die Lack-Shader `vehicle_paint1` und `vehicle_paint2` werden auf `vehicle_paint3`
 * umgestellt, das eine zweite Textur-Ebene (`DiffuseSampler2`, auf der zweiten Texturkoordinate UV1) über dem Lack zeigt. Die neue Textur
 * kommt ins Texturwörterbuch (.ytd), das Modell (.yft) verweist über ihren Namen darauf.
 */

import { type Yft, editYft, readYft } from '@toolkit/rage-formats';
import { matchShader } from './vehicle-add.ts';
import type { VehiclePart } from './vehicle.ts';

export interface LiveryCandidate {
  /** Nummer des Shaders in der angezeigten Datei. */
  shader: number;
  preset: string;
  /** Haupttextur des Shaders, zur Orientierung. */
  diffuse: string;
  triangles: number;
  /** Alle Geometrien mit diesem Shader haben die zweite Texturkoordinate (UV1), auf der die Ebene liegt. */
  hasUv1: boolean;
  /** Vorschlag: mit UV1, und keine Unterboden-, Boden- oder LOD-Teile. */
  recommended: boolean;
  partIds: string[];
}

const CONVERTIBLE = new Set(['vehicle_paint1', 'vehicle_paint2']);
const SKIP_HINT = /under|floor|lod|dummy|chassis_low/i;

/** Lack-Shader, die sich auf paint3 umstellen lassen, mit ihren Teilen. Leer, wenn es nichts umzustellen gibt. */
export function liveryCandidates(yft: Yft, parts: VehiclePart[]): LiveryCandidate[] {
  const byShader = new Map<number, VehiclePart[]>();
  for (const p of parts) {
    if (p.category !== 'paint') continue;
    if (!CONVERTIBLE.has(yft.shaders[p.shader]?.preset ?? '')) continue;
    let list = byShader.get(p.shader);
    if (!list) byShader.set(p.shader, (list = []));
    list.push(p);
  }
  return [...byShader.entries()]
    .map(([shader, list]) => {
      const diffuse = yft.shaders[shader]!.textures.find((t) => t.param === 'DiffuseSampler')?.name ?? '';
      const hasUv1 = list.every((p) => !!yft.geometries[p.geometry]?.uvs[1]);
      return {
        shader,
        preset: yft.shaders[shader]!.preset,
        diffuse,
        triangles: list.reduce((sum, p) => sum + p.triangleCount, 0),
        hasUv1,
        recommended: hasUv1 && !SKIP_HINT.test(diffuse),
        partIds: list.map((p) => p.id),
      };
    })
    .sort((a, b) => b.triangles - a.triangles);
}

/** Name für die neue Livery-Textur: `<fahrzeug>_livery`, bei Kollision mit einer vorhandenen Textur mit Zahl dahinter. */
export function liveryTextureName(model: string, taken: Iterable<string>): string {
  const used = new Set<string>();
  for (const name of taken) used.add(name.toLowerCase());
  const base = `${model.toLowerCase().replace(/[^a-z0-9_]+/g, '_') || 'vehicle'}_livery`;
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base}${n}`;
  return name;
}

export interface LiveryLayerPlan {
  /** Shader (Nummern in der Datei, die die Oberfläche zeigt), die umgestellt werden. */
  shaders: number[];
  textureName: string;
}

/**
 * Stellt in einer Modelldatei die Lack-Shader des Plans um. `reference` ist das Fahrzeug, für das die Shader-Nummern des Plans gelten (die
 * angezeigte Datei); die Shader der anderen Dateien werden über ihr Aussehen gefunden (siehe `matchShader`).
 */
export function applyLiveryLayer(file: Uint8Array, plan: LiveryLayerPlan, reference?: Yft): Uint8Array {
  const yft = readYft(file);
  const source = reference ?? yft;
  const paint = plan.shaders.map((shader) => {
    const target = matchShader(source, shader, yft);
    if (target === null) {
      const s = source.shaders[shader];
      throw new Error(`Das Material "${(s?.preset ?? '?').replace(/^vehicle_/, '')} / ${s?.textures.find((t) => t.param === 'DiffuseSampler')?.name ?? ''}" gibt es in dieser Modelldatei nicht.`);
    }
    return { shader: target, textureName: plan.textureName };
  });
  return editYft(file, { paint }).file;
}
