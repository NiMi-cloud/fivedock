/**
 * Neue Knochen an das Skelett eines Fahrzeugs (YFT) oder Drawables (YDR) hängen.
 *
 * Aufbau des Skeletts (112 Byte), Zeiger im Kopf:
 *   0x10 Namens-Hash-Tabelle (Zeigerfeld, Kapazität in 0x18, Anzahl in 0x1A; Einträge 16 Byte: Tag, Index, nächster Eintrag)
 *   0x20 Knochen (80 Byte je Knochen, davor ein 16-Byte-Kopf mit der Anzahl)
 *   0x28 umgekehrte Matrizen, 0x30 Matrizen (je 64 Byte)
 *   0x38 Elternindizes (16 Bit je Knochen), 0x40 Kind-Paare (Knochen, Eltern) in Gruppen zu vier Knochen
 *   0x5E Anzahl Knochen, 0x60 Anzahl Einträge der Kind-Paare
 * Alle diese Felder werden als neue Blöcke angehängt (alte Einträge kopiert, neue ergänzt); alles andere bleibt, wo es ist.
 */

import { Memory, YftReadError } from './memory.ts';
import { ResourceEditor } from './resource-edit.ts';

export interface NewBone {
  /** Name, zum Beispiel "siren11". */
  name: string;
  /** Index des Elternknochens: ein vorhandener Knochen oder ein weiter vorn in dieser Liste stehender neuer (Anzahl vorhandener + Nummer). */
  parent: number;
  /** Lage relativ zum Elternknochen (x rechts, y vorn, z oben, Meter). */
  translation: [number, number, number];
  /** Knochen-Flags (Standard 7 wie bei den Sirenen-Knochen). */
  flags?: number;
}

export interface BoneInfo {
  index: number;
  name: string;
  parent: number;
}

/** Hash, mit dem das Spiel Knochen anhand ihres Namens findet (ELF-Hash in Großbuchstaben, dann in den Bereich ab 0x170 gelegt). */
export function boneTag(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    let c = name.charCodeAt(i) & 0xff;
    if (c >= 97 && c <= 122) c -= 32;
    hash = ((hash << 4) + c) >>> 0;
    const x = (hash & 0xf0000000) >>> 0;
    if (x !== 0) hash = (hash ^ (x >>> 24)) >>> 0;
    hash = (hash & ~x) >>> 0;
  }
  return ((hash % 0xfe8f) + 0x170) & 0xffff;
}

/** Anzahl der Hash-Fächer, die das Spiel für n Knochen vorsieht. */
function bucketCount(n: number): number {
  for (const limit of [11, 29, 59, 107, 191, 331, 563, 953, 1609, 2729, 4621, 7841, 13297, 22571, 38351, 65167]) {
    if (n < limit) return limit;
  }
  return 65521;
}

const MAX_BONES = 255; // Blend-Indizes der Eckpunkte sind ein Byte

type Quat = [number, number, number, number];
type Vec = [number, number, number];

const quatMul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

/** Dreht v mit der Quaternion q (x, y, z, w). */
function rotate(q: Quat, v: Vec): Vec {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

interface Pose {
  position: Vec;
  rotation: Quat;
}

/** Schreibt 16 Gleitkommazahlen als 4x4-Matrix: Zeilen sind die gedrehten Basisvektoren, die vierte Zeile die Verschiebung. */
function matrixBytes(rotation: Quat, translation: Vec, inverse: boolean, column4: [number, number, number, number]): Uint8Array {
  const out = new Uint8Array(64);
  const view = new DataView(out.buffer);
  const axes: Vec[] = [rotate(rotation, [1, 0, 0]), rotate(rotation, [0, 1, 0]), rotate(rotation, [0, 0, 1])];
  let rows: Vec[] = axes;
  let t: Vec = translation;
  if (inverse) {
    // Umkehrung einer Drehung = Transponierte; Verschiebung = -t * R^T
    rows = [
      [axes[0]![0], axes[1]![0], axes[2]![0]],
      [axes[0]![1], axes[1]![1], axes[2]![1]],
      [axes[0]![2], axes[1]![2], axes[2]![2]],
    ];
    t = [
      -(translation[0] * rows[0]![0] + translation[1] * rows[1]![0] + translation[2] * rows[2]![0]),
      -(translation[0] * rows[0]![1] + translation[1] * rows[1]![1] + translation[2] * rows[2]![1]),
      -(translation[0] * rows[0]![2] + translation[1] * rows[1]![2] + translation[2] * rows[2]![2]),
    ];
  }
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) view.setFloat32((r * 4 + c) * 4, rows[r]![c]!, true);
    view.setFloat32((r * 4 + 3) * 4, column4[r]!, true);
  }
  for (let c = 0; c < 3; c++) view.setFloat32((12 + c) * 4, t[c]!, true);
  view.setFloat32(15 * 4, column4[3], true);
  return out;
}

