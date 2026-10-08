/**
 * Textur-Werkstatt: bestehende YTD-Dateien verkleinern (Optimieren) und einzelne Texturen ersetzen (Retexture).
 *
 * Grundsätze:
 *  - Was sich nicht sicher ändern lässt, bleibt byte-identisch. Eine YTD-Datei ohne Änderung wird nicht neu geschrieben.
 *  - Verkleinern geschieht zuerst durch Weglassen der obersten Mip-Stufen. Diese liegen schon in der Datei, es geht also
 *    nichts zusätzlich verloren und es wird nichts neu kodiert.
 *  - Was nicht gelesen werden kann (verschlüsselt, GTA V Enhanced, unbekanntes Pixelformat), wird gemeldet und unberührt gelassen.
 *
 * Ergebnisse tragen Codes statt Texten, damit die Oberfläche sie in der gewählten Sprache anzeigt.
 */

import {
  TEXTURE_USAGE,
  YtdReadError,
  buildMipChain,
  buildYtd,
  decodeTexture,
  downsampleBox,
  encodeBlocks,
  encodeMipChain,
  mipChainSize,
  packBgra,
  readYtd,
} from '@toolkit/rage-formats';
import type { BlockFormat, DdsTexture, RgbaImage, TextureFormat, YtdReadErrorCode, YtdTexture } from '@toolkit/rage-formats';
import { nearestPowerOfTwo, resizeBilinear } from './texture.ts';

// --- Gemeinsame Typen -----------------------------------------------------------------------------------

export interface TextureStats {
  width: number;
  height: number;
  levels: number;
  format: TextureFormat;
  /** Größe der Pixeldaten (entspricht dem Grafikspeicher im Spiel). */
  bytes: number;
}

export type TextureNote =
  | 'not-power-of-two' // Größe ist keine Zweierpotenz, bleibt unverändert
  | 'normal-map-kept' // Normalenkarte wird nicht verlustbehaftet umkomprimiert
  | 'too-small-to-compress' // unter 8 Pixel Kantenlänge
  | 'cannot-shrink' // zu wenige Mip-Stufen und das Format lässt sich nicht neu kodieren
  | 'unsupported-format' // Pixelformat wird nicht bearbeitet
  | 'alpha-needs-dxt5' // neues Bild hat Transparenz, Format wurde auf DXT5 gestellt
  | 'bc7-replaced' // BC7 lässt sich nicht schreiben, DXT wurde verwendet
  | 'aspect-stretched' // Seitenverhältnis des neuen Bildes weicht ab
  | 'size-adjusted' // Größe wurde auf eine Zweierpotenz angepasst
  | 'dds-size-differs' // das DDS hat eine andere Größe als die alte Textur
  | 'mips-added' // fehlende kleine Mip-Stufen wurden berechnet
  | 'mips-missing'; // Mip-Kette unvollständig und nicht ergänzbar (BC7, A8, L8)

export type TextureAction = 'unchanged' | 'resized' | 'recompressed' | 'resized-recompressed' | 'replaced';

export function statsOf(t: YtdTexture): TextureStats {
  return { width: t.width, height: t.height, levels: t.levels, format: t.format, bytes: t.data.length };
}

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

function hasAlpha(image: RgbaImage): boolean {
  for (let p = 3; p < image.data.length; p += 4) if (image.data[p]! < 250) return true;
  return false;
}

const BLOCK_FORMATS: ReadonlySet<TextureFormat> = new Set(['DXT1', 'DXT3', 'DXT5', 'ATI1', 'ATI2']);

function encode(image: RgbaImage, format: BlockFormat | 'A8R8G8B8'): { levels: number; data: Uint8Array } {
  if (format === 'A8R8G8B8') {
    const chain = buildMipChain(image);
    return { levels: chain.length, data: packBgra(chain) };
  }
  return encodeMipChain(image, format);
}

// --- Optimieren -----------------------------------------------------------------------------------------

export interface OptimizeOptions {
  /** Größte erlaubte Kantenlänge (Zweierpotenz). Größere Texturen werden Stufe für Stufe halbiert. Standard 1024. */
  maxSize?: number;
  /** Unkomprimierte Texturen (A8R8G8B8) in DXT1/DXT5 umwandeln. Standard: nein, weil dabei Qualität verloren geht. */
  compressUncompressed?: boolean;
}

export interface TextureResult {
  texture: YtdTexture;
  action: TextureAction;
  note?: TextureNote;
}

