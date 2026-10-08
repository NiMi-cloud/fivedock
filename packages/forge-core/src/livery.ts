/**
 * Livery-Vorlage: Die UV-Koordinaten der gewählten Karosserieteile als Dreiecksliste für das Malblatt.
 *
 * GTA-Lack-Shader (`vehicle_paint*`) legen die Livery als zweite Textur (`DiffuseSampler2`) über den Lack.
 * Sie liegt auf einem eigenen UV-Satz (bei den meisten Fahrzeugen UV1), in dem linke und rechte Seite getrennte
 * Flächen haben. Das Modul liest diesen Satz, prüft ihn (Überlappung, Flächen außerhalb des Blatts) und liefert
 * die Daten, aus denen die Oberfläche das PNG zeichnet.
 *
 * Konvention der Spieldateien: V = 0 liegt oben im Bild (wie in den Textur-Zeilen), die Koordinaten werden nicht gespiegelt.
 */

import type { Yft } from '@toolkit/rage-formats';
import type { VehiclePart } from './vehicle.ts';

/** Eine Gruppe von Teilen (zum Beispiel alle Lack-Geometrien einer Tür) für das Blatt. */
export interface LayoutGroup {
  key: string;
  parts: VehiclePart[];
}

export interface LayoutSpan {
  key: string;
  /** Erstes Dreieck der Gruppe in `triangles` (Dreiecksnummer, nicht Zahlenposition). */
  start: number;
  count: number;
  /** Begrenzung der Gruppe im Blatt. */
  min: [number, number];
  max: [number, number];
}

export interface UvLayout {
  uvSet: number;
  /** Sechs Zahlen je Dreieck: u0 v0 u1 v1 u2 v2. */
  triangles: Float32Array;
  spans: LayoutSpan[];
  /** Dreiecke, die nicht ins Blatt übernommen wurden, weil sie keine sichtbare Fläche haben (Striche, Punkte). */
  dropped: number;
}

export interface PairOverlap {
  a: string;
  b: string;
  /** Anteil der belegten Blattfläche, den beide Gruppen gemeinsam beanspruchen. */
  fraction: number;
}

export interface GroupOverlap {
  key: string;
  /** Anteil des Blatts, den die Gruppe belegt. */
  coverage: number;
  /** Anteil der eigenen Fläche, den mehr als ein Dreieck der Gruppe beansprucht. */
  overlap: number;
}

export interface LayoutReport {
  /** Anteil des Blatts (0 bis 1), der von Dreiecken belegt wird. */
  coverage: number;
  /** Anteil der belegten Fläche, den mehr als ein Dreieck beansprucht (gespiegelte oder übereinanderliegende Teile). */
  overlap: number;
  /** Größte Überlagerungen zwischen verschiedenen Gruppen. */
  pairs: PairOverlap[];
  /** Gruppen mit eigener Mehrfachbelegung, größte zuerst (nur ab 5 % der eigenen Fläche). */
  selfOverlaps: GroupOverlap[];
  /** Dreiecke, bei denen mindestens ein Eckpunkt außerhalb von 0 bis 1 liegt. */
  outside: number;
  /** Dreiecke ohne sichtbare Fläche, die aus dem Blatt weggelassen wurden. */
  degenerate: number;
  triangles: number;
}

/**
 * Ein Dreieck, dessen Höhe unter diesem Wert liegt (in UV-Einheiten, also Anteil der Blattkante), malt nichts: Viele Fahrzeuge
 * ziehen Innenflächen auf eine Linie oder einen Punkt zusammen, damit sie eine einzige Farbe der Textur treffen. Bei 2048 Pixeln
 * Kantenlänge sind 1/16384 ein Achtel Pixel.
 */
const MIN_TRIANGLE_HEIGHT = 1 / 16384;

/** Lange, sehr dünne Dreiecke (Länge mehr als das 300-Fache der Höhe, länger als 30 % des Blatts) sind Ausreißer und zeigen nur einen Strich quer über das Blatt. */
const NEEDLE_ASPECT = 300;
const NEEDLE_MIN_LENGTH = 0.3;

