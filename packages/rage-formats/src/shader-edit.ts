/**
 * Shader eines Fahrzeugs (YFT) ändern:
 *  - Lack-Shader auf `vehicle_paint3` umstellen, damit der Lack eine zweite Textur-Ebene tragen kann (Livery),
 *  - ein Material kopieren und ihm eine andere Haupttextur geben (für eigene Anbauteile mit Textur).
 *
 * `vehicle_paint3` hat gegenüber `vehicle_paint1` und `vehicle_paint2` genau drei zusätzliche Parameter: die Textur `DiffuseSampler2`
 * und die Vektoren `diffuse2SpecMod` und `matDiffuseColor2`. Ihre Stellen in der Parameterliste und die Nummern in den Parameterköpfen
 * folgen den Dateien echter Fahrzeuge (geprüft an einem Fahrzeug mit paint3 und einem mit paint2):
 *
 *   Parameterblock (je Shader): n Köpfe zu 16 Byte (Typ, Nummer, Zeiger), danach die Vektordaten (16 Byte je Vektor, Felder 32 Byte),
 *   danach n Namens-Hashes (32 Bit), danach Platz für Zwischenwerte: insgesamt B + 4 * aufgerundet(B) Byte mit B = 32 + Köpfe + Daten + 4n.
 *   Typ 0 = Textur (Zeiger auf ein Texturobjekt mit dem Namen bei +0x28, oder 0), 1 = Vektor, 2 = Feld aus zwei Vektoren.
 *   Nummern der Texturköpfe: 0, 2, 3, 4 ... Nummern der Vektorköpfe: von hinten gezählt, 162 für den letzten, je Vektor eins mehr
 *   (ein Feld zählt doppelt).
 */

import { joaat } from './jenkins.ts';
import { Memory, YftReadError } from './memory.ts';
import { type NewBlock, ResourceEditor } from './resource-edit.ts';

export interface PaintConversion {
  /** Nummer des Shaders in der Shader-Gruppe. */
  shader: number;
  /** Name der Textur für `DiffuseSampler2` (die Livery). */
  textureName: string;
}

export interface ShaderClone {
  /** Nummer des Shaders, der kopiert wird. */
  from: number;
  /** Name der Textur, die die Kopie als `DiffuseSampler` bekommt. */
  textureName: string;
}

const CONVERTIBLE = ['vehicle_paint1', 'vehicle_paint2'];
const TARGET = 'vehicle_paint3';

/** Parametername → Hash, so wie ihn die Dateien tragen. */
const hash = (name: string) => joaat(name);

interface Param {
  hash: number;
  type: number;
  /** Zeiger auf das Texturobjekt (Typ 0), 0 = keines. */
  texture: number;
  /** Ein neues Texturobjekt statt des Zeigers (Typ 0). */
  ref?: NewBlock;
  /** Vektordaten (Typ ≥ 1): je Vektor vier Zahlen. */
  vectors: number[][];
}

/** Aufbau eines neuen Parameterblocks. */
function layoutParams(params: Param[]): { size: number; parameterSize: number; dataSize: number; textureCount: number } {
  let heads = 0;
  let vectors = 0;
  let textures = 0;
  for (const p of params) {
    heads += 16;
    vectors += 16 * p.type;
    if (p.type === 0) textures++;
  }
  const base = 32 + heads + vectors + 4 * params.length;
  const dataSize = Math.ceil(base / 16) * 16;
  return { size: base + 4 * dataSize, parameterSize: heads + vectors, dataSize, textureCount: textures };
}

/** Stellt einen Vektor-Parameter zusammen. */
function vector(name: string, values: [number, number, number, number]): Param {
  return { hash: hash(name), type: 1, texture: 0, vectors: [values] };
}

/** Liest die Parameterliste eines Shaders. Die Hashes stehen hinter den Vektordaten. */
function readParams(mem: Memory, fx: number): Param[] {
  const params = mem.ptr(fx);
  const count = mem.u8(fx + 0x10);
  if (!params || count === 0) throw new YftReadError('unsupported', 'Der Shader hat keine Parameter.');
  const heads: Array<{ type: number; pointer: number }> = [];
  let vectorBytes = 0;
  for (let p = 0; p < count; p++) {
    const type = mem.u8(params + p * 16);
    heads.push({ type, pointer: mem.ptr(params + p * 16 + 8) });
    vectorBytes += 16 * type;
  }
  const hashes = params + count * 16 + vectorBytes;
  return heads.map((h, p) => ({
    hash: mem.u32(hashes + p * 4),
    type: h.type,
    texture: h.type === 0 ? h.pointer : 0,
    vectors: h.type === 0 ? [] : Array.from({ length: h.type }, (_, v) => Array.from({ length: 4 }, (_, k) => mem.f32(h.pointer + v * 16 + k * 4))),
  }));
}

