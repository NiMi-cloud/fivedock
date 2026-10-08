/**
 * Sirenen und Lichtbalken (carcols.meta): Die nativen Sirenen des Spiels. Jeder Eintrag in `<sirens>` ist ein Licht und gehört zum
 * Knochen `siren<Nummer>` des Fahrzeugmodells (siren1 bis siren20). Farbe, Blinkmuster, Helligkeit und Größe stehen in der Meta-Datei.
 *
 * Gelesen und geändert wird gezielt: Nur die betroffenen Werte werden im Text ersetzt, Kommentare und der Rest bleiben.
 */

import { XmlEditError, appendChild, applyEdits, indentOf, removeElement, setAttribute, setContent } from './xml-edit.ts';
import type { TextEdit } from './xml-edit.ts';
import { child, childText, childrenNamed, parseXml } from './xml.ts';
import type { XmlElement } from './xml.ts';

export interface SirenTiming {
  delta: number;
  start: number;
  speed: number;
  /** 32 Bit: jedes Bit ist ein Zeitschritt, 1 = Licht an. */
  sequencer: number;
  multiples: number;
  direction: boolean;
  syncToBpm: boolean;
}

export interface SirenLight {
  /** Nullbasiert. Gehört zum Knochen `siren<index + 1>`. */
  index: number;
  rotation: SirenTiming;
  flash: SirenTiming;
  coronaIntensity: number;
  coronaSize: number;
  coronaPull: number;
  coronaFaceCamera: boolean;
  /** "#rrggbb" */
  color: string;
  /** 0 bis 255 */
  alpha: number;
  intensity: number;
  lightGroup: number;
  rotate: boolean;
  scale: boolean;
  scaleFactor: number;
  flashing: boolean;
  light: boolean;
  spotLight: boolean;
  castShadows: boolean;
}

export interface SirenSetting {
  id: number;
  name: string;
  bpm: number;
  timeMultiplier: number;
  lightFalloffMax: number;
  lightFalloffExponent: number;
  lightInnerConeAngle: number;
  lightOuterConeAngle: number;
  lightOffset: number;
  textureName: string;
  useRealLights: boolean;
  lights: SirenLight[];
}

const num = (el: XmlElement | undefined, fallback = 0) => {
  const v = Number(el?.attributes['value']);
  return Number.isFinite(v) ? v : fallback;
};
const bool = (el: XmlElement | undefined) => el?.attributes['value'] === 'true';

function readTiming(el: XmlElement | undefined): SirenTiming {
  return {
    delta: num(el && child(el, 'delta')),
    start: num(el && child(el, 'start')),
    speed: num(el && child(el, 'speed')),
    sequencer: num(el && child(el, 'sequencer')) >>> 0,
    multiples: num(el && child(el, 'multiples'), 1),
    direction: bool(el && child(el, 'direction')),
    syncToBpm: bool(el && child(el, 'syncToBpm')),
  };
}

/** `0xAARRGGBB` → Farbe und Deckkraft. */
export function parseSirenColor(value: string): { color: string; alpha: number } {
  const n = Number.parseInt(value.replace(/^0x/i, ''), 16) >>> 0;
  const rgb = (n & 0xffffff).toString(16).padStart(6, '0');
  return { color: `#${rgb}`, alpha: (n >>> 24) & 0xff };
}

/** Farbe und Deckkraft → `0xAARRGGBB`. */
export function formatSirenColor(color: string, alpha = 255): string {
  const rgb = color.replace('#', '').padStart(6, '0').slice(-6).toUpperCase();
  return `0x${(alpha & 0xff).toString(16).padStart(2, '0').toUpperCase()}${rgb}`;
}

function readLight(item: XmlElement, index: number): SirenLight {
  const corona = child(item, 'corona');
  const { color, alpha } = parseSirenColor(child(item, 'color')?.attributes['value'] ?? '0xFFFFFFFF');
  return {
    index,
    rotation: readTiming(child(item, 'rotation')),
    flash: readTiming(child(item, 'flashiness')),
    coronaIntensity: num(corona && child(corona, 'intensity')),
    coronaSize: num(corona && child(corona, 'size')),
    coronaPull: num(corona && child(corona, 'pull')),
    coronaFaceCamera: bool(corona && child(corona, 'faceCamera')),
    color,
    alpha,
    intensity: num(child(item, 'intensity')),
    lightGroup: num(child(item, 'lightGroup')),
    rotate: bool(child(item, 'rotate')),
    scale: bool(child(item, 'scale')),
    scaleFactor: num(child(item, 'scaleFactor')),
    flashing: bool(child(item, 'flash')),
    light: bool(child(item, 'light')),
    spotLight: bool(child(item, 'spotLight')),
    castShadows: bool(child(item, 'castShadows')),
  };
}

