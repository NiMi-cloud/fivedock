/**
 * YTYP (Archetyp-Definitionen) schreiben. Eine YTYP-Datei ist ein "Meta"-Resource (RSC7, Version 2).
 *
 * Eine Meta-Datei beschreibt sich selbst: Sie enthält Tabellen mit den Typen ihrer Daten (Strukturen,
 * Felder, Enums) und danach die eigentlichen Datenblöcke. Dieser Schreiber kennt genau die zwei Typen,
 * die für Props nötig sind: `CMapTypes` (Wurzel) und `CBaseArchetypeDef` (ein Eintrag je Prop).
 *
 * Aufbau (Systemspeicher, jeder Punkt ein Block):
 *   Meta-Objekt (112 B)      Wurzel, Adresse 0x50000000
 *   ResourcePagesInfo (20 B)
 *   Strukturinfos (32 B je Typ), zugehörige Feldtabellen (16 B je Feld)
 *   Enum-Info (24 B) mit Einträgen (8 B je Wert)
 *   Datenblock-Tabelle (16 B je Block)
 *   Datenblöcke: 1 = CMapTypes, 2 = alle CBaseArchetypeDef hintereinander, 3 = Zeigerliste auf Block 2
 *
 * Zeiger innerhalb der Datenblöcke sind kodiert als (Offset << 12) | Blocknummer (Blocknummern ab 1).
 * Alle Feldpositionen, Typcodes und Schlüssel wurden gegen Referenzdateien geprüft (siehe ytyp.test.ts
 * und spikes/04-ytyp). Feldnamen werden ohne Kleinschreibung gehasht (joaatLiteral), Werte der
 * Namensfelder mit normalem joaat (klein geschrieben).
 */

import { joaat, joaatLiteral } from './jenkins.ts';
import { ResourceBlock, buildResource } from './rsc7.ts';
import type { BlockWriter } from './rsc7.ts';

export const YTYP_VERSION = 2;

/** Konstante im Kopf des Meta-Objekts, wie in Referenzdateien. */
const META_VFT = 0x405bc808;
const META_MAGIC = 0x50524430; // "0DRP"
const META_FORMAT = 0x79;

// Typcodes der Felder in den Strukturtabellen.
const FLOAT = 0x21;
const UINT = 0x15;
const FLOAT_XYZ = 0x33;
const HASH = 0x4a;
const INT_ENUM = 0x62;
const ARRAY = 0x52;
const STRUCTURE = 0x05;
const STRUCTURE_POINTER = 0x07;

/** Platzhalter-Name der Eintragsbeschreibung eines Arrays (steht direkt vor dem Array-Feld). */
const ELEMENT = 0x100;

interface FieldInfo {
  /** Hash des Feldnamens (oder ELEMENT). */
  name: number;
  offset: number;
  type: number;
  /** Bei Arrays: Index des Eintrags, der den Elementtyp beschreibt. */
  refIndex: number;
  /** Bei Enums und Strukturen: Hash des Typnamens. */
  refKey: number;
}

function field(name: string | number, offset: number, type: number, refIndex = 0, refKey: string | number = 0): FieldInfo {
  return {
    name: typeof name === 'string' ? joaatLiteral(name) : name,
    offset,
    type,
    refIndex,
    refKey: typeof refKey === 'string' ? joaatLiteral(refKey) : refKey,
  };
}

const ENUM_ASSET_TYPE = 'rage__fwArchetypeDef__eAssetType';

const ARCHETYPE_FIELDS: FieldInfo[] = [
  field('lodDist', 0x08, FLOAT),
  field('flags', 0x0c, UINT),
  field('specialAttribute', 0x10, UINT),
  field('bbMin', 0x20, FLOAT_XYZ),
  field('bbMax', 0x30, FLOAT_XYZ),
  field('bsCentre', 0x40, FLOAT_XYZ),
  field('bsRadius', 0x50, FLOAT),
  field('hdTextureDist', 0x54, FLOAT),
  field('name', 0x58, HASH),
  field('textureDictionary', 0x5c, HASH),
  field('clipDictionary', 0x60, HASH),
  field('drawableDictionary', 0x64, HASH),
  field('physicsDictionary', 0x68, HASH),
  field('assetType', 0x6c, INT_ENUM, 0, ENUM_ASSET_TYPE),
  field('assetName', 0x70, HASH),
  field(ELEMENT, 0x00, STRUCTURE_POINTER),
  field('extensions', 0x78, ARRAY, 15),
];

const MAP_TYPES_FIELDS: FieldInfo[] = [
  field(ELEMENT, 0x00, STRUCTURE_POINTER),
  field('extensions', 0x08, ARRAY, 0),
  field(ELEMENT, 0x00, STRUCTURE_POINTER),
  field('archetypes', 0x18, ARRAY, 2),
  field('name', 0x28, HASH),
  field(ELEMENT, 0x00, HASH),
  field('dependencies', 0x30, ARRAY, 5),
  field(ELEMENT, 0x00, STRUCTURE, 0, 'CCompositeEntityType'),
  field('compositeEntityTypes', 0x40, ARRAY, 7),
];

