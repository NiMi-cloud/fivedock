import type { CollisionMode } from './collision.ts';

export interface PropExportOptions {
  /** Gültiger Modellname (siehe `sanitizePropName`). */
  name: string;
  collision: CollisionMode;
  lodLevels: 1 | 2 | 3;
  /** Größte Texturkante in Pixeln (Zweierpotenz). Standard 2048. */
  maxTextureSize?: number;
  /** Texturen mit DXT komprimieren. Standard: ja. */
  compressTextures?: boolean;
}

export interface ExportedFile {
  /** Pfad innerhalb des Resource-Ordners, mit Schrägstrichen. */
  path: string;
  data: Uint8Array;
}

export interface PropResource {
  files: ExportedFile[];
  /** Hinweise an den Nutzer, z. B. angepasste Texturgrößen oder noch nicht unterstützte Optionen. */
  warnings: string[];
}

/** Wird geworfen, wenn eine Funktion noch nicht gebaut ist. */
export class NotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotReadyError';
  }
}