/** true, wenn das Dreieck im Blatt keine sichtbare Fläche hat: Punkt, Linie oder langer dünner Ausreißer. */
function isInvisibleTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  const area2 = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay));
  const longest = Math.max(Math.hypot(bx - ax, by - ay), Math.hypot(cx - bx, cy - by), Math.hypot(ax - cx, ay - cy));
  if (longest === 0) return true;
  const height = area2 / longest;
  return height < MIN_TRIANGLE_HEIGHT || (longest > NEEDLE_MIN_LENGTH && longest / height > NEEDLE_ASPECT);
}

/** Name der Livery-Textur (`DiffuseSampler2`) eines Shaders, sonst null. */
export function overlayNameOfShader(yft: Yft, shader: number): string | null {
  return yft.shaders[shader]?.textures.find((t) => t.param === 'DiffuseSampler2' && t.name)?.name ?? null;
}

/** Nummern der UV-Sätze, die mindestens eine Geometrie der Gruppen besitzt. */
export function availableUvSets(yft: Yft, groups: LayoutGroup[]): number[] {
  const sets = new Set<number>();
  for (const g of groups) {
    for (const p of g.parts) yft.geometries[p.geometry]?.uvs.forEach((uv, i) => uv && sets.add(i));
  }
  return [...sets].sort((a, b) => a - b);
}

export interface LiveryScope {
  /** Gruppen, deren Teile eine Livery-Ebene haben (Lack-Shader mit zweiter Textur). */
  groups: LayoutGroup[];
  /** false, wenn kein Lack-Shader eine zweite Textur hat. Dann sind alle Lack-Gruppen enthalten. */
  hasLayer: boolean;
  /** Namen der Livery-Texturen ohne Dopplung. */
  textures: string[];
}

/**
 * Welche Teile bekommen die Livery? Lack-Shader mit `DiffuseSampler2` tragen eine Livery-Ebene (zum Beispiel die Karosserie,
 * nicht der Unterboden). Gibt es keinen solchen Shader, sind es alle Lack-Teile, und `hasLayer` ist false.
 */
export function liveryScope(yft: Yft, paintGroups: LayoutGroup[]): LiveryScope {
  const groups: LayoutGroup[] = [];
  const textures = new Set<string>();
  for (const group of paintGroups) {
    const parts = group.parts.filter((p) => {
      const name = overlayNameOfShader(yft, p.shader);
      if (name) textures.add(name);
      return name !== null;
    });
    if (parts.length > 0) groups.push({ key: group.key, parts });
  }
  if (groups.length === 0) return { groups: paintGroups, hasLayer: false, textures: [] };
  return { groups, hasLayer: true, textures: [...textures] };
}

/**
 * Welcher UV-Satz trägt die Livery? Haben die Gruppen eine zweite Diffuse-Textur, ist es UV1, sonst der erste
 * vorhandene Satz nach UV0, und wenn es nur UV0 gibt, UV0.
 */
export function suggestUvSet(yft: Yft, groups: LayoutGroup[]): number {
  const sets = availableUvSets(yft, groups);
  const hasOverlay = groups.some((g) => g.parts.some((p) => overlayNameOfShader(yft, p.shader)));
  if (hasOverlay && sets.includes(1)) return 1;
  return sets.find((s) => s !== 0) ?? 0;
}

/**
 * Sammelt die Dreiecke der Gruppen im gewählten UV-Satz. Gruppen ohne diesen Satz werden übersprungen,
 * Dreiecke ohne sichtbare Fläche (Punkte, Linien, lange Ausreißer) werden weggelassen und in `dropped` gezählt.
 */