function sirenItems(root: XmlElement): XmlElement[] {
  const sirens = child(root, 'Sirens');
  return sirens ? childrenNamed(sirens, 'Item') : [];
}

/** Liest alle Sirenen-Einstellungen einer carcols.meta. */
export function readSirenSettings(text: string): SirenSetting[] {
  return sirenItems(parseXml(text)).map((item) => {
    const lights = child(item, 'sirens');
    return {
      id: num(child(item, 'id')),
      name: childText(item, 'name'),
      bpm: num(child(item, 'sequencerBpm'), 650),
      timeMultiplier: num(child(item, 'timeMultiplier'), 1),
      lightFalloffMax: num(child(item, 'lightFalloffMax')),
      lightFalloffExponent: num(child(item, 'lightFalloffExponent')),
      lightInnerConeAngle: num(child(item, 'lightInnerConeAngle')),
      lightOuterConeAngle: num(child(item, 'lightOuterConeAngle')),
      lightOffset: num(child(item, 'lightOffset')),
      textureName: childText(item, 'textureName'),
      useRealLights: bool(child(item, 'useRealLights')),
      lights: lights ? childrenNamed(lights, 'Item').map((l, i) => readLight(l, i)) : [],
    };
  });
}

// --- Ändern ------------------------------------------------------------------------------------------------

/** Felder eines Lichts und ihr Pfad im Eintrag. Das Element am Ende des Pfads hat ein `value`-Attribut. */
export const LIGHT_FIELDS = {
  color: ['color'],
  intensity: ['intensity'],
  lightGroup: ['lightGroup'],
  rotate: ['rotate'],
  scale: ['scale'],
  scaleFactor: ['scaleFactor'],
  flashing: ['flash'],
  light: ['light'],
  spotLight: ['spotLight'],
  castShadows: ['castShadows'],
  flashSequence: ['flashiness', 'sequencer'],
  flashDelta: ['flashiness', 'delta'],
  flashSpeed: ['flashiness', 'speed'],
  flashStart: ['flashiness', 'start'],
  flashMultiples: ['flashiness', 'multiples'],
  flashDirection: ['flashiness', 'direction'],
  flashSync: ['flashiness', 'syncToBpm'],
  rotationSequence: ['rotation', 'sequencer'],
  rotationDelta: ['rotation', 'delta'],
  rotationSpeed: ['rotation', 'speed'],
  rotationStart: ['rotation', 'start'],
  rotationMultiples: ['rotation', 'multiples'],
  rotationDirection: ['rotation', 'direction'],
  rotationSync: ['rotation', 'syncToBpm'],
  coronaIntensity: ['corona', 'intensity'],
  coronaSize: ['corona', 'size'],
  coronaPull: ['corona', 'pull'],
  coronaFaceCamera: ['corona', 'faceCamera'],
} as const;

export type LightField = keyof typeof LIGHT_FIELDS;

/** Felder der ganzen Sirenen-Einstellung. */
export const SETTING_FIELDS = {
  bpm: ['sequencerBpm'],
  timeMultiplier: ['timeMultiplier'],
  lightFalloffMax: ['lightFalloffMax'],
  lightFalloffExponent: ['lightFalloffExponent'],
  lightInnerConeAngle: ['lightInnerConeAngle'],
  lightOuterConeAngle: ['lightOuterConeAngle'],
  lightOffset: ['lightOffset'],
  useRealLights: ['useRealLights'],
} as const;

export type SettingField = keyof typeof SETTING_FIELDS;

const SEQUENCE_FIELDS = new Set<string>(['flashSequence', 'rotationSequence']);
const INTEGER_FIELDS = new Set<string>(['intensity', 'lightGroup', 'scaleFactor', 'flashMultiples', 'rotationMultiples', 'bpm']);

function serialize(field: string, value: number | boolean | string, colorAlpha = 255): string {
  if (field === 'color') return formatSirenColor(String(value), colorAlpha);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) throw new XmlEditError('Der Wert ist keine Zahl.');
  if (SEQUENCE_FIELDS.has(field)) return String(value >>> 0);
  if (INTEGER_FIELDS.has(field)) return String(Math.round(value));
  return value.toFixed(8);
}

