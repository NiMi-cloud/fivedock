/**
 * Fahrzeug in Teile zerlegen: Jedes Dreieck gehört zu dem Knochen, dem seine Eckpunkte hauptsächlich folgen
 * (Haube, Türen, Stoßfänger, Räder, Fahrgestell), und zu dem Material seiner Geometrie (Lack, Glas, Reifen, Licht).
 * Daraus entstehen anklickbare Teile für die Fahrzeug-Ansicht und die Grundlage für die Livery-Vorlage.
 */

import { isPaintPreset } from '@toolkit/rage-formats';
import type { Yft, YftGeometry } from '@toolkit/rage-formats';

export type PartCategory = 'paint' | 'glass' | 'tire' | 'light' | 'other';

export interface VehiclePart {
  id: string;
  /** Name des Knochens, dem das Teil folgt (zum Beispiel "door_dside_f"). */
  bone: string;
  /** Anzeigename des Knochens in beiden Sprachen. */
  label: { de: string; en: string };
  category: PartCategory;
  /** Index in `Yft.geometries` und `Yft.shaders`. */
  geometry: number;
  shader: number;
  /** Eckpunktindizes der Dreiecke (je drei), bezogen auf die Eckpunkte der Geometrie. */
  indices: Uint32Array;
  triangleCount: number;
  /** Achsenparallele Begrenzung des Teils im Fahrzeug. */
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
}

export interface VehicleParts {
  parts: VehiclePart[];
  /** Zahl der Teile je Kategorie. */
  counts: Record<PartCategory, number>;
}

export const CATEGORY_ORDER: PartCategory[] = ['paint', 'glass', 'light', 'tire', 'other'];

/** Anzeigenamen bekannter Fahrzeugknochen. Unbekannte Knochen zeigen ihren Dateinamen. */
const BONE_LABELS: Record<string, { de: string; en: string }> = {
  chassis: { de: 'Karosserie', en: 'Body' },
  bodyshell: { de: 'Karosserie-Hülle (Dach, Seiten)', en: 'Body shell (roof, sides)' },
  reversinglight_l: { de: 'Rückfahrlicht links', en: 'Left reversing light' },
  reversinglight_r: { de: 'Rückfahrlicht rechts', en: 'Right reversing light' },
  window_lm: { de: 'Fenster Mitte links', en: 'Middle left window' },
  window_rm: { de: 'Fenster Mitte rechts', en: 'Middle right window' },
  chassis_lowlod: { de: 'Karosserie (niedrig)', en: 'Body (low)' },
  chassis_dummy: { de: 'Karosserie (Hilfsteil)', en: 'Body (dummy)' },
  bonnet: { de: 'Motorhaube', en: 'Hood' },
  boot: { de: 'Kofferraumklappe', en: 'Trunk lid' },
  boot_2: { de: 'Heckklappe 2', en: 'Tailgate 2' },
  door_dside_f: { de: 'Tür vorn links', en: 'Front left door' },
  door_pside_f: { de: 'Tür vorn rechts', en: 'Front right door' },
  door_dside_r: { de: 'Tür hinten links', en: 'Rear left door' },
  door_pside_r: { de: 'Tür hinten rechts', en: 'Rear right door' },
  bumper_f: { de: 'Stoßfänger vorn', en: 'Front bumper' },
  bumper_r: { de: 'Stoßfänger hinten', en: 'Rear bumper' },
  wheel_lf: { de: 'Rad vorn links', en: 'Front left wheel' },
  wheel_rf: { de: 'Rad vorn rechts', en: 'Front right wheel' },
  wheel_lr: { de: 'Rad hinten links', en: 'Rear left wheel' },
  wheel_rr: { de: 'Rad hinten rechts', en: 'Rear right wheel' },
  wheel_lm1: { de: 'Rad Mitte links', en: 'Middle left wheel' },
  wheel_rm1: { de: 'Rad Mitte rechts', en: 'Middle right wheel' },
  windscreen: { de: 'Frontscheibe', en: 'Windscreen' },
  windscreen_r: { de: 'Heckscheibe', en: 'Rear window' },
  window_lf: { de: 'Fenster vorn links', en: 'Front left window' },
  window_rf: { de: 'Fenster vorn rechts', en: 'Front right window' },
  window_lr: { de: 'Fenster hinten links', en: 'Rear left window' },
  window_rr: { de: 'Fenster hinten rechts', en: 'Rear right window' },
  exhaust: { de: 'Auspuff', en: 'Exhaust' },
  steeringwheel: { de: 'Lenkrad', en: 'Steering wheel' },
  seat_dside_f: { de: 'Sitz vorn links', en: 'Front left seat' },
  seat_pside_f: { de: 'Sitz vorn rechts', en: 'Front right seat' },
  seat_dside_r: { de: 'Sitz hinten links', en: 'Rear left seat' },
  seat_pside_r: { de: 'Sitz hinten rechts', en: 'Rear right seat' },
  petrolcap: { de: 'Tankdeckel', en: 'Fuel cap' },
  headlight_l: { de: 'Scheinwerfer links', en: 'Left headlight' },
  headlight_r: { de: 'Scheinwerfer rechts', en: 'Right headlight' },
  taillight_l: { de: 'Rücklicht links', en: 'Left taillight' },
  taillight_r: { de: 'Rücklicht rechts', en: 'Right taillight' },
  indicator_lf: { de: 'Blinker vorn links', en: 'Front left indicator' },
  indicator_rf: { de: 'Blinker vorn rechts', en: 'Front right indicator' },
  indicator_lr: { de: 'Blinker hinten links', en: 'Rear left indicator' },
  indicator_rr: { de: 'Blinker hinten rechts', en: 'Rear right indicator' },
  platelight: { de: 'Kennzeichenlicht', en: 'Plate light' },
  numberplate: { de: 'Kennzeichen', en: 'Number plate' },
};

