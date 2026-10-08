import {
  DEFAULT_LIGHTBAR,
  LIGHTBAR_LIMITS,
  SIREN_PRESETS,
  buildLightbar,
  computeBounds,
  ensureSirenLights,
  placeModelParts,
  planAddedParts,
  readSirenSettings,
  readVariation,
  roofHeight,
  suggestLightbarMaterials,
  suggestRoofPosition,
  toGameSpace,
  usedShaders,
  validateModel,
} from '@toolkit/forge-core';
import type { AddedLightbar, AddedModel, AddedPart, LightbarSpec, PlannedSiren, SirenPresetId, VehiclePart } from '@toolkit/forge-core';
import type { Yft } from '@toolkit/rage-formats';
import { useMemo, useRef, useState } from 'react';
import { useLang } from '../i18n.tsx';
import { drawRgba } from '../lib/image.ts';
import { DonorPanel } from './DonorPanel.tsx';
import { loadModelFiles } from '../lib/loadModel.ts';
import type { useVehicleMeta } from '../lib/useVehicleMeta.ts';
import { NumberField } from './VehicleMetaPanels.tsx';
import type { ExtraMesh } from './VehicleViewport.tsx';

type Meta = ReturnType<typeof useVehicleMeta>;

interface Props {
  yft: Yft;
  parts: VehiclePart[];
  added: AddedPart[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (next: AddedPart[]) => void;
  meta: Meta;
  model: string;
}

/** Zeichenflächen der Modell-Texturen, einmal je Textur (die Vorschau wird oft neu gebaut). */
const canvases = new WeakMap<object, HTMLCanvasElement>();
function canvasOf(texture: { width: number; height: number; rgba: Uint8Array }): HTMLCanvasElement {
  let canvas = canvases.get(texture);
  if (!canvas) {
    canvas = document.createElement('canvas');
    drawRgba(canvas, { width: texture.width, height: texture.height, data: texture.rgba });
    canvases.set(texture, canvas);
  }
  return canvas;
}

/** Netze der Anbauteile für die Vorschau im 3D-Bild: Lichtbalken dunkel mit bläulichen Linsen, Modelle in den Grundfarben ihrer Materialien. */
export function addedExtras(added: AddedPart[], selectedId: string | null): ExtraMesh[] {
  const out: ExtraMesh[] = [];
  for (const part of added) {
    const highlight = part.id === selectedId;
    if (part.kind === 'lightbar') {
      const build = buildLightbar(part.spec);
      out.push({ id: `${part.id}-housing`, ...build.housing, color: '#30343c', highlight });
      out.push({ id: `${part.id}-lens`, ...build.lens, color: '#5aa0ff', glow: true, highlight });
    } else {
      placeModelParts(part).forEach((placed, i) => {
        const textureIndex = part.materialTextures[placed.materialIndex];
        const texture = textureIndex === null || textureIndex === undefined ? undefined : part.textures[textureIndex];
        out.push({
          id: `${part.id}-${i}`,
          positions: placed.positions,
          normals: placed.normals,
          indices: placed.indices,
          color: part.colors[placed.materialIndex] ?? '#808080',
          highlight,
          ...(texture ? { uvs: placed.uvs, image: canvasOf(texture) } : {}),
        });
      });
    }
  }
  return out;
}

/** Sirenen, die die Anbauteile anlegen würden, je Teil (in der Reihenfolge der Teile). */
function sirensPerPart(added: AddedPart[], planned: PlannedSiren[]): PlannedSiren[][] {
  let next = 0;
  return added.map((part) => {
    if (part.kind !== 'lightbar' || !part.sirens) return [];
    const count = buildLightbar(part.spec).lights.length;
    const slice = planned.slice(next, next + count);
    next += count;
    return slice;
  });
}

export function materialLabel(yft: Yft, index: number): string {
  const shader = yft.shaders[index];
  const diffuse = shader?.textures.find((t) => t.param === 'DiffuseSampler')?.name || '–';
  return `${index} · ${(shader?.preset ?? '?').replace(/^vehicle_/, '')} · ${diffuse}`;
}

let counter = 0;
const newId = (kind: string) => `${kind}-${Date.now().toString(36)}-${counter++}`;

const toHex = (c: [number, number, number, number]) =>
  `#${[c[0], c[1], c[2]].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`;

/** Maße der Teile in Metern (nach Größenfaktor). */
function sizeOf(model: AddedModel): [number, number, number] | null {
  const bounds = computeBounds({ name: '', parts: model.parts, materials: [], textures: [] });
  if (!bounds) return null;
  return [(bounds.max[0] - bounds.min[0]) * model.scale, (bounds.max[1] - bounds.min[1]) * model.scale, (bounds.max[2] - bounds.min[2]) * model.scale];
}

export function AddPartsPanel({ yft, parts, added, selectedId, onSelect, onChange, meta, model }: Props) {
  const { s, lang } = useLang();
  const [preset, setPreset] = useState<SirenPresetId>('police-fast');
  const [setupMessage, setSetupMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelProblems, setModelProblems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const modelInput = useRef<HTMLInputElement>(null);

  const materials = useMemo(() => [...usedShaders(yft)].sort((a, b) => a - b), [yft]);
  const suggestion = useMemo(() => suggestLightbarMaterials(yft, parts), [yft, parts]);

  const plan = useMemo(() => {
    try {
      return { ...planAddedParts(yft, added), error: null as string | null };
    } catch (e) {
      return { plan: { bones: [], meshes: [] }, sirens: [] as PlannedSiren[], boneNames: [] as string[], error: e instanceof Error ? e.message : String(e) };
    }
  }, [yft, added]);
  const perPart = useMemo(() => (plan.error ? added.map(() => [] as PlannedSiren[]) : sirensPerPart(added, plan.sirens)), [added, plan]);

  const selected = added.find((a) => a.id === selectedId) ?? null;
  const selectedIndex = selected ? added.indexOf(selected) : -1;
  const selectedSirens = selectedIndex >= 0 ? perPart[selectedIndex]! : [];

  const update = (id: string, change: (part: AddedPart) => AddedPart) => {
    onChange(added.map((a) => (a.id === id ? change(a) : a)));
    setSetupMessage(null);
  };
  const setSpec = (id: string, patch: Partial<LightbarSpec>) => update(id, (a) => (a.kind === 'lightbar' ? { ...a, spec: { ...a.spec, ...patch } } : a));
  const setModel = (id: string, patch: Partial<AddedModel>) => update(id, (a) => (a.kind === 'model' ? { ...a, ...patch } : a));

  const addLightbar = () => {
    const spec: LightbarSpec = { ...DEFAULT_LIGHTBAR };
    const position = suggestRoofPosition(yft, parts, spec);
    if (position) spec.position = position;
    const bar: AddedLightbar = {
      id: newId('lightbar'),
      kind: 'lightbar',
      spec,
      housingShader: suggestion.housing ?? materials[0] ?? 0,
      lensShader: suggestion.lens,
      sirens: true,
      parentBone: 0,
    };
    onChange([...added, bar]);
    onSelect(bar.id);
    setSetupMessage(null);
  };

  /** Welches Material des Fahrzeugs passt zu einem Material des Modells? Nach dem Namen, sonst das schwarze Gehäusematerial. */
  const guessMaterial = (name: string): number => {
    const housing = suggestion.housing ?? materials[0] ?? 0;
    if (/glass|lens|light|lamp|emis|siren|led/i.test(name)) return suggestion.lens ?? housing;
    if (/chrome|metal|steel|silver|alu/i.test(name)) {
      const chrome = materials.find((i) => /chrome/i.test(yft.shaders[i]?.textures.find((t) => t.param === 'DiffuseSampler')?.name ?? ''));
      if (chrome !== undefined) return chrome;
    }
    return housing;
  };

  const addModel = async (files: File[]) => {
    setModelError(null);
    setModelProblems([]);
    setLoading(true);
    try {
      const loaded = await loadModelFiles(files);
      const problems = validateModel(loaded.model);
      if (problems.length > 0) setModelProblems(problems);
      const game = toGameSpace(loaded.model, { upAxis: 'y', scale: 1, centerXY: true, groundZ: true });
      const bounds = computeBounds(game);
      if (!bounds) throw new Error(s.addModelFailed);
      const longest = Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]);
      // Modelle in Zentimetern oder riesige Szenen: auf etwa einen Meter bringen, der Nutzer stellt nach.
      const scale = longest > 6 || longest < 0.05 ? 1 / longest : 1;
      const draft: AddedModel = {
        id: newId('model'),
        kind: 'model',
        name: loaded.fileName,
        parts: game.parts,
        colors: game.materials.map((m) => toHex(m.baseColor)),
        materials: game.materials.map((m) => guessMaterial(m.name)),
        textures: game.textures,
        sourceTextures: game.materials.map((m) => (m.textureIndex !== null && game.textures[m.textureIndex] ? m.textureIndex : null)),
        // Hat das Material im Modell eine Textur, wird sie standardmäßig mitgenommen.
        materialTextures: game.materials.map((m) => (m.textureIndex !== null && game.textures[m.textureIndex] ? m.textureIndex : null)),
        rotation: [0, 0, 0],
        scale,
        position: [0, 0, 0],
        parentBone: 0,
      };
      const footprint = { length: (bounds.max[0] - bounds.min[0]) * scale, depth: (bounds.max[1] - bounds.min[1]) * scale };
      const roof = suggestRoofPosition(yft, parts, footprint);
      if (roof) draft.position = roof;
      onChange([...added, draft]);
      onSelect(draft.id);
    } catch (e) {
      setModelError(`${s.addModelFailed} ${e instanceof Error ? e.message : ''}`.trim());
    } finally {
      setLoading(false);
    }
  };