export function buildUvLayout(yft: Yft, groups: LayoutGroup[], uvSet: number): UvLayout {
  let total = 0;
  for (const g of groups) for (const p of g.parts) if (yft.geometries[p.geometry]?.uvs[uvSet]) total += p.triangleCount;

  const buffer = new Float32Array(total * 6);
  const spans: LayoutSpan[] = [];
  let at = 0;
  let dropped = 0;
  for (const group of groups) {
    const start = at;
    const min: [number, number] = [Infinity, Infinity];
    const max: [number, number] = [-Infinity, -Infinity];
    for (const part of group.parts) {
      const uv = yft.geometries[part.geometry]?.uvs[uvSet];
      if (!uv) continue;
      const idx = part.indices;
      for (let i = 0; i + 2 < idx.length; i += 3) {
        const a = idx[i]!;
        const b = idx[i + 1]!;
        const c = idx[i + 2]!;
        const ax = uv[a * 2]!;
        const ay = uv[a * 2 + 1]!;
        const bx = uv[b * 2]!;
        const by = uv[b * 2 + 1]!;
        const cx = uv[c * 2]!;
        const cy = uv[c * 2 + 1]!;
        if (isInvisibleTriangle(ax, ay, bx, by, cx, cy)) {
          dropped++;
          continue;
        }
        buffer.set([ax, ay, bx, by, cx, cy], at * 6);
        for (const [x, y] of [[ax, ay], [bx, by], [cx, cy]] as const) {
          if (x < min[0]) min[0] = x;
          if (x > max[0]) max[0] = x;
          if (y < min[1]) min[1] = y;
          if (y > max[1]) max[1] = y;
        }
        at++;
      }
    }
    if (at > start) spans.push({ key: group.key, start, count: at - start, min, max });
  }
  return { uvSet, triangles: buffer.slice(0, at * 6), spans, dropped };
}

/** Eine zusammenhängende Fläche einer Gruppe im Blatt (zum Beispiel das Dach, eine Seite, ein Kotflügel). */
export interface LayoutIsland {
  key: string;
  min: [number, number];
  max: [number, number];
  /** Flächenschwerpunkt im Blatt. */
  centroid: [number, number];
  /** Summe der Dreiecksflächen in UV-Einheiten. */
  area: number;
  triangles: number;
}

/** Zerlegt jede Gruppe in zusammenhängende Flächen: Dreiecke, die einen Eckpunkt teilen, gehören zusammen. */
export function buildIslands(layout: UvLayout): LayoutIsland[] {
  const q = (x: number) => Math.round(x * 16384);
  const islands: LayoutIsland[] = [];
  for (const span of layout.spans) {
    const parent = new Int32Array(span.count);
    for (let i = 0; i < span.count; i++) parent[i] = i;
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]!]!;
        x = parent[x]!;
      }
      return x;
    };
    const owner = new Map<string, number>();
    for (let t = 0; t < span.count; t++) {
      const o = (span.start + t) * 6;
      for (let k = 0; k < 3; k++) {
        const key = `${q(layout.triangles[o + k * 2]!)},${q(layout.triangles[o + k * 2 + 1]!)}`;
        const seen = owner.get(key);
        if (seen === undefined) owner.set(key, t);
        else parent[find(t)] = find(seen);
      }
    }
    const byRoot = new Map<number, { island: LayoutIsland; sx: number; sy: number }>();
    for (let t = 0; t < span.count; t++) {
      const o = (span.start + t) * 6;
      const root = find(t);
      let entry = byRoot.get(root);
      if (!entry) {
        entry = { island: { key: span.key, min: [Infinity, Infinity], max: [-Infinity, -Infinity], centroid: [0, 0], area: 0, triangles: 0 }, sx: 0, sy: 0 };
        byRoot.set(root, entry);
      }
      const island = entry.island;
      const ax = layout.triangles[o]!;
      const ay = layout.triangles[o + 1]!;
      const bx = layout.triangles[o + 2]!;
      const by = layout.triangles[o + 3]!;
      const cx = layout.triangles[o + 4]!;
      const cy = layout.triangles[o + 5]!;
      const area = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
      island.area += area;
      entry.sx += ((ax + bx + cx) / 3) * area;
      entry.sy += ((ay + by + cy) / 3) * area;
      island.triangles++;
      for (const [x, y] of [[ax, ay], [bx, by], [cx, cy]] as const) {
        if (x < island.min[0]) island.min[0] = x;
        if (x > island.max[0]) island.max[0] = x;
        if (y < island.min[1]) island.min[1] = y;
        if (y > island.max[1]) island.max[1] = y;
      }
    }
    for (const { island, sx, sy } of byRoot.values()) {
      island.centroid = island.area > 0 ? [sx / island.area, sy / island.area] : [(island.min[0] + island.max[0]) / 2, (island.min[1] + island.max[1]) / 2];
      islands.push(island);
    }
  }
  return islands;
}

