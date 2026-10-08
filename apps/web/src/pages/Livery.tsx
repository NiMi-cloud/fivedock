import { CATEGORY_ORDER, boneWorldPositions, buildVehicleParts, checkLiveryImage, groupPartsByBone, liveryCandidates, liveryTextureName, planAddedParts, retargetAdded, sirenBoneNumbers } from '@toolkit/forge-core';
import type { AddedPart, PackFiles, PartCategory, VehiclePart } from '@toolkit/forge-core';
import { YftReadError, readYft } from '@toolkit/rage-formats';
import type { Yft } from '@toolkit/rage-formats';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LiveryPaintPanel } from '../components/LiveryPaintPanel.tsx';
import type { LayerSetup, PaintedLivery } from '../components/LiveryPaintPanel.tsx';
import { LiveryTemplatePanel } from '../components/LiveryTemplatePanel.tsx';
import { AddPartsPanel, addedExtras } from '../components/AddPartsPanel.tsx';
import { EditorExportCard } from '../components/EditorExportCard.tsx';
import { VehicleEditPanel } from '../components/VehicleEditPanel.tsx';
import { HandlingPanel, LightsPanel, VehicleDataPanel } from '../components/VehicleMetaPanels.tsx';
import type { SirenBone } from '../components/VehicleMetaPanels.tsx';
import { UvSheet } from '../components/UvSheet.tsx';
import { VehicleViewport } from '../components/VehicleViewport.tsx';
import type { CameraCommand, LiveryOverlay, SirenMarker, ViewPreset } from '../components/VehicleViewport.tsx';
import { useLang } from '../i18n.tsx';
import { drawRgba, decodeImageFile } from '../lib/image.ts';
import { useLiveryTemplate } from '../lib/useLiveryTemplate.ts';
import { useVehicleMeta } from '../lib/useVehicleMeta.ts';
import { useVehicleTextures } from '../lib/useVehicleTextures.ts';
import { ArchiveError, fromDataTransfer, fromFileList, readPack } from '../lib/pack-input.ts';
import type { InputFile } from '../lib/pack-input.ts';
import { readPackTextures } from '../lib/vehicle-textures.ts';
import type { PackTexture } from '../lib/vehicle-textures.ts';

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const isYftPath = (path: string) => path.toLowerCase().endsWith('.yft');
const baseName = (path: string) => path.split('/').pop() ?? path;

/** Wählt aus mehreren .yft-Dateien die normale Fassung vor der Hochdetail-Fassung (_hi). */
function preferredYft(paths: string[]): string {
  return [...paths].sort((a, b) => Number(/_hi\./i.test(a)) - Number(/_hi\./i.test(b)) || a.length - b.length)[0]!;
}

const fmt = (n: number) => n.toLocaleString();

