/**
 * Schreibt die Livery in .ytd-Dateien (und, wenn das Fahrzeug noch keine Livery-Ebene hat, in die Modelldateien). Das dauert bei großen
 * Fahrzeugen einige Sekunden (Mip-Kette berechnen, die ganzen Dateien neu zusammensetzen) und läuft deshalb in einem eigenen Thread,
 * damit die Seite bedienbar bleibt.
 */
import { addLiveryTexture, applyLiveryLayer, replaceLiveryTexture } from '@toolkit/forge-core';
import { readYft } from '@toolkit/rage-formats';
import type { RgbaImage } from '@toolkit/rage-formats';

export interface ReplaceRequest {
  kind: 'replace';
  textureName: string;
  image: RgbaImage;
  /** Dateiname → Inhalt der .ytd. */
  files: Record<string, Uint8Array>;
}

/** Livery-Ebene neu anlegen: Lack-Shader in den Modelldateien umstellen und die Textur in die Texturdateien aufnehmen. */
export interface LayerRequest {
  kind: 'layer';
  textureName: string;
  image: RgbaImage;
  /** Nummern der Lack-Shader in der Modelldatei `reference`. */
  shaders: number[];
  /** Die Modelldatei, für die die Shader-Nummern gelten (die angezeigte). */
  reference: Uint8Array;
  yfts: Record<string, Uint8Array>;
  ytds: Record<string, Uint8Array>;
}

export type LiveryWorkerRequest = ReplaceRequest | LayerRequest;

export type LiveryWorkerResponse =
  | { ok: true; files: Record<string, Uint8Array>; warnings: string[] }
  | { ok: false; message: string };

function run(request: LiveryWorkerRequest): { files: Record<string, Uint8Array>; warnings: string[] } {
  const files: Record<string, Uint8Array> = {};
  const warnings: string[] = [];
  if (request.kind === 'replace') {
    for (const [name, bytes] of Object.entries(request.files)) files[name] = replaceLiveryTexture(bytes, request.textureName, request.image).ytd;
    return { files, warnings };
  }
  const reference = readYft(request.reference);
  for (const [name, bytes] of Object.entries(request.yfts)) {
    try {
      files[name] = applyLiveryLayer(bytes, { shaders: request.shaders, textureName: request.textureName }, reference);
    } catch (e) {
      warnings.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (Object.keys(files).length === 0) throw new Error(warnings.join(' '));
  for (const [name, bytes] of Object.entries(request.ytds)) files[name] = addLiveryTexture(bytes, request.textureName, request.image).ytd;
  return { files, warnings };
}

self.onmessage = (event: MessageEvent<LiveryWorkerRequest>) => {
  try {
    const { files, warnings } = run(event.data);
    const transfer = Object.values(files).map((bytes) => bytes.buffer as ArrayBuffer);
    (self as unknown as Worker).postMessage({ ok: true, files, warnings } satisfies LiveryWorkerResponse, transfer);
  } catch (e) {
    (self as unknown as Worker).postMessage({ ok: false, message: e instanceof Error ? e.message : String(e) } satisfies LiveryWorkerResponse);
  }
};
