import { describe, expect, it } from 'vitest';
import { editYdr } from './drawable-edit.ts';
import { Memory } from './memory.ts';
import { ResourceEditor } from './resource-edit.ts';
import { SYSTEM_BASE, parseResource } from './rsc7.ts';
import { boneTag } from './skeleton-edit.ts';
import { buildYdr, defaultShader } from './ydr.ts';
import { readYdr } from './yft.ts';

type Vec3 = [number, number, number];

/** Ein Prop (YDR) mit einem von Hand gebauten Skelett: Wurzel, "door" (Eltern 0), "handle" (Eltern 1). */
function drawableWithSkeleton(): Uint8Array {
  const base = buildYdr({
    name: 'forge_skel',
    shaders: [defaultShader('t')],
    high: [{ geometries: [{ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), uvs: new Float32Array(6), indices: [0, 1, 2], shader: 0 }] }],
  });
  const names = ['root', 'door', 'handle', 'trim'];
  const parents = [-1, 0, 1, 0];
  const local: Vec3[] = [[0, 0, 0], [1, 0.5, 0.25], [0.1, 0.2, 0.3], [-1, 0, 0]];
  const ed = ResourceEditor.open(base, 165, 'Drawable');
  const total = names.length;
  const nameBlocks = names.map((n) => ed.block('system', n.length + 1, (w) => w.cstring(0, n)));
  const bones = ed.block('system', 16 + total * 80, (w) => {
    w.u32(0, total);
    names.forEach((_, i) => {
      const o = 16 + i * 80;
      w.f32(o + 12, 1);
      local[i]!.forEach((v, k) => w.f32(o + 0x10 + k * 4, v));
      for (let k = 0; k < 3; k++) w.f32(o + 0x20 + k * 4, 1);
      w.f32(o + 0x2c, 1);
      // Geschwister: nächster Knochen mit demselben Elternknochen
      let sibling = -1;
      for (let j = i + 1; j < total; j++) {
        if (parents[j] === parents[i]) {
          sibling = j;
          break;
        }
      }
      w.u16(o + 0x30, sibling & 0xffff);
      w.u16(o + 0x32, parents[i]! & 0xffff);
      w.u64(o + 0x38, nameBlocks[i]!.address);
      w.u16(o + 0x40, 7);
      w.u16(o + 0x42, i);
      w.u16(o + 0x44, i === 0 ? 0 : boneTag(names[i]!));
      w.u16(o + 0x46, i);
    });
  });
  const parentBlock = ed.block('system', 16, (w) => parents.forEach((p, i) => w.u16(i * 2, p & 0xffff)));
  const matrices = ed.block('system', total * 64, (w) => {
    for (let i = 0; i < total; i++) {
      w.f32(i * 64, 1);
      w.f32(i * 64 + 20, 1);
      w.f32(i * 64 + 28, 4);
      w.f32(i * 64 + 40, 1);
      w.f32(i * 64 + 44, -3);
    }
  });
  const inverse = ed.block('system', total * 64, (w) => {
    for (let i = 0; i < total; i++) {
      w.f32(i * 64, 1);
      w.f32(i * 64 + 20, 1);
      w.f32(i * 64 + 40, 1);
    }
  });
  // Kind-Paare: eine Gruppe zu vier Knochen (alle außer der Wurzel, aufgefüllt)
  const childPairs = [1, 0, 2, 1, 3, 0, 3, 0];
  const children = ed.block('system', 16, (w) => childPairs.forEach((c, i) => w.u16(i * 2, c)));
  const tagTable = ed.block('system', 11 * 8, () => {});
  const skeleton = ed.block('system', 112, (w) => {
    w.u32(0, 1080114336);
    w.u32(4, 1);
    w.u64(0x10, tagTable.address);
    w.u16(0x18, 11);
    w.u16(0x1a, total);
    w.u32(0x1c, 0x1000000);
    w.u64(0x20, bones.address + 16);
    w.u64(0x28, inverse.address);
    w.u64(0x30, matrices.address);
    w.u64(0x38, parentBlock.address);
    w.u64(0x40, children.address);
    w.u16(0x5c, 1);
    w.u16(0x5e, total);
    w.u16(0x60, childPairs.length);
  });
  ed.patch((m) => m.setPtr(SYSTEM_BASE + 0x18, skeleton.address));
  return ed.finish();
}