export function boneLabel(bone: string): { de: string; en: string } {
  return BONE_LABELS[bone] ?? { de: bone, en: bone };
}

/** Art eines Materials nach seinem Shader. */
export function categoryOf(preset: string): PartCategory {
  if (isPaintPreset(preset)) return 'paint';
  if (preset.startsWith('vehicle_vehglass') || preset.includes('glass')) return 'glass';
  if (preset === 'vehicle_tire') return 'tire';
  if (preset === 'vehicle_lightsemissive' || preset.startsWith('vehicle_lights') || preset.includes('emissive')) return 'light';
  return 'other';
}

/** Knochen, dem ein Eckpunkt am stärksten folgt. Ohne Skinning ist es der Knochen 0 (Fahrgestell). */
function dominantBone(g: YftGeometry, vertex: number): number {
  const weights = g.blendWeights;
  const indices = g.blendIndices;
  if (!weights || !indices) return 0;
  let best = 0;
  for (let k = 1; k < 4; k++) if (weights[vertex * 4 + k]! > weights[vertex * 4 + best]!) best = k;
  const index = indices[vertex * 4 + best]!;
  return g.boneIds.length > 0 ? (g.boneIds[index] ?? 0) : index;
}

/**
 * Knochenindex je Dreieck einer Geometrie: der Knochen, dem die Mehrheit der drei Eckpunkte folgt (sonst der erste Eckpunkt).
 * Daraus entstehen die Teile; die Fahrzeug-Bearbeitung nutzt dieselbe Zuordnung, damit beides übereinstimmt.
 */
export function triangleBones(g: YftGeometry): Int32Array {
  const vertexBone = new Int32Array(g.vertexCount);
  for (let v = 0; v < g.vertexCount; v++) vertexBone[v] = dominantBone(g, v);
  const out = new Int32Array(Math.floor(g.indices.length / 3));
  for (let t = 0; t < out.length; t++) {
    const ba = vertexBone[g.indices[t * 3]!]!;
    const bb = vertexBone[g.indices[t * 3 + 1]!]!;
    const bc = vertexBone[g.indices[t * 3 + 2]!]!;
    out[t] = bb === bc ? bb : ba;
  }
  return out;
}