/** Rundet auf eine Zweierpotenz nach unten, mindestens 4. */
function floorPowerOfTwo(n: number): number {
  return Math.max(4, 2 ** Math.floor(Math.log2(Math.max(1, n))));
}

/** Verkleinert oder komprimiert eine einzelne Textur. Gibt die Textur unverändert zurück, wenn nichts zu tun ist. */
export function optimizeTexture(t: YtdTexture, options: OptimizeOptions = {}): TextureResult {
  const maxSize = floorPowerOfTwo(options.maxSize ?? 1024);
  const wantCompress = options.compressUncompressed ?? false;
  const longest = Math.max(t.width, t.height);

  const needsShrink = longest > maxSize;
  const canCompress = wantCompress && t.format === 'A8R8G8B8';
  if (!needsShrink && !canCompress) return { texture: t, action: 'unchanged' };

  if (!isPowerOfTwo(t.width) || !isPowerOfTwo(t.height)) {
    return { texture: t, action: 'unchanged', note: 'not-power-of-two' };
  }

  let k = 0;
  while (longest >> k > maxSize) k++;
  const width = Math.max(1, t.width >> k);
  const height = Math.max(1, t.height >> k);

  // Umkomprimieren (nur A8R8G8B8): Bild der Zielgröße lesen und als DXT neu kodieren.
  let compressNote: TextureNote | undefined;
  if (canCompress) {
    if (t.usage === TEXTURE_USAGE.NORMAL) {
      compressNote = 'normal-map-kept';
    } else if (width < 8 || height < 8) {
      compressNote = 'too-small-to-compress';
    } else {
      let image: RgbaImage;
      if (k < t.levels) {
        image = decodeTexture(t, k);
      } else {
        image = decodeTexture(t, 0);
        for (let i = 0; i < k; i++) image = downsampleBox(image);
      }
      const format: BlockFormat = hasAlpha(image) ? 'DXT5' : 'DXT1';
      const { levels, data } = encodeMipChain(image, format);
      return {
        texture: { ...t, width, height, levels, format, data },
        action: needsShrink ? 'resized-recompressed' : 'recompressed',
      };
    }
  }

  if (!needsShrink) return { texture: t, action: 'unchanged', note: compressNote };

  // Verkleinern ohne Neukodierung: oberste Mip-Stufen weglassen.
  if (k < t.levels) {
    const offset = mipChainSize(t.format, t.width, t.height, k);
    return {
      texture: { ...t, width, height, levels: t.levels - k, data: t.data.slice(offset) },
      action: 'resized',
      note: compressNote,
    };
  }

  // Keine Mip-Stufen vorhanden: neu berechnen, falls das Format es erlaubt.
  if (!BLOCK_FORMATS.has(t.format) && t.format !== 'A8R8G8B8') {
    // BC7 lässt sich lesen, aber noch nicht schreiben; A8 und L8 sind selten und bleiben unberührt.
    return { texture: t, action: 'unchanged', note: t.format === 'BC7' ? 'cannot-shrink' : 'unsupported-format' };
  }
  let image = decodeTexture(t, 0);
  for (let i = 0; i < k; i++) image = downsampleBox(image);
  const { levels, data } = encode(image, t.format as BlockFormat | 'A8R8G8B8');
  return { texture: { ...t, width, height, levels, data }, action: 'resized', note: compressNote };
}

// --- Retexture ------------------------------------------------------------------------------------------

export interface RetextureOptions {
  /**
   * 'keep': Größe der alten Textur übernehmen (Standard, damit sich nichts im Spiel verschiebt).
   * 'fit': Größe des neuen Bildes verwenden (auf Zweierpotenz gerundet, höchstens `maxSize`).
   */
  size?: 'keep' | 'fit';
  maxSize?: number;
  /** Zielformat. 'auto' übernimmt das der alten Textur. */
  format?: 'auto' | BlockFormat | 'A8R8G8B8';
}

export interface RetextureResult {
  texture: YtdTexture;
  notes: TextureNote[];
}

/**
 * Ersetzt das Bild einer Textur. Name, Verwendungszweck und Flags bleiben erhalten, damit Shader und Modelle
 * weiterhin auf dieselbe Textur zeigen.
 */