function findSetting(root: XmlElement, id: number): XmlElement {
  const item = sirenItems(root).find((i) => num(child(i, 'id')) === id);
  if (!item) throw new XmlEditError(`Die Sirene ${id} steht nicht in der Datei.`);
  return item;
}

function walk(item: XmlElement, path: readonly string[]): XmlElement {
  let el: XmlElement | undefined = item;
  for (const name of path) el = el && child(el, name);
  if (!el) throw new XmlEditError(`<${path.join('/')}> fehlt im Eintrag.`);
  return el;
}

/** Ändert ein Feld der Sirenen-Einstellung (Takt, Reichweite …). */
export function setSirenSetting(text: string, id: number, field: SettingField, value: number | boolean): string {
  const el = walk(findSetting(parseXml(text), id), SETTING_FIELDS[field]);
  return applyEdits(text, [setAttribute(el, 'value', serialize(field, value))]);
}

/** Ändert den Namen einer Sirenen-Einstellung. */
export function setSirenName(text: string, id: number, name: string): string {
  return applyEdits(text, [setContent(walk(findSetting(parseXml(text), id), ['name']), name)]);
}

/** Ändert ein Feld eines Lichts. Bei `color` bleibt die Deckkraft der Datei erhalten. */
export function setSirenLight(text: string, id: number, lightIndex: number, field: LightField, value: number | boolean | string): string {
  const root = parseXml(text);
  const lights = child(findSetting(root, id), 'sirens');
  const item = lights ? childrenNamed(lights, 'Item')[lightIndex] : undefined;
  if (!item) throw new XmlEditError(`Das Licht ${lightIndex + 1} gibt es in der Sirene ${id} nicht.`);
  const el = walk(item, LIGHT_FIELDS[field]);
  let alpha = 255;
  if (field === 'color') alpha = parseSirenColor(el.attributes['value'] ?? '0xFFFFFFFF').alpha;
  return applyEdits(text, [setAttribute(el, 'value', serialize(field, value, alpha))]);
}

/** Hängt ein Licht an (Kopie des letzten) oder entfernt das letzte, bis es `count` Lichter sind. */
export function setSirenLightCount(text: string, id: number, count: number): string {
  const root = parseXml(text);
  const setting = findSetting(root, id);
  const container = child(setting, 'sirens');
  if (!container) throw new XmlEditError(`Die Sirene ${id} hat keine Lichtliste.`);
  const items = childrenNamed(container, 'Item');
  if (count < 0 || count > 20) throw new XmlEditError('Es sind 0 bis 20 Lichter möglich.');
  if (count === items.length) return text;
  if (count < items.length) return applyEdits(text, items.slice(count).map((l) => removeElement(text, l)));
  const last = items[items.length - 1];
  if (!last) throw new XmlEditError('Ohne ein vorhandenes Licht gibt es keine Vorlage zum Kopieren.');
  const template = text.slice(last.start, last.end);
  const copies: string[] = [];
  for (let n = items.length + 1; n <= count; n++) copies.push(template.replace(/<!--\s*Siren\s*\d+\s*-->/i, `<!-- Siren ${n} -->`));
  return applyEdits(text, [appendChild(text, container, copies.join(`\n${indentOf(text, last)}`), indentOf(text, last))]);
}

// --- Neu anlegen -------------------------------------------------------------------------------------------

/** Blinkmuster: 32 Zeitschritte, 1 = an. Gegenstücke ergänzen sich, sodass links und rechts abwechselnd leuchten. */
export const SEQUENCES = {
  solid: 0xffffffff,
  alternateA: 0xaaaaaaaa,
  alternateB: 0x55555555,
  doubleA: 0xcccccccc,
  doubleB: 0x33333333,
  slowA: 0xf0f0f0f0,
  slowB: 0x0f0f0f0f,
  strobeA: 0x88888888,
  strobeB: 0x44444444,
} as const;

export interface SirenPresetLight {
  color: string;
  sequence: number;
}

export type SirenPresetId = 'police-double' | 'police-fast' | 'fire' | 'ambulance' | 'amber';

export const SIREN_PRESETS: Record<SirenPresetId, { de: string; en: string }> = {
  'police-double': { de: 'Polizei rot/blau, Doppelblitz', en: 'Police red/blue, double flash' },
  'police-fast': { de: 'Polizei rot/blau, schneller Wechsel', en: 'Police red/blue, fast alternate' },
  fire: { de: 'Feuerwehr rot, Wechsel', en: 'Fire red, alternate' },
  ambulance: { de: 'Rettung rot/weiß', en: 'Ambulance red/white' },
  amber: { de: 'Warnleuchte gelb', en: 'Amber warning light' },
};

