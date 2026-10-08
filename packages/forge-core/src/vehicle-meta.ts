/**
 * Fahrzeugdaten (vehicles.meta) und Varianten (carvariations.meta): lesen und gezielt ändern, ohne den Rest der Dateien anzufassen.
 */

import { VEHICLE_CLASSES, VEHICLE_TYPES, DASHBOARD_TYPES, PLATE_TYPES, SWANKNESS, WHEEL_TYPES } from './vehicle-enums.ts';
import { parseFlags } from './vehicle-flags.ts';
import { XmlEditError, appendChild, applyEdits, indentOf, removeElement, setAttribute, setContent } from './xml-edit.ts';
import type { TextEdit } from './xml-edit.ts';
import { child, childText, childrenNamed, descendants, parseXml } from './xml.ts';
import type { XmlElement } from './xml.ts';

// --- vehicles.meta -----------------------------------------------------------------------------------------

export interface VehicleNumberField {
  key: string;
  label: { de: string; en: string };
  hint: { de: string; en: string };
  min: number;
  max: number;
  step: number;
  integer?: boolean;
}

export const VEHICLE_NUMBERS: VehicleNumberField[] = [
  { key: 'wheelScale', label: { de: 'Radgröße vorn', en: 'Front wheel scale' }, hint: { de: 'Skaliert die Vorderräder des Fahrzeugs.', en: 'Scales the front wheels.' }, min: 0.1, max: 1.5, step: 0.005 },
  { key: 'wheelScaleRear', label: { de: 'Radgröße hinten', en: 'Rear wheel scale' }, hint: { de: 'Skaliert die Hinterräder des Fahrzeugs.', en: 'Scales the rear wheels.' }, min: 0.1, max: 1.5, step: 0.005 },
  { key: 'defaultBodyHealth', label: { de: 'Karosserie-Stabilität', en: 'Body health' }, hint: { de: 'Wie viel Schaden die Karosserie aushält (1000 ist normal).', en: 'How much damage the body takes (1000 is normal).' }, min: 100, max: 10000, step: 50 },
  { key: 'dirtLevelMax', label: { de: 'Verschmutzung (höchstens)', en: 'Dirt level (max)' }, hint: { de: 'Wie schmutzig das Auto beim Auftauchen höchstens ist.', en: 'How dirty the car can be when it spawns.' }, min: 0, max: 15, step: 0.5 },
  { key: 'frequency', label: { de: 'Häufigkeit im Verkehr', en: 'Traffic frequency' }, hint: { de: 'Wie oft das Auto im Straßenverkehr auftaucht, 0 = nie.', en: 'How often it appears in traffic, 0 = never.' }, min: 0, max: 1000, step: 1, integer: true },
  { key: 'maxNum', label: { de: 'Höchstzahl gleichzeitig', en: 'Maximum at once' }, hint: { de: 'Wie viele dieser Autos es höchstens gleichzeitig gibt.', en: 'How many of these cars can exist at once.' }, min: 0, max: 999, step: 1, integer: true },
  { key: 'steerWheelMult', label: { de: 'Lenkrad-Drehung', en: 'Steering wheel rotation' }, hint: { de: 'Wie stark sich das Lenkrad im Auto dreht.', en: 'How much the steering wheel turns.' }, min: 0, max: 3, step: 0.05 },
];

export interface VehicleEnumField {
  key: string;
  label: { de: string; en: string };
  options: readonly string[];
}

export const VEHICLE_ENUM_FIELDS: VehicleEnumField[] = [
  { key: 'type', label: { de: 'Fahrzeugtyp', en: 'Vehicle type' }, options: VEHICLE_TYPES },
  { key: 'vehicleClass', label: { de: 'Fahrzeugklasse', en: 'Vehicle class' }, options: VEHICLE_CLASSES },
  { key: 'wheelType', label: { de: 'Radtyp (Tuning)', en: 'Wheel type (tuning)' }, options: WHEEL_TYPES },
  { key: 'dashboardType', label: { de: 'Armaturenbrett', en: 'Dashboard' }, options: DASHBOARD_TYPES },
  { key: 'plateType', label: { de: 'Kennzeichen', en: 'Number plates' }, options: PLATE_TYPES },
  { key: 'swankness', label: { de: 'Nobelheit', en: 'Swankness' }, options: SWANKNESS },
];

export const VEHICLE_TEXT_FIELDS = [
  { key: 'gameName', label: { de: 'Anzeigename-Schlüssel (gameName)', en: 'Display name key (gameName)' } },
  { key: 'vehicleMakeName', label: { de: 'Hersteller', en: 'Make' } },
  { key: 'audioNameHash', label: { de: 'Motorsound', en: 'Engine sound' } },
  { key: 'handlingId', label: { de: 'Handling-Name', en: 'Handling name' } },
] as const;

