import { readZip } from '@toolkit/forge-core';
import type { PackFiles } from '@toolkit/forge-core';

/** Eine Eingabedatei mit ihrem Pfad: Name allein oder relativer Pfad, wenn sie aus einem Ordner stammt. */
export interface InputFile {
  path: string;
  file: File;
}

const IGNORED = /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini|__MACOSX\/.*)$/i;
const ARCHIVE_EXTENSIONS = ['.rar', '.7z'];

export const isArchiveName = (name: string) => ARCHIVE_EXTENSIONS.some((e) => name.toLowerCase().endsWith(e));

/** Dateien aus einem Dateiauswahlfeld (auch mit `webkitdirectory`, dann mit relativem Pfad). */
export function fromFileList(list: FileList | File[]): InputFile[] {
  return Array.from(list).map((file) => ({ path: file.webkitRelativePath || file.name, file }));
}

/** Ein Eintrag aus dem Dateisystem-Baum eines gezogenen Ordners. */
interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (ok: (f: File) => void, fail: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (entries: EntryLike[]) => void, fail: (e: unknown) => void) => void };
}

async function walk(entry: EntryLike, prefix: string, out: InputFile[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((ok, fail) => entry.file!(ok, fail));
    out.push({ path: `${prefix}${entry.name}`, file });
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    // readEntries liefert höchstens ~100 Einträge je Aufruf, bis eine leere Liste kommt.
    for (;;) {
      const batch = await new Promise<EntryLike[]>((ok, fail) => reader.readEntries(ok, fail));
      if (batch.length === 0) break;
      for (const child of batch) await walk(child, `${prefix}${entry.name}/`, out);
    }
  }
}

/**
 * Dateien und Ordner aus einem Drop. Muss im Drop-Ereignis aufgerufen werden: Die Einträge sind nur dort gültig,
 * das Einlesen der Ordner läuft danach asynchron weiter.
 */
export async function fromDataTransfer(dt: DataTransfer): Promise<InputFile[]> {
  const entries: EntryLike[] = [];
  const plain: File[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind !== 'file') continue;
    const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => EntryLike | null }).webkitGetAsEntry?.() ?? null;
    if (entry) entries.push(entry);
    else {
      const file = item.getAsFile();
      if (file) plain.push(file);
    }
  }
  if (entries.length === 0 && plain.length === 0) return fromFileList(dt.files);
  const out: InputFile[] = fromFileList(plain);
  for (const entry of entries) await walk(entry, '', out);
  return out;
}

export class ArchiveError extends Error {
  readonly code: 'encrypted' | 'failed';
  constructor(code: 'encrypted' | 'failed', message: string) {
    super(message);
    this.name = 'ArchiveError';
    this.code = code;
  }
}

/** Entpackt ein RAR- oder 7z-Archiv im Browser (libarchive als WebAssembly, wird erst bei Bedarf geladen). */
export async function extractArchive(file: File): Promise<PackFiles> {
  const { Archive } = await import('libarchive.js');
  Archive.init({ workerUrl: new URL('libarchive/worker-bundle.js', document.baseURI).href });
  const archive = await Archive.open(file);
  try {
    if (await archive.hasEncryptedData()) throw new ArchiveError('encrypted', 'Das Archiv ist mit einem Passwort geschützt.');
    const tree = (await archive.extractFiles()) as Record<string, unknown>;
    const out: PackFiles = {};
    const visit = async (node: Record<string, unknown>, prefix: string): Promise<void> => {
      for (const [name, value] of Object.entries(node)) {
        if (value instanceof File) out[`${prefix}${name}`] = new Uint8Array(await value.arrayBuffer());
        else if (value && typeof value === 'object') await visit(value as Record<string, unknown>, `${prefix}${name}/`);
      }
    };
    await visit(tree, '');
    return out;
  } catch (e) {
    if (e instanceof ArchiveError) throw e;
    throw new ArchiveError('failed', e instanceof Error ? e.message : String(e));
  } finally {
    await archive.close();
  }
}

export interface ReadPackOptions {
  /** Wird mit dem Namen der Datei aufgerufen, die gerade gelesen wird. */
  onFile?: (name: string) => void;
}

/**
 * Macht aus Eingabedateien ein Paket (Pfad → Bytes): ZIP und RAR/7z werden aufgeklappt, Ordner behalten ihre Pfade,
 * alles andere wird unverändert übernommen.
 */
export async function readPack(inputs: InputFile[], options: ReadPackOptions = {}): Promise<PackFiles> {
  const out: PackFiles = {};
  for (const { path, file } of inputs) {
    if (IGNORED.test(path)) continue;
    options.onFile?.(file.name);
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.zip')) {
      Object.assign(out, readZip(new Uint8Array(await file.arrayBuffer())));
    } else if (isArchiveName(lower)) {
      Object.assign(out, await extractArchive(file));
    } else {
      out[path] = new Uint8Array(await file.arrayBuffer());
    }
  }
  return out;
}
