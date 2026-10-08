/**
 * Lichtbalken zum Aufsetzen auf ein Fahrzeug: Gehäuse und Linsen als Dreiecksnetze, Lage der Sirenenlichter, Dachhöhe aus dem
 * Fahrzeug und Vorschläge für die Materialien. Alle Maße in Metern im Fahrzeugraum (x rechts, y vorn, z oben).
 */

import type { NewBone, NewMesh, Yft } from '@toolkit/rage-formats';
import { type VehiclePart, boneWorldPositions } from './vehicle.ts';

export type Vec3 = [number, number, number];

export interface LightbarSpec {
  /** Länge quer zum Fahrzeug. */
  length: number;
  /** Tiefe in Fahrtrichtung. */
  depth: number;
  /** Gesamthöhe über dem Dach. */
  height: number;
  /** Mitte des Fußes: x, y und die Höhe des Daches (Unterkante des Gehäuses). */
  position: Vec3;
  /** Anzahl der Leuchtmodule (je eines wird ein Sirenenlicht). */
  modules: number;
  /** flach (Streifen) oder hoch (Kuppeln) */
  style: 'flat' | 'dome';
  /** Zwei Standfüße am Dach. */
  feet: boolean;
}

export const DEFAULT_LIGHTBAR: LightbarSpec = {
  length: 1.1,
  depth: 0.3,
  height: 0.1,
  position: [0, 0, 1.2],
  modules: 6,
  style: 'flat',
  feet: true,
};

/** Grenzen der Maße, so wie die Oberfläche sie anbietet. */
export const LIGHTBAR_LIMITS = {
  length: [0.3, 2.2],
  depth: [0.1, 0.8],
  height: [0.04, 0.3],
  modules: [1, 10],
} as const;

export interface LightbarBuild {
  /** Gehäuse: Wanne, Rippen, Endkappen und Füße in einem Netz. */
  housing: NewMesh;
  /** Alle Linsen in einem Netz. */
  lens: NewMesh;
  /** Mitte jedes Leuchtmoduls, von links nach rechts. */
  lights: Vec3[];
  boundsMin: Vec3;
  boundsMax: Vec3;
}

class MeshBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly indices: number[] = [];

  /** Ein Viereck mit gemeinsamer Normale; Ecken gegen den Uhrzeigersinn von außen gesehen. */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3): void {
    const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v: Vec3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n) || 1;
    n = [n[0] / len, n[1] / len, n[2] / len];
    const base = this.positions.length / 3;
    for (const p of [a, b, c, d]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(n[0], n[1], n[2]);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Quader mit abgeschrägter Oberseite: unten halbe Größe `bottom`, oben `top` (x, y), Höhe h, Unterkante bei z0. */
  frustum(cx: number, cy: number, z0: number, bottom: [number, number], top: [number, number], h: number): void {
    const [bx, by] = bottom;
    const [tx, ty] = top;
    const z1 = z0 + h;
    const b: Vec3[] = [[cx - bx, cy - by, z0], [cx + bx, cy - by, z0], [cx + bx, cy + by, z0], [cx - bx, cy + by, z0]];
    const t: Vec3[] = [[cx - tx, cy - ty, z1], [cx + tx, cy - ty, z1], [cx + tx, cy + ty, z1], [cx - tx, cy + ty, z1]];
    // Dreiecke gegen den Uhrzeigersinn von außen gesehen, wie in den Spieldateien (Normale = (b - a) x (c - a)).
    this.quad(t[0]!, t[1]!, t[2]!, t[3]!); // oben
    this.quad(b[0]!, b[3]!, b[2]!, b[1]!); // unten
    this.quad(b[0]!, b[1]!, t[1]!, t[0]!); // vorn (-y)
    this.quad(b[1]!, b[2]!, t[2]!, t[1]!); // rechts (+x)
    this.quad(b[2]!, b[3]!, t[3]!, t[2]!); // hinten (+y)
    this.quad(b[3]!, b[0]!, t[0]!, t[3]!); // links (-x)
  }

  box(cx: number, cy: number, z0: number, hx: number, hy: number, h: number): void {
    this.frustum(cx, cy, z0, [hx, hy], [hx, hy], h);
  }

  toMesh(): NewMesh {
    return { positions: new Float32Array(this.positions), normals: new Float32Array(this.normals), indices: this.indices };
  }
}

