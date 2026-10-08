import { unzipSync, zipSync } from 'fflate';
import type { PackFiles } from './texture-lab.ts';

/** Dateiendungen, die schon komprimiert sind. Sie werden im ZIP nur abgelegt, das spart Rechenzeit. */
const STORED = new Set(['.ytd', '.ydr', '.yft', '.ydd', '.ytyp', '.ymap', '.ybn', '.ycd', '.png', '.jpg', '.jpeg', '.webp', '.zip']);

function extension(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot < 0 ? '' : path.slice(dot).toLowerCase();
}

/**
 * Entpackt ein ZIP. Ordnereinträge werden ausgelassen, Pfade vereinheitlicht (Schrägstrich).
 * Pfade mit ".." werden abgelehnt, auch wenn die Dateien nie auf die Platte geschrieben werden.
 */
export function readZip(bytes: Uint8Array): PackFiles {
  const raw = unzipSync(bytes);
  const out: PackFiles = {};
  for (const [name, data] of Object.entries(raw)) {
    const path = name.replace(/\\/g, '/');
    if (path.endsWith('/')) continue;
    if (path.split('/').includes('..')) throw new Error(`Unzulässiger Pfad im ZIP: ${name}`);
    out[path] = data;
  }
  return out;
}

export function writeZip(files: PackFiles): Uint8Array {
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  for (const [path, data] of Object.entries(files)) {
    entries[path] = [data, { level: STORED.has(extension(path)) ? 0 : 6 }];
  }
  return zipSync(entries);
}
