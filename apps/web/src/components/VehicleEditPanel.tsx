import { CATEGORY_ORDER, diffuseTextureOf, looksLikeDecal, removeParts, ruleOfPart, writeZip } from '@toolkit/forge-core';
import type { PackFiles, PartRule, VehiclePart } from '@toolkit/forge-core';
import type { Yft } from '@toolkit/rage-formats';
import { useMemo, useState } from 'react';
import { useLang } from '../i18n.tsx';
import { downloadBytes } from '../lib/download.ts';

interface Props {
  yft: Yft;
  parts: VehiclePart[];
  /** Zum Entfernen markierte Teile. */
  removed: ReadonlySet<string>;
  /** Im Bild oder in der Liste angeklicktes Teil. */
  pickedId: string | null;
  onPick: (id: string) => void;
  onToggle: (id: string) => void;
  onClear: () => void;
  files: PackFiles | null;
  /** Alle .yft-Dateien des Pakets (normales und Hochdetail-Modell). */
  yftPaths: string[];
  /** Anfang des Dateinamens für die ZIP-Datei. */
  fileBase: string;
}

const baseName = (path: string) => path.split('/').pop() ?? path;
const fmt = (n: number) => n.toLocaleString();

interface FileResult {
  name: string;
  removed: number;
  byLod: number[];
  failed?: string;
}