export function retexture(original: YtdTexture, image: RgbaImage, options: RetextureOptions = {}): RetextureResult {
  const notes: TextureNote[] = [];
  const maxSize = floorPowerOfTwo(options.maxSize ?? 2048);

  let width: number;
  let height: number;
  if ((options.size ?? 'keep') === 'keep' && isPowerOfTwo(original.width) && isPowerOfTwo(original.height)) {
    width = original.width;
    height = original.height;
  } else {
    width = nearestPowerOfTwo(image.width, 4, maxSize);
    height = nearestPowerOfTwo(image.height, 4, maxSize);
    if ((options.size ?? 'keep') === 'keep') notes.push('size-adjusted');
  }
  const aspectIn = image.width / image.height;
  const aspectOut = width / height;
  if (Math.abs(aspectIn / aspectOut - 1) > 0.05) notes.push('aspect-stretched');

  const resized = resizeBilinear(image, width, height);

  let format: BlockFormat | 'A8R8G8B8';
  const requested = options.format ?? 'auto';
  if (requested !== 'auto') {
    format = requested;
  } else if (original.format === 'BC7') {
    format = hasAlpha(resized) ? 'DXT5' : 'DXT1';
    notes.push('bc7-replaced');
  } else if (original.format === 'A8' || original.format === 'L8') {
    format = hasAlpha(resized) ? 'DXT5' : 'DXT1';
  } else {
    format = original.format;
  }
  if (format === 'DXT1' && hasAlpha(resized)) {
    format = 'DXT5';
    notes.push('alpha-needs-dxt5');
  }

  const { levels, data } = encode(resized, format);
  return {
    texture: { ...original, width, height, levels, format, data },
    notes,
  };
}

/** Anzahl der Stufen einer vollständigen Mip-Kette bis 1x1. */
function fullChainLevels(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

/** true, wenn wir die Textur dekodieren und danach wieder in dasselbe Format kodieren können. */
function canRebuildMips(format: TextureFormat): boolean {
  return BLOCK_FORMATS.has(format) || format === 'A8R8G8B8';
}

/**
 * Ergänzt fehlende kleine Mip-Stufen. Die vorhandenen Stufen bleiben Byte für Byte erhalten; die neuen werden
 * aus der letzten vorhandenen Stufe berechnet. Gibt die Textur unverändert zurück, wenn die Kette vollständig ist
 * oder das Format sich nicht neu kodieren lässt (BC7, A8, L8).
 */
export function completeMips(t: YtdTexture): YtdTexture {
  const target = fullChainLevels(t.width, t.height);
  if (t.levels >= target || !canRebuildMips(t.format)) return t;

  let image = decodeTexture(t, t.levels - 1);
  const parts: Uint8Array[] = [t.data];
  for (let level = t.levels; level < target; level++) {
    image = downsampleBox(image);
    parts.push(t.format === 'A8R8G8B8' ? packBgra([image]) : encodeBlocks(image, t.format as BlockFormat));
  }
  const data = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    data.set(p, offset);
    offset += p.length;
  }
  return { ...t, levels: target, data };
}

/**
 * Ersetzt eine Textur durch den Inhalt einer DDS-Datei, ohne neu zu kodieren. Name, Verwendungszweck und Flags
 * der alten Textur bleiben erhalten. Fehlende kleine Mip-Stufen werden ergänzt.
 */
export function retextureFromDds(original: YtdTexture, dds: DdsTexture): RetextureResult {
  if (!isPowerOfTwo(dds.width) || !isPowerOfTwo(dds.height)) {
    throw new Error(`Das DDS ist ${dds.width}×${dds.height} und damit keine Zweierpotenz. Das Spiel liest nur Zweierpotenzen.`);
  }
  const notes: TextureNote[] = [];
  if (dds.width !== original.width || dds.height !== original.height) notes.push('dds-size-differs');

  let texture: YtdTexture = { ...original, width: dds.width, height: dds.height, levels: dds.levels, format: dds.format, data: dds.data };
  if (texture.levels < fullChainLevels(texture.width, texture.height)) {
    if (canRebuildMips(texture.format)) {
      texture = completeMips(texture);
      notes.push('mips-added');
    } else {
      notes.push('mips-missing');
    }
  }
  return { texture, notes };
}

// --- Ganze Resource -------------------------------------------------------------------------------------

export type PackFiles = Record<string, Uint8Array>;

export type SkipReason = YtdReadErrorCode;

export interface TextureReport {
  name: string;
  before: TextureStats;
  after: TextureStats;
  action: TextureAction;
  note?: TextureNote;
}

export interface FileReport {
  path: string;
  status: 'optimized' | 'unchanged' | 'skipped';
  reason?: SkipReason;
  /** Meldung des Lesers bei übersprungenen Dateien (deutscher Text, nur zur Fehlersuche). */
  detail?: string;
  textures: TextureReport[];
  /** Pixeldaten vorher und nachher in Bytes. */
  pixelBytesBefore: number;
  pixelBytesAfter: number;
  /** Dateigröße vorher und nachher. */
  fileBytesBefore: number;
  fileBytesAfter: number;
}

