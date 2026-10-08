import type { AddedPart, PackFiles, VehiclePart } from '@toolkit/forge-core';
import type { Yft } from '@toolkit/rage-formats';
import { useState } from 'react';
import { useLang } from '../i18n.tsx';
import { downloadBytes } from '../lib/download.ts';
import { buildEditedResource } from '../lib/export-resource.ts';
import type { useVehicleMeta } from '../lib/useVehicleMeta.ts';

interface Props {
  files: PackFiles | null;
  yft: Yft;
  parts: VehiclePart[];
  removed: ReadonlySet<string>;
  yftPaths: string[];
  meta: ReturnType<typeof useVehicleMeta>;
  /** Spawn-Name des Fahrzeugs, wird zum Namen der Resource. */
  model: string;
  /** Anzeigename für das Spiel (wird als vehicle_names.lua mitgegeben), leer = keiner. */
  displayName: string;
  /** Neue Anbauteile, die beim Laden eingebaut werden. */
  added: AddedPart[];
}

/** Fasst alle Änderungen am Fahrzeug zusammen und lädt sie als fertige Resource herunter. */
export function EditorExportCard({ files, yft, parts, removed, yftPaths, meta, model, displayName, added }: Props) {
  const { s } = useLang();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const metaNames = Object.keys(meta.changedFiles).map((p) => p.split('/').pop()!);
  const nothing = removed.size === 0 && metaNames.length === 0 && displayName.trim() === '' && added.length === 0;

  const download = async () => {
    if (!files) return;
    setBusy(true);
    setError(null);
    setDone(null);
    setWarnings([]);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const resourceName = model.toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || 'fahrzeug';
      const result = buildEditedResource({ files, yft, parts, removed, yftPaths, metaFiles: meta.changedFiles, resourceName, displayName, added });
      downloadBytes(`${resourceName}.zip`, result.zip);
      setWarnings(result.addedFailures.map((f) => s.expAddedFailed.replace('{file}', f.file).replace('{message}', f.message)));
      setDone(
        s.expDone
          .replace('{file}', `${resourceName}.zip`)
          .replace('{triangles}', result.removedTriangles.toLocaleString())
          .replace('{metas}', result.changedMetas.join(', ') || '–'),
      );
    } catch (e) {
      setError(`${s.expFailed} ${e instanceof Error ? e.message : ''}`.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card template-panel export-card">
      <h3>{s.expTitle}</h3>
      {nothing ? (
        <p className="muted small">{s.expNothing}</p>
      ) : (
        <ul className="small export-list">
          {removed.size > 0 ? <li>{s.expParts.replace('{count}', String(removed.size))}</li> : null}
          {added.length > 0 ? <li>{s.expAdded.replace('{count}', String(added.length))}</li> : null}
          {metaNames.map((n) => (
            <li key={n}>{s.expMeta.replace('{file}', n)}</li>
          ))}
        </ul>
      )}
      <button type="button" className="btn btn-primary" disabled={busy || !files} onClick={() => void download()}>
        {busy ? s.expBusy : s.expDownload}
      </button>
      <p className="muted small">{s.expNote}</p>
      {error ? <p className="notice notice-error small" role="alert">{error}</p> : null}
      {done ? <p className="notice notice-ok small" role="status">{done}</p> : null}
      {warnings.map((w) => (
        <p key={w} className="notice notice-error small" role="alert">{w}</p>
      ))}
    </section>
  );
}
