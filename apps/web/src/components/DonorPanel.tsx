import { buildVehicleParts, donorToAddedModel } from '@toolkit/forge-core';
import type { AddedModel, TextureSource, VehiclePart } from '@toolkit/forge-core';
import { YftReadError, decodeTexture, levelForPreview, readYdr, readYft } from '@toolkit/rage-formats';
import type { Yft } from '@toolkit/rage-formats';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useLang } from '../i18n.tsx';
import { ArchiveError, fromFileList, readPack } from '../lib/pack-input.ts';
import { readPackTextures } from '../lib/vehicle-textures.ts';
import type { PackTexture } from '../lib/vehicle-textures.ts';
import { VehicleViewport } from './VehicleViewport.tsx';
import type { CameraCommand } from './VehicleViewport.tsx';

interface Props {
  /** Das eigene Fahrzeug, in das die Teile kommen. */
  target: Yft;
  targetParts: VehiclePart[];
  /** Das fertige Anbauteil. */
  onTake: (build: (id: string) => AddedModel) => void;
}

type PackFiles = Record<string, Uint8Array>;

interface Donor {
  /** Name der gewählten Datei ohne Endung. */
  name: string;
  yft: Yft;
  parts: VehiclePart[];
}

const MAX_TEXTURE = 1024;

/** Alle Teile eines Knochens (Lack, Glas, Licht, Sonstiges), denn ein Stoßfänger besteht aus allen vier. */
interface Group {
  key: string;
  label: VehiclePart['label'];
  parts: VehiclePart[];
  triangleCount: number;
}

function groupByBone(parts: VehiclePart[], lang: 'de' | 'en'): Group[] {
  const map = new Map<string, Group>();
  for (const p of parts) {
    let g = map.get(p.bone);
    if (!g) map.set(p.bone, (g = { key: p.bone, label: p.label, parts: [], triangleCount: 0 }));
    g.parts.push(p);
    g.triangleCount += p.triangleCount;
  }
  return [...map.values()].sort((a, b) => a.label[lang].localeCompare(b.label[lang], lang, { numeric: true }));
}
const isModelPath = (path: string) => /\.(yft|ydr)$/i.test(path);

/** Die normale Fassung vor der Hochdetail-Fassung (_hi), dann der kürzeste Name. */
function preferred(paths: string[]): string {
  return [...paths].sort((a, b) => Number(/_hi\./i.test(a)) - Number(/_hi\./i.test(b)) || a.length - b.length)[0]!;
}

