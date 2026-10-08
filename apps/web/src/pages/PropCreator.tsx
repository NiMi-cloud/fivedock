import {
  NotReadyError,
  boundsSize,
  buildPropResource,
  computeBounds,
  computeCollision,
  estimateExport,
  modelStats,
  sanitizePropName,
  toGameSpace,
  validateModel,
} from '@toolkit/forge-core';
import type { CollisionMode, ModelData, UpAxis } from '@toolkit/forge-core';
import { useCallback, useMemo, useState } from 'react';
import { DropZone } from '../components/DropZone.tsx';
import { PipelineStatus } from '../components/PipelineStatus.tsx';
import { Viewport3D } from '../components/Viewport3D.tsx';
import { useLang } from '../i18n.tsx';
import { downloadBytes, zipResource } from '../lib/download.ts';
import { loadModelFiles } from '../lib/loadModel.ts';
import { createSampleCrate } from '../lib/sample.ts';

type Loaded = { model: ModelData; fileName: string };

const fmt = (n: number, digits = 2) => n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });

function isPow2(n: number) {
  return n > 0 && (n & (n - 1)) === 0;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Ab dieser Größe warnen wir, dass ein einzelnes Prop viel Speicher braucht. */
const LARGE_PROP_BYTES = 24 * 1024 * 1024;

export function PropCreator() {
  const { s } = useLang();

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('my_prop');
  const [upAxis, setUpAxis] = useState<UpAxis>('y');
  /** Zielgröße der längsten Kante in Metern. null = Originalgröße (Faktor 1). */
  const [targetSize, setTargetSize] = useState<number | null>(null);
  /** Rohtext des Größenfelds, damit man Zwischenstände wie „1,“ tippen kann. */
  const [sizeText, setSizeText] = useState('');
  const [collision, setCollision] = useState<CollisionMode>('box');
  const [lod, setLod] = useState<1 | 2 | 3>(1);
  const [maxTexture, setMaxTexture] = useState(1024);
  const [compress, setCompress] = useState(true);
  const [showReference, setShowReference] = useState(true);
  const [showCollision, setShowCollision] = useState(true);

  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const accept = useCallback((model: ModelData, fileName: string) => {
    setLoaded({ model, fileName });
    setName(sanitizePropName(fileName));
    setUpAxis('y');
    setTargetSize(null);
    setSizeText('');
    setExportMessage(null);
    setError(null);
  }, []);

  const onFiles = useCallback(
    async (files: File[]) => {
      setLoading(true);
      setError(null);
      try {
        const result = await loadModelFiles(files);
        accept(result.model, result.fileName);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [accept],
  );

  const onSample = useCallback(() => accept(createSampleCrate(), 'crate.glb'), [accept]);

  // Modell bei Faktor 1 im GTA-Raum, um die Originalgröße zu kennen.
  const base = useMemo(
    () => (loaded ? toGameSpace(loaded.model, { upAxis, scale: 1, centerXY: true, groundZ: true }) : null),
    [loaded, upAxis],
  );
  const baseLongest = useMemo(() => {
    const b = base ? computeBounds(base) : null;
    return b ? Math.max(...boundsSize(b)) : 0;
  }, [base]);

  const scale = targetSize && baseLongest > 0 ? targetSize / baseLongest : 1;

  const game = useMemo(
    () => (loaded ? toGameSpace(loaded.model, { upAxis, scale, centerXY: true, groundZ: true }) : null),
    [loaded, upAxis, scale],
  );
  const collisionMesh = useMemo(() => (game ? computeCollision(game, collision) : null), [game, collision]);

  const stats = useMemo(() => (game ? modelStats(game) : null), [game]);
  const estimate = useMemo(
    () => (game ? estimateExport(game, { maxTextureSize: maxTexture, compressTextures: compress }) : null),
    [game, maxTexture, compress],
  );
  const size = useMemo(() => {
    const b = game ? computeBounds(game) : null;
    return b ? boundsSize(b) : null;
  }, [game]);

  const notes = useMemo(() => {
    if (!game || !stats || !size) return [];
    const list = [...validateModel(game)];
    const longest = Math.max(...size);
    if (longest > 50) list.push(s.warnHuge);
    if (longest < 0.05) list.push(s.warnTiny);
    if (stats.triangles > 30000) list.push(s.warnTriangles);
    if (game.textures.some((t) => !isPow2(t.width) || !isPow2(t.height))) list.push(s.warnTextures);
    if (game.textures.length === 0) list.push(s.warnNoTexture);
    return list;
  }, [game, stats, size, s]);

  const finalName = sanitizePropName(name);

  const onExport = useCallback(async () => {
    if (!game) return;
    setExporting(true);
    setExportMessage(null);
    try {
      // Kurz abgeben, damit "Wird erstellt …" sichtbar wird, bevor die Berechnung die Seite blockiert.
      await new Promise((resolve) => setTimeout(resolve, 30));
      const resource = await buildPropResource(game, {
        name: finalName,
        collision,
        lodLevels: lod,
        maxTextureSize: maxTexture,
        compressTextures: compress,
      });
      const zip = zipResource(finalName, resource.files);
      downloadBytes(`${finalName}.zip`, zip);
      const note = resource.warnings.length > 0 ? ` ${resource.warnings.join(' ')}` : '';
      setExportMessage({ kind: 'ok', text: `${s.exportDone} (${formatBytes(zip.length)})${note}` });
    } catch (e) {
      const text = e instanceof NotReadyError ? e.message : `${s.exportFailed} ${e instanceof Error ? e.message : String(e)}`;
      setExportMessage({ kind: 'error', text });
    } finally {
      setExporting(false);
    }
  }, [game, finalName, collision, lod, maxTexture, compress, s]);

  return (
    <main className="container">
      <header className="page-head">
        <h1>{s.propTitle}</h1>
        <p className="lead">{s.propIntro}</p>
      </header>

      {!loaded ? (
        <>
          <DropZone onFiles={onFiles} onSample={onSample} sampleLabel={s.loadSample} busy={loading} />
          {loading ? <p className="notice" role="status">{s.loading}</p> : null}
          {error ? (
            <p className="notice notice-error" role="alert">
              <strong>{s.loadFailed}</strong> {error}
            </p>
          ) : null}
        </>
      ) : (
        <div className="workspace">
          <div className="stage">
            <Viewport3D model={game} showReference={showReference} collision={collisionMesh} showCollision={showCollision} />
            <div className="stage-bar">
              <label className="check">
                <input type="checkbox" checked={showReference} onChange={(e) => setShowReference(e.target.checked)} />
                {s.showReference}
              </label>
              <label className="check">
                <input type="checkbox" checked={showCollision} disabled={collision === 'none'} onChange={(e) => setShowCollision(e.target.checked)} />
                {s.showCollision}
              </label>
            </div>
          </div>

          <aside className="side">
            <section className="card">
              <div className="card-head">
                <h3>{s.stats}</h3>
                <button type="button" className="btn btn-small" onClick={() => setLoaded(null)}>
                  {s.clearModel}
                </button>
              </div>
              <p className="muted small file-name" title={loaded.fileName}>
                {s.fileLabel}: {loaded.fileName}
              </p>
              {stats && size ? (
                <dl className="stats">
                  <div><dt>{s.statTriangles}</dt><dd>{stats.triangles.toLocaleString()}</dd></div>
                  <div><dt>{s.statVertices}</dt><dd>{stats.vertices.toLocaleString()}</dd></div>
                  <div><dt>{s.statMaterials}</dt><dd>{stats.materials}</dd></div>
                  <div><dt>{s.statTextures}</dt><dd>{stats.textures}</dd></div>
                  <div className="wide">
                    <dt>{s.statSize}</dt>
                    <dd>{fmt(size[0])} × {fmt(size[1])} × {fmt(size[2])} m</dd>
                  </div>
                </dl>
              ) : null}
              {notes.length > 0 ? (
                <div className="notes">
                  <h4>{s.problems}</h4>
                  <ul>
                    {notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            <section className="card">
              <h3>{s.settings}</h3>

              <label className="field">
                <span>{s.nameLabel}</span>
                <input type="text" value={name} maxLength={60} spellCheck={false} onChange={(e) => setName(e.target.value)} onBlur={() => setName(sanitizePropName(name))} />
                <small>{s.nameHelp} {s.nameResult}: <code>{finalName}</code></small>
              </label>

              <label className="field">
                <span>{s.upAxisLabel}</span>
                <select value={upAxis} onChange={(e) => setUpAxis(e.target.value as UpAxis)}>
                  <option value="y">{s.upY}</option>
                  <option value="z">{s.upZ}</option>
                </select>
              </label>

              <label className="field">
                <span>{s.sizeLabel}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={sizeText !== '' ? sizeText : String(Number(baseLongest.toFixed(3)))}
                  onChange={(e) => {
                    setSizeText(e.target.value);
                    const v = Number.parseFloat(e.target.value.replace(',', '.'));
                    setTargetSize(Number.isFinite(v) && v > 0 && v <= 500 ? v : null);
                  }}
                  onBlur={() => setSizeText('')}
                />
                <small>
                  {s.sizeHelp} {s.scaleFactor}: {fmt(scale, 4)}
                </small>
              </label>

              <label className="field">
                <span>{s.collisionLabel}</span>
                <select value={collision} onChange={(e) => setCollision(e.target.value as CollisionMode)}>
                  <option value="box">{s.collisionBox}</option>
                  <option value="boxes">{s.collisionBoxes}</option>
                  <option value="hull">{s.collisionHull}</option>
                  <option value="mesh">{s.collisionMesh}</option>
                  <option value="none">{s.collisionNone}</option>
                </select>
              </label>

              <label className="field">
                <span>{s.lodLabel}</span>
                <select value={lod} onChange={(e) => setLod(Number(e.target.value) as 1 | 2 | 3)}>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
                <small>{s.lodHelp}</small>
              </label>

              <label className="field">
                <span>{s.textureSizeLabel}</span>
                <select value={maxTexture} onChange={(e) => setMaxTexture(Number(e.target.value))}>
                  {[256, 512, 1024, 2048, 4096].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <small>{s.textureSizeHelp}</small>
              </label>

              <label className="check field-check">
                <input type="checkbox" checked={compress} onChange={(e) => setCompress(e.target.checked)} />
                <span>
                  {s.compressLabel}
                  <small className="block">{s.compressHelp}</small>
                </span>
              </label>
            </section>

            {estimate ? (
              <section className="card">
                <h3>{s.estimateTitle}</h3>
                <dl className="stats">
                  <div><dt>{s.estimateTextures}</dt><dd>{formatBytes(estimate.textureBytes)}</dd></div>
                  <div><dt>{s.estimateMesh}</dt><dd>{formatBytes(estimate.meshBytes)}</dd></div>
                  <div className="wide"><dt>{s.estimateTotal}</dt><dd>{formatBytes(estimate.totalBytes)}</dd></div>
                </dl>
                {estimate.totalBytes > LARGE_PROP_BYTES ? <p className="notice notice-warn">{s.estimateLarge}</p> : null}
              </section>
            ) : null}

            <section className="card">
              <h3>{s.exportTitle}</h3>
              <button type="button" className="btn btn-primary btn-block" disabled={exporting || !game} onClick={onExport}>
                {exporting ? s.exportBusy : s.exportButton}
              </button>
              {exportMessage ? (
                <p className={`notice ${exportMessage.kind === 'error' ? 'notice-warn' : 'notice-ok'}`} role="status">
                  {exportMessage.text}
                </p>
              ) : null}
              <details className="howto">
                <summary>{s.howToUse}</summary>
                <p>{s.howToUseText.replace('<name>', finalName)}</p>
              </details>
            </section>

            <PipelineStatus />
          </aside>
        </div>
      )}
    </main>
  );
}
