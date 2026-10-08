import { useState } from 'react';
import { useLang } from '../i18n.tsx';
import { downloadBytes } from '../lib/download.ts';
import { sheetToPng } from '../lib/uv-draw.ts';
import { SHEET_SIZES } from '../lib/useLiveryTemplate.ts';
import type { SheetSize, useLiveryTemplate } from '../lib/useLiveryTemplate.ts';

interface Props {
  tpl: ReturnType<typeof useLiveryTemplate>;
  /** Dateiname-Anfang für das PNG, zum Beispiel der Name des Fahrzeugs. */
  fileBase: string;
  /** true, wenn das gewählte Teil zu den Lack-Teilen mit Livery-Ebene gehört. */
  selectionInScope: boolean;
}

const percent = (x: number) => `${(x * 100).toFixed(x > 0 && x < 0.1 ? 1 : 0)} %`;

export function LiveryTemplatePanel({ tpl, fileBase, selectionInScope }: Props) {
  const { s } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    if (!tpl.layout) return;
    setBusy(true);
    setError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const blob = await sheetToPng(tpl.layout, tpl.outlines, tpl.islands, tpl.styles, { size: tpl.size, fill: tpl.fill, labels: tpl.labels, base: tpl.baseImage });
      downloadBytes(`${fileBase}_livery_uv${tpl.uvSet}_${tpl.size}.png`, new Uint8Array(await blob.arrayBuffer()), 'image/png');
    } catch (e) {
      setError(`${s.tplFailed} ${e instanceof Error ? e.message : ''}`.trim());
    } finally {
      setBusy(false);
    }
  };

  if (!tpl.scope) {
    return (
      <section className="card">
        <h3>{s.tplTitle}</h3>
        <p className="muted small">{s.tplNoPaint}</p>
      </section>
    );
  }

  const { report } = tpl;
  const tex = tpl.texture;

  return (
    <section className="card template-panel">
      <h3>{s.tplTitle}</h3>
      <p className="muted small">{s.tplIntro}</p>

      {tpl.scope.hasLayer ? (
        <dl className="detail-list">
          <div>
            <dt>{s.tplLayerLabel}</dt>
            <dd>
              <code>{tpl.textureName}</code>
              {tex ? <span className="muted small"> {tex.width}×{tex.height} {tex.format}</span> : null}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="notice small">{s.tplNoLayer}</p>
      )}

      <label className="field">
        <span>{s.tplSet}</span>
        <select value={tpl.uvSet} onChange={(e) => tpl.setUvSet(Number(e.target.value))}>
          {tpl.sets.map((i) => (
            <option key={i} value={i}>{`UV${i}`}</option>
          ))}
        </select>
      </label>
      <p className="muted small">{s.tplSetHint}</p>

      <fieldset className="field-group">
        <legend>{s.tplScope}</legend>
        <label className="check">
          <input type="radio" name="tpl-scope" checked={!tpl.onlySelection} onChange={() => tpl.setOnlySelection(false)} />
          {s.tplScopeAll}
        </label>
        <label className="check">
          <input type="radio" name="tpl-scope" checked={tpl.onlySelection} onChange={() => tpl.setOnlySelection(true)} />
          {s.tplScopeSelection}
        </label>
        {tpl.onlySelection && !selectionInScope ? <p className="muted small">{s.tplScopeNeedsPaint}</p> : null}
      </fieldset>

      <label className="field">
        <span>{s.tplSize}</span>
        <select value={tpl.size} onChange={(e) => tpl.setSize(Number(e.target.value) as SheetSize)}>
          {SHEET_SIZES.map((n) => (
            <option key={n} value={n}>{`${n} × ${n}`}</option>
          ))}
        </select>
      </label>

      <label className="check">
        <input type="checkbox" checked={tpl.fill} onChange={(e) => tpl.setFill(e.target.checked)} />
        {s.tplFill}
      </label>
      <label className="check">
        <input type="checkbox" checked={tpl.labels} onChange={(e) => tpl.setLabels(e.target.checked)} />
        {s.tplLabels}
      </label>
      {tpl.baseStatus !== 'none' ? (
        <label className="check">
          <input type="checkbox" checked={tpl.useBase && tpl.baseStatus === 'ready'} disabled={tpl.baseStatus !== 'ready'} onChange={(e) => tpl.setUseBase(e.target.checked)} />
          {s.tplBase}
        </label>
      ) : null}
      {tpl.baseStatus === 'missing' ? <p className="muted small">{s.tplBaseMissing.replace('{name}', tpl.textureName ?? '')}</p> : null}
      {tpl.baseStatus === 'undecodable' ? <p className="muted small">{s.tplBaseUndecodable}</p> : null}

      <div className="row-tight">
        <button type="button" className="btn btn-primary" disabled={!tpl.layout || busy} onClick={() => void download()}>
          {busy ? s.tplPreparing : s.tplDownload}
        </button>
      </div>
      {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
      {!tpl.layout ? <p className="muted small">{s.tplEmpty}</p> : null}

      {report ? (
        <>
          <h4 className="template-report-title">{s.tplReport}</h4>
          <dl className="detail-list">
            <div><dt>{s.tplCoverage}</dt><dd>{percent(report.coverage)}</dd></div>
            <div><dt>{s.tplOverlap}</dt><dd className={report.overlap > 0.05 ? 'is-warn' : undefined}>{percent(report.overlap)}</dd></div>
            {report.outside > 0 ? <div><dt>{s.tplOutside}</dt><dd className="is-warn">{report.outside}</dd></div> : null}
            {report.degenerate > 0 ? <div><dt>{s.tplDegenerate}</dt><dd>{report.degenerate}</dd></div> : null}
          </dl>
          {report.overlap > 0.05 ? <p className="muted small">{s.tplOverlapNote}</p> : null}
          {report.selfOverlaps.length > 0 ? (
            <>
              <p className="small template-pairs-title">{s.tplSelfOverlap}</p>
              <ul className="template-pairs small">
                {report.selfOverlaps.map((g) => (
                  <li key={g.key}>
                    {tpl.styles.get(g.key)?.label ?? g.key} <span className="muted">{percent(g.overlap)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {report.pairs.length > 0 ? (
            <>
              <p className="small template-pairs-title">{s.tplPairs}</p>
              <ul className="template-pairs small">
                {report.pairs.map((p) => (
                  <li key={`${p.a}|${p.b}`}>
                    {tpl.styles.get(p.a)?.label ?? p.a} ↔ {tpl.styles.get(p.b)?.label ?? p.b} <span className="muted">{percent(p.fraction)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