/** Farben und Blinkmuster für Lichter an den angegebenen Seitenlagen (x < 0 links, sonst rechts, bei x nahe 0 abwechselnd). */
export function presetLights(preset: SirenPresetId, sides: number[]): SirenPresetLight[] {
  return sides.map((x, i) => {
    const left = Math.abs(x) < 0.02 ? i % 2 === 0 : x < 0;
    switch (preset) {
      case 'police-double':
        return left ? { color: '#ff0000', sequence: SEQUENCES.doubleA } : { color: '#0000ff', sequence: SEQUENCES.doubleB };
      case 'police-fast':
        return left ? { color: '#ff0000', sequence: SEQUENCES.alternateA } : { color: '#0000ff', sequence: SEQUENCES.alternateB };
      case 'fire':
        return left ? { color: '#ff0000', sequence: SEQUENCES.alternateA } : { color: '#ff0000', sequence: SEQUENCES.alternateB };
      case 'ambulance':
        return left ? { color: '#ff0000', sequence: SEQUENCES.slowA } : { color: '#ffffff', sequence: SEQUENCES.slowB };
      default:
        return { color: '#ff8000', sequence: SEQUENCES.slowA };
    }
  });
}

export interface NewSirenOptions {
  id: number;
  name: string;
  bpm?: number;
  lights: SirenPresetLight[];
}

const fl = (v: number) => v.toFixed(8);

/** Quelltext einer neuen Sirenen-Einstellung mit den üblichen Werten (Aufbau wie bei Spiel und gängigen Fahrzeugen). */
export function buildSirenSetting(options: NewSirenOptions, indent = '    '): string {
  const i1 = indent;
  const i2 = `${indent}  `;
  const i3 = `${indent}    `;
  const lights = options.lights
    .map((light, n) => {
      const i4 = `${i3}  `;
      return [
        `${i3}<Item>`,
        `${i4}<!-- Siren ${n + 1} -->`,
        `${i4}<rotation>`,
        `${i4}  <delta value="${fl(0)}"/>`,
        `${i4}  <start value="${fl(0)}"/>`,
        `${i4}  <speed value="${fl(3)}"/>`,
        `${i4}  <sequencer value="4294967295"/>`,
        `${i4}  <multiples value="1"/>`,
        `${i4}  <direction value="false"/>`,
        `${i4}  <syncToBpm value="true"/>`,
        `${i4}</rotation>`,
        `${i4}<flashiness>`,
        `${i4}  <delta value="0"/>`,
        `${i4}  <start value="${fl(0)}"/>`,
        `${i4}  <speed value="${fl(0)}"/>`,
        `${i4}  <sequencer value="${light.sequence >>> 0}"/>`,
        `${i4}  <multiples value="1"/>`,
        `${i4}  <direction value="true"/>`,
        `${i4}  <syncToBpm value="true"/>`,
        `${i4}</flashiness>`,
        `${i4}<corona>`,
        `${i4}  <intensity value="${fl(25)}"/>`,
        `${i4}  <size value="${fl(0.5)}"/>`,
        `${i4}  <pull value="${fl(0.15)}"/>`,
        `${i4}  <faceCamera value="false"/>`,
        `${i4}</corona>`,
        `${i4}<color value="${formatSirenColor(light.color)}"/>`,
        `${i4}<intensity value="4"/>`,
        `${i4}<lightGroup value="${(n % 2) + 1}"/>`,
        `${i4}<rotate value="false"/>`,
        `${i4}<scale value="true"/>`,
        `${i4}<scaleFactor value="100"/>`,
        `${i4}<flash value="true"/>`,
        `${i4}<light value="true"/>`,
        `${i4}<spotLight value="false"/>`,
        `${i4}<castShadows value="false"/>`,
        `${i3}</Item>`,
      ].join('\n');
    })
    .join('\n');
  return [
    `${i1}<Item>`,
    `${i2}<id value="${Math.round(options.id)}"/>`,
    `${i2}<name>${options.name.replace(/[<>&]/g, '')}</name>`,
    `${i2}<timeMultiplier value="${fl(1)}"/>`,
    `${i2}<lightFalloffMax value="${fl(10)}"/>`,
    `${i2}<lightFalloffExponent value="${fl(10)}"/>`,
    `${i2}<lightInnerConeAngle value="${fl(2.29061)}"/>`,
    `${i2}<lightOuterConeAngle value="${fl(70)}"/>`,
    `${i2}<lightOffset value="${fl(0)}"/>`,
    `${i2}<textureName>VehicleLight_sirenlight</textureName>`,
    `${i2}<sequencerBpm value="${Math.round(options.bpm ?? 650)}"/>`,
    `${i2}<leftHeadLight><sequencer value="0"/></leftHeadLight>`,
    `${i2}<rightHeadLight><sequencer value="0"/></rightHeadLight>`,
    `${i2}<leftTailLight><sequencer value="0"/></leftTailLight>`,
    `${i2}<rightTailLight><sequencer value="0"/></rightTailLight>`,
    `${i2}<leftHeadLightMultiples value="1"/>`,
    `${i2}<rightHeadLightMultiples value="1"/>`,
    `${i2}<leftTailLightMultiples value="2"/>`,
    `${i2}<rightTailLightMultiples value="2"/>`,
    `${i2}<useRealLights value="true"/>`,
    `${i2}<sirens>`,
    lights,
    `${i2}</sirens>`,
    `${i1}</Item>`,
  ].join('\n');
}

