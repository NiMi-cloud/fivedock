import {
  FLAG_CATALOG,
  FLAG_GROUPS,
  FLAG_GROUP_TITLES,
  HANDLING_FIELDS,
  HANDLING_GROUPS,
  HANDLING_GROUP_TITLES,
  HANDLING_VECTORS,
  SEQUENCES,
  SIREN_PRESETS,
  VEHICLE_ENUM_FIELDS,
  VEHICLE_NUMBERS,
  VEHICLE_TEXT_FIELDS,
  addSirenSetting,
  buildSirenSetting,
  isKnownFlag,
  newCarcols,
  otherFlags,
  presetLights,
  readHandlings,
  readSirenSettings,
  readVariation,
  readVehicle,
  sequenceOn,
  setAllVariationColors,
  setHandlingText,
  setHandlingValue,
  setSirenLight,
  setSirenLightCount,
  setSirenSetting,
  setVariationLiveries,
  setVariationSiren,
  setVehicleFlags,
  setVehicleNumber,
  setVehicleText,
  suggestSirenId,
} from '@toolkit/forge-core';
import type { LightField, SirenPresetId } from '@toolkit/forge-core';
import { useEffect, useMemo, useState } from 'react';
import { useLang } from '../i18n.tsx';
import type { useVehicleMeta } from '../lib/useVehicleMeta.ts';
import type { SirenMarker } from './VehicleViewport.tsx';

type Meta = ReturnType<typeof useVehicleMeta>;

interface BaseProps {
  meta: Meta;
  model: string;
}

/** Zeigt den Fehler einer Änderung an und führt Änderungen aus. */
function useEditor(meta: Meta) {
  const [error, setError] = useState<string | null>(null);
  const run = (slot: Parameters<Meta['apply']>[0], change: (text: string) => string) => setError(meta.apply(slot, change));
  return { error, run };
}

function Missing({ file }: { file: string }) {
  const { s } = useLang();
  return <p className="notice small">{s.prpNoMeta.replace('{file}', file)}</p>;
}

