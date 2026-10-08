import { isYtdPath, optimizePack, retexture, retextureFromDds, writeZip } from '@toolkit/forge-core';
import type { PackFiles, PackReport, SkipReason, TextureNote } from '@toolkit/forge-core';
import { YtdReadError, buildYtd, canDecode, decodeTexture, levelForPreview, readDds, readYtd, writeDdsTexture } from '@toolkit/rage-formats';
import type { YtdTexture } from '@toolkit/rage-formats';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../i18n.tsx';
import { downloadBytes } from '../lib/download.ts';
import { fill, formatBytes, savedPercent } from '../lib/format.ts';
import { decodeImageFile, drawRgba, rgbaToPngBlob } from '../lib/image.ts';
import { fromDataTransfer, fromFileList, readPack } from '../lib/pack-input.ts';
import type { InputFile } from '../lib/pack-input.ts';

type Entry =
  | { path: string; ok: true; textures: YtdTexture[] }
  | { path: string; ok: false; reason: SkipReason; detail: string };

interface Snapshot {
  files: PackFiles;
  entries: Entry[];
}

type Message = { kind: 'ok' | 'warn' | 'error'; text: string };

const MAX_HISTORY = 10;
const PREVIEW_EDGE = 128;

function readEntry(path: string, bytes: Uint8Array): Entry {
  try {
    return { path, ok: true, textures: readYtd(bytes) };
  } catch (e) {
    return {
      path,
      ok: false,
      reason: e instanceof YtdReadError ? e.code : 'corrupt',
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Liest ZIP, RAR, 7z und Ordner aus und nimmt andere Dateien unter ihrem Pfad auf. Der Name stammt vom ersten Archiv oder Ordner. */
async function collectFiles(inputs: InputFile[]): Promise<{ files: PackFiles; name: string }> {
  const files = await readPack(inputs);
  const first = inputs[0];
  const name = first ? (first.path.includes('/') ? first.path.split('/')[0]! : first.file.name.replace(/\.(zip|rar|7z|ytd)$/i, '')) : '';
  return { files, name: name || 'textures' };
}

function formatLabel(t: YtdTexture): string {
  return `${t.width}×${t.height} · ${t.format}`;
}

function Thumb({ texture }: { texture: YtdTexture }) {
  const { s } = useLang();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const previewable = canDecode(texture.format);

  useEffect(() => {
    if (!previewable || !canvas.current) return;
    try {
      drawRgba(canvas.current, decodeTexture(texture, levelForPreview(texture, PREVIEW_EDGE)));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [texture, previewable]);

  return (
    <div className="thumb">
      {previewable && !failed ? <canvas ref={canvas} className="thumb-canvas" /> : <span className="thumb-none">{s.labNoPreview}</span>}
    </div>
  );
}

export function TextureLab() {
  const { s } = useLang();
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<{ path: string; name: string } | null>(null);

  const [files, setFiles] = useState<PackFiles | null>(null);
  const [packName, setPackName] = useState('textures');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [report, setReport] = useState<PackReport | null>(null);
  const [busy, setBusy] = useState<'load' | 'optimize' | 'replace' | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const [maxSize, setMaxSize] = useState(1024);
  const [recompress, setRecompress] = useState(false);
  const [replaceSize, setReplaceSize] = useState<'keep' | 'fit'>('keep');

  const summary = useMemo(() => {
    let textures = 0;
    let bytes = 0;
    let ytds = 0;
    for (const e of entries) {
      if (!e.ok) continue;
      ytds++;
      textures += e.textures.length;
      bytes += e.textures.reduce((sum, t) => sum + t.data.length, 0);
    }
    return { ytds, textures, bytes };
  }, [entries]);

  const loadFiles = useCallback(
    async (list: InputFile[]) => {
      setBusy('load');
      setMessage(null);
      setReport(null);
      setProgress(null);
      try {
        const collected = await collectFiles(list);
        const paths = Object.keys(collected.files).filter(isYtdPath).sort();
        if (paths.length === 0) throw new Error(s.labNoYtd);
        const next: Entry[] = [];
        for (const [i, path] of paths.entries()) {
          setProgress([i, paths.length]);
          await yieldToUi();
          next.push(readEntry(path, collected.files[path]!));
        }
        setFiles(collected.files);
        setPackName(collected.name);
        setEntries(next);
        setHistory([]);
        setOpen(new Set(paths.slice(0, 1)));
      } catch (e) {
        setMessage({ kind: 'error', text: `${s.labLoadFailed} ${e instanceof Error ? e.message : String(e)}` });
      } finally {
        setBusy(null);
        setProgress(null);
      }
    },
    [s],
  );

  const pushHistory = useCallback(() => {
    if (!files) return;
    setHistory((h) => [...h.slice(-(MAX_HISTORY - 1)), { files, entries }]);
  }, [files, entries]);

  const onOptimize = useCallback(async () => {
    if (!files) return;
    setBusy('optimize');
    setMessage(null);
    try {
      const result = await optimizePack(files, { maxSize, compressUncompressed: recompress }, (done, total) => setProgress([done, total]));
      setReport(result.report);
      if (result.report.totals.texturesChanged > 0) {
        const changed = new Set(result.report.files.filter((f) => f.status === 'optimized').map((f) => f.path));
        const nextEntries = entries.map((e) => (changed.has(e.path) ? readEntry(e.path, result.files[e.path]!) : e));
        pushHistory();
        setFiles(result.files);
        setEntries(nextEntries);
      }
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }, [files, entries, maxSize, recompress, pushHistory]);

  const onUndo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last) return;
    setFiles(last.files);
    setEntries(last.entries);
    setHistory((h) => h.slice(0, -1));
    setReport(null);
    setMessage(null);
  }, [history]);

  const startReplace = (path: string, name: string) => {
    replaceTarget.current = { path, name };
    imageInput.current?.click();
  };

  const onReplaceFile = useCallback(
    async (file: File) => {
      const target = replaceTarget.current;
      if (!target || !files) return;
      const entry = entries.find((e) => e.path === target.path);
      const old = entry && entry.ok ? entry.textures.find((t) => t.name === target.name) : undefined;
      if (!entry || !entry.ok || !old) return;
      setBusy('replace');
      setMessage(null);
      try {
        await yieldToUi();
        const result = file.name.toLowerCase().endsWith('.dds')
          ? retextureFromDds(old, readDds(new Uint8Array(await file.arrayBuffer())))
          : retexture(old, await decodeImageFile(file), { size: replaceSize });
        const textures = entry.textures.map((t) => (t.name === target.name ? result.texture : t));
        const bytes = buildYtd(textures, { allowNonPowerOfTwo: true });
        pushHistory();
        setFiles({ ...files, [target.path]: bytes });
        setEntries(entries.map((e) => (e.path === target.path ? { ...e, textures } : e)));
        setReport(null);
        const notes = result.notes.map((n: TextureNote) => s.labNotes[n]).join(' ');
        setMessage({ kind: notes ? 'warn' : 'ok', text: `${fill(s.labReplaced, { name: target.name })} ${notes}`.trim() });
      } catch (e) {
        setMessage({ kind: 'error', text: `${s.labReplaceFailed} ${e instanceof Error ? e.message : String(e)}` });
      } finally {
        setBusy(null);
      }
    },
    [files, entries, replaceSize, pushHistory, s],
  );

  const onDownload = useCallback(() => {
    if (!files) return;
    const names = Object.keys(files);
    const only = names[0];
    if (names.length === 1 && only && isYtdPath(only)) {
      downloadBytes(only.split('/').pop() ?? only, files[only]!, 'application/octet-stream');
    } else {
      downloadBytes(`${packName}.zip`, writeZip(files));
    }
  }, [files, packName]);

  const savePng = async (t: YtdTexture) => {
    try {
      const blob = await rgbaToPngBlob(decodeTexture(t, 0));
      downloadBytes(`${t.name}.png`, new Uint8Array(await blob.arrayBuffer()), 'image/png');
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const saveDds = (t: YtdTexture) => {
    try {
      downloadBytes(`${t.name}.dds`, writeDdsTexture(t), 'application/octet-stream');
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const clear = () => {
    setFiles(null);
    setEntries([]);
    setHistory([]);
    setReport(null);
    setMessage(null);
  };

  const busyText = busy === 'load' ? s.labLoading : busy === 'optimize' ? s.labOptimizing : busy === 'replace' ? s.labReplaceBusy : null;

  return (
    <main className="container">
      <header className="page-head">
        <h1>{s.labTitle}</h1>
        <p className="lead">{s.labIntro}</p>
        <p className="muted small lab-limits">{s.labLimits}</p>
      </header>

      {!files ? (
        <>
          <div
            className={`dropzone${over ? ' is-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              void fromDataTransfer(e.dataTransfer).then((inputs) => (inputs.length > 0 ? loadFiles(inputs) : undefined));
            }}
          >
            <h2>{s.labDropTitle}</h2>
            <p>{s.labDropHint}</p>
            <div className="row">
              <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => input.current?.click()}>
                {s.labDropButton}
              </button>
              <button type="button" className="btn" disabled={busy !== null} onClick={() => folderInput.current?.click()}>
                {s.vehDropFolder}
              </button>
            </div>
          </div>
          {busy === 'load' ? (
            <p className="notice" role="status">
              {s.labLoading} {progress ? `${progress[0]}/${progress[1]}` : ''}
            </p>
          ) : null}
          {message ? (
            <p className={`notice ${message.kind === 'error' ? 'notice-error' : 'notice-warn'}`} role="alert">
              {message.text}
            </p>
          ) : null}
        </>
      ) : (
        <div className="workspace">
          <div className="lab-main">
            <h2 className="lab-heading">{s.labTexturesTitle}</h2>
            {entries.map((entry) => {
              const isOpen = open.has(entry.path);
              return (
                <details
                  key={entry.path}
                  className="file-group"
                  open={isOpen}
                  onToggle={(e) => {
                    const nowOpen = (e.currentTarget as HTMLDetailsElement).open;
                    setOpen((prev) => {
                      if (prev.has(entry.path) === nowOpen) return prev;
                      const next = new Set(prev);
                      if (nowOpen) next.add(entry.path);
                      else next.delete(entry.path);
                      return next;
                    });
                  }}
                >
                  <summary>
                    <span className="file-path">{entry.path}</span>
                    <span className="muted small">
                      {entry.ok
                        ? `${entry.textures.length} · ${formatBytes(entry.textures.reduce((sum, t) => sum + t.data.length, 0))}`
                        : s.labErrorFile}
                    </span>
                  </summary>
                  {isOpen ? (
                    entry.ok ? (
                      <ul className="tex-list">
                        {entry.textures.map((t) => (
                          <li key={t.name} className="tex">
                            <Thumb texture={t} />
                            <div className="tex-info">
                              <strong className="tex-name" title={t.name}>{t.name}</strong>
                              <span className="muted small">
                                {formatLabel(t)} · {t.levels} {s.labMips} · {formatBytes(t.data.length)}
                              </span>
                              <span className="tex-flags">
                                {t.levels === 1 && Math.max(t.width, t.height) >= 64 ? <span className="badge badge-planned">{s.labNoMips}</span> : null}
                                {(t.width & (t.width - 1)) !== 0 || (t.height & (t.height - 1)) !== 0 ? (
                                  <span className="badge badge-progress">{s.labNotPow2}</span>
                                ) : null}
                              </span>
                            </div>
                            <div className="tex-actions">
                              <button type="button" className="btn btn-small" disabled={busy !== null} onClick={() => startReplace(entry.path, t.name)}>
                                {s.labReplace}
                              </button>
                              <button type="button" className="btn btn-small" disabled={!canDecode(t.format)} onClick={() => void savePng(t)}>
                                {s.labSavePng}
                              </button>
                              <button type="button" className="btn btn-small" disabled={t.format === 'BC7'} onClick={() => saveDds(t)}>
                                {s.labSaveDds}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="notice notice-warn">{s.labSkipReasons[entry.reason]}</p>
                    )
                  ) : null}
                </details>
              );
            })}
          </div>

          <aside className="side">
            <section className="card">
              <div className="card-head">
                <h3>{s.labSummaryTitle}</h3>
                <button type="button" className="btn btn-small" disabled={busy !== null} onClick={clear}>
                  {s.labClear}
                </button>
              </div>
              <dl className="stats">
                <div><dt>{s.labFiles}</dt><dd>{summary.ytds}</dd></div>
                <div><dt>{s.labTextures}</dt><dd>{summary.textures.toLocaleString()}</dd></div>
                <div className="wide"><dt>{s.labMemory}</dt><dd>{formatBytes(summary.bytes)}</dd></div>
              </dl>
            </section>

            <section className="card">
              <h3>{s.labOptimizeTitle}</h3>
              <label className="field">
                <span>{s.labMaxSize}</span>
                <select value={maxSize} onChange={(e) => setMaxSize(Number(e.target.value))}>
                  {[128, 256, 512, 1024, 2048, 4096].map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <small>{s.labMaxSizeHelp}</small>
              </label>
              <label className="check field-check">
                <input type="checkbox" checked={recompress} onChange={(e) => setRecompress(e.target.checked)} />
                <span>
                  {s.labRecompress}
                  <small className="block">{s.labRecompressHelp}</small>
                </span>
              </label>
              <button type="button" className="btn btn-primary btn-block" disabled={busy !== null} onClick={() => void onOptimize()}>
                {busy === 'optimize' ? s.labOptimizing : s.labOptimizeButton}
              </button>
              {busy === 'optimize' && progress ? <p className="muted small" role="status">{progress[0]}/{progress[1]}</p> : null}
            </section>

            <section className="card">
              <h3>{s.labReplaceSettings}</h3>
              <label className="field">
                <span>{s.labReplaceSize}</span>
                <select value={replaceSize} onChange={(e) => setReplaceSize(e.target.value as 'keep' | 'fit')}>
                  <option value="keep">{s.labReplaceKeep}</option>
                  <option value="fit">{s.labReplaceFit}</option>
                </select>
                <small>{s.labReplaceHelp}</small>
              </label>
            </section>

            {busyText && busy !== 'optimize' ? <p className="notice" role="status">{busyText}</p> : null}
            {message ? (
              <p className={`notice ${message.kind === 'error' ? 'notice-error' : message.kind === 'warn' ? 'notice-warn' : 'notice-ok'}`} role="status">
                {message.text}
              </p>
            ) : null}

            {report ? <ReportCard report={report} /> : null}

            <section className="card">
              <button type="button" className="btn btn-primary btn-block" disabled={busy !== null} onClick={onDownload}>
                {s.labDownload}
              </button>
              <p className="muted small">{s.labDownloadHint}</p>
              <button type="button" className="btn btn-block" disabled={busy !== null || history.length === 0} onClick={onUndo}>
                {s.labUndo}
              </button>
            </section>
          </aside>
        </div>
      )}

      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept=".zip,.rar,.7z,.ytd"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) void loadFiles(fromFileList(e.target.files));
          e.target.value = '';
        }}
      />
      <input
        ref={folderInput}
        type="file"
        hidden
        {...{ webkitdirectory: '', directory: '' }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) void loadFiles(fromFileList(e.target.files));
          e.target.value = '';
        }}
      />
      <input
        ref={imageInput}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp,.dds"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onReplaceFile(file);
          e.target.value = '';
        }}
      />
    </main>
  );
}

function ReportCard({ report }: { report: PackReport }) {
  const { s } = useLang();
  const t = report.totals;
  const statusLabel = { optimized: s.labStatusOptimized, unchanged: s.labStatusUnchanged, skipped: s.labStatusSkipped } as const;
  const interesting = report.files.filter((f) => f.status !== 'unchanged' || f.textures.some((x) => x.note));

  return (
    <section className="card report" aria-label={s.labResultTitle}>
      <h3>{s.labResultTitle}</h3>
      {t.texturesChanged === 0 ? <p className="notice notice-warn">{s.labResultNothing}</p> : null}
      <dl className="stats">
        <div className="wide">
          <dt>{s.labResultMemory}</dt>
          <dd>
            {formatBytes(t.pixelBytesBefore)} → {formatBytes(t.pixelBytesAfter)}
            {t.pixelBytesBefore > t.pixelBytesAfter ? ` (−${savedPercent(t.pixelBytesBefore, t.pixelBytesAfter)} %)` : ''}
          </dd>
        </div>
        <div className="wide">
          <dt>{s.labResultFile}</dt>
          <dd>{formatBytes(t.fileBytesBefore)} → {formatBytes(t.fileBytesAfter)}</dd>
        </div>
        <div className="wide">
          <dt>{s.labTextures}</dt>
          <dd>{fill(s.labResultChanged, { n: t.texturesChanged, m: t.texturesTotal })}</dd>
        </div>
      </dl>
      {report.embeddedTextureFiles.length > 0 ? (
        <p className="muted small">{fill(s.labEmbedded, { n: report.embeddedTextureFiles.length })}</p>
      ) : null}
      {interesting.length > 0 ? (
        <ul className="report-list">
          {interesting.map((f) => (
            <li key={f.path}>
              <div className="report-file">
                <span className="file-path">{f.path}</span>
                <span className={`badge ${f.status === 'optimized' ? 'badge-available' : f.status === 'skipped' ? 'badge-progress' : 'badge-planned'}`}>
                  {statusLabel[f.status]}
                </span>
              </div>
              {f.status === 'skipped' && f.reason ? <p className="muted small">{s.labSkipReasons[f.reason]}</p> : null}
              {f.textures
                .filter((x) => x.action !== 'unchanged' || x.note)
                .map((x) => (
                  <p key={x.name} className="muted small report-texture">
                    <code>{x.name}</code> {x.before.width}×{x.before.height} {x.before.format} → {x.after.width}×{x.after.height} {x.after.format} (
                    {formatBytes(x.before.bytes)} → {formatBytes(x.after.bytes)}) {x.action !== 'unchanged' ? s.labActions[x.action] : ''}
                    {x.note ? ` ${s.labNotes[x.note]}` : ''}
                  </p>
                ))}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