export interface PackReport {
  files: FileReport[];
  /** Dateien, die eingebettete Texturen enthalten können, aber nicht bearbeitet werden (YDR, YFT, YDD). */
  embeddedTextureFiles: string[];
  totals: {
    pixelBytesBefore: number;
    pixelBytesAfter: number;
    fileBytesBefore: number;
    fileBytesAfter: number;
    texturesChanged: number;
    texturesTotal: number;
  };
}

export interface PackResult {
  /** Alle Dateien der Resource, geänderte YTD-Dateien ersetzt. */
  files: PackFiles;
  report: PackReport;
}

export type Progress = (done: number, total: number, current: string) => void;

const EMBEDDED_EXTENSIONS = ['.ydr', '.yft', '.ydd', '.ypt'];

function extension(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot < 0 ? '' : path.slice(dot).toLowerCase();
}

export function isYtdPath(path: string): boolean {
  return extension(path) === '.ytd';
}

/** Gibt anderen Aufgaben (Anzeige, Eingaben) Gelegenheit zu laufen. */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function emptyReport(path: string, size: number, status: FileReport['status']): FileReport {
  return { path, status, textures: [], pixelBytesBefore: 0, pixelBytesAfter: 0, fileBytesBefore: size, fileBytesAfter: size };
}

/** Optimiert alle YTD-Dateien einer Resource. Alle anderen Dateien bleiben unverändert. */
export async function optimizePack(files: PackFiles, options: OptimizeOptions = {}, onProgress?: Progress): Promise<PackResult> {
  const out: PackFiles = { ...files };
  const reports: FileReport[] = [];
  const paths = Object.keys(files).sort();
  const ytdPaths = paths.filter(isYtdPath);
  const embedded = paths.filter((p) => EMBEDDED_EXTENSIONS.includes(extension(p)));

  let done = 0;
  for (const path of ytdPaths) {
    onProgress?.(done, ytdPaths.length, path);
    await yieldToUi();
    const bytes = files[path]!;

    let textures: YtdTexture[];
    try {
      textures = readYtd(bytes);
    } catch (e) {
      const code: SkipReason = e instanceof YtdReadError ? e.code : 'corrupt';
      reports.push({ ...emptyReport(path, bytes.length, 'skipped'), reason: code, detail: e instanceof Error ? e.message : String(e) });
      done++;
      continue;
    }

    const results = textures.map((t) => optimizeTexture(t, options));
    const changed = results.some((r) => r.action !== 'unchanged');
    const textureReports: TextureReport[] = results.map((r, i) => ({
      name: textures[i]!.name,
      before: statsOf(textures[i]!),
      after: statsOf(r.texture),
      action: r.action,
      note: r.note,
    }));
    const pixelBefore = textures.reduce((s, t) => s + t.data.length, 0);
    const pixelAfter = results.reduce((s, r) => s + r.texture.data.length, 0);

    if (!changed) {
      reports.push({ ...emptyReport(path, bytes.length, 'unchanged'), textures: textureReports, pixelBytesBefore: pixelBefore, pixelBytesAfter: pixelBefore });
    } else {
      const rebuilt = buildYtd(results.map((r) => r.texture), { allowNonPowerOfTwo: true });
      out[path] = rebuilt;
      reports.push({
        path,
        status: 'optimized',
        textures: textureReports,
        pixelBytesBefore: pixelBefore,
        pixelBytesAfter: pixelAfter,
        fileBytesBefore: bytes.length,
        fileBytesAfter: rebuilt.length,
      });
    }
    done++;
  }
  onProgress?.(done, ytdPaths.length, '');

  const totals = {
    pixelBytesBefore: reports.reduce((s, r) => s + r.pixelBytesBefore, 0),
    pixelBytesAfter: reports.reduce((s, r) => s + r.pixelBytesAfter, 0),
    fileBytesBefore: reports.reduce((s, r) => s + r.fileBytesBefore, 0),
    fileBytesAfter: reports.reduce((s, r) => s + r.fileBytesAfter, 0),
    texturesTotal: reports.reduce((s, r) => s + r.textures.length, 0),
    texturesChanged: reports.reduce((s, r) => s + r.textures.filter((t) => t.action !== 'unchanged').length, 0),
  };
  return { files: out, report: { files: reports, embeddedTextureFiles: embedded, totals } };
}