interface StructInfo {
  name: number;
  key: number;
  unknown8: number;
  size: number;
  fields: FieldInfo[];
}

const STRUCTS: StructInfo[] = [
  { name: joaatLiteral('CBaseArchetypeDef'), key: 0x8fbadaa4, unknown8: 0x400, size: 0x90, fields: ARCHETYPE_FIELDS },
  { name: joaatLiteral('CMapTypes'), key: 0x9b8046d4, unknown8: 0x300, size: 0x50, fields: MAP_TYPES_FIELDS },
];

const ASSET_TYPES = {
  uninitialized: 0,
  fragment: 1,
  drawable: 2,
  drawableDictionary: 3,
  assetless: 4,
} as const;

const ENUM_ENTRIES: Array<[string, number]> = [
  ['ASSET_TYPE_UNINITIALIZED', ASSET_TYPES.uninitialized],
  ['ASSET_TYPE_FRAGMENT', ASSET_TYPES.fragment],
  ['ASSET_TYPE_DRAWABLE', ASSET_TYPES.drawable],
  ['ASSET_TYPE_DRAWABLEDICTIONARY', ASSET_TYPES.drawableDictionary],
  ['ASSET_TYPE_ASSETLESS', ASSET_TYPES.assetless],
];
const ENUM_KEY = 0x6f39632c;

const MAP_TYPES_BLOCK = 1;
const ARCHETYPE_BLOCK = 2;
const POINTER_BLOCK = 3;
const ARCHETYPE_SIZE = 0x90;
const MAP_TYPES_SIZE = 0x50;

export type AssetType = keyof typeof ASSET_TYPES;
export type Vec3 = [number, number, number];

export interface Archetype {
  /** Modellname, so wird das Prop im Spiel aufgerufen. */
  name: string;
  bbMin: Vec3;
  bbMax: Vec3;
  bsCentre: Vec3;
  bsRadius: number;
  /** Ab dieser Entfernung (m) wird das Modell nicht mehr gezeichnet. Standard 200. */
  lodDist?: number;
  hdTextureDist?: number;
  flags?: number;
  specialAttribute?: number;
  /** Name des Texture Dictionary (meist gleich dem Modellnamen). */
  textureDictionary?: string;
  clipDictionary?: string;
  drawableDictionary?: string;
  /** Name der Kollision, bei eingebetteter Kollision gleich dem Modellnamen. */
  physicsDictionary?: string;
  assetType?: AssetType;
  /** Name der Datei (ohne Endung), die das Modell enthält. Standard: Modellname. */
  assetName?: string;
}

function hashOf(text: string | undefined): number {
  return text ? joaat(text) : 0;
}

function pointerTo(blockNumber: number, offset: number): number {
  if (offset > 0xfffff) throw new Error('Zu viele Archetypen für eine YTYP-Datei.');
  return ((offset << 12) | blockNumber) >>> 0;
}

function writeFieldInfo(w: BlockWriter, at: number, f: FieldInfo): void {
  w.u32(at, f.name);
  w.u32(at + 4, f.offset);
  w.u8(at + 8, f.type);
  w.u16(at + 10, f.refIndex);
  w.u32(at + 12, f.refKey);
}

function writeArchetype(w: BlockWriter, at: number, a: Archetype): void {
  const f32 = (offset: number, value: number) => w.f32(at + offset, value);
  const vec = (offset: number, v: Vec3) => v.forEach((x, i) => f32(offset + i * 4, x));

  f32(0x08, a.lodDist ?? 200);
  w.u32(at + 0x0c, a.flags ?? 0);
  w.u32(at + 0x10, a.specialAttribute ?? 0);
  vec(0x20, a.bbMin);
  vec(0x30, a.bbMax);
  vec(0x40, a.bsCentre);
  f32(0x50, a.bsRadius);
  f32(0x54, a.hdTextureDist ?? 100);
  w.u32(at + 0x58, joaat(a.name));
  w.u32(at + 0x5c, hashOf(a.textureDictionary));
  w.u32(at + 0x60, hashOf(a.clipDictionary));
  w.u32(at + 0x64, hashOf(a.drawableDictionary));
  w.u32(at + 0x68, hashOf(a.physicsDictionary));
  w.u32(at + 0x6c, ASSET_TYPES[a.assetType ?? 'drawable']);
  w.u32(at + 0x70, joaat(a.assetName ?? a.name));
  // extensions (0x78): leeres Array, bleibt 0
}

function validate(name: string, archetypes: Archetype[]): void {
  if (!/^[\x21-\x7e]+$/.test(name)) throw new Error(`Ungültiger YTYP-Name "${name}".`);
  if (archetypes.length === 0) throw new Error('Eine YTYP-Datei braucht mindestens einen Archetyp.');
  if (archetypes.length > 7000) throw new Error('Zu viele Archetypen.');
  const seen = new Set<number>();
  for (const a of archetypes) {
    if (!/^[\x21-\x7e]+$/.test(a.name)) throw new Error(`Ungültiger Modellname "${a.name}".`);
    const h = joaat(a.name);
    if (seen.has(h)) throw new Error(`Modellname doppelt oder Hash-Kollision: "${a.name}".`);
    seen.add(h);
    const numbers = [...a.bbMin, ...a.bbMax, ...a.bsCentre, a.bsRadius];
    if (numbers.some((n) => !Number.isFinite(n))) throw new Error(`Archetyp ${a.name}: ungültige Maße.`);
  }
}

