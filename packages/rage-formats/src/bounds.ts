/**
 * Kollision ("Bounds") für Drawables: ein Komposit mit einem oder mehreren Box-Kindern.
 *
 * Aufbau (jeder Punkt ein Systemblock):
 *   Komposit (176 B)         Zeiger auf alle folgenden Blöcke, Anzahl der Kinder
 *   Kinder-Zeiger (8 B je Kind)
 *   Transformationen (64 B je Kind)   4x4-Matrix mit der Verschiebung des Kindes, in der letzten Spalte stehen Flag-Werte (0, 1, 1, 0)
 *   Begrenzungen (32 B je Kind)       lokale Box (Min + Max), in der w-Komponente 1 beziehungsweise der Margin
 *   Flags 1 und Flags 2 (je 8 B je Kind)   Kollisionsgruppen
 *   Kind (112 B)             hier: Box
 *
 * Wie bei Sollumz liegt jede Box lokal um den Ursprung, ihre Lage im Drawable steckt in der Verschiebung der
 * Transformation. Margin, Mittelpunkt, Schwerpunkt, Volumen und Trägheit folgen den Regeln, die Sollumz beim Export
 * anwendet (Zahlenfakten, geprüft gegen ein Sollumz-Referenz-XML mit drei außermittigen Boxen, siehe bounds.test.ts
 * und spikes/05-ydr/verify-boxes.ts).
 */

import { ResourceBlock } from './rsc7.ts';
import type { BlockWriter } from './rsc7.ts';

export type Vec3 = [number, number, number];

const BOUND_SIZE = 112;
const COMPOSITE_SIZE = 176;

const VFT_COMPOSITE = 1080212136;
const VFT_BOX = 1080221016;

const TYPE_BOX = 3;
const TYPE_COMPOSITE = 10;

/** Kollisionsgruppen, wie sie Sollumz für Props voreinstellt. */
const FLAGS1 = 0x0000003e;
const FLAGS2 = 0x07f3bec0;

/** Größter Margin einer Box. Dünne Boxen bekommen weniger (siehe `boxMargin`). */
const MAX_BOX_MARGIN = 0.04;

export interface BoxBound {
  type: 'box';
  /** Ecken der Box im Koordinatensystem des Drawables. */
  min: Vec3;
  max: Vec3;
  /** Index des Kollisionsmaterials, 0 = Standard. */
  materialIndex?: number;
}

export interface CollisionSpec {
  children: BoxBound[];
}

export interface CollisionBlocks {
  /** Wurzelblock (das Komposit), auf den das Drawable zeigt. */
  root: ResourceBlock;
  blocks: ResourceBlock[];
}

/** Größe der Margin einer Box: ein Achtel der kürzesten Seite, höchstens 4 cm (wie bei Sollumz). */
export function boxMargin(size: Vec3): number {
  return Math.min(MAX_BOX_MARGIN, Math.min(...size) / 8);
}

/** Massenträgheit je Masseneinheit eines vollen Quaders mit den Seitenlängen `size`. */
export function boxInertia(size: Vec3): Vec3 {
  const [x, y, z] = size;
  return [(y * y + z * z) / 12, (x * x + z * z) / 12, (x * x + y * y) / 12];
}

interface BaseFields {
  type: number;
  vft: number;
  min: Vec3;
  max: Vec3;
  /** Mittelpunkt (Offset 0x40, im XML "BoxCenter"). */
  centroid: Vec3;
  /** Schwerpunkt (Offset 0x50, im XML "SphereCenter"). */
  cg: Vec3;
  radius: number;
  margin: number;
  volume: number;
  inertia: Vec3;
  materialIndex: number;
}