export interface VehicleData {
  modelName: string;
  numbers: Record<string, number>;
  texts: Record<string, string>;
  flags: string[];
}

function vehicleItems(root: XmlElement): XmlElement[] {
  return descendants(root, 'Item').filter((i) => child(i, 'modelName'));
}

function findVehicle(root: XmlElement, model: string): XmlElement {
  const item = vehicleItems(root).find((i) => childText(i, 'modelName').toLowerCase() === model.toLowerCase());
  if (!item) throw new XmlEditError(`Das Fahrzeug "${model}" steht nicht in der Datei.`);
  return item;
}

/** Namen aller Fahrzeuge einer vehicles.meta. */
export function listVehicles(text: string): string[] {
  return vehicleItems(parseXml(text)).map((i) => childText(i, 'modelName'));
}

/** Liest die Daten eines Fahrzeugs aus vehicles.meta, oder null, wenn es nicht darin steht. */
export function readVehicle(text: string, model: string): VehicleData | null {
  const root = parseXml(text);
  const item = vehicleItems(root).find((i) => childText(i, 'modelName').toLowerCase() === model.toLowerCase());
  if (!item) return null;
  const numbers: Record<string, number> = {};
  const texts: Record<string, string> = {};
  for (const c of item.children) {
    if (c.attributes['value'] !== undefined && c.children.length === 0) {
      const n = Number(c.attributes['value']);
      if (Number.isFinite(n)) numbers[c.name] = n;
    } else if (c.children.length === 0 && c.name !== 'flags') {
      texts[c.name] = c.text;
    }
  }
  return { modelName: childText(item, 'modelName'), numbers, texts, flags: parseFlags(childText(item, 'flags')) };
}

/** Setzt eine Zahl (`value="…"`) in vehicles.meta. Die Schreibweise (Ganzzahl oder Dezimalzahl) bleibt wie in der Datei. */
export function setVehicleNumber(text: string, model: string, key: string, value: number): string {
  const root = parseXml(text);
  const el = child(findVehicle(root, model), key);
  if (!el || el.attributes['value'] === undefined) throw new XmlEditError(`<${key}> hat in "${model}" keinen Wert zum Ändern.`);
  if (!Number.isFinite(value)) throw new XmlEditError('Der Wert ist keine Zahl.');
  const old = el.attributes['value']!;
  const integer = /^-?\d+$/.test(old);
  const decimals = integer ? 0 : (old.split('.')[1]?.length ?? 6);
  return applyEdits(text, [setAttribute(el, 'value', value.toFixed(Math.min(decimals, 8)))]);
}

/** Setzt einen Text (Klasse, Typ, Name …) in vehicles.meta. Ein selbstschließendes Element bekommt dabei Inhalt. */
export function setVehicleText(text: string, model: string, key: string, value: string): string {
  const root = parseXml(text);
  const el = child(findVehicle(root, model), key);
  if (!el) throw new XmlEditError(`<${key}> steht nicht im Fahrzeug "${model}".`);
  return applyEdits(text, [setContent(el, value)]);
}

/** Ersetzt die Flags eines Fahrzeugs. Doppelte werden entfernt, die Reihenfolge bleibt. */
export function setVehicleFlags(text: string, model: string, flags: string[]): string {
  const root = parseXml(text);
  const item = findVehicle(root, model);
  const el = child(item, 'flags');
  const unique = [...new Set(flags)];
  if (el) return applyEdits(text, [setContent(el, unique.join(' '))]);
  return applyEdits(text, [appendChild(text, item, `<flags>${unique.join(' ')}</flags>`, indentOf(text, child(item, 'modelName')!))]);
}

// --- carvariations.meta ------------------------------------------------------------------------------------

export interface VariationColor {
  /** Farbnummern: Karosserie, Zweitfarbe, Perleffekt, Felgen (je nach Datei weitere). */
  indices: number[];
  liveries: boolean[];
}

export interface VariationData {
  colors: VariationColor[];
  kits: string[];
  sirenSettings: number;
  lightSettings: number;
}

function variationItems(root: XmlElement): XmlElement[] {
  return descendants(root, 'Item').filter((i) => child(i, 'modelName') && child(i, 'colors'));
}

function findVariation(root: XmlElement, model: string): XmlElement {
  const item = variationItems(root).find((i) => childText(i, 'modelName').toLowerCase() === model.toLowerCase());
  if (!item) throw new XmlEditError(`Das Fahrzeug "${model}" steht nicht in der Datei.`);
  return item;
}