export interface SkeletonEditResult {
  /** Indizes der neuen Knochen, in der Reihenfolge der übergebenen Liste. */
  indices: number[];
  boneCount: number;
}

/**
 * Hängt neue Knochen an das Skelett des Drawables an der Adresse `drawable`. Läuft über den Editor, die Datei entsteht erst in `finish()`.
 * Wirft, wenn das Skelett fehlt, ein Elternknochen nicht existiert oder die Knochenzahl 255 überschreiten würde.
 */
export function addBones(ed: ResourceEditor, drawable: number, bones: NewBone[]): SkeletonEditResult {
  const mem = ed.mem;
  const skeleton = mem.ptr(drawable + 0x18);
  if (!skeleton) throw new YftReadError('unsupported', 'Die Datei hat kein Skelett.');
  const count = mem.u16(skeleton + 0x5e);
  const total = count + bones.length;
  if (bones.length === 0) return { indices: [], boneCount: count };
  if (total > MAX_BONES) throw new Error(`Das Skelett dürfte höchstens ${MAX_BONES} Knochen haben (jetzt ${total}).`);

  const bonesPointer = mem.ptr(skeleton + 0x20);
  const inversePointer = mem.ptr(skeleton + 0x28);
  const transformPointer = mem.ptr(skeleton + 0x30);
  const parentPointer = mem.ptr(skeleton + 0x38);
  const childPointer = mem.ptr(skeleton + 0x40);
  const childCount = mem.u16(skeleton + 0x60);
  const oldCapacity = mem.u16(skeleton + 0x18);
  if (!bonesPointer || !transformPointer || !inversePointer || !parentPointer) throw new YftReadError('unsupported', 'Das Skelett ist unvollständig.');

  // vorhandene Knochen lesen
  const boneBytes: Uint8Array[] = [];
  const parents: number[] = [];
  const tags: number[] = [];
  const locals: Pose[] = [];
  for (let i = 0; i < count; i++) {
    const b = bonesPointer + i * 80;
    boneBytes.push(mem.bytes(b, 80).slice());
    parents.push(mem.i16(b + 0x32));
    tags.push(mem.u16(b + 0x44));
    locals.push({
      rotation: [mem.f32(b), mem.f32(b + 4), mem.f32(b + 8), mem.f32(b + 12)],
      position: [mem.f32(b + 0x10), mem.f32(b + 0x14), mem.f32(b + 0x18)],
    });
  }
  // Lage im Fahrzeug: Eltern zuerst (die Reihenfolge der Knochen in der Datei muss nicht Eltern vor Kindern sein).
  const poses: Array<Pose | undefined> = new Array(count).fill(undefined);
  const poseOf = (i: number, depth = 0): Pose => {
    const known = poses[i];
    if (known) return known;
    const local = locals[i]!;
    const parent = parents[i]!;
    let pose: Pose;
    if (parent >= 0 && parent < count && parent !== i && depth < count) {
      const p = poseOf(parent, depth + 1);
      const rotated = rotate(p.rotation, local.position);
      pose = { position: [p.position[0] + rotated[0], p.position[1] + rotated[1], p.position[2] + rotated[2]], rotation: quatMul(p.rotation, local.rotation) };
    } else {
      pose = local;
    }
    poses[i] = pose;
    return pose;
  };
  const column4: [number, number, number, number] = [mem.f32(transformPointer + 12), mem.f32(transformPointer + 28), mem.f32(transformPointer + 44), mem.f32(transformPointer + 60)];

  // neue Knochen vorbereiten
  const added: Array<{ bytes: Uint8Array; local: Vec; pose: Pose; name: string; parent: number; transform: Uint8Array; inverse: Uint8Array }> = [];
  const allParents = parents.slice();
  bones.forEach((nb, j) => {
    const index = count + j;
    if (!(nb.parent >= 0 && nb.parent < index)) throw new Error(`Der Elternknochen ${nb.parent} von "${nb.name}" gibt es nicht (oder er steht in der Liste erst später).`);
    if (!/^[\x20-\x7e]+$/.test(nb.name)) throw new Error(`Der Knochenname "${nb.name}" darf nur aus druckbaren ASCII-Zeichen bestehen.`);
    const parentPose = nb.parent < count ? poseOf(nb.parent) : added[nb.parent - count]!.pose;
    const rotation: Quat = [0, 0, 0, 1];
    const rotated = rotate(parentPose.rotation, nb.translation);
    const pose: Pose = {
      position: [parentPose.position[0] + rotated[0], parentPose.position[1] + rotated[1], parentPose.position[2] + rotated[2]],
      rotation: quatMul(parentPose.rotation, rotation),
    };
    const bytes = new Uint8Array(80);
    const v = new DataView(bytes.buffer);
    v.setFloat32(12, 1, true); // Quaternion (0, 0, 0, 1)
    nb.translation.forEach((x, k) => v.setFloat32(0x10 + k * 4, x, true));
    for (let k = 0; k < 3; k++) v.setFloat32(0x20 + k * 4, 1, true);
    v.setFloat32(0x2c, 1, true);
    v.setInt16(0x30, -1, true); // Geschwister: wird unten verkettet
    v.setInt16(0x32, nb.parent, true);
    v.setUint16(0x40, nb.flags ?? 7, true);
    v.setInt16(0x42, index, true);
    v.setUint16(0x44, boneTag(nb.name), true);
    v.setInt16(0x46, index, true);
    added.push({
      bytes,
      local: nb.translation,
      pose,
      name: nb.name,
      parent: nb.parent,
      transform: matrixBytes(rotation, nb.translation, false, column4),
      inverse: matrixBytes(pose.rotation, pose.position, true, [0, 0, 0, 0]),
    });
    allParents.push(nb.parent);
    tags.push(boneTag(nb.name));
  });

  // Geschwister verketten: das bisher letzte Kind des Elternknochens verweist auf den neuen Knochen.
  const siblingOf = (index: number): number => (index < count ? new DataView(boneBytes[index]!.buffer).getInt16(0x30, true) : new DataView(added[index - count]!.bytes.buffer).getInt16(0x30, true));
  const setSibling = (index: number, value: number) => {
    const target = index < count ? boneBytes[index]! : added[index - count]!.bytes;
    new DataView(target.buffer).setInt16(0x30, value, true);
  };
  added.forEach((nb, j) => {
    const index = count + j;
    for (let i = 0; i < index; i++) {
      if (allParents[i] === nb.parent && siblingOf(i) === -1) {
        setSibling(i, index);
        break;
      }
    }
  });

  // Namen
  const nameBlocks = added.map((nb) => ed.block('system', nb.name.length + 1, (w) => w.cstring(0, nb.name), `Name ${nb.name}`));

  // Knochenblock mit Kopf
  const bonesBlock = ed.block(
    'system',
    16 + total * 80,
    (w) => {
      w.u32(0, total);
      boneBytes.forEach((b, i) => w.copy(16 + i * 80, b));
      added.forEach((nb, j) => {
        w.copy(16 + (count + j) * 80, nb.bytes);
        w.u64(16 + (count + j) * 80 + 0x38, nameBlocks[j]!.address);
      });
    },
    'Knochen',
  );

  const parentBlock = ed.block(
    'system',
    Math.ceil((total * 2) / 16) * 16,
    (w) => {
      allParents.forEach((p, i) => w.u16(i * 2, p & 0xffff));
    },
    'Elternindizes',
  );
  const transformBlock = ed.block(
    'system',
    total * 64,
    (w) => {
      w.copy(0, mem.bytes(transformPointer, count * 64));
      added.forEach((nb, j) => w.copy((count + j) * 64, nb.transform));
    },
    'Matrizen',
  );
  const inverseBlock = ed.block(
    'system',
    total * 64,
    (w) => {
      w.copy(0, mem.bytes(inversePointer, count * 64));
      added.forEach((nb, j) => w.copy((count + j) * 64, nb.inverse));
    },
    'Umgekehrte Matrizen',
  );

  // Kind-Paare: vorhandene bleiben, die neuen kommen in Gruppen zu je vier Knochen dahinter. Ein Knochen steht immer in einer
  // späteren Gruppe als sein Elternknochen, damit beim Berechnen der Eltern schon fertig sind.
  const oldChildren: number[] = [];
  for (let i = 0; i < (childPointer ? childCount : 0); i++) oldChildren.push(mem.i16(childPointer + i * 2));
  const newChildren: number[] = [];
  {
    const done = new Set<number>();
    let pending = added.map((_, j) => count + j);
    while (pending.length > 0) {
      const layer: number[] = [];
      const rest: number[] = [];
      for (const index of pending) {
        const parent = allParents[index]!;
        const ready = parent < count || done.has(parent);
        if (ready && layer.length < 4) layer.push(index);
        else rest.push(index);
      }
      if (layer.length === 0) throw new Error('Die neuen Knochen haben eine ungültige Eltern-Reihenfolge.');
      for (const index of layer) {
        newChildren.push(index, allParents[index]!);
        done.add(index);
      }
      const last = layer[layer.length - 1]!;
      while (newChildren.length % 8 !== 0) newChildren.push(last, allParents[last]!);
      pending = rest;
    }
  }
  const childTotal = oldChildren.length + newChildren.length;
  const childBlock = ed.block(
    'system',
    Math.ceil((childTotal * 2) / 16) * 16,
    (w) => {
      [...oldChildren, ...newChildren].forEach((c, i) => w.u16(i * 2, c & 0xffff));
    },
    'Kind-Paare',
  );

  // Hash-Tabelle der Namen: gleiche Kapazität wie vorher, solange sie reicht
  const capacity = oldCapacity >= total ? oldCapacity : bucketCount(total);
  const buckets: number[][] = Array.from({ length: capacity }, () => []);
  tags.forEach((tag, index) => buckets[tag % capacity]!.push(index));
  const entryBlock = ed.block(
    'system',
    total * 16,
    (w) => {
      // Je Fach: der zuletzt eingetragene Knochen steht vorn, der Rest folgt über die Verkettung.
      buckets.forEach((list) => {
        const order = list.slice().reverse();
        order.forEach((index, k) => {
          w.u32(index * 16, tags[index]!);
          w.u32(index * 16 + 4, index);
          w.u64(index * 16 + 8, k + 1 < order.length ? entryBlock.address + order[k + 1]! * 16 : 0);
        });
      });
    },
    'Namens-Einträge',
  );
  const tagBlock = ed.block(
    'system',
    capacity * 8,
    (w) => {
      buckets.forEach((list, b) => {
        if (list.length > 0) w.u64(b * 8, entryBlock.address + list[list.length - 1]! * 16);
      });
    },
    'Namens-Tabelle',
  );

  ed.patch((m) => {
    m.setPtr(skeleton + 0x10, tagBlock.address);
    m.setU16(skeleton + 0x18, capacity);
    m.setU16(skeleton + 0x1a, Math.min(total, capacity));
    m.setPtr(skeleton + 0x20, bonesBlock.address + 16);
    m.setPtr(skeleton + 0x28, inverseBlock.address);
    m.setPtr(skeleton + 0x30, transformBlock.address);
    m.setPtr(skeleton + 0x38, parentBlock.address);
    m.setPtr(skeleton + 0x40, childBlock.address);
    m.setU16(skeleton + 0x5e, total);
    m.setU16(skeleton + 0x60, childTotal);
  });

  return { indices: added.map((_, j) => count + j), boneCount: total };
}

/** Liest Index, Name und Elternknochen aller Knochen (zum Beispiel für Auswahllisten). */
export function readBoneInfos(mem: Memory, drawable: number): BoneInfo[] {
  const skeleton = mem.ptr(drawable + 0x18);
  if (!skeleton) return [];
  const bones = mem.ptr(skeleton + 0x20);
  const count = mem.u16(skeleton + 0x5e);
  const out: BoneInfo[] = [];
  for (let i = 0; i < count; i++) {
    const b = bones + i * 80;
    const name = mem.ptr(b + 0x38);
    out.push({ index: i, name: name ? mem.cstring(name) : `bone_${i}`, parent: mem.i16(b + 0x32) });
  }
  return out;
}