const baseName = (path: string) => path.split('/').pop() ?? path;
const stem = (path: string) => baseName(path).replace(/\.[^.]+$/, '');
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function DonorPanel({ target, targetParts, onTake }: Props) {
  const { s, lang } = useLang();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<PackFiles | null>(null);
  const [textures, setTextures] = useState<Map<string, PackTexture>>(new Map());
  const [paths, setPaths] = useState<string[]>([]);
  const [donor, setDonor] = useState<Donor | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [command, setCommand] = useState<CameraCommand | null>(null);
  const nonce = useRef(0);

  const groups = useMemo(() => (donor ? groupByBone(donor.parts, lang) : []), [donor, lang]);
  const [filter, setFilter] = useState('');
  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? groups.filter((g) => g.label[lang].toLowerCase().includes(needle) || g.key.toLowerCase().includes(needle)) : groups;
  }, [groups, filter, lang]);
  const groupOfPart = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) for (const p of g.parts) map.set(p.id, g.key);
    return map;
  }, [groups]);
  const everyId = useMemo(() => new Set(donor?.parts.map((p) => p.id) ?? []), [donor]);
  const selectedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of groups) if (checked.has(g.key)) for (const p of g.parts) ids.add(p.id);
    return ids;
  }, [groups, checked]);
  const triangles = useMemo(() => (donor ? donor.parts.filter((p) => selectedIds.has(p.id)).reduce((sum, p) => sum + p.triangleCount, 0) : 0), [donor, selectedIds]);

  const open = useCallback(
    async (all: PackFiles, path: string) => {
      setBusy(true);
      setError(null);
      try {
        await tick();
        const bytes = all[path]!;
        const yft = /\.ydr$/i.test(path) ? readYdr(bytes) : readYft(bytes);
        const built = buildVehicleParts(yft);
        setDonor({ name: stem(path), yft, parts: built.parts });
        setChecked(new Set());
        setFilter('');
        nonce.current++;
        setCommand({ kind: 'preset', preset: 'iso', nonce: nonce.current });
      } catch (e) {
        const code = e instanceof YftReadError ? e.code : 'corrupt';
        setError(`${s.vehLoadFailed} ${s.vehErrors[code]}`);
        setDonor(null);
      } finally {
        setBusy(false);
      }
    },
    [s],
  );

  const load = async (list: File[]) => {
    setBusy(true);
    setError(null);
    try {
      const collected = await readPack(fromFileList(list));
      const found = Object.keys(collected).filter(isModelPath).sort();
      if (found.length === 0) throw new Error(s.vehNoYft);
      await tick();
      setTextures(readPackTextures(collected));
      setFiles(collected);
      setPaths(found);
      await open(collected, preferred(found));
    } catch (e) {
      if (e instanceof ArchiveError) setError(`${s.vehArchiveFailed} ${e.code === 'encrypted' ? s.vehArchiveEncrypted : e.message}`);
      else setError(`${s.vehLoadFailed} ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  };

  const close = () => {
    setFiles(null);
    setPaths([]);
    setDonor(null);
    setChecked(new Set());
    setTextures(new Map());
    setError(null);
  };

  const toggle = (key: string) =>
    setChecked((old) => {
      const next = new Set(old);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const textureOf = (name: string): TextureSource | null => {
    const hit = textures.get(name.toLowerCase());
    if (!hit) return null;
    try {
      const image = decodeTexture(hit.texture, levelForPreview(hit.texture, MAX_TEXTURE));
      return { name: hit.texture.name, width: image.width, height: image.height, rgba: image.data };
    } catch {
      return null;
    }
  };

  const take = () => {
    if (!donor || selectedIds.size === 0) return;
    const chosen = donor.parts.filter((p) => selectedIds.has(p.id));
    const labels = groups.filter((g) => checked.has(g.key)).map((g) => g.label[lang]);
    const label = labels[0]! + (labels.length > 1 ? ` ${s.donorMore.replace('{count}', String(labels.length - 1))}` : '');
    try {
      onTake((id) =>
        donorToAddedModel({
          id,
          name: s.donorName.replace('{file}', donor.name).replace('{label}', label),
          donor: donor.yft,
          parts: chosen,
          textureOf,
          target,
          targetParts,
        }),
      );
      setChecked(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="card template-panel donor-panel">
      <h3>{s.donorTitle}</h3>
      <p className="muted small">{s.donorIntro}</p>
      <div className="row-tight">
        <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>{s.donorLoad}</button>
        {files ? <button type="button" className="btn btn-small" onClick={close}>{s.donorClose}</button> : null}
      </div>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept=".yft,.ydr,.ytd,.zip,.rar,.7z"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) void load([...e.target.files]);
          e.target.value = '';
        }}
      />
      {error ? <p className="notice notice-error small" role="alert">{error}</p> : null}
      {donor && files ? (
        <>
          {paths.length > 1 ? (
            <label className="field">
              <span>{s.donorFile}</span>
              <select value={paths.find((p) => stem(p) === donor.name) ?? paths[0]} onChange={(e) => void open(files, e.target.value)}>
                {paths.map((p) => (
                  <option key={p} value={p}>{baseName(p)}</option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="donor-preview">
            <VehicleViewport
              yft={donor.yft}
              parts={donor.parts}
              visible={everyId}
              selected={selectedIds}
              wireframe={false}
              paintColor="#9aa0a6"
              livery={null}
              diffuse={null}
              command={command}
              noWebGlText={s.vehNoWebGL}
              onPick={(id) => {
                const key = id ? groupOfPart.get(id) : undefined;
                if (key) toggle(key);
              }}
            />
          </div>
          {textures.size === 0 ? <p className="notice notice-warn small" role="status">{s.donorNoTextures}</p> : null}
          <h4 className="add-subtitle">{s.donorPick}</h4>
          <input type="search" className="donor-filter" value={filter} placeholder={s.donorFilter} aria-label={s.donorFilter} onChange={(e) => setFilter(e.target.value)} />
          <ul className="donor-list">
            {shown.map((g) => (
              <li key={g.key}>
                <label className="check small">
                  <input type="checkbox" checked={checked.has(g.key)} onChange={() => toggle(g.key)} />
                  {g.label[lang]}
                  <span className="muted"> · {g.triangleCount.toLocaleString()}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="small">{s.donorSelection.replace('{parts}', String(checked.size)).replace('{triangles}', triangles.toLocaleString())}</p>
          <div className="row-tight">
            <button type="button" className="btn btn-primary" disabled={checked.size === 0} onClick={take}>{s.donorTake}</button>
            <button type="button" className="btn btn-small" disabled={checked.size === 0} onClick={() => setChecked(new Set())}>{s.donorNone}</button>
          </div>
          <p className="muted small">{s.donorNote}</p>
        </>
      ) : null}
    </section>
  );
}