export function Livery({ mode = 'livery' }: { mode?: 'livery' | 'editor' }) {
  const { s, lang } = useLang();
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [files, setFiles] = useState<PackFiles | null>(null);
  const [yftPaths, setYftPaths] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [yft, setYft] = useState<Yft | null>(null);
  const yftRef = useRef<Yft | null>(null);
  yftRef.current = yft;
  const [textures, setTextures] = useState<ReadonlyMap<string, PackTexture>>(new Map());
  const [stage, setStage] = useState<'car' | 'sheet'>('car');
  const [panel, setPanel] = useState<'parts' | 'template' | 'paint' | 'edit' | 'add' | 'vehicle' | 'handling' | 'lights'>(mode === 'editor' ? 'edit' : 'parts');
  const [markers, setMarkers] = useState<SirenMarker[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [markerBpm, setMarkerBpm] = useState(650);
  const [playing, setPlaying] = useState(false);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [added, setAdded] = useState<AddedPart[]>([]);
  const [addedSelected, setAddedSelected] = useState<string | null>(null);
  const [layerChosen, setLayerChosen] = useState<ReadonlySet<number>>(new Set());
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [painted, setPainted] = useState<PaintedLivery | null>(null);
  const [paintError, setPaintError] = useState<string | null>(null);
  const [showLivery, setShowLivery] = useState(true);
  const [showTextures, setShowTextures] = useState(true);
  const [paintColor, setPaintColor] = useState('#c7ccd6');
  const [parts, setParts] = useState<VehiclePart[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [hiddenCategories, setHiddenCategories] = useState<Set<PartCategory>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [wireframe, setWireframe] = useState(false);
  const [command, setCommand] = useState<CameraCommand | null>(null);
  const nonce = useRef(0);

  const groups = useMemo(() => groupPartsByBone(parts), [parts]);
  const groupOfPart = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) for (const p of g.parts) map.set(p.id, g.key);
    return map;
  }, [groups]);
  const selectedGroup = groups.find((g) => g.key === selectedKey) ?? null;
  const selectedIds = useMemo(
    () => (panel === 'edit' ? new Set(pickedId ? [pickedId] : []) : new Set(selectedGroup?.parts.map((p) => p.id) ?? [])),
    [panel, pickedId, selectedGroup],
  );
  const tpl = useLiveryTemplate(yft, groups, textures, selectedKey, lang);
  const modelName = useMemo(() => (current ? baseName(current).replace(/\.yft$/i, '').replace(/_hi$/i, '') : null), [current]);

  // Fahrzeuge ohne Livery-Ebene: Lack-Materialien, die sich auf paint3 umstellen lassen, und die Dateien, in die geschrieben wird.
  const layerCandidates = useMemo(() => (yft && tpl.scope && !tpl.scope.hasLayer ? liveryCandidates(yft, parts) : []), [yft, parts, tpl.scope]);
  useEffect(() => {
    setLayerChosen(new Set(layerCandidates.filter((c) => c.recommended).map((c) => c.shader)));
  }, [layerCandidates]);
  const layerPartIds = useMemo(() => new Set(layerCandidates.filter((c) => layerChosen.has(c.shader)).flatMap((c) => c.partIds)), [layerCandidates, layerChosen]);
  const layer = useMemo<LayerSetup>(() => {
    const normalized = (path: string) => baseName(path).toLowerCase().replace(/\+hi(?=\.ytd$)/, '');
    return {
      candidates: layerCandidates,
      chosen: layerChosen,
      onToggle: (shader) =>
        setLayerChosen((prev) => {
          const next = new Set(prev);
          if (next.has(shader)) next.delete(shader);
          else next.add(shader);
          return next;
        }),
      textureName: liveryTextureName(modelName ?? 'vehicle', textures.keys()),
      yftPaths,
      ytdPaths: modelName && files ? Object.keys(files).filter((path) => /\.ytd$/i.test(path) && normalized(path) === `${modelName.toLowerCase()}.ytd`) : [],
      referencePath: current,
    };
  }, [layerCandidates, layerChosen, modelName, textures, yftPaths, files, current]);
  const meta = useVehicleMeta(mode === 'editor' ? files : null, modelName);
  const sirenBones = useMemo<SirenBone[]>(() => {
    if (!yft) return [];
    const world = boneWorldPositions(yft.bones);
    const wanted = new Set(sirenBoneNumbers(yft.bones.map((b) => b.name)));
    const existing = [...yft.bones].sort((a, b) => a.index - b.index).flatMap((b) => {
      const m = /^siren(\d+)$/i.exec(b.name);
      return m && wanted.has(Number(m[1])) ? [{ number: Number(m[1]), position: world[b.index]! }] : [];
    });
    // Sirenen der geplanten Anbauteile zählen schon mit, damit ihre Lichter im Reiter Lichter erscheinen.
    let planned: SirenBone[] = [];
    if (added.length > 0) {
      try {
        planned = planAddedParts(yft, added).sirens.map((x) => ({ number: x.number, position: x.position }));
      } catch {
        // die Meldung steht im Reiter Anbauteile
      }
    }
    return [...existing, ...planned].sort((a, b) => a.number - b.number);
  }, [yft, added]);
  const extras = useMemo(() => (mode === 'editor' && added.length > 0 ? addedExtras(added, panel === 'add' ? addedSelected : null) : undefined), [mode, added, panel, addedSelected]);
  const showMarkers = mode === 'editor' && panel === 'lights';
  const selectedKeys = useMemo(() => new Set(selectedKey ? [selectedKey] : []), [selectedKey]);
  const selectionInScope = !!selectedKey && !!tpl.scope?.groups.some((g) => g.key === selectedKey);
  const liveryImage = painted?.canvas ?? tpl.existingImage;
  const liveryPartIds = useMemo(() => new Set(tpl.scope?.hasLayer ? tpl.scope.groups.flatMap((g) => g.parts.map((p) => p.id)) : layerPartIds), [tpl.scope, layerPartIds]);
  // Bei einer neu angelegten Ebene liegt die Livery auf UV1, bei einer vorhandenen auf dem Satz, den das Fahrzeug nutzt.
  const overlay = useMemo<LiveryOverlay | null>(
    () => (showLivery && liveryImage && liveryPartIds.size > 0 ? { image: liveryImage, uvSet: tpl.scope?.hasLayer ? tpl.liveryUvSet : 1, partIds: liveryPartIds } : null),
    [showLivery, liveryImage, liveryPartIds, tpl.liveryUvSet, tpl.scope],
  );

  const vehicleTextures = useVehicleTextures(yft, parts, textures, showTextures);

  const loadPainted = useCallback(
    async (file: File | null) => {
      setPaintError(null);
      if (!file) {
        setPainted(null);
        return;
      }
      try {
        const image = await decodeImageFile(file);
        const canvas = document.createElement('canvas');
        drawRgba(canvas, image);
        const target = tpl.texture ?? { width: image.width, height: image.height };
        setPainted({ name: file.name, image, canvas, check: checkLiveryImage(image, target) });
        setShowLivery(true);
      } catch (e) {
        setPaintError(`${s.lvrFailed} ${e instanceof Error ? e.message : ''}`.trim());
      }
    },
    [tpl.texture, s],
  );

  const visible = useMemo(() => {
    const set = new Set<string>();
    for (const p of parts) if (!hiddenIds.has(p.id) && !hiddenCategories.has(p.category) && !removed.has(p.id)) set.add(p.id);
    return set;
  }, [parts, hiddenIds, hiddenCategories, removed]);

  const stats = useMemo(() => {
    const triangles = parts.reduce((sum, p) => sum + p.triangleCount, 0);
    const counts: Record<PartCategory, number> = { paint: 0, glass: 0, light: 0, tire: 0, other: 0 };
    for (const p of parts) counts[p.category]++;
    return { triangles, counts };
  }, [parts]);

  const openYft = useCallback(
    async (all: PackFiles, path: string) => {
      setBusy(true);
      setError(null);
      try {
        await yieldToUi();
        const model = readYft(all[path]!);
        const built = buildVehicleParts(model);
        // Anbauteile gelten für die Datei, die gerade angezeigt wird: beim Wechsel (zum Beispiel zur Hochdetail-Datei) Material und Knochen übersetzen.
        const previous = yftRef.current;
        if (previous) setAdded((list) => (list.length > 0 ? retargetAdded(list, previous, model) : list));
        setYft(model);
        setParts(built.parts);
        setCurrent(path);
        setHiddenIds(new Set());
        setHiddenCategories(new Set());
        setSelectedKey(null);
        setRemoved(new Set());
        setPickedId(null);
        setSearch('');
        nonce.current++;
        setCommand({ kind: 'preset', preset: 'iso', nonce: nonce.current });
      } catch (e) {
        const code = e instanceof YftReadError ? e.code : 'corrupt';
        setError(`${s.vehLoadFailed} ${s.vehErrors[code]}`);
        setYft(null);
        setParts([]);
      } finally {
        setBusy(false);
      }
    },
    [s],
  );

  const loadInputs = useCallback(
    async (inputs: InputFile[]) => {
      setBusy(true);
      setError(null);
      setStatus(null);
      try {
        const collected = await readPack(inputs, {
          onFile: (name) => setStatus(/\.(rar|7z)$/i.test(name) ? `${s.vehUnpacking} ${name}` : null),
        });
        const paths = Object.keys(collected).filter(isYftPath).sort();
        if (paths.length === 0) throw new Error(s.vehNoYft);
        await yieldToUi();
        setTextures(readPackTextures(collected));
        setAdded([]);
        setAddedSelected(null);
        setFiles(collected);
        setYftPaths(paths);
        await openYft(collected, preferredYft(paths));
      } catch (e) {
        if (e instanceof ArchiveError) {
          setError(`${s.vehArchiveFailed} ${e.code === 'encrypted' ? s.vehArchiveEncrypted : e.message}`);
        } else {
          setError(`${s.vehLoadFailed} ${e instanceof Error ? e.message : String(e)}`);
        }
        setBusy(false);
      } finally {
        setStatus(null);
      }
    },
    [openYft, s],
  );

  const clear = () => {
    setFiles(null);
    setAdded([]);
    setAddedSelected(null);
    setTextures(new Map());
    setPainted(null);
    setPaintError(null);
    setStage('car');
    setYft(null);
    setParts([]);
    setYftPaths([]);
    setCurrent(null);
    setError(null);
  };

  const view = (preset: ViewPreset) => {
    nonce.current++;
    setCommand({ kind: 'preset', preset, nonce: nonce.current });
  };

  /** Macht die Teile einer Gruppe sichtbar, falls sie ausgeblendet sind (einzeln oder über ihre Art). */
  const reveal = (group: (typeof groups)[number]) => {
    const ids = new Set(group.parts.map((p) => p.id));
    setHiddenIds((prev) => {
      let next = prev;
      if (hiddenCategories.has(group.category)) {
        // Die ganze Art ist ausgeblendet: Sie wird eingeschaltet, die anderen Teile dieser Art bleiben einzeln ausgeblendet.
        next = new Set(prev);
        for (const p of parts) if (p.category === group.category && !ids.has(p.id)) next.add(p.id);
      }
      if ([...ids].some((id) => next.has(id))) {
        next = new Set(next);
        for (const id of ids) next.delete(id);
      }
      return next;
    });
    if (hiddenCategories.has(group.category)) {
      setHiddenCategories((prev) => {
        const next = new Set(prev);
        next.delete(group.category);
        return next;
      });
    }
  };

  const selectKey = (key: string | null, focus = false) => {
    setSelectedKey(key);
    const group = key ? groups.find((g) => g.key === key) : undefined;
    // Ein gewähltes Teil soll auch zu sehen sein, zum Beispiel nach „Nur Auswahl zeigen“ oder „Ausblenden“.
    if (group) reveal(group);
    if (focus && group) {
      nonce.current++;
      setCommand({ kind: 'focus', partIds: group.parts.map((p) => p.id), nonce: nonce.current });
    }
  };

  const toggleCategory = (c: PartCategory) =>
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const hideSelection = () => setHiddenIds((prev) => new Set([...prev, ...selectedIds]));
  const showAll = () => {
    setHiddenIds(new Set());
    setHiddenCategories(new Set());
  };
  const onlySelection = () => {
    const others = parts.filter((p) => !selectedIds.has(p.id)).map((p) => p.id);
    setHiddenIds(new Set(others));
    setHiddenCategories(new Set());
  };

  const needle = search.trim().toLowerCase();
  const shownGroups = groups.filter(
    (g) => !needle || g.bone.toLowerCase().includes(needle) || g.label.de.toLowerCase().includes(needle) || g.label.en.toLowerCase().includes(needle),
  );

  const details = useMemo(() => {
    if (!selectedGroup || !yft) return null;
    const geometries = [...new Set(selectedGroup.parts.map((p) => p.geometry))];
    const shaders = [...new Set(selectedGroup.parts.map((p) => p.shader))];
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const p of selectedGroup.parts) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, p.boundsMin[k]!);
        max[k] = Math.max(max[k]!, p.boundsMax[k]!);
      }
    }
    const uvSets = new Set<number>();
    for (const gi of geometries) yft.geometries[gi]!.uvs.forEach((u, i) => u && uvSets.add(i));
    const presets = shaders.map((i) => yft.shaders[i]?.preset ?? '?');
    const textures = [...new Set(shaders.flatMap((i) => yft.shaders[i]?.textures.filter((t) => t.param === 'DiffuseSampler' && t.name).map((t) => t.name) ?? []))];
    return {
      geometries: geometries.length,
      presets: [...new Set(presets)],
      textures,
      uv: [...uvSets].sort().map((i) => `UV${i}`),
      size: [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!],
    };
  }, [selectedGroup, yft]);

  const steps: Array<[string, 'done' | 'wip' | 'open']> = [
    [s.vehStepView, 'done'],
    [s.vehStepTemplate, 'done'],
    [s.vehStepWrite, 'open'],
    [s.vehStepGame, 'open'],
  ];
  const stateLabel = { done: s.vehStateDone, wip: s.vehStateWip, open: s.vehStateOpen } as const;
  const viewButtons: Array<[ViewPreset, string]> = [
    ['iso', s.vehViewIso],
    ['front', s.vehViewFront],
    ['side', s.vehViewSide],
    ['rear', s.vehViewRear],
    ['top', s.vehViewTop],
  ];

  if (!yft) {
    return (
      <main className="container">
        <header className="page-head">
          <h1>{mode === 'editor' ? s.edtPageTitle : s.vehTitle}</h1>
          <p className="lead">{mode === 'editor' ? s.edtPageIntro : s.vehIntro}</p>
          <p className="muted small lab-limits">{mode === 'editor' ? s.edtStatus : s.vehStatus}</p>
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
            void fromDataTransfer(e.dataTransfer).then((inputs) => (inputs.length > 0 ? loadInputs(inputs) : undefined));
          }}
        >
          <h2>{s.vehDropTitle}</h2>
          <p>{s.vehDropHint}</p>
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => input.current?.click()}>
              {s.vehDropButton}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => folderInput.current?.click()}>
              {s.vehDropFolder}
            </button>
          </div>
        </div>
        {busy ? <p className="notice" role="status">{status ?? s.vehLoading}</p> : null}
        {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept=".zip,.rar,.7z,.yft,.ytd"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) void loadInputs(fromFileList(e.target.files));
            e.target.value = '';
          }}
        />
        <input
          ref={folderInput}
          type="file"
          hidden
          {...{ webkitdirectory: '', directory: '' }}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) void loadInputs(fromFileList(e.target.files));
            e.target.value = '';
          }}
        />
      </main>
    );
  }

  return (
    <main className="vehicle-page">
      <div className="vehicle-layout">
        <section className="vehicle-stage" aria-label={s.vehTitle}>
          <div className="vehicle-toolbar">
            {mode === 'livery' ? (
            <div className="segmented" role="tablist" aria-label="Bereich">
              <button type="button" role="tab" aria-selected={stage === 'car'} className={stage === 'car' ? 'is-active' : undefined} onClick={() => { setStage('car'); if (panel === 'template') setPanel('parts'); }}>
                {s.vehTab3d}
              </button>
              <button type="button" role="tab" aria-selected={stage === 'sheet'} className={stage === 'sheet' ? 'is-active' : undefined} onClick={() => { setStage('sheet'); setPanel('template'); }}>
                {s.vehTabSheet}
              </button>
            </div>
          ) : null}
            {stage === 'car' ? (
              <>
                <div className="row-tight" role="group" aria-label="Ansicht">
                  {viewButtons.map(([preset, label]) => (
                    <button key={preset} type="button" className="btn btn-small" onClick={() => view(preset)}>
                      {label}
                    </button>
                  ))}
                </div>
                {liveryImage ? (
                  <label className="check">
                    <input type="checkbox" checked={showLivery} onChange={(e) => setShowLivery(e.target.checked)} />
                    {s.vehShowLivery}
                  </label>
                ) : null}
                {textures.size > 0 ? (
                  <label className="check">
                    <input type="checkbox" checked={showTextures} onChange={(e) => setShowTextures(e.target.checked)} />
                    {s.vehShowTextures}
                    {showTextures && vehicleTextures.progress ? <span className="muted small"> {vehicleTextures.progress[0]}/{vehicleTextures.progress[1]}</span> : null}
                  </label>
                ) : null}
                <label className="check">
                  <input type="color" value={paintColor} onChange={(e) => setPaintColor(e.target.value)} className="color-input" />
                  {s.vehPaintColor}
                </label>
                <label className="check">
                  <input type="checkbox" checked={wireframe} onChange={(e) => setWireframe(e.target.checked)} />
                  {s.vehWireframe}
                </label>
                <button type="button" className="btn btn-small" onClick={showAll} disabled={hiddenIds.size === 0 && hiddenCategories.size === 0}>
                  {s.vehShowAll}
                </button>
              </>
            ) : null}
          </div>
          <div hidden={stage !== 'car'}>
            <VehicleViewport
              yft={yft}
              parts={parts}
              visible={visible}
              selected={selectedIds}
              wireframe={wireframe}
              paintColor={paintColor}
              livery={overlay}
              markers={showMarkers ? markers : undefined}
              markerBpm={markerBpm}
              markersPlaying={playing}
              extras={extras}
              diffuse={showTextures ? vehicleTextures.images : null}
              command={command}
              noWebGlText={s.vehNoWebGL}
              onPick={(id) => {
                setPickedId(id);
                selectKey(id ? (groupOfPart.get(id) ?? null) : null);
              }}
            />
          </div>
          {stage === 'sheet' ? (
            <UvSheet
              layout={tpl.layout}
              outlines={tpl.outlines}
              islands={tpl.islands}
              styles={tpl.styles}
              base={painted?.canvas ?? tpl.baseImage}
              fill={tpl.fill}
              labels={tpl.labels}
              selectedKeys={selectedKeys}
              onPick={(key) => selectKey(key)}
              emptyText={s.tplEmpty}
            />
          ) : null}
          <p className="vehicle-hint muted small">{stage === 'car' ? s.vehHint : s.tplSheetHint}</p>
        </section>

        <aside className="vehicle-side">
          <section className="card">
            <div className="card-head">
              <h3 className="file-title" title={yft.name}>{yft.name.replace(/^pack:\//, '') || s.vehTitle}</h3>
              <button type="button" className="btn btn-small" onClick={clear}>{s.vehClear}</button>
            </div>
            {yftPaths.length > 1 && files ? (
              <label className="field">
                <span>{s.vehFile}</span>
                <select value={current ?? ''} disabled={busy} onChange={(e) => void openYft(files, e.target.value)}>
                  {yftPaths.map((p) => (
                    <option key={p} value={p}>{baseName(p)}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <dl className="stats">
              <div><dt>{s.vehParts}</dt><dd>{fmt(groups.length)}</dd></div>
              <div><dt>{s.vehTriangles}</dt><dd>{fmt(stats.triangles)}</dd></div>
              <div><dt>{s.vehMaterials}</dt><dd>{fmt(yft.shaders.length)}</dd></div>
              <div><dt>{s.vehBones}</dt><dd>{fmt(yft.bones.length)}</dd></div>
            </dl>
            {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
          </section>

          {mode === 'editor' && modelName ? (
            <EditorExportCard files={files} yft={yft} parts={parts} removed={removed} yftPaths={yftPaths} meta={meta} model={modelName} displayName={displayName} added={added} />
          ) : null}

          <div className="segmented segmented-wide" role="tablist" aria-label="Schritte">
            {(
              (mode === 'editor'
                ? [
                    ['parts', s.vehPanelParts],
                    ['edit', s.edtPanel],
                    ['add', s.addPanel],
                    ['vehicle', s.prpPanelVehicle],
                    ['handling', s.prpPanelHandling],
                    ['lights', s.prpPanelLights],
                  ]
                : [
                    ['parts', s.vehPanelParts],
                    ['template', s.vehPanelTemplate],
                    ['paint', s.vehPanelPaint],
                  ]) as ReadonlyArray<readonly ['parts' | 'template' | 'paint' | 'edit' | 'add' | 'vehicle' | 'handling' | 'lights', string]>
            ).map(([key, label], i) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={panel === key}
                className={panel === key ? 'is-active' : undefined}
                onClick={() => {
                  setPanel(key);
                  if (key === 'template') setStage('sheet');
                  else setStage('car');
                }}
              >
                {i + 1} {label}
              </button>
            ))}
          </div>

          {panel === 'parts' ? (
            <>
            <section className="card vehicle-parts">
              <h3>{s.vehPartList}</h3>
              <input type="text" value={search} placeholder={s.vehSearch} onChange={(e) => setSearch(e.target.value)} aria-label={s.vehSearch} />
              <div className="chips" role="group" aria-label="Arten">
                {CATEGORY_ORDER.filter((c) => stats.counts[c] > 0).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`chip chip-${c}${hiddenCategories.has(c) ? ' is-off' : ''}`}
                    aria-pressed={!hiddenCategories.has(c)}
                    onClick={() => toggleCategory(c)}
                  >
                    {s.vehCategories[c]} <span className="muted">{stats.counts[c]}</span>
                  </button>
                ))}
              </div>
              <ul className="part-list">
                {shownGroups.map((g) => {
                  const hidden = g.parts.every((p) => hiddenIds.has(p.id)) || hiddenCategories.has(g.category);
                  return (
                    <li key={g.key} className={`part${g.key === selectedKey ? ' is-selected' : ''}${hidden ? ' is-hidden' : ''}`}>
                      <button type="button" className="part-main" onClick={() => selectKey(g.key === selectedKey ? null : g.key, true)}>
                        <span className={`dot dot-${g.category}`} aria-hidden="true" />
                        <span className="part-name">{g.label[lang]}</span>
                        <span className="muted small">{fmt(g.triangleCount)}</span>
                      </button>
                      <button
                        type="button"
                        className="part-eye"
                        aria-label={hidden ? s.vehShowAll : s.vehHide}
                        title={hidden ? s.vehShowAll : s.vehHide}
                        onClick={() =>
                          setHiddenIds((prev) => {
                            const next = new Set(prev);
                            const all = g.parts.every((p) => next.has(p.id));
                            for (const p of g.parts) {
                              if (all) next.delete(p.id);
                              else next.add(p.id);
                            }
                            return next;
                          })
                        }
                      >
                        {hidden ? '◌' : '●'}
                      </button>
                    </li>
                  );
                })}
                {shownGroups.length === 0 ? <li className="muted small part-empty">{s.vehNoMatch}</li> : null}
              </ul>
            </section>

            <section className="card">
              <h3>{s.vehDetails}</h3>
              {selectedGroup && details ? (
                <>
                  <p className="detail-title">{selectedGroup.label[lang]}</p>
                  <dl className="detail-list">
                    <div><dt>{s.vehBone}</dt><dd><code>{selectedGroup.bone}</code></dd></div>
                    <div><dt>{s.vehCategory}</dt><dd>{s.vehCategories[selectedGroup.category]}</dd></div>
                    <div><dt>{s.vehTriangles}</dt><dd>{fmt(selectedGroup.triangleCount)}</dd></div>
                    <div><dt>{s.vehGeometries}</dt><dd>{details.geometries}</dd></div>
                    <div><dt>{s.vehShaders}</dt><dd>{details.presets.join(', ')}</dd></div>
                    {details.textures.length > 0 ? <div><dt>{s.vehTextures}</dt><dd>{details.textures.join(', ')}</dd></div> : null}
                    <div><dt>{s.vehUv}</dt><dd>{details.uv.join(', ') || '–'}</dd></div>
                    <div><dt>{s.vehSize}</dt><dd>{details.size.map((v) => v.toFixed(2)).join(' × ')} m</dd></div>
                  </dl>
                  <div className="row-tight">
                    <button type="button" className="btn btn-small" onClick={onlySelection}>{s.vehOnlySelection}</button>
                    <button type="button" className="btn btn-small" onClick={hideSelection}>{s.vehHide}</button>
                  </div>
                </>
              ) : (
                <p className="muted small">{s.vehNoSelection}</p>
              )}
            </section>
            </>
          ) : null}

          {panel === 'template' ? (
            <LiveryTemplatePanel tpl={tpl} fileBase={baseName(current ?? yft.name).replace(/\.[a-z]+$/i, '') || 'fahrzeug'} selectionInScope={selectionInScope} />
          ) : null}

          {panel === 'paint' ? (
            <>
              <LiveryPaintPanel tpl={tpl} files={files} fileBase={baseName(current ?? yft.name).replace(/\.[a-z]+$/i, '') || 'fahrzeug'} painted={painted} onLoad={loadPainted} error={paintError} layer={layer} />

            <section className="card">
              <h3>{s.vehLiveryTitle}</h3>
              <ol className="steps">
                {steps.map(([label, state]) => (
                  <li key={label} className={`step-${state}`}>
                    <span>{label}</span>
                    <span className="muted small">{stateLabel[state]}</span>
                  </li>
                ))}
              </ol>
              <p className="muted small">{s.vehStatus}</p>
            </section>
            </>
          ) : null}

          {panel === 'edit' ? (
            <VehicleEditPanel
              yft={yft}
              parts={parts}
              removed={removed}
              pickedId={pickedId}
              onPick={(id) => {
                setPickedId(id);
                nonce.current++;
                setCommand({ kind: 'focus', partIds: [id], nonce: nonce.current });
              }}
              onToggle={(id) =>
                setRemoved((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onClear={() => setRemoved(new Set())}
              files={files}
              yftPaths={yftPaths}
              fileBase={baseName(current ?? yft.name).replace(/\.[a-z]+$/i, '') || 'fahrzeug'}
            />
          ) : null}

          {panel === 'add' && modelName ? (
            <AddPartsPanel
              yft={yft}
              parts={parts}
              added={added}
              selectedId={addedSelected}
              onSelect={setAddedSelected}
              onChange={setAdded}
              meta={meta}
              model={modelName}
            />
          ) : null}

          {panel === 'vehicle' && modelName ? <VehicleDataPanel meta={meta} model={modelName} displayName={displayName} onDisplayName={setDisplayName} /> : null}
          {panel === 'handling' && modelName ? <HandlingPanel meta={meta} model={modelName} /> : null}
          {panel === 'lights' && modelName ? (
            <LightsPanel
              meta={meta}
              model={modelName}
              bones={sirenBones}
              playing={playing}
              onPlaying={setPlaying}
              onMarkers={(next, bpm) => {
                setMarkers(next);
                setMarkerBpm(bpm);
              }}
            />
          ) : null}
        </aside>
      </div>
      {busy ? <p className="notice vehicle-busy" role="status">{s.vehLoading}</p> : null}
    </main>
  );
}