/** Zerlegt die Geometrien des Fahrzeugs in Teile nach Knochen und Material. */
export function buildVehicleParts(yft: Yft): VehicleParts {
  const parts: VehiclePart[] = [];

  yft.geometries.forEach((g, gi) => {
    const preset = yft.shaders[g.shader]?.preset ?? '';
    const category = categoryOf(preset);
    // Dreiecke je Knochen sammeln.
    const boneOfTriangle = triangleBones(g);
    const byBone = new Map<number, number[]>();
    for (let t = 0; t < boneOfTriangle.length; t++) {
      const bone = boneOfTriangle[t]!;
      let list = byBone.get(bone);
      if (!list) byBone.set(bone, (list = []));
      list.push(g.indices[t * 3]!, g.indices[t * 3 + 1]!, g.indices[t * 3 + 2]!);
    }

    for (const [bone, list] of byBone) {
      const min: [number, number, number] = [Infinity, Infinity, Infinity];
      const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      for (const v of list) {
        for (let k = 0; k < 3; k++) {
          const x = g.positions[v * 3 + k]!;
          if (x < min[k]!) min[k] = x;
          if (x > max[k]!) max[k] = x;
        }
      }
      const boneName = yft.bones[bone]?.name ?? `bone_${bone}`;
      parts.push({
        id: `g${gi}:b${bone}`,
        bone: boneName,
        label: boneLabel(boneName),
        category,
        geometry: gi,
        shader: g.shader,
        indices: Uint32Array.from(list),
        triangleCount: list.length / 3,
        boundsMin: min,
        boundsMax: max,
      });
    }
  });

  const counts: Record<PartCategory, number> = { paint: 0, glass: 0, light: 0, tire: 0, other: 0 };
  for (const p of parts) counts[p.category]++;
  // Nach Kategorie, dann größte Teile zuerst.
  parts.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || b.triangleCount - a.triangleCount);
  return { parts, counts };
}

/** Fasst Teile mit gleichem Knochen und gleicher Kategorie zusammen (zum Beispiel mehrere Lack-Geometrien einer Tür). */
export function groupPartsByBone(parts: VehiclePart[]): Array<{ key: string; bone: string; label: VehiclePart['label']; category: PartCategory; parts: VehiclePart[]; triangleCount: number }> {
  const groups = new Map<string, { key: string; bone: string; label: VehiclePart['label']; category: PartCategory; parts: VehiclePart[]; triangleCount: number }>();
  for (const p of parts) {
    const key = `${p.category}:${p.bone}`;
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { key, bone: p.bone, label: p.label, category: p.category, parts: [], triangleCount: 0 }));
    group.parts.push(p);
    group.triangleCount += p.triangleCount;
  }
  return [...groups.values()].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || b.triangleCount - a.triangleCount);
}

/**
 * Lage jedes Knochens im Fahrzeug: die Lage des Knochens zusammen mit der seiner Eltern. Gedreht wird dabei nicht, es zählen nur
 * die Verschiebungen. Das reicht, um Lichter und Anbauteile an der richtigen Stelle zu zeigen.
 */
export function boneWorldPositions(bones: Array<{ index: number; parent: number; position: [number, number, number] }>): Array<[number, number, number]> {
  const out: Array<[number, number, number] | undefined> = [];
  const compute = (i: number, depth: number): [number, number, number] => {
    const cached = out[i];
    if (cached) return cached;
    const bone = bones[i]!;
    const parent: [number, number, number] = bone.parent >= 0 && bone.parent !== i && depth < 64 ? compute(bone.parent, depth + 1) : [0, 0, 0];
    const world: [number, number, number] = [parent[0] + bone.position[0], parent[1] + bone.position[1], parent[2] + bone.position[2]];
    out[i] = world;
    return world;
  };
  return bones.map((_, i) => compute(i, 0));
}
