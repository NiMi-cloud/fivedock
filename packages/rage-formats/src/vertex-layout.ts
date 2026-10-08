/**
 * Aufbau von Eckpunkten (Vertex-Deklaration) lesen und Eckpunkte in diesem Aufbau schreiben.
 *
 * Eine Vertex-Deklaration (16 Byte) enthält: Flags (Bit n = Slot n vorhanden), Schrittweite, Anzahl und je Slot einen
 * 4-Bit-Datentyp. Die Slots liegen in der Reihenfolge ihrer Nummer hintereinander im Eckpunkt.
 */

import { Memory, YftReadError } from './memory.ts';

/** Typnummer -> Größe in Byte (HALF2, FLOAT, HALF4, FLOAT2, FLOAT3, FLOAT4, UBYTE4, COLOUR, RGBA8SNORM). */
export const COMPONENT_SIZE: Record<number, number> = { 1: 4, 2: 4, 3: 8, 5: 8, 6: 12, 7: 16, 8: 4, 9: 4, 10: 4 };

export const SLOT_POSITION = 0;
export const SLOT_BLEND_WEIGHTS = 1;
export const SLOT_BLEND_INDICES = 2;
export const SLOT_NORMAL = 3;
export const SLOT_COLOUR0 = 4;
export const SLOT_COLOUR1 = 5;
export const SLOT_TEXCOORD0 = 6;
export const SLOT_TANGENT = 14;

export function halfToFloat(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const frac = h & 0x3ff;
  if (exp === 0) return sign * 2 ** -14 * (frac / 1024);
  if (exp === 31) return frac ? NaN : sign * Infinity;
  return sign * 2 ** (exp - 15) * (1 + frac / 1024);
}

/** Kleinste 16-Bit-Gleitkommazahl (IEEE half), gerundet. Werte außerhalb des Bereichs werden begrenzt. */
export function floatToHalf(value: number): number {
  if (Number.isNaN(value)) return 0x7e00;
  const sign = value < 0 || Object.is(value, -0) ? 0x8000 : 0;
  const v = Math.abs(value);
  if (v >= 65520) return sign | 0x7bff;
  if (v < 2 ** -24 / 2) return sign;
  if (v < 2 ** -14) return sign | Math.round(v / 2 ** -24);
  let exp = Math.floor(Math.log2(v));
  let frac = Math.round((v / 2 ** exp - 1) * 1024);
  if (frac === 1024) {
    frac = 0;
    exp++;
  }
  if (exp > 15) return sign | 0x7bff;
  return sign | ((exp + 15) << 10) | frac;
}

export interface VertexLayout {
  stride: number;
  /** je Slot: Typ und Versatz im Eckpunkt, null wenn der Slot fehlt */
  slots: Array<{ type: number; offset: number } | null>;
}

export function readLayout(mem: Memory, decl: number, strideHint: number): VertexLayout {
  const flags = mem.u32(decl);
  const stride = mem.u16(decl + 4) || strideHint;
  const typesLow = mem.u32(decl + 8);
  const typesHigh = mem.u32(decl + 12);
  const slots: VertexLayout['slots'] = [];
  let offset = 0;
  for (let s = 0; s < 16; s++) {
    if (!(flags & (1 << s))) {
      slots.push(null);
      continue;
    }
    const type = ((s < 8 ? typesLow >>> (4 * s) : typesHigh >>> (4 * (s - 8))) & 0xf) >>> 0;
    const size = COMPONENT_SIZE[type];
    if (size === undefined) throw new YftReadError('unsupported', `Unbekannter Eckpunkt-Datentyp ${type}.`);
    slots.push({ type, offset });
    offset += size;
  }
  if (offset !== stride) throw new YftReadError('unsupported', `Eckpunktaufbau (${offset} Byte) passt nicht zur Schrittweite ${stride}.`);
  return { stride, slots };
}