  const remove = (id: string) => {
    onChange(added.filter((a) => a.id !== id));
    if (selectedId === id) onSelect(null);
  };

  const toRoof = () => {
    if (!selected) return;
    if (selected.kind === 'lightbar') {
      const z = roofHeight(yft, parts, selected.spec.position[0], selected.spec.position[1], selected.spec.length / 2, selected.spec.depth / 2);
      if (z !== null) setSpec(selected.id, { position: [selected.spec.position[0], selected.spec.position[1], z] });
    } else {
      const size = sizeOf(selected);
      const z = roofHeight(yft, parts, selected.position[0], selected.position[1], (size?.[0] ?? 0.2) / 2, (size?.[1] ?? 0.2) / 2);
      if (z !== null) setModel(selected.id, { position: [selected.position[0], selected.position[1], z] });
    }
  };

  const variation = meta.docs.variations;
  const carcols = meta.docs.carcols;
  const sirenId = variation
    ? (() => {
        try {
          return readVariation(variation.text, model)?.sirenSettings ?? 0;
        } catch {
          return 0;
        }
      })()
    : 0;
  const hasSetting = !!carcols && sirenId !== 0 && readSirenSettings(carcols.text).some((x) => x.id === sirenId);

  const setupLights = () => {
    if (!selected || selectedSirens.length === 0) return;
    const error = meta.apply('carcols', (t) =>
      ensureSirenLights(
        t,
        sirenId,
        selectedSirens.map((x) => ({ number: x.number, x: x.position[0] })),
        preset,
      ),
    );
    setSetupMessage(error ? { kind: 'error', text: error } : { kind: 'ok', text: s.addSetupDone });
  };

