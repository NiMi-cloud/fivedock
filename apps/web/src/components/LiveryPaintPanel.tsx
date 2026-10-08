import { writeZip } from '@toolkit/forge-core';
import type { LiveryCandidate, LiveryImageCheck, LiveryImageWarning, PackFiles } from '@toolkit/forge-core';
import type { RgbaImage } from '@toolkit/rage-formats';
import { useRef, useState } from 'react';
import { useLang } from '../i18n.tsx';
import { downloadBytes } from '../lib/download.ts';
import { createLayerInWorker, writeLiveryInWorker } from '../lib/write-livery.ts';
import type { useLiveryTemplate } from '../lib/useLiveryTemplate.ts';

/** Ein geladenes, bemaltes Livery-Bild. */
export interface PaintedLivery {
  name: string;
  image: RgbaImage;
  canvas: HTMLCanvasElement;
  check: LiveryImageCheck;
}

/** Was nötig ist, um bei einem Fahrzeug ohne Livery-Ebene eine anzulegen. */
export interface LayerSetup {
  candidates: LiveryCandidate[];
  /** Gewählte Lack-Shader (Nummern in der angezeigten Modelldatei). */
  chosen: ReadonlySet<number>;
  onToggle: (shader: number) => void;
  /** Name der neuen Livery-Textur. */
  textureName: string;
  /** Pfade der Modelldateien und der Texturdateien des Fahrzeugs im Paket. */
  yftPaths: string[];
  ytdPaths: string[];
  /** Pfad der angezeigten Modelldatei. */
  referencePath: string | null;
}

interface Props {
  tpl: ReturnType<typeof useLiveryTemplate>;
  files: PackFiles | null;
  /** Dateiname-Anfang für die ZIP-Datei, wenn mehrere Dateien entstehen. */
  fileBase: string;
  painted: PaintedLivery | null;
  /** Wird mit dem geladenen Bild aufgerufen (die Seite prüft und zeigt es an), oder mit null zum Entfernen. */
  onLoad: (file: File | null) => Promise<void>;
  error: string | null;
  layer: LayerSetup;
}

const baseName = (path: string) => path.split('/').pop() ?? path;