function writeBase(w: BlockWriter, f: BaseFields): void {
  w.u32(0x00, f.vft);
  w.u32(0x04, 1);
  w.u8(0x10, f.type);
  w.f32(0x14, f.radius);
  f.max.forEach((v, k) => w.f32(0x20 + k * 4, v));
  w.f32(0x2c, f.margin);
  f.min.forEach((v, k) => w.f32(0x30 + k * 4, v));
  w.u32(0x3c, 1);
  f.centroid.forEach((v, k) => w.f32(0x40 + k * 4, v));
  w.u8(0x4c, f.materialIndex);
  f.cg.forEach((v, k) => w.f32(0x50 + k * 4, v));
  f.inertia.forEach((v, k) => w.f32(0x60 + k * 4, v));
  w.f32(0x6c, f.volume);
}

interface Derived {
  /** Lage des Mittelpunkts im Drawable. */
  centre: Vec3;
  size: Vec3;
  localMin: Vec3;
  localMax: Vec3;
  margin: number;
  volume: number;
  inertia: Vec3;
  radius: number;
}

function derive(c: BoxBound): Derived {
  const size: Vec3 = [c.max[0] - c.min[0], c.max[1] - c.min[1], c.max[2] - c.min[2]];
  const half: Vec3 = [size[0] / 2, size[1] / 2, size[2] / 2];
  return {
    centre: [(c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2, (c.min[2] + c.max[2]) / 2],
    size,
    localMin: [-half[0], -half[1], -half[2]],
    localMax: half,
    margin: boxMargin(size),
    volume: size[0] * size[1] * size[2],
    inertia: boxInertia(size),
    radius: Math.hypot(...size) / 2,
  };
}

/** Werte des Komposits aus den Kindern (Mittelpunkt, Schwerpunkt, Radius, Volumen, Trägheit). */
export function compositeProperties(children: BoxBound[]) {
  const d = children.map(derive);
  const n = d.length;

  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const c of children) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, c.min[k]!);
      max[k] = Math.max(max[k]!, c.max[k]!);
    }
  }

  const volume = d.reduce((s, c) => s + c.volume, 0);
  const centroid: Vec3 = [0, 0, 0];
  const cg: Vec3 = [0, 0, 0];
  for (const c of d) {
    for (let k = 0; k < 3; k++) {
      centroid[k]! += c.centre[k]! / n;
      cg[k]! += c.centre[k]! * c.volume;
    }
  }
  for (let k = 0; k < 3; k++) cg[k] = volume > 0 ? cg[k]! / volume : centroid[k]!;

  const radius = Math.hypot(max[0] - centroid[0], max[1] - centroid[1], max[2] - centroid[2]);

  // Trägheit: je Kind Eigenträgheit plus Verschiebung zum gemeinsamen Schwerpunkt (Satz von Steiner), je Masse normiert.
  let inertia: Vec3 = [1, 1, 1];
  if (volume > 0) {
    const sum: Vec3 = [0, 0, 0];
    for (const c of d) {
      const dx = c.centre[0] - cg[0];
      const dy = c.centre[1] - cg[1];
      const dz = c.centre[2] - cg[2];
      sum[0]! += c.inertia[0] * c.volume + c.volume * (dy * dy + dz * dz);
      sum[1]! += c.inertia[1] * c.volume + c.volume * (dx * dx + dz * dz);
      sum[2]! += c.inertia[2] * c.volume + c.volume * (dx * dx + dy * dy);
    }
    inertia = [sum[0] / volume, sum[1] / volume, sum[2] / volume];
  }
  return { min, max, centroid, cg, radius, volume, inertia };
}