/** Schreibt einen neuen Parameterblock für `params`. Texturköpfe zeigen auf `ref` (neues Objekt) oder auf den alten Zeiger. */
function emitParams(ed: ResourceEditor, params: Param[]): { block: NewBlock; layout: ReturnType<typeof layoutParams> } {
  const layout = layoutParams(params);
  const vectorOffsets: number[] = [];
  let cursor = params.length * 16;
  for (const p of params) {
    vectorOffsets.push(cursor);
    cursor += 16 * p.type;
  }
  const block = ed.block(
    'system',
    layout.size,
    (w) => {
      // Nummern der Köpfe
      const numbers: number[] = new Array(params.length).fill(0);
      let texture = 0;
      for (let p = 0; p < params.length; p++) if (params[p]!.type === 0) numbers[p] = texture++ === 0 ? 0 : texture;
      let register = 162;
      for (let p = params.length - 1; p >= 0; p--) {
        const param = params[p]!;
        if (param.type === 0) continue;
        numbers[p] = register;
        register += param.type;
      }
      params.forEach((param, p) => {
        const head = p * 16;
        w.u8(head, param.type);
        w.u8(head + 1, numbers[p]!);
        if (param.type === 0) {
          w.u64(head + 8, param.ref ? param.ref.address : param.texture);
        } else {
          w.u64(head + 8, block.address + vectorOffsets[p]!);
          param.vectors.forEach((v, i) => v.forEach((x, k) => w.f32(vectorOffsets[p]! + i * 16 + k * 4, x)));
        }
      });
      const hashesAt = params.length * 16 + params.reduce((sum, p) => sum + 16 * p.type, 0);
      params.forEach((param, p) => w.u32(hashesAt + p * 4, param.hash));
    },
    'Shader-Parameter',
  );
  return { block, layout };
}

/** Fügt die drei Parameter von paint3 an ihren Stellen ein. `diffuse2` ist das Texturobjekt der neuen Ebene. */
function withLiveryParams(old: Param[], diffuse2: NewBlock): Param[] {
  const out = old.slice();
  const indexOf = (name: string) => out.findIndex((p) => p.hash === hash(name));
  const insertAfter = (anchors: string[], param: Param) => {
    for (const name of anchors) {
      const i = indexOf(name);
      if (i >= 0) {
        out.splice(i + 1, 0, param);
        return;
      }
    }
    out.push(param);
  };
  const insertBefore = (anchors: string[], param: Param) => {
    for (const name of anchors) {
      const i = indexOf(name);
      if (i >= 0) {
        out.splice(i, 0, param);
        return;
      }
    }
    out.push(param);
  };
  if (indexOf('DiffuseSampler2') >= 0) throw new YftReadError('unsupported', 'Der Shader hat schon eine zweite Textur-Ebene.');
  insertAfter(['DamageSampler', 'DiffuseSampler'], { hash: hash('DiffuseSampler2'), type: 0, texture: 0, ref: diffuse2, vectors: [] });
  insertAfter(['envEffThickness', 'envEffScale', 'envEffTexTileUV'], vector('diffuse2SpecMod', [8, 0, 0, 0]));
  insertBefore(['matDiffuseColor'], vector('matDiffuseColor2', [1, 1, 1, 0]));
  return out;
}

/** Gemeinsame Blöcke für Texturnamen: ein Name wird nur einmal angelegt. */
function nameBlocks(ed: ResourceEditor) {
  const names = new Map<string, NewBlock>();
  return (text: string) => {
    let block = names.get(text);
    if (!block) {
      block = ed.block('system', text.length + 1, (w) => w.cstring(0, text), `Textur ${text}`);
      names.set(text, block);
    }
    return block;
  };
}

/** Ein neues Texturobjekt (80 Byte) als Kopie von `donor` mit anderem Namen. */
function textureObject(ed: ResourceEditor, donor: number, name: NewBlock): NewBlock {
  const bytes = ed.mem.bytes(donor, 80).slice();
  return ed.block(
    'system',
    80,
    (w) => {
      w.copy(0, bytes);
      w.u64(0x28, name.address);
    },
    'Texturobjekt',
  );
}

/** Die Haupttextur eines Shaders (oder irgendeine vorhandene) als Vorlage für neue Texturobjekte. */
function donorTexture(params: Param[]): number {
  const found = (params.find((p) => p.hash === hash('DiffuseSampler') && p.texture) ?? params.find((p) => p.type === 0 && p.texture))?.texture ?? 0;
  if (!found) throw new YftReadError('unsupported', 'Der Shader hat keine Textur, die als Vorlage für eine neue dienen kann.');
  return found;
}

