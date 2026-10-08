/**
 * Livery ins Fahrzeug schreiben: Die bemalte Livery ersetzt die Livery-Textur (`DiffuseSampler2` des Lack-Shaders) im
 * Texturwörterbuch des Fahrzeugs. Das Fahrzeugmodell (YFT) bleibt unberührt, es verweist weiter auf denselben
 * Texturnamen. Alle anderen Texturen der Datei bleiben Byte für Byte erhalten.
 */

import { buildYtd, readYtd } from '@toolkit/rage-formats';
import type { RgbaImage, YtdTexture } from '@toolkit/rage-formats';
import { retexture } from './texture-lab.ts';
import type { RetextureOptions, TextureNote } from './texture-lab.ts';

export type LiveryWriteErrorCode = 'texture-missing';

export class LiveryWriteError extends Error {
  readonly code: LiveryWriteErrorCode;
  constructor(code: LiveryWriteErrorCode, message: string) {
    super(message);
    this.name = 'LiveryWriteError';
    this.code = code;
  }
}

export interface LiveryWriteResult {
  /** Das neue Texturwörterbuch mit der ersetzten Livery. */
  ytd: Uint8Array;
  /** Die neue Livery-Textur wie in der Datei. */
  texture: YtdTexture;
  notes: TextureNote[];
}

/** Ersetzt die Textur `name` im YTD durch `image`. Größe und Format der alten Textur bleiben, damit sich im Spiel nichts verschiebt. */
export function replaceLiveryTexture(ytd: Uint8Array, name: string, image: RgbaImage, options: RetextureOptions = {}): LiveryWriteResult {
  const textures = readYtd(ytd);
  const index = textures.findIndex((t) => t.name.toLowerCase() === name.toLowerCase());
  if (index < 0) throw new LiveryWriteError('texture-missing', `Die Textur "${name}" steht nicht in dieser Datei.`);
  const { texture, notes } = retexture(textures[index]!, image, options);
  const next = textures.slice();
  next[index] = texture;
  return { ytd: buildYtd(next, { allowNonPowerOfTwo: true }), texture, notes };
}

export type LiveryImageWarning = 'resized' | 'aspect' | 'opaque' | 'empty';

export interface LiveryImageCheck {
  width: number;
  height: number;
  /** Anteil der Pixel mit voller Deckkraft. */
  opaque: number;
  /** Anteil der Pixel, die ganz durchsichtig sind. */
  transparent: number;
  warnings: LiveryImageWarning[];
}

/**
 * Prüft ein bemaltes Bild gegen die vorhandene Livery-Textur. Die Ebene liegt mit ihrer Deckkraft über dem Lack:
 * Ein Bild ohne durchsichtige Stellen überdeckt die ganze Lackfarbe, ein ganz leeres Bild zeigt keine Livery.
 */
export function checkLiveryImage(image: RgbaImage, target: { width: number; height: number }): LiveryImageCheck {
  let opaque = 0;
  let transparent = 0;
  const pixels = image.width * image.height;
  for (let i = 3; i < image.data.length; i += 4) {
    const a = image.data[i]!;
    if (a >= 250) opaque++;
    else if (a === 0) transparent++;
  }
  const warnings: LiveryImageWarning[] = [];
  if (image.width !== target.width || image.height !== target.height) {
    warnings.push(Math.abs(image.width / image.height - target.width / target.height) > 0.01 ? 'aspect' : 'resized');
  }
  if (pixels > 0 && opaque / pixels > 0.98) warnings.push('opaque');
  if (pixels > 0 && transparent / pixels > 0.999) warnings.push('empty');
  return { width: image.width, height: image.height, opaque: pixels ? opaque / pixels : 0, transparent: pixels ? transparent / pixels : 0, warnings };
}

/**
 * Legt die Livery-Textur `name` im Texturwörterbuch an (gibt es sie schon, wird sie ersetzt). Die Größe richtet sich nach dem Bild (auf eine
 * Zweierpotenz gerundet, höchstens `maxSize`, Standard 2048), das Format ist DXT5 mit Mip-Kette: Die Ebene braucht Deckkraft, und DXT5 hält
 * Kanten und Schrift gut bei einem Viertel des Speichers von unkomprimierten Bildern. Alle anderen Texturen bleiben Byte für Byte erhalten.
 */
export function addLiveryTexture(ytd: Uint8Array, name: string, image: RgbaImage, options: RetextureOptions = {}): LiveryWriteResult {
  const textures = readYtd(ytd);
  if (textures.some((t) => t.name.toLowerCase() === name.toLowerCase())) return replaceLiveryTexture(ytd, name, image, options);
  const template: YtdTexture = { name, width: image.width, height: image.height, levels: 1, format: 'DXT5', data: new Uint8Array(0), unknown32: 128 };
  const { texture, notes } = retexture(template, image, { size: 'fit', maxSize: 2048, format: 'DXT5', ...options });
  return { ytd: buildYtd([...textures, texture], { allowNonPowerOfTwo: true }), texture, notes };
}