/**
 * Prüft das Blatt, indem jedes Dreieck auf ein Raster (Standard 512 × 512) gezeichnet wird.
 * Ein Pixel zählt als belegt, wenn sein Mittelpunkt in einem Dreieck liegt.
 */
export function analyzeLayout(layout: UvLayout, size = 512): LayoutReport {
  const count = new Uint8Array(size * size);
  const owner = new Int16Array(size * size).fill(-1);
  const local = new Uint8Array(size * size);
  const overlapPairs = new Map<string, number>();
  const selfOverlaps: GroupOverlap[] = [];
  let outside = 0;
  let covered = 0;
  let overlapped = 0;

  layout.spans.forEach((span, spanIndex) => {
    local.fill(0);
    let localCovered = 0;
    let localOverlapped = 0;
    for (let t = span.start; t < span.start + span.count; t++) {
      const o = t * 6;
      const ax = layout.triangles[o]! * size;
      const ay = layout.triangles[o + 1]! * size;
      let bx = layout.triangles[o + 2]! * size;
      let by = layout.triangles[o + 3]! * size;
      let cx = layout.triangles[o + 4]! * size;
      let cy = layout.triangles[o + 5]! * size;
      if ([ax, ay, bx, by, cx, cy].some((c) => c < 0 || c > size)) outside++;
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (area === 0) continue;
      // Umlaufsinn vereinheitlichen, damit „innen“ überall positiv ist.
      if (area < 0) {
        [bx, cx] = [cx, bx];
        [by, cy] = [cy, by];
      }
      const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const maxX = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx)));
      const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
      const maxY = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy)));
      // Kantenfunktionen; ein Pixelmittelpunkt genau auf einer Kante gehört nur dem Dreieck, in dessen Richtung die Kante läuft
      // (sonst würden die zwei Dreiecke eines Vierecks entlang der Diagonale als überlappend gezählt).
      const d0x = bx - ax;
      const d0y = by - ay;
      const d1x = cx - bx;
      const d1y = cy - by;
      const d2x = ax - cx;
      const d2y = ay - cy;
      const own0 = d0y > 0 || (d0y === 0 && d0x > 0);
      const own1 = d1y > 0 || (d1y === 0 && d1x > 0);
      const own2 = d2y > 0 || (d2y === 0 && d2x > 0);
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          const e0 = d0x * (py - ay) - d0y * (px - ax);
          if (e0 < 0 || (e0 === 0 && !own0)) continue;
          const e1 = d1x * (py - by) - d1y * (px - bx);
          if (e1 < 0 || (e1 === 0 && !own1)) continue;
          const e2 = d2x * (py - cy) - d2y * (px - cx);
          if (e2 < 0 || (e2 === 0 && !own2)) continue;
          const i = y * size + x;

          if (local[i] === 0) localCovered++;
          else if (local[i] === 1) localOverlapped++;
          if (local[i]! < 255) local[i]!++;

          const previous = owner[i]!;
          if (count[i] === 0) {
            covered++;
          } else {
            if (count[i] === 1) overlapped++;
            if (previous !== spanIndex && previous >= 0) {
              const a = layout.spans[previous]!.key;
              const b = span.key;
              const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
              overlapPairs.set(key, (overlapPairs.get(key) ?? 0) + (count[i] === 1 ? 1 : 0));
            }
          }
          if (count[i]! < 255) count[i]!++;
          owner[i] = spanIndex;
        }
      }
    }
    if (localCovered > 0 && localOverlapped / localCovered >= 0.05) {
      selfOverlaps.push({ key: span.key, coverage: localCovered / (size * size), overlap: localOverlapped / localCovered });
    }
  });

  const pairs: PairOverlap[] = [...overlapPairs]
    .map(([key, pixels]) => {
      const [a, b] = key.split('\u0000') as [string, string];
      return { a, b, fraction: covered > 0 ? pixels / covered : 0 };
    })
    .filter((p) => p.fraction > 0.002)
    .sort((x, y) => y.fraction - x.fraction)
    .slice(0, 8);

  return {
    coverage: covered / (size * size),
    overlap: covered > 0 ? overlapped / covered : 0,
    pairs,
    selfOverlaps: selfOverlaps.sort((x, y) => y.coverage * y.overlap - x.coverage * x.overlap).slice(0, 8),
    outside,
    degenerate: layout.dropped,
    triangles: layout.triangles.length / 6,
  };
}