/** Baut die Blöcke der Kollision. Gibt den Wurzelblock und alle weiteren Blöcke zurück. */
export function buildCollisionBlocks(spec: CollisionSpec): CollisionBlocks {
  const children = spec.children;
  if (children.length === 0) throw new Error('Die Kollision braucht mindestens ein Element.');
  if (children.length > 0xffff) throw new Error('Zu viele Kollisionselemente.');

  for (const c of children) {
    for (let k = 0; k < 3; k++) {
      if (!Number.isFinite(c.min[k]!) || !Number.isFinite(c.max[k]!)) throw new Error('Ungültige Maße der Kollisionsbox.');
      if (c.max[k]! < c.min[k]!) throw new Error('Die Kollisionsbox hat negative Ausdehnung.');
    }
  }

  const n = children.length;
  const derived = children.map(derive);
  const zero: Vec3 = [0, 0, 0];

  const childBlocks = children.map(
    (c, i) =>
      new ResourceBlock(
        BOUND_SIZE,
        (w) =>
          writeBase(w, {
            type: TYPE_BOX,
            vft: VFT_BOX,
            min: derived[i]!.localMin,
            max: derived[i]!.localMax,
            centroid: zero,
            cg: zero,
            radius: derived[i]!.radius,
            margin: derived[i]!.margin,
            volume: derived[i]!.volume,
            inertia: derived[i]!.inertia,
            materialIndex: c.materialIndex ?? 0,
          }),
        `bound:box:${i}`,
      ),
  );

  const childArray = new ResourceBlock(8 * n, (w) => childBlocks.forEach((b, i) => w.pointer(i * 8, b)), 'bound:children');

  // Einheitsmatrix mit der Verschiebung des Kindes in Zeile 3. In der letzten Spalte stehen die Flag-Werte (0, 1, 1, 0).
  const transformBlock = new ResourceBlock(
    64 * n,
    (w) => {
      for (let i = 0; i < n; i++) {
        const at = i * 64;
        w.f32(at + 0x00, 1); // Zeile 0: (1, 0, 0 | 0)
        w.f32(at + 0x14, 1); // Zeile 1: (0, 1, 0 | 1)
        w.u32(at + 0x1c, 1);
        w.f32(at + 0x28, 1); // Zeile 2: (0, 0, 1 | 1)
        w.u32(at + 0x2c, 1);
        derived[i]!.centre.forEach((v, k) => w.f32(at + 0x30 + k * 4, v)); // Zeile 3: Verschiebung (x, y, z | 0)
      }
    },
    'bound:transforms',
  );

  const boxes = new ResourceBlock(
    32 * n,
    (w) =>
      derived.forEach((d, i) => {
        const at = i * 32;
        d.localMin.forEach((v, k) => w.f32(at + k * 4, v));
        w.u32(at + 12, 1);
        d.localMax.forEach((v, k) => w.f32(at + 16 + k * 4, v));
        w.f32(at + 28, d.margin);
      }),
    'bound:boxes',
  );

  const flagsFill = (w: BlockWriter) => {
    for (let i = 0; i < n; i++) {
      w.u32(i * 8, FLAGS1);
      w.u32(i * 8 + 4, FLAGS2);
    }
  };
  const flags1 = new ResourceBlock(8 * n, flagsFill, 'bound:flags1');
  const flags2 = new ResourceBlock(8 * n, flagsFill, 'bound:flags2');

  const props = compositeProperties(children);

  const root = new ResourceBlock(
    COMPOSITE_SIZE,
    (w) => {
      writeBase(w, {
        type: TYPE_COMPOSITE,
        vft: VFT_COMPOSITE,
        min: props.min,
        max: props.max,
        centroid: props.centroid,
        cg: props.cg,
        radius: props.radius,
        margin: 0,
        volume: props.volume,
        inertia: props.inertia,
        materialIndex: 0,
      });
      w.pointer(0x70, childArray);
      w.pointer(0x78, transformBlock);
      w.pointer(0x80, transformBlock); // zweite Transformation zeigt auf dieselben Daten
      w.pointer(0x88, boxes);
      w.pointer(0x90, flags1);
      w.pointer(0x98, flags2);
      w.u16(0xa0, n);
      w.u16(0xa2, n);
    },
    'bound:composite',
  );

  return { root, blocks: [root, childArray, transformBlock, boxes, flags1, flags2, ...childBlocks] };
}