/** Baut die Netze eines Lichtbalkens. */
export function buildLightbar(spec: LightbarSpec): LightbarBuild {
  const modules = Math.round(Math.min(LIGHTBAR_LIMITS.modules[1], Math.max(LIGHTBAR_LIMITS.modules[0], spec.modules)));
  const L = spec.length;
  const D = spec.depth;
  const H = spec.height;
  const [cx, cy, z0] = spec.position;
  const housing = new MeshBuilder();
  const lens = new MeshBuilder();

  const footHeight = spec.feet ? Math.min(0.02, H * 0.25) : 0;
  const trayHeight = Math.max(0.012, H * 0.3);
  const trayZ = z0 + footHeight;
  const lensZ = trayZ + trayHeight;
  const lensHeight = Math.max(0.01, H - footHeight - trayHeight);
  const dome = spec.style === 'dome';

  // Wanne und Endkappen
  housing.box(cx, cy, trayZ, L / 2, D / 2, trayHeight);
  const capWidth = Math.min(0.03, L / 8);
  const capHeight = lensHeight * (dome ? 0.8 : 0.9);
  for (const side of [-1, 1]) housing.box(cx + side * (L / 2 - capWidth / 2), cy, lensZ, capWidth / 2, D / 2, capHeight);

  // Füße
  if (spec.feet) {
    const footX = Math.min(L / 2 - 0.1, L * 0.35);
    for (const side of [-1, 1]) housing.box(cx + side * footX, cy, z0, 0.045, Math.min(0.07, D / 3), footHeight);
  }

  // Leuchtmodule: Linse als abgeschrägter Quader, dazwischen schmale Rippen
  const inner = L - 2 * capWidth;
  const pitch = inner / modules;
  const rib = Math.min(0.012, pitch / 6);
  const lights: Vec3[] = [];
  for (let i = 0; i < modules; i++) {
    const x = cx - inner / 2 + pitch * (i + 0.5);
    const halfWidth = pitch / 2 - rib / 2;
    const halfDepth = (D / 2) * 0.88;
    const topShrink = dome ? 0.55 : 0.88;
    lens.frustum(x, cy, lensZ, [halfWidth, halfDepth], [halfWidth * topShrink, halfDepth * (dome ? 0.5 : 0.8)], lensHeight * (dome ? 1 : 0.85));
    lights.push([x, cy, lensZ + lensHeight * 0.55]);
    if (i < modules - 1) housing.box(x + pitch / 2, cy, lensZ, rib / 2, D / 2, lensHeight * 0.8);
  }

  return {
    housing: housing.toMesh(),
    lens: lens.toMesh(),
    lights,
    boundsMin: [cx - L / 2, cy - D / 2, z0],
    boundsMax: [cx + L / 2, cy + D / 2, z0 + H],
  };
}

/**
 * Höhe des Daches im Rechteck um (x, y): die höchste Lackfläche über einem Raster von Messpunkten (die Fläche wird je Dreieck
 * ausgelesen, nicht nur an den Eckpunkten). Ohne Fläche dort: die höchste Lackfläche überhaupt, ohne Lack: null.
 */