export function VehicleEditPanel({ yft, parts, removed, pickedId, onPick, onToggle, onClear, files, yftPaths, fileBase }: Props) {
  const { s, lang } = useLang();
  const [search, setSearch] = useState('');
  const [onlyDecals, setOnlyDecals] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<FileResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const info = useMemo(() => {
    const map = new Map<string, { preset: string; texture: string | null }>();
    for (const p of parts) {
      const shader = yft.shaders[p.shader];
      map.set(p.id, { preset: shader?.preset ?? '?', texture: shader ? diffuseTextureOf(shader) : null });
    }
    return map;
  }, [parts, yft]);

  const needle = search.trim().toLowerCase();
  const shown = parts.filter((p) => {
    const i = info.get(p.id)!;
    if (onlyDecals && !looksLikeDecal(i.texture)) return false;
    if (!needle) return true;
    return [p.bone, p.label.de, p.label.en, i.preset, i.texture ?? ''].some((x) => x.toLowerCase().includes(needle));
  });
  // Nach Art, dann größte zuerst, wie in der Teileliste
  const ordered = [...shown].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || b.triangleCount - a.triangleCount);

  const picked = pickedId ? (parts.find((p) => p.id === pickedId) ?? null) : null;
  const pickedInfo = picked ? info.get(picked.id)! : null;
  const markedCount = removed.size;
  const markedTriangles = parts.filter((p) => removed.has(p.id)).reduce((sum, p) => sum + p.triangleCount, 0);

  const exportFiles = async () => {
    if (!files || removed.size === 0) return;
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const unique = new Map<string, PartRule>();
      for (const p of parts) if (removed.has(p.id)) {
        const rule = ruleOfPart(yft, p);
        unique.set(JSON.stringify(rule), rule);
      }
      const rules = [...unique.values()];
      const out: Record<string, Uint8Array> = {};
      const report: FileResult[] = [];
      for (const path of yftPaths) {
        const name = baseName(path);
        try {
          const result = removeParts(files[path]!, rules);
          report.push({ name, removed: result.removed, byLod: result.byLod });
          if (result.removed > 0) out[name] = result.file;
          // Auch der Ladebalken der Seite soll zwischen großen Dateien Luft bekommen.
          await new Promise((resolve) => setTimeout(resolve, 0));
        } catch (e) {
          report.push({ name, removed: 0, byLod: [0, 0, 0, 0], failed: e instanceof Error ? e.message : String(e) });
        }
      }
      setResults(report);
      const names = Object.keys(out);
      if (names.length === 1) downloadBytes(names[0]!, out[names[0]!]!, 'application/octet-stream');
      else if (names.length > 1) downloadBytes(`${fileBase}_bearbeitet.zip`, writeZip(out));
    } catch (e) {
      setError(`${s.edtFailed} ${e instanceof Error ? e.message : ''}`.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="card template-panel">
        <h3>{s.edtTitle}</h3>
        <p className="muted small">{s.edtIntro}</p>

        {picked && pickedInfo ? (
          <div className="edit-picked">
            <p className="detail-title">{picked.label[lang]}</p>
            <dl className="detail-list">
              <div><dt>{s.vehBone}</dt><dd><code>{picked.bone}</code></dd></div>
              <div><dt>{s.vehShaders}</dt><dd>{pickedInfo.preset}</dd></div>
              <div><dt>{s.vehTextures}</dt><dd>{pickedInfo.texture ?? '–'}</dd></div>
              <div><dt>{s.vehTriangles}</dt><dd>{fmt(picked.triangleCount)}</dd></div>
            </dl>
            <button type="button" className={`btn ${removed.has(picked.id) ? '' : 'btn-primary'}`} onClick={() => onToggle(picked.id)}>
              {removed.has(picked.id) ? s.edtRestore : s.edtRemove}
            </button>
          </div>
        ) : (
          <p className="muted small">{s.edtPickHint}</p>
        )}
      </section>

      <section className="card template-panel">
        <h3>{s.edtMarked}</h3>
        {markedCount === 0 ? (
          <p className="muted small">{s.edtNone}</p>
        ) : (
          <p className="small">{s.edtMarkedCount.replace('{parts}', String(markedCount)).replace('{triangles}', fmt(markedTriangles))}</p>
        )}
        <div className="row-tight">
          <button type="button" className="btn btn-primary" disabled={busy || markedCount === 0 || !files} onClick={() => void exportFiles()}>
            {busy ? s.edtExporting : s.edtExport}
          </button>
          <button type="button" className="btn btn-small" disabled={markedCount === 0} onClick={onClear}>{s.edtClear}</button>
        </div>
        <p className="muted small">{s.edtNote}</p>
        {error ? <p className="notice notice-error small" role="alert">{error}</p> : null}
        {results ? (
          <ul className="file-list small">
            {results.map((r) => (
              <li key={r.name}>
                <code>{r.name}</code>
                <span className={r.failed ? 'is-warn' : 'muted'}>
                  {r.failed ?? (r.removed > 0 ? s.edtResult.replace('{count}', fmt(r.removed)).replace('{levels}', r.byLod.join(' / ')) : s.edtNothing)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="card vehicle-parts">
        <h3>{s.vehPartList}</h3>
        <input type="text" value={search} placeholder={s.vehSearch} onChange={(e) => setSearch(e.target.value)} aria-label={s.vehSearch} />
        <label className="check">
          <input type="checkbox" checked={onlyDecals} onChange={(e) => setOnlyDecals(e.target.checked)} />
          {s.edtDecals}
        </label>
        <ul className="part-list">
          {ordered.map((p) => {
            const i = info.get(p.id)!;
            return (
              <li key={p.id} className={`part${p.id === pickedId ? ' is-selected' : ''}${removed.has(p.id) ? ' is-hidden' : ''}`}>
                <button type="button" className="part-main" onClick={() => onPick(p.id)}>
                  <span className={`dot dot-${p.category}`} aria-hidden="true" />
                  <span className="part-name">
                    {p.label[lang]}
                    <span className="muted small part-sub"> {i.texture ?? i.preset}</span>
                  </span>
                  <span className="muted small">{fmt(p.triangleCount)}</span>
                </button>
                <button type="button" className="part-eye" aria-label={removed.has(p.id) ? s.edtRestore : s.edtRemove} title={removed.has(p.id) ? s.edtRestore : s.edtRemove} onClick={() => onToggle(p.id)}>
                  {removed.has(p.id) ? '↶' : '✕'}
                </button>
              </li>
            );
          })}
          {ordered.length === 0 ? <li className="muted small part-empty">{s.vehNoMatch}</li> : null}
        </ul>
      </section>
    </>
  );
}