  const limits = LIGHTBAR_LIMITS;
  const noMaterial = materials.length === 0;
  const partName = (part: AddedPart, i: number) => (part.kind === 'lightbar' ? s.addLightbarName.replace('{n}', String(i + 1)) : s.addModelName.replace('{name}', part.name));
  const partInfo = (part: AddedPart) =>
    part.kind === 'lightbar'
      ? `${part.spec.modules} · ${part.spec.length.toFixed(2)} m`
      : s.addModelTriangles.replace('{count}', part.parts.reduce((sum, p) => sum + p.indices.length / 3, 0).toLocaleString());

  return (
    <>
      <section className="card template-panel">
        <h3>{s.addTitle}</h3>
        <p className="muted small">{s.addIntro}</p>
        <div className="row-tight">
          <button type="button" className="btn btn-primary" disabled={noMaterial} onClick={addLightbar}>{s.addLightbar}</button>
          <button type="button" className="btn" disabled={noMaterial || loading} onClick={() => modelInput.current?.click()}>{s.addModel}</button>
        </div>
        <input
          ref={modelInput}
          type="file"
          multiple
          hidden
          accept=".glb,.gltf,.obj,.mtl,.fbx,.dae,.bin,.png,.jpg,.jpeg,.webp,.tga"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) void addModel([...e.target.files]);
            e.target.value = '';
          }}
        />
        <p className="muted small">{s.addModelHint}</p>
        {modelError ? <p className="notice notice-error small" role="alert">{modelError}</p> : null}
        {modelProblems.length > 0 ? (
          <div className="notice notice-warn small" role="status">
            <p>{s.addModelProblems}</p>
            <ul>{modelProblems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        ) : null}
        {noMaterial ? <p className="notice small">{s.addNoMaterial}</p> : null}
        <h4 className="add-subtitle">{s.addListTitle}</h4>
        {added.length === 0 ? (
          <p className="muted small">{s.addEmpty}</p>
        ) : (
          <ul className="add-list">
            {added.map((part, i) => (
              <li key={part.id} className={part.id === selectedId ? 'is-selected' : undefined}>
                <button type="button" className="add-main" onClick={() => onSelect(part.id === selectedId ? null : part.id)}>
                  {partName(part, i)}
                  <span className="muted small"> · {partInfo(part)}</span>
                </button>
                <button type="button" className="btn btn-small" onClick={() => remove(part.id)}>{s.addRemove}</button>
              </li>
            ))}
          </ul>
        )}
        {plan.error ? <p className="notice notice-error small" role="alert">{plan.error}</p> : null}
        <p className="muted small">{s.addNote}</p>
      </section>

      <DonorPanel
        target={yft}
        targetParts={parts}
        onTake={(build) => {
          const draft = build(newId('model'));
          onChange([...added, draft]);
          onSelect(draft.id);
          setSetupMessage(null);
        }}
      />

      {selected?.kind === 'lightbar' ? (
        <>
          <section className="card template-panel">
            <h3>{s.addSize}</h3>
            <NumberField label={s.addLength} unit="m" value={selected.spec.length} original={DEFAULT_LIGHTBAR.length} min={limits.length[0]} max={limits.length[1]} step={0.01} onChange={(v) => setSpec(selected.id, { length: clamp(v, limits.length) })} />
            <NumberField label={s.addDepth} unit="m" value={selected.spec.depth} original={DEFAULT_LIGHTBAR.depth} min={limits.depth[0]} max={limits.depth[1]} step={0.01} onChange={(v) => setSpec(selected.id, { depth: clamp(v, limits.depth) })} />
            <NumberField label={s.addHeight} unit="m" value={selected.spec.height} original={DEFAULT_LIGHTBAR.height} min={limits.height[0]} max={limits.height[1]} step={0.005} onChange={(v) => setSpec(selected.id, { height: clamp(v, limits.height) })} />
            <NumberField label={s.addModules} value={selected.spec.modules} original={DEFAULT_LIGHTBAR.modules} min={limits.modules[0]} max={limits.modules[1]} step={1} onChange={(v) => setSpec(selected.id, { modules: Math.round(clamp(v, limits.modules)) })} />
            <label className="field">
              <span>{s.addStyle}</span>
              <select value={selected.spec.style} onChange={(e) => setSpec(selected.id, { style: e.target.value as LightbarSpec['style'] })}>
                <option value="flat">{s.addStyleFlat}</option>
                <option value="dome">{s.addStyleDome}</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={selected.spec.feet} onChange={(e) => setSpec(selected.id, { feet: e.target.checked })} />
              {s.addFeet}
            </label>
          </section>

          <PositionCard s={s} position={selected.spec.position} onChange={(position) => setSpec(selected.id, { position })} onRoof={toRoof} />

          <section className="card template-panel">
            <h3>{s.addMaterials}</h3>
            <p className="muted small">{s.addMaterialHint}</p>
            <label className="field">
              <span>{s.addHousing}</span>
              <select value={selected.housingShader} onChange={(e) => update(selected.id, (a) => (a.kind === 'lightbar' ? { ...a, housingShader: Number(e.target.value) } : a))}>
                {materials.map((i) => (
                  <option key={i} value={i}>{materialLabel(yft, i)}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{s.addLens}</span>
              <select value={selected.lensShader ?? ''} onChange={(e) => update(selected.id, (a) => (a.kind === 'lightbar' ? { ...a, lensShader: e.target.value === '' ? null : Number(e.target.value) } : a))}>
                <option value="">{s.addLensSame}</option>
                {materials.map((i) => (
                  <option key={i} value={i}>{materialLabel(yft, i)}</option>
                ))}
              </select>
            </label>
          </section>

          <section className="card template-panel">
            <h3>{s.prpLightsTitle}</h3>
            <label className="check">
              <input type="checkbox" checked={selected.sirens} onChange={(e) => update(selected.id, (a) => (a.kind === 'lightbar' ? { ...a, sirens: e.target.checked } : a))} />
              {s.addSirens}
            </label>
            <p className="muted small">{s.addSirensHint}</p>
            {selected.sirens && selectedSirens.length > 0 ? (
              <>
                <p className="small">{s.addSirenNumbers.replace('{list}', selectedSirens.map((x) => x.number).join(', '))}</p>
                {hasSetting ? (
                  <>
                    <label className="field">
                      <span>{s.prpPreset}</span>
                      <select value={preset} onChange={(e) => setPreset(e.target.value as SirenPresetId)}>
                        {(Object.keys(SIREN_PRESETS) as SirenPresetId[]).map((id) => (
                          <option key={id} value={id}>{SIREN_PRESETS[id][lang]}</option>
                        ))}
                      </select>
                    </label>
                    <div className="row-tight">
                      <button type="button" className="btn btn-small" onClick={setupLights}>{s.addSetupLights}</button>
                    </div>
                    <p className="muted small">{s.addSetupHint.replace('{list}', selectedSirens.map((x) => x.number).join(', '))}</p>
                  </>
                ) : (
                  <p className="notice small">{s.addSetupNeedSiren}</p>
                )}
                {setupMessage ? <p className={`notice small ${setupMessage.kind === 'ok' ? 'notice-ok' : 'notice-error'}`} role="status">{setupMessage.text}</p> : null}
              </>
            ) : null}
          </section>
        </>
      ) : null}

      {selected?.kind === 'model' ? (
        <>
          <section className="card template-panel">
            <h3>{selected.name}</h3>
            <NumberField label={s.addModelScale} value={selected.scale} original={1} min={0.01} max={5} step={0.01} onChange={(v) => setModel(selected.id, { scale: Math.max(0.001, v) })} />
            {(() => {
              const size = sizeOf(selected);
              return size ? <p className="muted small">{s.addModelSize.replace('{size}', size.map((v) => v.toFixed(2)).join(' × '))}</p> : null;
            })()}
            {selected.parts.reduce((sum, p) => sum + p.indices.length / 3, 0) > 20000 ? <p className="notice notice-warn small">{s.addModelHeavy}</p> : null}
            <h4 className="add-subtitle">{s.addModelRotation}</h4>
            {(['addRotX', 'addRotY', 'addRotZ'] as const).map((key, axis) => (
              <NumberField
                key={key}
                label={s[key]}
                unit="°"
                value={selected.rotation[axis]!}
                original={0}
                min={-180}
                max={180}
                step={1}
                onChange={(v) => setModel(selected.id, { rotation: selected.rotation.map((r, i) => (i === axis ? v : r)) as [number, number, number] })}
              />
            ))}
            <div className="row-tight">
              <button type="button" className="btn btn-small" onClick={() => setModel(selected.id, { rotation: [selected.rotation[0] + 90, selected.rotation[1], selected.rotation[2]] })}>{s.addModelUpright}</button>
            </div>
          </section>

          <PositionCard s={s} position={selected.position} onChange={(position) => setModel(selected.id, { position })} onRoof={toRoof} />

          <section className="card template-panel">
            <h3>{s.addModelMaterials}</h3>
            <p className="muted small">{s.addMaterialHint}</p>
            {selected.colors.map((color, i) => (
              <div key={i} className="material-row">
                <label className="field">
                  <span><span className="swatch" style={{ background: color }} aria-hidden="true" /> {i + 1}</span>
                  <select
                    value={selected.materials[i] ?? 0}
                    onChange={(e) => setModel(selected.id, { materials: selected.materials.map((m, k) => (k === i ? Number(e.target.value) : m)) })}
                  >
                    {materials.map((m) => (
                      <option key={m} value={m}>{materialLabel(yft, m)}</option>
                    ))}
                  </select>
                </label>
                {selected.sourceTextures[i] !== null && selected.sourceTextures[i] !== undefined ? (
                  <label className="check small">
                    <input
                      type="checkbox"
                      checked={selected.materialTextures[i] !== null}
                      onChange={(e) => setModel(selected.id, { materialTextures: selected.materialTextures.map((t, k) => (k === i ? (e.target.checked ? (selected.sourceTextures[i] ?? null) : null) : t)) })}
                    />
                    {s.addModelOwnTexture}
                  </label>
                ) : null}
              </div>
            ))}
            {selected.materialTextures.some((t) => t !== null) ? <p className="muted small">{s.addModelTextureNote}</p> : null}
            <label className="field">
              <span>{s.addModelBone}</span>
              <select value={selected.parentBone} onChange={(e) => setModel(selected.id, { parentBone: Number(e.target.value) })}>
                {yft.bones.map((b) => (
                  <option key={b.index} value={b.index}>{b.name}</option>
                ))}
              </select>
            </label>
          </section>
        </>
      ) : null}
    </>
  );
}

function PositionCard({
  s,
  position,
  onChange,
  onRoof,
}: {
  s: ReturnType<typeof useLang>['s'];
  position: [number, number, number];
  onChange: (position: [number, number, number]) => void;
  onRoof: () => void;
}) {
  return (
    <section className="card template-panel">
      <h3>{s.addPosition}</h3>
      <NumberField label={s.addX} unit="m" value={position[0]} original={0} min={-2} max={2} step={0.01} onChange={(v) => onChange([v, position[1], position[2]])} />
      <NumberField label={s.addY} unit="m" value={position[1]} original={position[1]} min={-4} max={4} step={0.01} onChange={(v) => onChange([position[0], v, position[2]])} />
      <NumberField label={s.addZ} unit="m" value={position[2]} original={position[2]} min={-1.5} max={3} step={0.005} onChange={(v) => onChange([position[0], position[1], v])} />
      <div className="row-tight">
        <button type="button" className="btn btn-small" onClick={onRoof} title={s.addToRoofNote}>{s.addToRoof}</button>
      </div>
    </section>
  );
}

function clamp(value: number, [min, max]: readonly [number, number]): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
