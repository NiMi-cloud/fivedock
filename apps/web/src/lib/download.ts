import { zipSync } from 'fflate';
import type { ExportedFile } from '@toolkit/forge-core';

/** Packt Dateien in ein ZIP. Alle Pfade liegen unter einem Ordner mit dem Namen der Resource. */
export function zipResource(folder: string, files: ExportedFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[`${folder}/${f.path}`] = f.data;
  return zipSync(entries, { level: 6 });
}

export function downloadBytes(fileName: string, bytes: Uint8Array, mime = 'application/zip'): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