/** Neue carcols.meta mit einer Sirenen-Einstellung. */
export function newCarcols(sirenXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<CVehicleModelInfoVarGlobal>\n  <Sirens>\n${sirenXml}\n  </Sirens>\n</CVehicleModelInfoVarGlobal>\n`;
}

/** Hängt eine neue Sirenen-Einstellung an eine vorhandene carcols.meta an. */
export function addSirenSetting(text: string, sirenXml: string): string {
  const root = parseXml(text);
  const sirens = child(root, 'Sirens');
  const edits: TextEdit[] = [];
  if (sirens) {
    edits.push(appendChild(text, sirens, sirenXml.trimStart(), '    '));
  } else {
    edits.push(appendChild(text, root, `<Sirens>\n${sirenXml}\n  </Sirens>`, '  '));
  }
  return applyEdits(text, edits);
}

/** Nummer für eine neue Sirene: aus dem Namen abgeleitet und frei von bereits vergebenen. */
export function suggestSirenId(name: string, used: Iterable<number>): number {
  const taken = new Set(used);
  let h = 2166136261;
  for (const c of name.toLowerCase()) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  let id = 1000 + (h % 60000);
  while (taken.has(id)) id++;
  return id;
}

/** Lichtnummern (1 bis 20) der Knochen `siren<Nummer>` in der Reihenfolge der Nummern. */
export function sirenBoneNumbers(boneNames: string[]): number[] {
  const out: number[] = [];
  for (const name of boneNames) {
    const m = /^siren(\d+)$/i.exec(name);
    if (m) out.push(Number(m[1]));
  }
  return out.sort((a, b) => a - b);
}

/** Ist das Licht zu diesem Zeitschritt an? Bit 0 ist der erste Schritt. Die Bitreihenfolge im Spiel ist nicht belegt, die Vorschau ist daher ungefähr. */
export function sequenceOn(sequencer: number, step: number): boolean {
  return ((sequencer >>> 0) >>> (((step % 32) + 32) % 32)) & 1 ? true : false;
}

/**
 * Stellt sicher, dass die Sirenen-Einstellung `id` für alle angegebenen Lichtnummern ein Licht hat (fehlende werden als Kopie des
 * letzten angehängt), und gibt diesen Lichtern Farbe und Blinkmuster der Voreinstellung. Welche Seite ein Licht hat, bestimmt `x`
 * (x < 0 links). Andere Lichter der Einstellung bleiben unverändert.
 */
export function ensureSirenLights(text: string, id: number, lights: Array<{ number: number; x: number }>, preset: SirenPresetId): string {
  if (lights.length === 0) return text;
  const setting = readSirenSettings(text).find((s) => s.id === id);
  if (!setting) throw new XmlEditError(`Die Sirene ${id} steht nicht in der Datei.`);
  const need = Math.max(...lights.map((l) => l.number));
  let out = need > setting.lights.length ? setSirenLightCount(text, id, need) : text;
  const look = presetLights(
    preset,
    lights.map((l) => l.x),
  );
  lights.forEach((l, i) => {
    out = setSirenLight(out, id, l.number - 1, 'color', look[i]!.color);
    out = setSirenLight(out, id, l.number - 1, 'flashSequence', look[i]!.sequence);
  });
  return out;
}