function colorItems(variation: XmlElement): XmlElement[] {
  const colors = child(variation, 'colors');
  return colors ? childrenNamed(colors, 'Item') : [];
}

export function readVariation(text: string, model: string): VariationData | null {
  const root = parseXml(text);
  const item = variationItems(root).find((i) => childText(i, 'modelName').toLowerCase() === model.toLowerCase());
  if (!item) return null;
  const kits = child(item, 'kits');
  return {
    colors: colorItems(item).map((c) => ({
      indices: (child(c, 'indices')?.text.match(/-?\d+/g) ?? []).map(Number),
      liveries: childrenNamed(child(c, 'liveries') ?? c, 'Item').map((l) => l.attributes['value'] === 'true'),
    })),
    kits: kits ? childrenNamed(kits, 'Item').map((k) => k.text) : [],
    sirenSettings: Number(child(item, 'sirenSettings')?.attributes['value'] ?? 0),
    lightSettings: Number(child(item, 'lightSettings')?.attributes['value'] ?? 0),
  };
}

/** Setzt die Sirenen-Nummer (`sirenSettings`) eines Fahrzeugs. */
export function setVariationSiren(text: string, model: string, id: number): string {
  const root = parseXml(text);
  const item = findVariation(root, model);
  const el = child(item, 'sirenSettings');
  if (el) return applyEdits(text, [setAttribute(el, 'value', String(Math.round(id)))]);
  const anchor = child(item, 'lightSettings') ?? child(item, 'colors')!;
  return applyEdits(text, [
    { start: anchor.end, end: anchor.end, text: `\n${indentOf(text, anchor)}<sirenSettings value="${Math.round(id)}" />` },
  ]);
}

/** Setzt für alle Farbkombinationen, welche Lackierungen (Liveries) freigeschaltet sind. Fehlende Einträge werden ergänzt, überzählige entfernt. */
export function setVariationLiveries(text: string, model: string, enabled: boolean[]): string {
  const root = parseXml(text);
  const item = findVariation(root, model);
  const edits: TextEdit[] = [];
  for (const color of colorItems(item)) {
    const liveries = child(color, 'liveries');
    if (!liveries) continue;
    const existing = childrenNamed(liveries, 'Item');
    const indent = existing[0] ? indentOf(text, existing[0]) : `${indentOf(text, liveries)}  `;
    existing.forEach((l, i) => {
      if (i < enabled.length) edits.push(setAttribute(l, 'value', enabled[i] ? 'true' : 'false'));
      else edits.push(removeElement(text, l));
    });
    if (enabled.length > existing.length) {
      // Neue Einträge als ein Block ans Ende hängen (einzelne Einfügungen an derselben Stelle würden sich überschneiden).
      const block = enabled
        .slice(existing.length)
        .map((on) => `<Item value="${on ? 'true' : 'false'}" />`)
        .join(`\n${indent}`);
      edits.push(appendChild(text, liveries, block, indent));
    }
  }
  return applyEdits(text, edits);
}

/** Setzt die Farbnummern einer Farbkombination (zum Beispiel Karosserie und Zweitfarbe). */
export function setVariationColor(text: string, model: string, colorIndex: number, indices: number[]): string {
  const root = parseXml(text);
  const color = colorItems(findVariation(root, model))[colorIndex];
  const el = color ? child(color, 'indices') : undefined;
  if (!el) throw new XmlEditError(`Die Farbkombination ${colorIndex + 1} gibt es nicht.`);
  const old = text.slice(el.contentStart, el.contentEnd);
  let n = 0;
  // Jede Zahl an ihrem Platz ersetzen, damit Zeilenumbrüche und Einrückung der Datei erhalten bleiben.
  const next = old.replace(/-?\d+/g, (whole) => (n < indices.length ? String(Math.round(indices[n++]!)) : whole));
  return applyEdits(text, [{ start: el.contentStart, end: el.contentEnd, text: next }]);
}

/** Ändert die Farbnummern aller Farbkombinationen auf einmal (nur die angegebenen Stellen, `null` lässt eine Stelle). */
export function setAllVariationColors(text: string, model: string, indices: Array<number | null>): string {
  const root = parseXml(text);
  const colors = colorItems(findVariation(root, model));
  const edits: TextEdit[] = [];
  for (const color of colors) {
    const el = child(color, 'indices');
    if (!el) continue;
    const old = text.slice(el.contentStart, el.contentEnd);
    let n = 0;
    const next = old.replace(/-?\d+/g, (whole) => {
      const v = indices[n++];
      return v === null || v === undefined ? whole : String(Math.round(v));
    });
    edits.push({ start: el.contentStart, end: el.contentEnd, text: next });
  }
  return applyEdits(text, edits);
}
