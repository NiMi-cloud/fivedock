import type { RgbaImage } from '@toolkit/rage-formats';
import type { LiveryWorkerRequest, LiveryWorkerResponse } from '../workers/livery.worker.ts';

export interface LiveryWriteOutput {
  files: Record<string, Uint8Array>;
  /** Dateien, die nicht angepasst werden konnten, mit der Meldung (die Datei bleibt dann ohne Livery-Ebene). */
  warnings: string[];
}

/** Eigene Kopien der Dateien: Die Eingaben stammen aus einem größeren Puffer (ZIP, Archiv), und die Seite braucht sie danach noch. */
function copyAll(files: Record<string, Uint8Array>, transfer: ArrayBuffer[]): Record<string, Uint8Array> {
  const copies: Record<string, Uint8Array> = {};
  for (const [name, bytes] of Object.entries(files)) {
    const copy = bytes.slice();
    copies[name] = copy;
    transfer.push(copy.buffer as ArrayBuffer);
  }
  return copies;
}

function runInWorker(build: (transfer: ArrayBuffer[]) => LiveryWorkerRequest): Promise<LiveryWriteOutput> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/livery.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<LiveryWorkerResponse>) => {
      finish();
      if (event.data.ok) resolve({ files: event.data.files, warnings: event.data.warnings });
      else reject(new Error(event.data.message));
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || 'Der Hintergrundprozess ist abgestürzt.'));
    };
    const transfer: ArrayBuffer[] = [];
    worker.postMessage(build(transfer), transfer);
  });
}

/** Schreibt die Livery in die angegebenen .ytd-Dateien, in einem Web Worker. Die Eingabe bleibt unverändert. */
export function writeLiveryInWorker(textureName: string, image: RgbaImage, files: Record<string, Uint8Array>): Promise<Record<string, Uint8Array>> {
  return runInWorker((transfer) => {
    const copies = copyAll(files, transfer);
    const data = image.data.slice();
    transfer.push(data.buffer as ArrayBuffer);
    return { kind: 'replace', textureName, image: { width: image.width, height: image.height, data }, files: copies };
  }).then((out) => out.files);
}

export interface CreateLayerInput {
  textureName: string;
  image: RgbaImage;
  /** Nummern der Lack-Shader in der Datei `reference`. */
  shaders: number[];
  reference: Uint8Array;
  yfts: Record<string, Uint8Array>;
  ytds: Record<string, Uint8Array>;
}

/** Legt die Livery-Ebene neu an: stellt die Lack-Shader in den Modelldateien um und nimmt die Textur in die Texturdateien auf. */
export function createLayerInWorker(input: CreateLayerInput): Promise<LiveryWriteOutput> {
  return runInWorker((transfer) => {
    const data = input.image.data.slice();
    transfer.push(data.buffer as ArrayBuffer);
    const reference = input.reference.slice();
    transfer.push(reference.buffer as ArrayBuffer);
    return {
      kind: 'layer',
      textureName: input.textureName,
      image: { width: input.image.width, height: input.image.height, data },
      shaders: input.shaders,
      reference,
      yfts: copyAll(input.yfts, transfer),
      ytds: copyAll(input.ytds, transfer),
    };
  });
}
