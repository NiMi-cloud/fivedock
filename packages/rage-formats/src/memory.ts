/**
 * Speicherzugriff über virtuelle Adressen für gelesene Resource-Dateien (Systemspeicher ab 0x50000000, Grafikspeicher ab 0x60000000).
 * Wird vom Leser (yft.ts) und vom Editor (resource-edit.ts, drawable-edit.ts) gemeinsam genutzt.
 */

import { GRAPHICS_BASE, SYSTEM_BASE } from './rsc7.ts';

export class YftReadError extends Error {
  readonly code: 'encrypted' | 'not-rsc7' | 'wrong-version' | 'corrupt' | 'unsupported';

  constructor(code: YftReadError['code'], message: string) {
    super(message);
    this.name = 'YftReadError';
    this.code = code;
  }
}

export class Memory {
  private readonly parts: Array<{ base: number; bytes: Uint8Array; view: DataView }>;

  constructor(system: Uint8Array, graphics: Uint8Array) {
    this.parts = [
      { base: SYSTEM_BASE, bytes: system, view: new DataView(system.buffer, system.byteOffset, system.byteLength) },
      { base: GRAPHICS_BASE, bytes: graphics, view: new DataView(graphics.buffer, graphics.byteOffset, graphics.byteLength) },
    ];
  }

  private at(address: number, size: number): { view: DataView; offset: number; bytes: Uint8Array } {
    const part = address >= GRAPHICS_BASE ? this.parts[1]! : this.parts[0]!;
    const offset = address - part.base;
    if (address < SYSTEM_BASE || offset < 0 || offset + size > part.bytes.length) {
      throw new YftReadError('corrupt', `Zeiger auf ungültige Adresse 0x${address.toString(16)}.`);
    }
    return { view: part.view, offset, bytes: part.bytes };
  }

  /** true, wenn `size` Bytes ab `address` im Speicher liegen. */
  contains(address: number, size = 1): boolean {
    if (address < SYSTEM_BASE) return false;
    const part = address >= GRAPHICS_BASE ? this.parts[1]! : this.parts[0]!;
    const offset = address - part.base;
    return offset >= 0 && offset + size <= part.bytes.length;
  }

  u8(address: number): number {
    const m = this.at(address, 1);
    return m.view.getUint8(m.offset);
  }

  u16(address: number): number {
    const m = this.at(address, 2);
    return m.view.getUint16(m.offset, true);
  }

  i16(address: number): number {
    const m = this.at(address, 2);
    return m.view.getInt16(m.offset, true);
  }

  u32(address: number): number {
    const m = this.at(address, 4);
    return m.view.getUint32(m.offset, true);
  }

  f32(address: number): number {
    const m = this.at(address, 4);
    return m.view.getFloat32(m.offset, true);
  }

  /** 64-Bit-Zeiger als Zahl (Adressen liegen unter 2^53). */
  ptr(address: number): number {
    const m = this.at(address, 8);
    return m.view.getUint32(m.offset + 4, true) * 0x100000000 + m.view.getUint32(m.offset, true);
  }

  cstring(address: number): string {
    const m = this.at(address, 1);
    let end = m.offset;
    while (end < m.bytes.length && m.bytes[end] !== 0) end++;
    return String.fromCharCode(...m.bytes.subarray(m.offset, end));
  }

  setU8(address: number, value: number): void {
    const m = this.at(address, 1);
    m.view.setUint8(m.offset, value & 0xff);
  }

  setU16(address: number, value: number): void {
    const m = this.at(address, 2);
    m.view.setUint16(m.offset, value & 0xffff, true);
  }

  setU32(address: number, value: number): void {
    const m = this.at(address, 4);
    m.view.setUint32(m.offset, value >>> 0, true);
  }

  setF32(address: number, value: number): void {
    const m = this.at(address, 4);
    m.view.setFloat32(m.offset, value, true);
  }

  setPtr(address: number, value: number): void {
    const m = this.at(address, 8);
    m.view.setUint32(m.offset, value >>> 0, true);
    m.view.setUint32(m.offset + 4, Math.floor(value / 0x100000000) >>> 0, true);
  }

  /** Verweist auf die Rohdaten (keine Kopie). */
  bytes(address: number, length: number): Uint8Array {
    const m = this.at(address, length);
    return m.bytes.subarray(m.offset, m.offset + length);
  }
}
