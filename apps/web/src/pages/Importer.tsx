import { analyzeVehiclePack, buildVehicleResource, writeZip } from '@toolkit/forge-core';
import type { IssueLevel, PackFiles, VehiclePackAnalysis } from '@toolkit/forge-core';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useLang } from '../i18n.tsx';
import { downloadBytes } from '../lib/download.ts';
import { formatBytes } from '../lib/format.ts';
import { ArchiveError, fromDataTransfer, fromFileList, readPack } from '../lib/pack-input.ts';
import type { InputFile } from '../lib/pack-input.ts';

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Ordner der Resource: Kleinbuchstaben, Ziffern, Unterstrich und Bindestrich. */
function cleanResourceName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
}

function fill(text: string, params: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => params[key] ?? whole);
}

export function Importer() {
  const { s } = useLang();
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<PackFiles | null>(null);
  const [analysis, setAnalysis] = useState<VehiclePackAnalysis | null>(null);
  const [resourceName, setResourceName] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const load = useCallback(
    async (inputs: InputFile[]) => {
      setBusy(s.vehLoading);
      setError(null);
      try {
        const collected = await readPack(inputs, { onFile: (name) => setBusy(/\.(rar|7z)$/i.test(name) ? `${s.vehUnpacking} ${name}` : s.vehLoading) });
        await yieldToUi();
        const result = analyzeVehiclePack(collected);
        setFiles(collected);
        setAnalysis(result);
        setResourceName(result.resourceName);
        setNames({});
      } catch (e) {
        if (e instanceof ArchiveError) setError(`${s.vehArchiveFailed} ${e.code === 'encrypted' ? s.vehArchiveEncrypted : e.message}`);
        else setError(`${s.impFailed} ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(null);
      }
    },
    [s],
  );

  const clear = () => {
    setFiles(null);
    setAnalysis(null);
    setError(null);
  };

  const hasErrors = analysis?.issues.some((i) => i.level === 'error') ?? false;
  const cleanName = cleanResourceName(resourceName) || 'fahrzeug';

  const download = async () => {
    if (!files || !analysis) return;
    setBusy(s.impPreparing);
    try {
      await yieldToUi();
      const built = buildVehicleResource(files, analysis, { resourceName: cleanName, displayNames: names });
      const prefixed: PackFiles = {};
      for (const [path, bytes] of Object.entries(built.files)) prefixed[`${cleanName}/${path}`] = bytes;
      downloadBytes(`${cleanName}.zip`, writeZip(prefixed));
    } catch (e) {
      setError(`${s.impFailed} ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const totals = useMemo(() => {
    if (!analysis) return null;
    return { stream: analysis.stream.reduce((sum, f) => sum + f.size, 0), count: analysis.stream.length };
  }, [analysis]);

  const levelClass: Record<IssueLevel, string> = { error: 'notice-error', warning: 'notice-warn', info: '' };

  if (!analysis || !files) {
    return (
      <main className="container">
        <header className="page-head">
          <h1>{s.impTitle}</h1>
          <p className="lead">{s.impIntro}</p>
          <p className="muted small lab-limits">{s.impStatus}</p>
        </header>
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
            void fromDataTransfer(e.dataTransfer).then((inputs) => (inputs.length > 0 ? load(inputs) : undefined));
          }}
        >
          <h2>{s.impDropTitle}</h2>
          <p>{s.impDropHint}</p>
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => input.current?.click()}>
              {s.vehDropButton}
            </button>
            <button type="button" className="btn" disabled={busy !== null} onClick={() => folderInput.current?.click()}>
              {s.vehDropFolder}
            </button>
          </div>
        </div>
        {busy ? <p className="notice" role="status">{busy}</p> : null}
        {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept=".zip,.rar,.7z,.yft,.ytd,.ydr,.ydd,.ybn,.meta,.xml,.lua"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) void load(fromFileList(e.target.files));
            e.target.value = '';
          }}
        />
        <input
          ref={folderInput}
          type="file"
          hidden
          {...{ webkitdirectory: '', directory: '' }}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) void load(fromFileList(e.target.files));
            e.target.value = '';
          }}
        />
      </main>
    );
  }

  return (
    <main className="container importer">
      <header className="page-head">
        <h1>{s.impTitle}</h1>
        <p className="muted small lab-limits">{s.impStatus}</p>
      </header>

      <div className="importer-grid">
        <div className="importer-main">
          <section className="card">
            <h3>{s.impModels}</h3>
            {analysis.models.length === 0 ? <p className="muted small">–</p> : null}
            <ul className="model-list">
              {analysis.models.map((m) => {
                const chips: Array<[string, boolean, boolean]> = [
                  [s.impChipModel, m.hasModel, true],
                  [s.impChipHigh, m.hasHighModel, false],
                  [s.impChipTexture, m.hasTexture, true],
                  [s.impChipHandling, m.hasHandling, true],
                  [s.impChipVariation, m.hasVariation, false],
                ];
                return (
                  <li key={m.name} className="model">
                    <div className="model-head">
                      <code className="model-name">{m.name}</code>
                      {m.sirenSetting !== '0' ? <span className="muted small">{s.impSiren} {m.sirenSetting}</span> : null}
                    </div>
                    <div className="chips">
                      {chips.map(([label, ok, important]) => (
                        <span key={label} className={`status-chip ${ok ? 'is-ok' : important ? 'is-bad' : 'is-none'}`}>
                          {ok ? '✓' : important ? '✕' : '–'} {label}
                        </span>
                      ))}
                    </div>
                    <label className="field">
                      <span>{s.impDisplayName}</span>
                      <input
                        type="text"
                        value={names[m.name.toLowerCase()] ?? ''}
                        placeholder={m.gameName}
                        onChange={(e) => setNames((prev) => ({ ...prev, [m.name.toLowerCase()]: e.target.value }))}
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="muted small">{s.impDisplayNameHint}</p>
          </section>

          <section className="card">
            <h3>{s.impIssues}</h3>
            {analysis.issues.length === 0 ? (
              <p className="notice notice-ok">{s.impNoIssues}</p>
            ) : (
              <ul className="issue-list">
                {analysis.issues.map((issue, i) => (
                  <li key={`${issue.code}-${i}`} className={`notice ${levelClass[issue.level]}`}>
                    <strong>{s.impLevels[issue.level]}.</strong> {fill(s.impIssueText[issue.code], issue.params)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h3>{s.impFiles}</h3>
            <h4 className="file-group-title">{s.impStream} <span className="muted small">{totals ? `${totals.count} · ${formatBytes(totals.stream)}` : ''}</span></h4>
            <ul className="file-list small">
              {analysis.stream.map((f) => (
                <li key={f.path}>
                  <code>{f.name}</code>
                  <span className="muted">{formatBytes(f.size)}{f.unreadable ? ` · ${s.impUnreadable}` : ''}</span>
                </li>
              ))}
            </ul>
            <h4 className="file-group-title">{s.impMetas}</h4>
            <ul className="file-list small">
              {analysis.metas.map((m) => (
                <li key={m.path}>
                  <code>{m.path.split('/').pop()}</code>
                  <span className="muted">→ {m.target}</span>
                </li>
              ))}
            </ul>
            {analysis.ignored.length > 0 ? (
              <>
                <h4 className="file-group-title">{s.impIgnored}</h4>
                <ul className="file-list small">
                  {analysis.ignored.map((p) => (
                    <li key={p}>
                      <code>{p.split('/').pop()}</code>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        </div>

        <aside className="importer-side">
          <section className="card">
            <label className="field">
              <span>{s.impResourceName}</span>
              <input type="text" value={resourceName} onChange={(e) => setResourceName(cleanResourceName(e.target.value))} />
              <small>{s.impResourceNameHint}</small>
            </label>
            <div className="row-tight">
              <button type="button" className={`btn ${hasErrors ? '' : 'btn-primary'}`} disabled={busy !== null} onClick={() => void download()}>
                {busy ?? (hasErrors ? s.impDownloadAnyway : s.impDownload)}
              </button>
              <button type="button" className="btn btn-small" onClick={clear}>{s.impClear}</button>
            </div>
            {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
          </section>
          <section className="card">
            <h3>{s.impNext}</h3>
            <p className="small">{fill(s.impNextSteps, { name: cleanName })}</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