/**
 * Stellt Lack-Shader (paint1 und paint2) auf paint3 um und gibt ihnen eine Textur-Ebene `DiffuseSampler2` mit dem angegebenen Namen.
 * Läuft über den Editor, die Datei entsteht erst in `finish()`.
 */
export function convertPaintShaders(ed: ResourceEditor, drawable: number, conversions: PaintConversion[]): void {
  if (conversions.length === 0) return;
  const mem = ed.mem;
  const group = mem.ptr(drawable + 0x10);
  if (!group) throw new YftReadError('corrupt', 'Die Datei hat keine Shader-Gruppe.');
  const array = mem.ptr(group + 0x10);
  const count = mem.u16(group + 0x18);
  const nameBlock = nameBlocks(ed);

  const done = new Set<number>();
  for (const conversion of conversions) {
    if (done.has(conversion.shader)) continue;
    done.add(conversion.shader);
    if (!(conversion.shader >= 0 && conversion.shader < count)) throw new Error(`Das Material ${conversion.shader} gibt es in dieser Datei nicht.`);
    const fx = mem.ptr(array + conversion.shader * 8);
    if (!fx) throw new YftReadError('corrupt', `Das Material ${conversion.shader} ist leer.`);
    const fileHash = mem.u32(fx + 0x18);
    if (!CONVERTIBLE.some((name) => fileHash === joaat(`${name}.sps`))) {
      throw new YftReadError('unsupported', `Das Material ${conversion.shader} ist kein einfacher Lack (paint1 oder paint2) und lässt sich nicht umstellen.`);
    }

    const old = readParams(mem, fx);
    const object = textureObject(ed, donorTexture(old), nameBlock(conversion.textureName));
    const params = withLiveryParams(old, object);
    const { block, layout } = emitParams(ed, params);

    ed.patch((m) => {
      m.setPtr(fx, block.address);
      m.setU32(fx + 0x08, joaat(TARGET));
      m.setU8(fx + 0x10, params.length);
      m.setU16(fx + 0x14, layout.parameterSize);
      m.setU16(fx + 0x16, layout.dataSize);
      m.setU32(fx + 0x18, joaat(`${TARGET}.sps`));
      m.setU8(fx + 0x27, layout.textureCount);
    });
  }
}

/**
 * Legt Kopien von Materialien an, jede mit einer anderen Haupttextur (`DiffuseSampler`). Die Kopien stehen am Ende der Shader-Liste, ihre
 * Nummern sind (Zahl der vorhandenen Materialien + Nummer in `clones`). Gibt diese Nummern zurück.
 */
export function cloneShaders(ed: ResourceEditor, drawable: number, clones: ShaderClone[]): number[] {
  if (clones.length === 0) return [];
  const mem = ed.mem;
  const group = mem.ptr(drawable + 0x10);
  if (!group) throw new YftReadError('corrupt', 'Die Datei hat keine Shader-Gruppe.');
  const array = mem.ptr(group + 0x10);
  const count = mem.u16(group + 0x18);
  const nameBlock = nameBlocks(ed);

  const created: NewBlock[] = [];
  for (const clone of clones) {
    if (!(clone.from >= 0 && clone.from < count)) throw new Error(`Das Material ${clone.from} gibt es in dieser Datei nicht.`);
    const fx = mem.ptr(array + clone.from * 8);
    if (!fx) throw new YftReadError('corrupt', `Das Material ${clone.from} ist leer.`);
    const params = readParams(mem, fx);
    const main = params.findIndex((p) => p.hash === hash('DiffuseSampler') && p.type === 0);
    if (main < 0) throw new YftReadError('unsupported', `Das Material ${clone.from} hat keine Haupttextur (DiffuseSampler).`);
    const object = textureObject(ed, donorTexture(params), nameBlock(clone.textureName));
    const next = params.map((p, i) => (i === main ? { ...p, ref: object } : p));
    const { block } = emitParams(ed, next);
    const fxBytes = mem.bytes(fx, 48).slice();
    created.push(
      ed.block(
        'system',
        48,
        (w) => {
          w.copy(0, fxBytes);
          w.u64(0, block.address);
        },
        'Shader',
      ),
    );
  }

  const total = count + clones.length;
  const oldPointers = Array.from({ length: count }, (_, i) => mem.ptr(array + i * 8));
  const pointers = ed.block(
    'system',
    total * 8,
    (w) => {
      oldPointers.forEach((p, i) => w.u64(i * 8, p));
      created.forEach((b, i) => w.u64((count + i) * 8, b.address));
    },
    'Shader-Zeiger',
  );
  ed.patch((m) => {
    m.setPtr(group + 0x10, pointers.address);
    m.setU16(group + 0x18, total);
    m.setU16(group + 0x1a, total);
  });
  return clones.map((_, i) => count + i);
}