export function roofHeight(yft: Yft, parts: VehiclePart[], x: number, y: number, halfWidth: number, halfDepth: number): number | null {
  const samples: Array<[number, number]> = [];
  for (const sx of [-1, -0.5, 0, 0.5, 1]) for (const sy of [-1, 0, 1]) samples.push([x + sx * halfWidth, y + sy * halfDepth]);
  let best = -Infinity;
  let top = -Infinity;
  for (const part of parts) {
    if (part.category !== 'paint') continue;
    const g = yft.geometries[part.geometry];
    if (!g) continue;
    const pos = g.positions;
    for (let t = 0; t + 2 < part.indices.length; t += 3) {
      const a = part.indices[t]! * 3;
      const b = part.indices[t + 1]! * 3;
      const c = part.indices[t + 2]! * 3;
      top = Math.max(top, pos[a + 2]!, pos[b + 2]!, pos[c + 2]!);
      const minX = Math.min(pos[a]!, pos[b]!, pos[c]!);
      const maxX = Math.max(pos[a]!, pos[b]!, pos[c]!);
      const minY = Math.min(pos[a + 1]!, pos[b + 1]!, pos[c + 1]!);
      const maxY = Math.max(pos[a + 1]!, pos[b + 1]!, pos[c + 1]!);
      if (maxX < x - halfWidth || minX > x + halfWidth || maxY < y - halfDepth || minY > y + halfDepth) continue;
      const det = (pos[b + 1]! - pos[c + 1]!) * (pos[a]! - pos[c]!) + (pos[c]! - pos[b]!) * (pos[a + 1]! - pos[c + 1]!);
      if (Math.abs(det) < 1e-12) continue;
      for (const [sx, sy] of samples) {
        const l1 = ((pos[b + 1]! - pos[c + 1]!) * (sx - pos[c]!) + (pos[c]! - pos[b]!) * (sy - pos[c + 1]!)) / det;
        const l2 = ((pos[c + 1]! - pos[a + 1]!) * (sx - pos[c]!) + (pos[a]! - pos[c]!) * (sy - pos[c + 1]!)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
        best = Math.max(best, l1 * pos[a + 2]! + l2 * pos[b + 2]! + l3 * pos[c + 2]!);
      }
    }
  }
  if (Number.isFinite(best)) return best;
  return Number.isFinite(top) ? top : null;
}

/** Materialien (Shader-Nummern des Fahrzeugs), die als Gehäuse und Linse zum Lichtbalken passen. */
export interface LightbarMaterials {
  housing: number | null;
  lens: number | null;
}

/** Shader-Nummern, die mindestens eine Geometrie der höchsten Detailstufe benutzt (nur diese taugen als Vorlage). */
export function usedShaders(yft: Yft): Set<number> {
  return new Set(yft.geometries.map((g) => g.shader));
}

const HOUSING_HINTS = /black|plastic|rubber|trim|carbon|matt|interior/i;
const LENS_HINTS = /emis|light|lens|siren|lamp|spot/i;

/** Schlägt Materialien vor: Gehäuse schwarz und matt, Linse leuchtend (wie die Sirenenlinsen des Fahrzeugs, wenn es welche hat). */
export function suggestLightbarMaterials(yft: Yft, parts: VehiclePart[]): LightbarMaterials {
  const used = usedShaders(yft);
  const triangles = new Map<number, number>();
  for (const g of yft.geometries) triangles.set(g.shader, (triangles.get(g.shader) ?? 0) + g.indices.length / 3);

  const diffuse = (i: number) => yft.shaders[i]?.textures.find((t) => t.param === 'DiffuseSampler')?.name ?? '';
  let housing: number | null = null;
  let best = -Infinity;
  yft.shaders.forEach((s, i) => {
    if (!used.has(i) || s.preset !== 'vehicle_mesh') return;
    const name = diffuse(i);
    let score = 0;
    if (/^black$/i.test(name)) score += 30;
    else if (HOUSING_HINTS.test(name)) score += 15;
    if (/chrome|badge|logo|dash|screen|wheel|rim|lod|undercarriage/i.test(name)) score -= 40;
    // glatte Flächen: ohne Rippen oder Muster in der Normalen-Textur sieht ein Anbauteil ruhiger aus
    const bump = yft.shaders[i]?.textures.find((t) => t.param === 'BumpSampler')?.name ?? '';
    if (/^(blank|flat|default)/i.test(bump)) score += 15;
    // Teile in der Mitte der Größenordnung sind eher einfache Kunststoffteile als Spezialteile
    score += Math.min(10, Math.log10(1 + (triangles.get(i) ?? 0)) * 3);
    if (score > best) {
      best = score;
      housing = i;
    }
  });
  if (housing === null) housing = [...used].find((i) => yft.shaders[i]?.preset === 'vehicle_mesh') ?? null;

  // Linse: bevorzugt das Material der Sirenenlinsen
  const sirenShaders = new Map<number, number>();
  for (const p of parts) {
    if (p.category === 'light' && /^siren/i.test(p.bone)) sirenShaders.set(p.shader, (sirenShaders.get(p.shader) ?? 0) + p.triangleCount);
  }
  let lens: number | null = null;
  const bySiren = [...sirenShaders.entries()].sort((a, b) => b[1] - a[1])[0];
  if (bySiren) lens = bySiren[0];
  if (lens === null) {
    let bestScore = -Infinity;
    yft.shaders.forEach((s, i) => {
      if (!used.has(i) || s.preset !== 'vehicle_lightsemissive') return;
      const score = (LENS_HINTS.test(diffuse(i)) ? 5 : 0) + Math.log10(1 + (triangles.get(i) ?? 0));
      if (score > bestScore) {
        bestScore = score;
        lens = i;
      }
    });
  }
  return { housing, lens };
}

/** Nächste freie Sirenen-Nummern (1 bis 20), die weder einen Knochen haben noch in `taken` stehen. */
export function freeSirenNumbers(boneNames: string[], count: number, taken: Iterable<number> = []): number[] {
  const used = new Set<number>(taken);
  for (const name of boneNames) {
    const m = /^siren(\d+)$/i.exec(name);
    if (m) used.add(Number(m[1]));
  }
  const out: number[] = [];
  for (let n = 1; n <= 20 && out.length < count; n++) if (!used.has(n)) out.push(n);
  return out;
}

export interface LightbarBones {
  bones: NewBone[];
  /** Nummern der Sirenen, in der Reihenfolge der Leuchtmodule (links nach rechts). Leer ohne Sirenen. */
  sirens: number[];
  /** Knochen, an den das Gehäuse gebunden wird: der neue Balken-Knochen, ohne Sirenen der Elternknochen. */
  barBone: number;
}

export interface LightbarBoneOptions {
  /** Knochen, an dem der Balken hängt (Standard: das Fahrgestell, Index 0). */
  parentBone?: number;
  /** Name des Balken-Knochens (Standard: forge_lightbar). */
  name?: string;
  /** Index, den der erste neue Knochen bekommt (Standard: Zahl der Knochen des Fahrzeugs). Nötig, wenn schon andere neue Knochen geplant sind. */
  firstIndex?: number;
  /** Sirenen-Nummern, die schon für andere neue Knochen vergeben sind. */
  takenSirens?: Iterable<number>;
  /** Sirenen-Knochen anlegen (Standard: ja). Ohne bleibt es bei einem Gehäuse am Elternknochen, ganz ohne neue Knochen. */
  withSirens?: boolean;
}

/**
 * Knochen für einen Lichtbalken: ein Balken-Knochen am Dach und ein Sirenen-Knochen je Leuchtmodul. Lagen werden relativ zum
 * Elternknochen angegeben.
 */
export function lightbarBones(yft: Yft, build: LightbarBuild, spec: LightbarSpec, options: LightbarBoneOptions = {}): LightbarBones {
  const parentBone = options.parentBone ?? 0;
  if (options.withSirens === false) return { bones: [], sirens: [], barBone: parentBone };
  const world = boneWorldPositions(yft.bones);
  const parent = world[parentBone] ?? [0, 0, 0];
  const first = options.firstIndex ?? yft.bones.length; // Index des Balken-Knochens
  const origin: Vec3 = [spec.position[0], spec.position[1], spec.position[2]];
  const sirens = freeSirenNumbers(
    yft.bones.map((b) => b.name),
    build.lights.length,
    options.takenSirens,
  );
  if (sirens.length < build.lights.length) throw new Error('Es sind nicht genug freie Sirenen-Nummern (1 bis 20) übrig.');
  const bones: NewBone[] = [{ name: options.name ?? 'forge_lightbar', parent: parentBone, translation: [origin[0] - parent[0], origin[1] - parent[1], origin[2] - parent[2]] }];
  build.lights.forEach((p, i) => {
    bones.push({ name: `siren${sirens[i]}`, parent: first, translation: [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]] });
  });
  return { bones, sirens, barBone: first };
}