export interface GroupOutline {
  key: string;
  /** Vier Zahlen je Kante: u0 v0 u1 v1. Nur Außenkanten der Gruppe, innere Dreieckskanten fehlen. */
  edges: Float32Array;
}

/**
 * Außenränder je Gruppe: Kanten, die nur ein Dreieck der Gruppe benutzt. Das ergibt die saubere Umrisslinie der
 * Flächen im Blatt, ohne das dichte Dreiecksnetz.
 */
export function buildOutlines(layout: UvLayout): GroupOutline[] {
  const q = (x: number) => Math.round(x * 65536);
  return layout.spans.map((span) => {
    const seen = new Map<string, { n: number; edge: [number, number, number, number] }>();
    for (let t = span.start; t < span.start + span.count; t++) {
      const o = t * 6;
      for (let e = 0; e < 3; e++) {
        const a = o + e * 2;
        const b = o + ((e + 1) % 3) * 2;
        const u0 = layout.triangles[a]!;
        const v0 = layout.triangles[a + 1]!;
        const u1 = layout.triangles[b]!;
        const v1 = layout.triangles[b + 1]!;
        const ka = `${q(u0)},${q(v0)}`;
        const kb = `${q(u1)},${q(v1)}`;
        if (ka === kb) continue;
        const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        const entry = seen.get(key);
        if (entry) entry.n++;
        else seen.set(key, { n: 1, edge: [u0, v0, u1, v1] });
      }
    }
    const boundary = [...seen.values()].filter((x) => x.n === 1);
    const edges = new Float32Array(boundary.length * 4);
    boundary.forEach((x, i) => edges.set(x.edge, i * 4));
    return { key: span.key, edges };
  });
}

/** Gruppe, die den Punkt (u, v) im Blatt belegt. Bei Überlagerung gewinnt die zuletzt gezeichnete. */
export function pickLayoutGroup(layout: UvLayout, u: number, v: number): string | null {
  for (let s = layout.spans.length - 1; s >= 0; s--) {
    const span = layout.spans[s]!;
    if (u < span.min[0] || u > span.max[0] || v < span.min[1] || v > span.max[1]) continue;
    for (let t = span.start + span.count - 1; t >= span.start; t--) {
      const o = t * 6;
      const ax = layout.triangles[o]!;
      const ay = layout.triangles[o + 1]!;
      const bx = layout.triangles[o + 2]!;
      const by = layout.triangles[o + 3]!;
      const cx = layout.triangles[o + 4]!;
      const cy = layout.triangles[o + 5]!;
      const d1 = (u - bx) * (ay - by) - (ax - bx) * (v - by);
      const d2 = (u - cx) * (by - cy) - (bx - cx) * (v - cy);
      const d3 = (u - ax) * (cy - ay) - (cx - ax) * (v - ay);
      const negative = d1 < 0 || d2 < 0 || d3 < 0;
      const positive = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(negative && positive)) return span.key;
    }
  }
  return null;
}