/** Baut eine YTYP-Datei mit den angegebenen Archetypen. `name` ist der Name der Datei (ohne Endung). */
export function buildYtyp(name: string, archetypes: Archetype[]): Uint8Array {
  validate(name, archetypes);
  const n = archetypes.length;

  // --- Blöcke anlegen (Adressen werden später vergeben) ---------------------------------------------
  const pagesInfo = new ResourceBlock(
    20,
    (w, ctx) => {
      w.u8(8, ctx.systemPageCount);
      w.u8(9, ctx.graphicsPageCount);
    },
    'pagesInfo',
  );

  const fieldBlocks = STRUCTS.map(
    (s) => new ResourceBlock(s.fields.length * 16, (w) => s.fields.forEach((f, i) => writeFieldInfo(w, i * 16, f)), `fields:${s.name}`),
  );
  const structInfos = new ResourceBlock(
    STRUCTS.length * 32,
    (w) => {
      STRUCTS.forEach((s, i) => {
        const at = i * 32;
        w.u32(at, s.name);
        w.u32(at + 4, s.key);
        w.u32(at + 8, s.unknown8);
        w.pointer(at + 16, fieldBlocks[i]!);
        w.u32(at + 24, s.size);
        w.u16(at + 30, s.fields.length);
      });
    },
    'structInfos',
  );

  const enumEntries = new ResourceBlock(
    ENUM_ENTRIES.length * 8,
    (w) =>
      ENUM_ENTRIES.forEach(([label, value], i) => {
        w.u32(i * 8, joaatLiteral(label));
        w.u32(i * 8 + 4, value);
      }),
    'enumEntries',
  );
  const enumInfos = new ResourceBlock(
    24,
    (w) => {
      w.u32(0, joaatLiteral(ENUM_ASSET_TYPE));
      w.u32(4, ENUM_KEY);
      w.pointer(8, enumEntries);
      w.u32(16, ENUM_ENTRIES.length);
    },
    'enumInfos',
  );

  const mapTypesData = new ResourceBlock(
    MAP_TYPES_SIZE,
    (w) => {
      // archetypes (0x18): Zeiger auf Block 3, Anzahl und Kapazität
      w.u32(0x18, pointerTo(POINTER_BLOCK, 0));
      w.u16(0x20, n);
      w.u16(0x22, n);
      w.u32(0x28, joaat(name));
    },
    'CMapTypes',
  );
  const archetypeData = new ResourceBlock(
    ARCHETYPE_SIZE * n,
    (w) => archetypes.forEach((a, i) => writeArchetype(w, i * ARCHETYPE_SIZE, a)),
    'CBaseArchetypeDef[]',
  );
  const pointerSize = Math.ceil((8 * n) / 16) * 16;
  const pointerData = new ResourceBlock(
    pointerSize,
    (w) => archetypes.forEach((_, i) => w.u32(i * 8, pointerTo(ARCHETYPE_BLOCK, i * ARCHETYPE_SIZE))),
    'pointers',
  );

  const dataBlocks = [
    { hash: joaatLiteral('CMapTypes'), length: MAP_TYPES_SIZE, block: mapTypesData },
    { hash: joaatLiteral('CBaseArchetypeDef'), length: ARCHETYPE_SIZE * n, block: archetypeData },
    { hash: STRUCTURE_POINTER, length: pointerSize, block: pointerData },
  ];
  const dataBlockTable = new ResourceBlock(
    dataBlocks.length * 16,
    (w) =>
      dataBlocks.forEach((d, i) => {
        w.u32(i * 16, d.hash);
        w.u32(i * 16 + 4, d.length);
        w.pointer(i * 16 + 8, d.block);
      }),
    'dataBlockTable',
  );

  const root = new ResourceBlock(
    112,
    (w) => {
      w.u32(0x00, META_VFT);
      w.u32(0x04, 1);
      w.pointer(0x08, pagesInfo);
      w.u32(0x10, META_MAGIC);
      w.u16(0x14, META_FORMAT);
      w.u32(0x1c, MAP_TYPES_BLOCK); // Wurzel-Datenblock
      w.pointer(0x20, structInfos);
      w.pointer(0x28, enumInfos);
      w.pointer(0x30, dataBlockTable);
      w.u16(0x48, STRUCTS.length);
      w.u16(0x4a, 1);
      w.u16(0x4c, dataBlocks.length);
    },
    'meta',
  );

  return buildResource({
    version: YTYP_VERSION,
    flagStyle: 'meta',
    system: [
      root,
      pagesInfo,
      structInfos,
      ...fieldBlocks,
      enumInfos,
      enumEntries,
      dataBlockTable,
      mapTypesData,
      archetypeData,
      pointerData,
    ],
    graphics: [],
  });
}