/**
 * Vorschlag für die Lage eines Lichtbalkens: mittig (x = 0), in Fahrtrichtung dort, wo das Dach am höchsten ist (Mittelwert der
 * Lackpunkte im obersten Streifen), in der Höhe des Daches an dieser Stelle. Ohne Lackteile: null.
 */
export function suggestRoofPosition(yft: Yft, parts: VehiclePart[], spec: Pick<LightbarSpec, 'length' | 'depth'>): Vec3 | null {
  let top = -Infinity;
  for (const part of parts) {
    if (part.category !== 'paint') continue;
    const g = yft.geometries[part.geometry];
    if (!g) continue;
    for (const v of part.indices) top = Math.max(top, g.positions[v * 3 + 2]!);
  }
  if (!Number.isFinite(top)) return null;
  let sum = 0;
  let count = 0;
  for (const part of parts) {
    if (part.category !== 'paint') continue;
    const g = yft.geometries[part.geometry];
    if (!g) continue;
    for (const v of part.indices) {
      if (g.positions[v * 3 + 2]! >= top - 0.06 && Math.abs(g.positions[v * 3]!) < 0.7) {
        sum += g.positions[v * 3 + 1]!;
        count++;
      }
    }
  }
  const y = count > 0 ? sum / count : 0;
  const z = roofHeight(yft, parts, 0, y, spec.length / 2, spec.depth / 2) ?? top;
  return [0, y, z];
}