interface NumberFieldProps {
  label: string;
  hint?: string;
  unit?: string;
  value: number;
  original: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

export function NumberField({ label, hint, unit, value, original, min, max, step, onChange }: NumberFieldProps) {
  const { s } = useLang();
  const changed = Math.abs(value - original) > 1e-9;
  const decimals = Math.max(0, Math.min(6, (String(step).split('.')[1] ?? '').length));
  return (
    <div className={`prop-field${changed ? ' is-changed' : ''}`}>
      <div className="prop-label">
        <span>{label}</span>
        {changed ? (
          <button type="button" className="link-button" onClick={() => onChange(original)} title={s.prpReset}>
            {s.prpReset} ({original.toFixed(decimals)})
          </button>
        ) : null}
      </div>
      <div className="prop-input">
        <input type="range" min={Math.min(min, value)} max={Math.max(max, value)} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
        <input type="number" step={step} value={Number(value.toFixed(6))} onChange={(e) => (e.target.value === '' ? undefined : onChange(Number(e.target.value)))} aria-label={label} />
        {unit ? <span className="muted small">{unit}</span> : null}
      </div>
      {hint ? <p className="muted small prop-hint">{hint}</p> : null}
    </div>
  );
}

// --- Fahrzeug ----------------------------------------------------------------------------------------------

const FLAG_ORDER = ['glass', 'service', 'paint', 'extras', 'body', 'behaviour', 'spawn'] as const;

export function VehicleDataPanel({ meta, model, displayName, onDisplayName }: BaseProps & { displayName: string; onDisplayName: (name: string) => void }) {
  const { s, lang } = useLang();
  const { error, run } = useEditor(meta);
  const doc = meta.docs.vehicles;
  const variation = meta.docs.variations;
  const [more, setMore] = useState('');

  const data = useMemo(() => (doc ? readVehicle(doc.text, model) : null), [doc, model]);
  const original = useMemo(() => (doc ? readVehicle(doc.original, model) : null), [doc, model]);
  const vari = useMemo(() => (variation ? readVariation(variation.text, model) : null), [variation, model]);
  const colorsFirst = vari?.colors[0]?.indices ?? [];
  const extraOptions = useMemo(() => otherFlags(), []);

  if (!doc || !data || !original) return <Missing file="vehicles.meta" />;

  const flags = new Set(data.flags);
  const catalogFlags = new Set(FLAG_CATALOG.map((f) => f.flag));
  const unlisted = data.flags.filter((f) => !catalogFlags.has(f));
  const toggle = (flag: string, on: boolean) => run('vehicles', (t) => setVehicleFlags(t, model, on ? [...data.flags, flag] : data.flags.filter((f) => f !== flag)));

  return (
    <>
      <section className="card template-panel">
        <h3>{s.prpVehicleTitle}</h3>
        <p className="muted small">{s.prpVehicleIntro}</p>
        {error ? <p className="notice notice-error small" role="alert">{error}</p> : null}

        <label className="field">
          <span>{s.prpDisplayName}</span>
          <input type="text" value={displayName} placeholder={data.texts['gameName'] ?? model} onChange={(e) => onDisplayName(e.target.value)} />
          <small className="muted">{s.prpDisplayNameHint}</small>
        </label>

        {VEHICLE_TEXT_FIELDS.filter((f) => data.texts[f.key] !== undefined).map((f) => (
          <label key={f.key} className="field">
            <span>{f.label[lang]}</span>
            <input type="text" value={data.texts[f.key] ?? ''} onChange={(e) => run('vehicles', (t) => setVehicleText(t, model, f.key, e.target.value))} />
          </label>
        ))}

        {VEHICLE_ENUM_FIELDS.filter((f) => data.texts[f.key] !== undefined).map((f) => {
          const value = data.texts[f.key] ?? '';
          const options = f.options.includes(value) ? f.options : [value, ...f.options];
          return (
            <label key={f.key} className="field">
              <span>{f.label[lang]}</span>
              <select value={value} onChange={(e) => run('vehicles', (t) => setVehicleText(t, model, f.key, e.target.value))}>
                {options.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
          );
        })}

        {VEHICLE_NUMBERS.filter((f) => data.numbers[f.key] !== undefined).map((f) => (
          <NumberField
            key={f.key}
            label={f.label[lang]}
            hint={f.hint[lang]}
            value={data.numbers[f.key]!}
            original={original.numbers[f.key] ?? data.numbers[f.key]!}
            min={f.min}
            max={f.max}
            step={f.step}
            onChange={(v) => run('vehicles', (t) => setVehicleNumber(t, model, f.key, f.integer ? Math.round(v) : v))}
          />
        ))}
      </section>

      {FLAG_ORDER.map((group) => {
        const items = FLAG_CATALOG.filter((f) => f.group === group);
        return (
          <section key={group} className={`card template-panel${group === 'glass' ? ' card-accent' : ''}`}>
            <h3>{FLAG_GROUP_TITLES[group][lang]}</h3>
            {items.map((f) => (
              <label key={f.flag} className="check check-block">
                <input type="checkbox" checked={flags.has(f.flag)} onChange={(e) => toggle(f.flag, e.target.checked)} />
                <span>
                  {f.label[lang]}
                  {f.hint ? <small className="muted block">{f.hint[lang]}</small> : null}
                </span>
              </label>
            ))}
          </section>
        );
      })}

      <section className="card template-panel">
        <h3>{s.prpFlagsOther}</h3>
        {unlisted.length === 0 ? <p className="muted small">–</p> : null}
        <ul className="flag-list">
          {unlisted.map((f) => (
            <li key={f}>
              <code className={isKnownFlag(f) ? undefined : 'is-warn'}>{f}</code>
              <button type="button" className="link-button" onClick={() => toggle(f, false)}>{s.edtRemove}</button>
            </li>
          ))}
        </ul>
        <div className="row-tight">
          <select value={more} onChange={(e) => setMore(e.target.value)} aria-label={s.prpFlagsMore}>
            <option value="">{s.prpFlagsMore}</option>
            {extraOptions.filter((f) => !flags.has(f)).map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-small"
            disabled={!more}
            onClick={() => {
              toggle(more, true);
              setMore('');
            }}
          >
            {s.prpAdd}
          </button>
        </div>
      </section>

      {variation && vari ? (
        <section className="card template-panel">
          <h3>{s.prpVariations}</h3>
          <p className="muted small">{s.prpVariationsIntro.replace('{count}', String(vari.colors.length))}</p>
          <div className="field">
            <span>{s.prpLiveries}</span>
            <div className="row-tight">
              {(vari.colors[0]?.liveries ?? []).map((on, i) => (
                <label key={i} className="check">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => {
                      const next = [...(vari.colors[0]?.liveries ?? [])];
                      next[i] = e.target.checked;
                      run('variations', (t) => setVariationLiveries(t, model, next));
                    }}
                  />
                  {i + 1}
                </label>
              ))}
              <button type="button" className="btn btn-small" onClick={() => run('variations', (t) => setVariationLiveries(t, model, [...(vari.colors[0]?.liveries ?? []), false]))}>+</button>
              <button
                type="button"
                className="btn btn-small"
                disabled={(vari.colors[0]?.liveries.length ?? 0) === 0}
                onClick={() => run('variations', (t) => setVariationLiveries(t, model, (vari.colors[0]?.liveries ?? []).slice(0, -1)))}
              >
                −
              </button>
            </div>
            <small className="muted">{s.prpLiveryHint}</small>
          </div>
          <div className="field">
            <span>{s.prpColors}</span>
            <div className="color-numbers">
              {[s.prpColorBody, s.prpColorSecond, s.prpColorPearl, s.prpColorWheels].map((label, i) => (
                <label key={label} className="field">
                  <small>{label}</small>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={colorsFirst[i] ?? 0}
                    onChange={(e) => run('variations', (t) => setAllVariationColors(t, model, [0, 1, 2, 3].map((k) => (k === i ? Number(e.target.value) : null))))}
                  />
                </label>
              ))}
            </div>
            <small className="muted">{s.prpColorHint}</small>
          </div>
          <label className="field">
            <span>{s.prpSirenId}</span>
            <input type="number" min={0} value={vari.sirenSettings} onChange={(e) => run('variations', (t) => setVariationSiren(t, model, Number(e.target.value)))} />
            <small className="muted">{s.prpSirenIdNote}</small>
          </label>
        </section>
      ) : null}
    </>
  );
}

// --- Fahrverhalten -----------------------------------------------------------------------------------------

export function HandlingPanel({ meta, model }: BaseProps) {
  const { s, lang } = useLang();
  const { error, run } = useEditor(meta);
  const doc = meta.docs.handling;
  const vehicleDoc = meta.docs.vehicles;
  const handlingId = useMemo(() => (vehicleDoc ? (readVehicle(vehicleDoc.text, model)?.texts['handlingId'] ?? '') : ''), [vehicleDoc, model]);
  const entry = useMemo(() => (doc ? readHandlings(doc.text).find((h) => h.name.toLowerCase() === handlingId.toLowerCase()) : undefined), [doc, handlingId]);
  const original = useMemo(() => (doc ? readHandlings(doc.original).find((h) => h.name.toLowerCase() === handlingId.toLowerCase()) : undefined), [doc, handlingId]);

  if (!doc || !entry || !original) return <Missing file="handling.meta" />;

  return (
    <>
      <section className="card template-panel">
        <h3>{s.prpHandlingTitle}</h3>
        <p className="muted small">{s.prpHandlingIntro.replace('{name}', entry.name)}</p>
        {error ? <p className="notice notice-error small" role="alert">{error}</p> : null}
        {meta.changed.handling ? (
          <button type="button" className="btn btn-small" onClick={() => meta.reset('handling')}>{s.prpResetAll}</button>
        ) : null}
      </section>

      {HANDLING_GROUPS.map((group) => {
        const fields = HANDLING_FIELDS.filter((f) => f.group === group && entry.numbers[f.key] !== undefined);
        if (fields.length === 0 && group !== 'other') return null;
        return (
          <section key={group} className="card template-panel">
            <h3>{HANDLING_GROUP_TITLES[group][lang]}</h3>
            {fields.map((f) => (
              <NumberField
                key={f.key}
                label={f.label[lang]}
                hint={f.hint[lang]}
                unit={f.unit}
                value={entry.numbers[f.key]!}
                original={original.numbers[f.key] ?? entry.numbers[f.key]!}
                min={f.min}
                max={f.max}
                step={f.step}
                onChange={(v) => run('handling', (t) => setHandlingValue(t, entry.name, f.key, f.kind === 'integer' ? Math.round(v) : v))}
              />
            ))}
            {group === 'other'
              ? HANDLING_VECTORS.filter((v) => entry.vectors[v.key]).map((v) => {
                  const value = entry.vectors[v.key]!;
                  return (
                    <div key={v.key} className="prop-field">
                      <div className="prop-label"><span>{v.label[lang]}</span></div>
                      <div className="vector-inputs">
                        {(['x', 'y', 'z'] as const).map((axis, i) => (
                          <label key={axis} className="field">
                            <small>{axis}</small>
                            <input
                              type="number"
                              step={0.01}
                              value={Number(value[i]!.toFixed(6))}
                              onChange={(e) => {
                                const next: [number, number, number] = [...value];
                                next[i] = Number(e.target.value);
                                run('handling', (t) => setHandlingValue(t, entry.name, v.key, next));
                              }}
                            />
                          </label>
                        ))}
                      </div>
                      <p className="muted small prop-hint">{v.hint[lang]}</p>
                    </div>
                  );
                })
              : null}
          </section>
        );
      })}

      <section className="card template-panel">
        <h3>{s.prpAdvanced}</h3>
        <p className="muted small">{s.prpAdvancedHint}</p>
        {(['strModelFlags', 'strHandlingFlags', 'strDamageFlags', 'AIHandling'] as const)
          .filter((k) => entry.texts[k] !== undefined)
          .map((k) => (
            <label key={k} className="field">
              <span><code>{k}</code></span>
              <input type="text" value={entry.texts[k] ?? ''} onChange={(e) => run('handling', (t) => setHandlingText(t, entry.name, k, e.target.value))} />
            </label>
          ))}
      </section>
    </>
  );
}

// --- Lichter und Sirenen -----------------------------------------------------------------------------------

export interface SirenBone {
  /** Nummer im Namen: siren3 → 3 */
  number: number;
  position: [number, number, number];
}

interface LightsProps extends BaseProps {
  bones: SirenBone[];
  playing: boolean;
  onPlaying: (playing: boolean) => void;
  onMarkers: (markers: SirenMarker[], bpm: number) => void;
}

const SEQUENCE_NAMES: Array<[keyof typeof SEQUENCES, { de: string; en: string }]> = [
  ['solid', { de: 'Dauerlicht', en: 'Solid' }],
  ['alternateA', { de: 'Schneller Wechsel A', en: 'Fast alternate A' }],
  ['alternateB', { de: 'Schneller Wechsel B', en: 'Fast alternate B' }],
  ['doubleA', { de: 'Doppelblitz A', en: 'Double flash A' }],
  ['doubleB', { de: 'Doppelblitz B', en: 'Double flash B' }],
  ['slowA', { de: 'Langsam A', en: 'Slow A' }],
  ['slowB', { de: 'Langsam B', en: 'Slow B' }],
  ['strobeA', { de: 'Blitz A', en: 'Strobe A' }],
  ['strobeB', { de: 'Blitz B', en: 'Strobe B' }],
];

export function LightsPanel({ meta, model, bones, playing, onPlaying, onMarkers }: LightsProps) {
  const { s, lang } = useLang();
  const { error, run } = useEditor(meta);
  const variation = meta.docs.variations;
  const carcols = meta.docs.carcols;
  const [preset, setPreset] = useState<SirenPresetId>('police-double');

  const vari = useMemo(() => (variation ? readVariation(variation.text, model) : null), [variation, model]);
  const settings = useMemo(() => (carcols ? readSirenSettings(carcols.text) : []), [carcols]);
  const setting = settings.find((x) => x.id === vari?.sirenSettings);
  const boneByNumber = useMemo(() => new Map(bones.map((b) => [b.number, b])), [bones]);

  // Marker für die 3D-Ansicht
  useEffect(() => {
    if (!setting) {
      onMarkers([], 650);
      return;
    }
    const markers: SirenMarker[] = [];
    for (const light of setting.lights) {
      const bone = boneByNumber.get(light.index + 1);
      if (!bone || !light.light) continue;
      markers.push({ id: `siren${light.index + 1}`, position: bone.position, color: light.color, sequence: light.flashing ? light.flash.sequencer : 0xffffffff });
    }
    onMarkers(markers, setting.bpm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setting, boneByNumber]);

  useEffect(() => () => onMarkers([], 650), []);  // eslint-disable-line react-hooks/exhaustive-deps

  if (!variation || !vari) return <Missing file="carvariations.meta" />;

  const create = () => {
    const sides = bones.length > 0 ? bones.map((b) => b.position[0]) : [-0.4, 0.4];
    const used = settings.map((x) => x.id);
    const id = suggestSirenId(model, used);
    const xml = buildSirenSetting({ id, name: model, lights: presetLights(preset, sides) });
    if (carcols) run('carcols', (t) => addSirenSetting(t, xml));
    else meta.create('carcols', 'data/carcols.meta', newCarcols(xml));
    run('variations', (t) => setVariationSiren(t, model, id));
  };

  const applyPreset = () => {
    if (!setting) return;
    const sides = setting.lights.map((l) => boneByNumber.get(l.index + 1)?.position[0] ?? (l.index % 2 === 0 ? -0.4 : 0.4));
    const planned = presetLights(preset, sides);
    run('carcols', (t) => {
      let out = t;
      planned.forEach((p, i) => {
        out = setSirenLight(out, setting.id, i, 'color', p.color);
        out = setSirenLight(out, setting.id, i, 'flashSequence', p.sequence);
      });
      return out;
    });
  };

  return (
    <>
      <section className="card template-panel">
        <h3>{s.prpLightsTitle}</h3>
        <p className="muted small">{s.prpLightsIntro}</p>
        {bones.length === 0 ? <p className="notice small">{s.prpNoSirenBones}</p> : <p className="muted small">{s.prpSirenBones.replace('{count}', String(bones.length)).replace('{list}', bones.map((b) => b.number).join(', '))}</p>}
        {error ? <p className="notice notice-error small" role="alert">{error}</p> : null}
        <label className="field">
          <span>{s.prpPreset}</span>
          <select value={preset} onChange={(e) => setPreset(e.target.value as SirenPresetId)}>
            {(Object.keys(SIREN_PRESETS) as SirenPresetId[]).map((id) => (
              <option key={id} value={id}>{SIREN_PRESETS[id][lang]}</option>
            ))}
          </select>
        </label>
        <div className="row-tight">
          {setting ? (
            <>
              <button type="button" className="btn btn-small" onClick={applyPreset}>{s.prpApplyPreset}</button>
              <button type="button" className={`btn btn-small${playing ? ' btn-primary' : ''}`} onClick={() => onPlaying(!playing)}>
                {playing ? s.prpStop : s.prpPlay}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary" onClick={create}>{s.prpCreateSiren}</button>
          )}
        </div>
        {setting ? <p className="muted small">{s.prpPreviewNote}</p> : <p className="muted small">{s.prpNoSiren}</p>}
      </section>

      {setting ? (
        <>
          <section className="card template-panel">
            <h3>{setting.name || `#${setting.id}`} <span className="muted small">#{setting.id}</span></h3>
            <NumberField label={s.prpBpm} hint={s.prpBpmHint} value={setting.bpm} original={readSirenSettings(carcols!.original).find((x) => x.id === setting.id)?.bpm ?? setting.bpm} min={60} max={1200} step={10} onChange={(v) => run('carcols', (t) => setSirenSetting(t, setting.id, 'bpm', v))} />
            <label className="check">
              <input type="checkbox" checked={setting.useRealLights} onChange={(e) => run('carcols', (t) => setSirenSetting(t, setting.id, 'useRealLights', e.target.checked))} />
              {s.prpRealLights}
            </label>
            <div className="row-tight">
              <button type="button" className="btn btn-small" disabled={setting.lights.length >= 20} onClick={() => run('carcols', (t) => setSirenLightCount(t, setting.id, setting.lights.length + 1))}>{s.prpAddLight}</button>
              <button type="button" className="btn btn-small" disabled={setting.lights.length <= 0} onClick={() => run('carcols', (t) => setSirenLightCount(t, setting.id, setting.lights.length - 1))}>{s.prpRemoveLight}</button>
            </div>
          </section>

          <section className="card template-panel">
            <h3>{s.prpLights} ({setting.lights.length})</h3>
            <ul className="siren-list">
              {setting.lights.map((light) => {
                const bone = boneByNumber.get(light.index + 1);
                const set = (field: LightField, value: number | boolean | string) => run('carcols', (t) => setSirenLight(t, setting.id, light.index, field, value));
                return (
                  <li key={light.index} className={`siren-row${bone ? '' : ' is-orphan'}`}>
                    <div className="siren-head">
                      <strong>{s.prpLight} {light.index + 1}</strong>
                      <span className="muted small">{bone ? `siren${light.index + 1}` : s.prpNoBone}</span>
                      <input type="color" value={light.color} onChange={(e) => set('color', e.target.value)} className="color-input" aria-label={s.prpColor} />
                      <label className="check">
                        <input type="checkbox" checked={light.light} onChange={(e) => set('light', e.target.checked)} />
                        {s.prpOn}
                      </label>
                      <label className="check">
                        <input type="checkbox" checked={light.flashing} onChange={(e) => set('flashing', e.target.checked)} />
                        {s.prpBlinks}
                      </label>
                    </div>
                    <div className="seq-grid" role="group" aria-label={s.prpPattern}>
                      {Array.from({ length: 32 }, (_, step) => (
                        <button
                          key={step}
                          type="button"
                          className={`seq-bit${sequenceOn(light.flash.sequencer, step) ? ' is-on' : ''}`}
                          style={sequenceOn(light.flash.sequencer, step) ? { background: light.color } : undefined}
                          aria-pressed={sequenceOn(light.flash.sequencer, step)}
                          aria-label={`${step + 1}`}
                          onClick={() => set('flashSequence', (light.flash.sequencer ^ (1 << step)) >>> 0)}
                        />
                      ))}
                    </div>
                    <div className="row-tight">
                      <select aria-label={s.prpPattern} value="" onChange={(e) => e.target.value && set('flashSequence', SEQUENCES[e.target.value as keyof typeof SEQUENCES])}>
                        <option value="">{s.prpPattern}</option>
                        {SEQUENCE_NAMES.map(([key, name]) => (
                          <option key={key} value={key}>{name[lang]}</option>
                        ))}
                      </select>
                      <label className="field field-inline">
                        <small>{s.prpIntensity}</small>
                        <input type="number" min={0} max={50} step={1} value={light.intensity} onChange={(e) => set('intensity', Number(e.target.value))} />
                      </label>
                      <label className="field field-inline">
                        <small>{s.prpSize}</small>
                        <input type="number" min={0.1} max={3} step={0.1} value={Number(light.coronaSize.toFixed(2))} onChange={(e) => set('coronaSize', Number(e.target.value))} />
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      ) : null}
    </>
  );
}