function structures(file: Uint8Array) {
  const res = parseResource(file);
  const mem = new Memory(res.system, res.graphics);
  const sk = mem.ptr(SYSTEM_BASE + 0x18);
  const count = mem.u16(sk + 0x5e);
  const bones = mem.ptr(sk + 0x20);
  return { mem, sk, count, bones };
}

describe('boneTag', () => {
  it('stimmt mit den Werten echter Fahrzeugknochen überein', () => {
    expect(boneTag('siren1')).toBe(24999);
    expect(boneTag('misc_lightbar')).toBe(63965);
    expect(boneTag('door_dside_f')).toBe(60963);
    expect(boneTag('SIREN1')).toBe(24999);
  });
});

describe('addBones', () => {
  it('hängt Knochen mit Namen, Eltern und Lage an', () => {
    const file = drawableWithSkeleton();
    expect(readYdr(file).bones.map((b) => b.name)).toEqual(['root', 'door', 'handle', 'trim']);

    const result = editYdr(file, {
      bones: [
        { name: 'forge_bar', parent: 0, translation: [0, 0.5, 1] },
        { name: 'siren11', parent: 4, translation: [0.25, 0, 0.1] },
        { name: 'siren12', parent: 4, translation: [-0.25, 0, 0.1] },
      ],
    });
    expect(result.boneIndices).toEqual([4, 5, 6]);
    expect(result.boneCount).toBe(7);

    const bones = readYdr(result.file).bones;
    expect(bones.map((b) => b.name)).toEqual(['root', 'door', 'handle', 'trim', 'forge_bar', 'siren11', 'siren12']);
    expect(bones.map((b) => b.parent)).toEqual([-1, 0, 1, 0, 0, 4, 4]);
    expect(bones[5]!.tag).toBe(boneTag('siren11'));
    // Lage = Matrix-Verschiebung: Eltern + eigene Lage
    expect(bones[4]!.position).toEqual([0, 0.5, 1]);
    expect(bones[5]!.position[0]).toBeCloseTo(0.25);
    expect(bones[5]!.position[1]).toBeCloseTo(0);
    expect(bones[5]!.position[2]).toBeCloseTo(0.1);
  });

  it('verkettet Geschwister: das bisher letzte Kind zeigt auf das neue', () => {
    const { mem, bones } = structures(editYdr(drawableWithSkeleton(), { bones: [{ name: 'a', parent: 0, translation: [0, 0, 0] }, { name: 'b', parent: 0, translation: [0, 0, 0] }] }).file);
    const sibling = (i: number) => mem.i16(bones + i * 80 + 0x30);
    expect(sibling(3)).toBe(4); // "trim" war das letzte Kind der Wurzel
    expect(sibling(4)).toBe(5);
    expect(sibling(5)).toBe(-1);
    expect(sibling(1)).toBe(3); // unverändert
  });

  it('baut die Namens-Tabelle so, dass jeder Knochen über seinen Namen gefunden wird', () => {
    const names = Array.from({ length: 12 }, (_, i) => `siren${i + 1}`);
    const { mem, sk, count } = structures(editYdr(drawableWithSkeleton(), { bones: names.map((name) => ({ name, parent: 0, translation: [0, 0, 0] as Vec3 })) }).file);
    expect(count).toBe(16);
    const capacity = mem.u16(sk + 0x18);
    expect(capacity).toBeGreaterThanOrEqual(16);
    const table = mem.ptr(sk + 0x10);
    const find = (tag: number): number => {
      let p = mem.ptr(table + (tag % capacity) * 8);
      for (let guard = 0; p && guard < 50; guard++) {
        if (mem.u32(p) === tag) return mem.u32(p + 4);
        p = mem.ptr(p + 8);
      }
      return -1;
    };
    names.forEach((name, i) => expect(find(boneTag(name))).toBe(4 + i));
    expect(find(boneTag('door'))).toBe(1);
    expect(find(boneTag('trim'))).toBe(3);
    expect(mem.u16(sk + 0x1a)).toBe(Math.min(16, capacity));
  });

  it('ergänzt Kind-Paare in Gruppen zu vier, Eltern stehen immer vor ihren Kindern', () => {
    const { mem, sk } = structures(
      editYdr(drawableWithSkeleton(), {
        bones: [
          { name: 'bar', parent: 0, translation: [0, 0, 0] },
          { name: 's1', parent: 4, translation: [0, 0, 0] },
          { name: 's2', parent: 4, translation: [0, 0, 0] },
          { name: 's3', parent: 4, translation: [0, 0, 0] },
          { name: 's4', parent: 4, translation: [0, 0, 0] },
          { name: 's5', parent: 4, translation: [0, 0, 0] },
        ],
      }).file,
    );
    const count = mem.u16(sk + 0x60);
    expect(count % 8).toBe(0);
    const pairs: Array<[number, number]> = [];
    const at = mem.ptr(sk + 0x40);
    for (let i = 0; i < count; i += 2) pairs.push([mem.i16(at + i * 2), mem.i16(at + i * 2 + 2)]);
    // die alten vier Paare bleiben vorn
    expect(pairs.slice(0, 4)).toEqual([[1, 0], [2, 1], [3, 0], [3, 0]]);
    const order: number[] = [];
    pairs.slice(4).forEach(([child]) => {
      if (!order.includes(child)) order.push(child);
    });
    expect(order).toEqual([4, 5, 6, 7, 8, 9]);
    // jeder neue Knochen steht erst nach seinem Elternknochen
    for (const [child, parent] of pairs.slice(4)) {
      if (parent >= 4) expect(order.indexOf(parent)).toBeLessThan(order.indexOf(child));
    }
    // in der Gruppe der "bar" steht kein Kind von "bar"
    const firstGroup = pairs.slice(4, 8).map(([c]) => c);
    expect(firstGroup).toContain(4);
    expect(firstGroup).not.toContain(5);
  });

  it('schreibt Matrix und umgekehrte Matrix passend zur Lage', () => {
    const { mem, sk } = structures(editYdr(drawableWithSkeleton(), { bones: [{ name: 'tip', parent: 2, translation: [0.5, 0, 0] }] }).file);
    const transform = mem.ptr(sk + 0x30);
    const inverse = mem.ptr(sk + 0x28);
    // "handle" (2) liegt bei (1,0.5,0.25) + (0.1,0.2,0.3), "tip" um 0.5 daneben
    const world = [1 + 0.1 + 0.5, 0.5 + 0.2, 0.25 + 0.3];
    for (let k = 0; k < 3; k++) {
      expect(mem.f32(transform + 4 * 64 + 48 + k * 4)).toBeCloseTo([0.5, 0, 0][k]!);
      expect(mem.f32(inverse + 4 * 64 + 48 + k * 4)).toBeCloseTo(-world[k]!);
    }
    // Drehanteil: Einheitsmatrix, und die "unbekannte" vierte Spalte wie bei den vorhandenen Knochen
    expect(mem.f32(transform + 4 * 64)).toBe(1);
    expect(mem.f32(transform + 4 * 64 + 28)).toBe(4);
    expect(mem.f32(transform + 4 * 64 + 44)).toBe(-3);
  });

  it('weist ungültige Eingaben ab', () => {
    const file = drawableWithSkeleton();
    expect(() => editYdr(file, { bones: [{ name: 'x', parent: 9, translation: [0, 0, 0] }] })).toThrow(/Elternknochen/);
    expect(() => editYdr(file, { bones: [{ name: 'x', parent: 5, translation: [0, 0, 0] }] })).toThrow(/Elternknochen/);
    expect(() => editYdr(file, { bones: [{ name: 'ä', parent: 0, translation: [0, 0, 0] }] })).toThrow(/Knochenname/);
    const many = Array.from({ length: 300 }, (_, i) => ({ name: `b${i}`, parent: 0, translation: [0, 0, 0] as Vec3 }));
    expect(() => editYdr(file, { bones: many })).toThrow(/höchstens/);
  });

  it('eine Datei ohne Skelett wird abgelehnt', () => {
    const plain = buildYdr({ name: 'x', shaders: [defaultShader('t')], high: [{ geometries: [{ positions: new Float32Array(9), normals: new Float32Array(9), uvs: new Float32Array(6), indices: [0, 1, 2], shader: 0 }] }] });
    expect(() => editYdr(plain, { bones: [{ name: 'a', parent: 0, translation: [0, 0, 0] }] })).toThrow(/Skelett/);
  });
});