export function LiveryPaintPanel({ tpl, files, fileBase, painted, onLoad, error, layer }: Props) {
  const { s } = useLang();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  if (!tpl.scope) return null;

  const creating = !tpl.scope.hasLayer;
  const tex = tpl.texture;
  const sizeText = tex ? `${tex.width}×${tex.height}` : '';
  const warningText: Record<LiveryImageWarning, string> = {
    resized: s.lvrWarnResized,
    aspect: s.lvrWarnAspect,
    opaque: s.lvrWarnOpaque,
    empty: s.lvrWarnEmpty,
  };
  const usable = layer.candidates.filter((c) => c.hasUv1);
  const canCreate = creating && !!painted && layer.chosen.size > 0 && layer.ytdPaths.length > 0 && !!layer.referencePath && !!files;

  const write = async () => {
    if (!painted || !files || !tex || !tpl.textureName || !tpl.texturePath) return;
    setBusy(true);
    setWriteError(null);
    setDone(null);
    try {
      // Die Textur steht oft in der normalen und in der Hochdetail-Datei (+hi). Beide bekommen die Livery.
      const paths = tpl.textureAllPaths.length > 0 ? tpl.textureAllPaths : [tpl.texturePath];
      const input: Record<string, Uint8Array> = {};
      for (const path of paths) input[baseName(path)] = files[path]!;
      // Das Schreiben dauert einige Sekunden und läuft in einem Hintergrundthread, die Seite bleibt bedienbar.
      const written = await writeLiveryInWorker(tpl.textureName, painted.image, input);
      const names = Object.keys(written);
      if (names.length === 1) {
        downloadBytes(names[0]!, written[names[0]!]!, 'application/octet-stream');
        setDone(s.lvrWriteDone.replace('{file}', names[0]!));
      } else {
        const zipName = `${fileBase}_livery.zip`;
        downloadBytes(zipName, writeZip(written));
        setDone(s.lvrWriteDoneMany.replace('{file}', zipName).replace('{count}', String(names.length)).replace('{list}', names.join(', ')));
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : '';
      setWriteError(`${s.lvrWriteFailed} ${detail}`.trim());
    } finally {
      setBusy(false);
    }
  };

  const createLayer = async () => {
    if (!canCreate || !painted || !files || !layer.referencePath) return;
    setBusy(true);
    setWriteError(null);
    setDone(null);
    setWarnings([]);
    try {
      const yfts: Record<string, Uint8Array> = {};
      for (const path of layer.yftPaths) yfts[baseName(path)] = files[path]!;
      const ytds: Record<string, Uint8Array> = {};
      for (const path of layer.ytdPaths) ytds[baseName(path)] = files[path]!;
      const written = await createLayerInWorker({
        textureName: layer.textureName,
        image: painted.image,
        shaders: [...layer.chosen],
        reference: files[layer.referencePath]!,
        yfts,
        ytds,
      });
      const zipName = `${fileBase}_livery.zip`;
      downloadBytes(zipName, writeZip(written.files));
      setDone(s.lvrLayerDone.replace('{file}', zipName).replace('{count}', String(Object.keys(written.files).length)));
      setWarnings(written.warnings);
    } catch (e) {
      const detail = e instanceof Error ? e.message : '';
      setWriteError(`${s.lvrWriteFailed} ${detail}`.trim());
    } finally {
      setBusy(false);
    }
  };

  const loadControls = (
    <>
      <div className="row-tight">
        <button type="button" className="btn" disabled={!creating && !tex} onClick={() => input.current?.click()}>
          {s.lvrLoad}
        </button>
        {painted ? (
          <button type="button" className="btn btn-small" onClick={() => void onLoad(null)}>
            {s.lvrRemove}
          </button>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          setDone(null);
          setWriteError(null);
          if (file) void onLoad(file);
          e.target.value = '';
        }}
      />
      {error ? <p className="notice notice-error small" role="alert">{error}</p> : null}
    </>
  );

  return (
    <section className="card template-panel">
      <h3>{creating ? s.lvrLayerTitle : s.lvrTitle}</h3>

      {creating ? (
        <>
          <p className="muted small">{s.lvrLayerIntro}</p>
          {layer.candidates.length === 0 || usable.length === 0 ? (
            <p className="notice small">{s.lvrLayerNone}</p>
          ) : (
            <>
              <p className="small">{s.lvrLayerWhich}</p>
              <ul className="layer-list">
                {layer.candidates.map((c) => (
                  <li key={c.shader}>
                    <label className="check">
                      <input type="checkbox" disabled={!c.hasUv1} checked={layer.chosen.has(c.shader)} onChange={() => layer.onToggle(c.shader)} />
                      <span>
                        {c.shader} · {c.preset.replace(/^vehicle_/, '')} · {c.diffuse || '–'}{' '}
                        <span className="muted small">{c.hasUv1 ? s.lvrLayerTriangles.replace('{count}', c.triangles.toLocaleString()) : s.lvrLayerNoUv1}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="muted small">{s.lvrLayerTexture.replace('{name}', layer.textureName)}</p>
              <p className="muted small">{s.lvrHowTo}</p>
              {loadControls}
              {!painted ? <p className="muted small">{s.lvrLayerNeedPng}</p> : null}
              {painted ? (
                <>
                  <dl className="detail-list">
                    <div>
                      <dt>{s.lvrLoaded}</dt>
                      <dd>
                        {painted.name} <span className="muted small">{painted.check.width}×{painted.check.height}</span>
                      </dd>
                    </div>
                  </dl>
                  {painted.check.warnings
                    .filter((w) => w === 'opaque' || w === 'empty')
                    .map((w) => (
                      <p key={w} className="notice notice-warn small">{warningText[w].replace('{size}', sizeText)}</p>
                    ))}
                  <div className="row-tight">
                    <button type="button" className="btn btn-primary" disabled={busy || !canCreate} onClick={() => void createLayer()}>
                      {busy ? s.lvrLayerWriting : s.lvrLayerWrite}
                    </button>
                  </div>
                </>
              ) : null}
              <p className="muted small">{s.lvrLayerNote}</p>
            </>
          )}
          {writeError ? <p className="notice notice-error small" role="alert">{writeError}</p> : null}
          {done ? <p className="notice notice-ok small" role="status">{done}</p> : null}
          {warnings.length > 0 ? <p className="notice notice-warn small" role="status">{s.lvrLayerWarn.replace('{list}', warnings.join(' '))}</p> : null}
        </>
      ) : (
        <>
          <p className="muted small">{s.lvrIntro}</p>
          <p className="muted small">{s.lvrHowTo}</p>
          {tpl.baseStatus === 'missing' ? <p className="notice small">{s.lvrNoTexture.replace('{name}', tpl.textureName ?? '')}</p> : null}

          {loadControls}

          {painted && tex ? (
            <>
              <dl className="detail-list">
                <div>
                  <dt>{s.lvrLoaded}</dt>
                  <dd>
                    {painted.name} <span className="muted small">{painted.check.width}×{painted.check.height}</span>
                  </dd>
                </div>
              </dl>
              {painted.check.warnings.map((w) => (
                <p key={w} className="notice notice-warn small">{warningText[w].replace('{size}', sizeText)}</p>
              ))}
              <p className="muted small">{s.lvrFormatNote.replace('{size}', sizeText).replace('{format}', tex.format)}</p>
              <div className="row-tight">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void write()}>
                  {busy ? s.lvrWriting : s.lvrWrite}
                </button>
              </div>
            </>
          ) : null}
          {writeError ? <p className="notice notice-error small" role="alert">{writeError}</p> : null}
          {done ? <p className="notice notice-ok small" role="status">{done}</p> : null}
        </>
      )}
    </section>
  );
}