/** Das, was in die Eckpunkte geschrieben wird; was ein Slot nicht braucht, wird ignoriert. */
export interface VertexSource {
  count: number;
  /** 3 Werte je Eckpunkt */
  positions: Float32Array;
  /** 3 Werte je Eckpunkt */
  normals: Float32Array;
  /** 4 Werte je Eckpunkt (xyz, w = Vorzeichen), oder null: dann wird eine Tangente aus der Normalen abgeleitet */
  tangents: Float32Array | null;
  /** Je Texturkoordinatensatz 2 Werte je Eckpunkt. Fehlende Sätze nutzen den letzten vorhandenen. */
  uvs: Float32Array[];
  /** Rohe vier Bytes in Dateireihenfolge, für alle Eckpunkte gleich */
  colour0: [number, number, number, number];
  colour1: [number, number, number, number];
  blendWeights: [number, number, number, number];
  blendIndices: [number, number, number, number];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const snorm = (v: number) => clamp(Math.round(v * 127), -127, 127);

/** Eine Tangente senkrecht zur Normalen, wenn keine aus den Texturkoordinaten berechnet wurde. */
export function fallbackTangent(nx: number, ny: number, nz: number): [number, number, number, number] {
  // senkrecht zur Normalen: Kreuzprodukt mit der Achse, die am wenigsten parallel zu ihr ist
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  const axis: [number, number, number] = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1];
  let tx = ny * axis[2] - nz * axis[1];
  let ty = nz * axis[0] - nx * axis[2];
  let tz = nx * axis[1] - ny * axis[0];
  const len = Math.hypot(tx, ty, tz) || 1;
  tx /= len;
  ty /= len;
  tz /= len;
  return [tx, ty, tz, 1];
}

/** Schreibt Eckpunkte im Aufbau `layout`. Wirft `unsupported`, wenn ein Slot einen Datentyp hat, den dieser Schreiber nicht kennt. */
export function writeVertices(layout: VertexLayout, source: VertexSource): Uint8Array {
  const out = new Uint8Array(source.count * layout.stride);
  const view = new DataView(out.buffer);

  const putFloats = (at: number, type: number, values: number[], what: string) => {
    if (type === 6 || type === 7 || type === 5 || type === 2) {
      values.forEach((v, i) => view.setFloat32(at + i * 4, v, true));
    } else if (type === 1 || type === 3) {
      values.forEach((v, i) => view.setUint16(at + i * 2, floatToHalf(v), true));
    } else if (type === 10) {
      values.forEach((v, i) => view.setInt8(at + i, snorm(v)));
    } else {
      throw new YftReadError('unsupported', `Eckpunkt-Datentyp ${type} für ${what} wird nicht unterstützt.`);
    }
  };
  const widthOf = (type: number) => (type === 2 ? 1 : type === 5 || type === 1 ? 2 : type === 6 ? 3 : 4);

  for (let v = 0; v < source.count; v++) {
    const base = v * layout.stride;
    layout.slots.forEach((slot, s) => {
      if (!slot) return;
      const at = base + slot.offset;
      const p = source.positions;
      const n = source.normals;
      if (s === SLOT_POSITION) {
        putFloats(at, slot.type, [p[v * 3]!, p[v * 3 + 1]!, p[v * 3 + 2]!], 'Position');
      } else if (s === SLOT_BLEND_WEIGHTS) {
        out.set(source.blendWeights, at);
      } else if (s === SLOT_BLEND_INDICES) {
        out.set(source.blendIndices, at);
      } else if (s === SLOT_NORMAL) {
        const values = [n[v * 3]!, n[v * 3 + 1]!, n[v * 3 + 2]!];
        if (widthOf(slot.type) === 4) values.push(0);
        putFloats(at, slot.type, values, 'Normale');
      } else if (s === SLOT_COLOUR0) {
        out.set(source.colour0, at);
      } else if (s === SLOT_COLOUR1) {
        out.set(source.colour1, at);
      } else if (s >= SLOT_TEXCOORD0 && s < SLOT_TEXCOORD0 + 8) {
        const set = source.uvs[Math.min(s - SLOT_TEXCOORD0, source.uvs.length - 1)];
        if (!set) return;
        putFloats(at, slot.type, [set[v * 2]!, set[v * 2 + 1]!], 'Texturkoordinate');
      } else if (s === SLOT_TANGENT) {
        const t = source.tangents
          ? [source.tangents[v * 4]!, source.tangents[v * 4 + 1]!, source.tangents[v * 4 + 2]!, source.tangents[v * 4 + 3]!]
          : fallbackTangent(n[v * 3]!, n[v * 3 + 1]!, n[v * 3 + 2]!);
        putFloats(at, slot.type, widthOf(slot.type) === 4 ? t : t.slice(0, 3), 'Tangente');
      }
      // alle anderen Slots (zum Beispiel Binormale) bleiben null
    });
  }
  return out;
}
