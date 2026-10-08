/**
 * Neue Texturen in ein Texturwörterbuch (.ytd) aufnehmen, zum Beispiel die Texturen eigener Anbauteile. Alle vorhandenen Texturen bleiben
 * Byte für Byte erhalten.
 */

import { type YtdTexture, buildYtd, readYtd } from '@toolkit/rage-formats';
import { retexture } from './texture-lab.ts';
import type { TextureNote } from './texture-lab.ts';

export interface NewTexture {
  name: string;
  width: number;
  height: number;
  /** RGBA, 8 Bit je Kanal, oberste Zeile zuerst. */
  rgba: Uint8Array;
}

export interface AddTexturesOptions {
  /** Größte Kantenlänge (Zweierpotenz). Größere Bilder werden verkleinert. Standard 1024. */
  maxSize?: number;
}

export interface AddTexturesResult {
  ytd: Uint8Array;
  notes: Array<{ name: string; notes: TextureNote[] }>;
}

/**
 * Legt die Texturen im Wörterbuch an (eine mit gleichem Namen wird ersetzt). Das Format ist DXT1, bei durchsichtigen Pixeln DXT5, jeweils mit
 * Mip-Kette; die Größe wird auf eine Zweierpotenz gerundet, weil das Spiel nur diese liest.
 */
export function addTextures(ytd: Uint8Array, items: NewTexture[], options: AddTexturesOptions = {}): AddTexturesResult {
  if (items.length === 0) return { ytd, notes: [] };
  const textures = readYtd(ytd);
  const notes: AddTexturesResult['notes'] = [];
  for (const item of items) {
    const template: YtdTexture = { name: item.name, width: item.width, height: item.height, levels: 1, format: 'DXT1', data: new Uint8Array(0), unknown32: 128 };
    const result = retexture(template, { width: item.width, height: item.height, data: item.rgba }, { size: 'fit', maxSize: options.maxSize ?? 1024, format: 'DXT1' });
    notes.push({ name: item.name, notes: result.notes });
    const at = textures.findIndex((t) => t.name.toLowerCase() === item.name.toLowerCase());
    if (at >= 0) textures[at] = { ...textures[at]!, ...result.texture, name: textures[at]!.name };
    else textures.push(result.texture);
  }
  return { ytd: buildYtd(textures, { allowNonPowerOfTwo: true }), notes };
}
