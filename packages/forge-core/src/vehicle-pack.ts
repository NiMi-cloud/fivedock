/**
 * Add-on-Fahrzeug einrichten: Aus den Dateien eines heruntergeladenen Fahrzeugs (Modelle, Texturen, Meta-Dateien) wird eine
 * saubere FiveM-Resource mit `fxmanifest.lua`, `stream/` und `data/`. Die Meta-Dateien werden am Inhalt erkannt, nicht am
 * Dateinamen, und gegeneinander geprüft (gibt es zu jedem Fahrzeug Modell, Textur und Handling?).
 */

import { XmlError, child, childText, childrenNamed, descendants, parseXml } from './xml.ts';
import type { XmlElement } from './xml.ts';
import type { PackFiles } from './texture-lab.ts';

export type MetaKind = 'vehicles' | 'handling' | 'variations' | 'carcols' | 'layouts';

interface MetaInfo {
  root: string;
  /** Typ der `data_file`-Zeile im Manifest. */
  dataFile: string;
  /** Standarddateiname im Ordner `data/`. */
  fileName: string;
}

const META_INFO: Record<MetaKind, MetaInfo> = {
  vehicles: { root: 'CVehicleModelInfo__InitDataList', dataFile: 'VEHICLE_METADATA_FILE', fileName: 'vehicles.meta' },
  handling: { root: 'CHandlingDataMgr', dataFile: 'HANDLING_FILE', fileName: 'handling.meta' },
  variations: { root: 'CVehicleModelInfoVariation', dataFile: 'VEHICLE_VARIATION_FILE', fileName: 'carvariations.meta' },
  carcols: { root: 'CVehicleModelInfoVarGlobal', dataFile: 'CARCOLS_FILE', fileName: 'carcols.meta' },
  layouts: { root: 'CVehicleMetadataMgr', dataFile: 'VEHICLE_LAYOUTS_FILE', fileName: 'vehiclelayouts.meta' },
};

const META_ORDER: MetaKind[] = ['handling', 'vehicles', 'carcols', 'variations', 'layouts'];

export type StreamKind = 'model' | 'texture' | 'drawable' | 'bounds' | 'other';

const STREAM_EXTENSIONS: Record<string, StreamKind> = {
  '.yft': 'model',
  '.ytd': 'texture',
  '.ydr': 'drawable',
  '.ydd': 'drawable',
  '.ybn': 'bounds',
  '.ycd': 'other',
  '.ymt': 'other',
  '.ypt': 'other',
  '.ytyp': 'other',
};

export interface MetaFile {
  path: string;
  kind: MetaKind;
  /** Zielpfad in der Resource, zum Beispiel "data/vehicles.meta". */
  target: string;
  bytes: Uint8Array;
}

export interface StreamFile {
  path: string;
  /** Name der Datei ohne Ordner. */
  name: string;
  kind: StreamKind;
  size: number;
  /** true, wenn die Datei nicht mit RSC7 beginnt (zum Beispiel verschlüsselt durch Cfx.re-Escrow). */
  unreadable: boolean;
}

export interface VehicleModel {
  /** Spawn-Name (`modelName` in vehicles.meta). */
  name: string;
  txdName: string;
  handlingId: string;
  gameName: string;
  sirenSetting: string;
  hasModel: boolean;
  hasHighModel: boolean;
  hasTexture: boolean;
  hasHandling: boolean;
  hasVariation: boolean;
}

export type IssueLevel = 'error' | 'warning' | 'info';

export type IssueCode =
  | 'no-vehicles-meta'
  | 'no-model-files'
  | 'meta-unreadable'
  | 'meta-unknown'
  | 'model-missing'
  | 'high-model-missing'
  | 'texture-missing'
  | 'handling-missing'
  | 'variation-orphan'
  | 'siren-missing'
  | 'encrypted-file'
  | 'bad-spawn-name'
  | 'duplicate-model'
  | 'model-without-meta'
  | 'old-manifest';

export interface Issue {
  level: IssueLevel;
  code: IssueCode;
  /** Werte für den Meldungstext (Dateiname, Modellname …). */
  params: Record<string, string>;
}

export interface VehiclePackAnalysis {
  models: VehicleModel[];
  metas: MetaFile[];
  stream: StreamFile[];
  /** Dateien, die nicht in die Resource kommen (Bilder, Texte, ein alter Manifest …). */
  ignored: string[];
  issues: Issue[];
  /** Vorschlag für den Namen der Resource. */
  resourceName: string;
}

const baseName = (path: string) => path.split('/').pop() ?? path;
const extension = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
};

const RSC7 = [0x52, 0x53, 0x43, 0x37];

function isRsc7(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && RSC7.every((v, i) => bytes[i] === v);
}

const decoder = new TextDecoder('utf-8');

/** Erkennt den Typ einer Meta-Datei am Wurzelelement. Gibt null zurück, wenn es keine bekannte Fahrzeug-Meta ist. */
function detectMeta(bytes: Uint8Array): { kind: MetaKind; root: XmlElement } | { error: string } | null {
  let root: XmlElement;
  try {
    root = parseXml(decoder.decode(bytes));
  } catch (e) {
    return { error: e instanceof XmlError ? e.message : String(e) };
  }
  for (const kind of META_ORDER) if (META_INFO[kind].root === root.name) return { kind, root };
  return null;
}

/** Spawn-Namen: Buchstaben, Ziffern und Unterstrich, so wie das Spiel sie hasht und Befehle sie erwarten. */
const SPAWN_NAME = /^[A-Za-z0-9_]+$/;

function sanitizeResourceName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'fahrzeug';
}

/**
 * Untersucht die Dateien eines Fahrzeugs: welche Fahrzeuge gibt es, was fehlt, was passt nicht zusammen.
 * Liest nichts außerhalb der Dateien, verändert nichts.
 */
export function analyzeVehiclePack(files: PackFiles): VehiclePackAnalysis {
  const issues: Issue[] = [];
  const stream: StreamFile[] = [];
  const metas: MetaFile[] = [];
  const ignored: string[] = [];
  const usedTargets = new Set<string>();

  const parsedVehicles: Array<{ item: XmlElement; source: string }> = [];
  const handlingNames = new Set<string>();
  /** Spawn-Name (klein) → Sirenen-Nummer aus carvariations.meta. */
  const variationModels = new Map<string, string>();
  const sirenIds = new Set<string>();

  for (const path of Object.keys(files).sort()) {
    const bytes = files[path]!;
    const name = baseName(path);
    const ext = extension(name);
    const lower = name.toLowerCase();

    if (ext in STREAM_EXTENSIONS) {
      const unreadable = !isRsc7(bytes);
      stream.push({ path, name, kind: STREAM_EXTENSIONS[ext]!, size: bytes.length, unreadable });
      if (unreadable) issues.push({ level: 'warning', code: 'encrypted-file', params: { file: name } });
      continue;
    }
    if (lower === 'fxmanifest.lua' || lower === '__resource.lua') {
      ignored.push(path);
      issues.push({ level: 'info', code: 'old-manifest', params: { file: name } });
      continue;
    }
    if (ext === '.meta' || ext === '.xml') {
      const detected = detectMeta(bytes);
      if (detected === null) {
        ignored.push(path);
        if (ext === '.meta') issues.push({ level: 'warning', code: 'meta-unknown', params: { file: name } });
        continue;
      }
      if ('error' in detected) {
        ignored.push(path);
        issues.push({ level: 'error', code: 'meta-unreadable', params: { file: name, detail: detected.error } });
        continue;
      }
      const { kind, root } = detected;
      let target = `data/${META_INFO[kind].fileName}`;
      for (let n = 2; usedTargets.has(target); n++) target = `data/${META_INFO[kind].fileName.replace(/\.meta$/, '')}_${n}.meta`;
      usedTargets.add(target);
      metas.push({ path, kind, target, bytes });

      if (kind === 'vehicles') {
        for (const item of descendants(root, 'Item').filter((i) => child(i, 'modelName'))) parsedVehicles.push({ item, source: name });
      } else if (kind === 'handling') {
        for (const h of descendants(root, 'Item')) {
          const handlingName = childText(h, 'handlingName');
          if (handlingName) handlingNames.add(handlingName.toLowerCase());
        }
      } else if (kind === 'variations') {
        for (const v of descendants(root, 'Item')) {
          const model = childText(v, 'modelName');
          if (model) variationModels.set(model.toLowerCase(), child(v, 'sirenSettings')?.attributes['value'] ?? '0');
        }
      } else if (kind === 'carcols') {
        const sirens = child(root, 'Sirens');
        for (const s of sirens ? childrenNamed(sirens, 'Item') : []) {
          const id = child(s, 'id')?.attributes['value'];
          if (id) sirenIds.add(id);
        }
      }
      continue;
    }
    ignored.push(path);
  }

  const streamNames = new Set(stream.map((s) => s.name.toLowerCase()));
  const models: VehicleModel[] = [];
  const seen = new Set<string>();
  for (const { item } of parsedVehicles) {
    const name = childText(item, 'modelName');
    const txdName = childText(item, 'txdName') || name;
    const handlingId = childText(item, 'handlingId');
    const model: VehicleModel = {
      name,
      txdName,
      handlingId,
      gameName: childText(item, 'gameName') || name.toUpperCase(),
      sirenSetting: variationModels.get(name.toLowerCase()) ?? '0',
      hasModel: streamNames.has(`${name.toLowerCase()}.yft`),
      hasHighModel: streamNames.has(`${name.toLowerCase()}_hi.yft`),
      hasTexture: streamNames.has(`${txdName.toLowerCase()}.ytd`),
      hasHandling: handlingNames.has(handlingId.toLowerCase()),
      hasVariation: variationModels.has(name.toLowerCase()),
    };
    if (seen.has(name.toLowerCase())) {
      issues.push({ level: 'warning', code: 'duplicate-model', params: { model: name } });
      continue;
    }
    seen.add(name.toLowerCase());
    models.push(model);

    if (!SPAWN_NAME.test(name)) issues.push({ level: 'warning', code: 'bad-spawn-name', params: { model: name } });
    if (!model.hasModel) issues.push({ level: 'error', code: 'model-missing', params: { model: name, file: `${name}.yft` } });
    else if (!model.hasHighModel) issues.push({ level: 'info', code: 'high-model-missing', params: { model: name, file: `${name}_hi.yft` } });
    if (!model.hasTexture) issues.push({ level: 'warning', code: 'texture-missing', params: { model: name, file: `${txdName}.ytd` } });
    if (!model.hasHandling) issues.push({ level: 'warning', code: 'handling-missing', params: { model: name, handling: handlingId || '(leer)' } });
    if (model.sirenSetting && model.sirenSetting !== '0' && !sirenIds.has(model.sirenSetting)) {
      issues.push({ level: 'warning', code: 'siren-missing', params: { model: name, id: model.sirenSetting } });
    }
  }

  for (const v of variationModels.keys()) {
    if (!seen.has(v)) issues.push({ level: 'warning', code: 'variation-orphan', params: { model: v } });
  }

  if (!metas.some((m) => m.kind === 'vehicles')) issues.push({ level: 'error', code: 'no-vehicles-meta', params: {} });
  if (!stream.some((s) => s.kind === 'model')) issues.push({ level: 'error', code: 'no-model-files', params: {} });
  // Modelle ohne Eintrag in der vehicles.meta: .yft ohne passendes Fahrzeug (außer _hi- und Rad-Dateien)
  for (const s of stream) {
    if (s.kind !== 'model') continue;
    const model = s.name.replace(/\.yft$/i, '').replace(/_hi$/i, '').toLowerCase();
    if (metas.some((m) => m.kind === 'vehicles') && !seen.has(model)) issues.push({ level: 'warning', code: 'model-without-meta', params: { file: s.name } });
  }

  const levelOrder: Record<IssueLevel, number> = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);

  return {
    models,
    metas,
    stream,
    ignored,
    issues,
    resourceName: sanitizeResourceName(models[0]?.name ?? stream.find((s) => s.kind === 'model')?.name.replace(/\.yft$/i, '') ?? 'fahrzeug'),
  };
}

export interface BuildResourceOptions {
  resourceName: string;
  /** Anzeigenamen je Spawn-Name (klein geschrieben). Fahrzeuge ohne Eintrag behalten ihren Namen aus der Meta. */
  displayNames?: Record<string, string>;
}

export interface BuiltResource {
  /** Dateien der Resource, Pfade relativ zum Resource-Ordner. */
  files: PackFiles;
  manifest: string;
}

function luaString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ')}'`;
}

/** Baut den Text der `fxmanifest.lua` für die gefundenen Meta-Dateien. */
export function buildManifest(metas: MetaFile[], hasNames: boolean): string {
  const lines = ["fx_version 'cerulean'", "game 'gta5'", ''];
  if (metas.length > 0) {
    lines.push('files {');
    for (const m of metas) lines.push(`  ${luaString(m.target)},`);
    lines.push('}', '');
    for (const kind of META_ORDER) {
      for (const m of metas.filter((x) => x.kind === kind)) lines.push(`data_file ${luaString(META_INFO[kind].dataFile)} ${luaString(m.target)}`);
    }
  }
  if (hasNames) lines.push('', "client_script 'vehicle_names.lua'");
  lines.push('');
  return lines.join('\n');
}

/**
 * Ordnet die Dateien zu einer Resource: Modelle und Texturen nach `stream/`, Meta-Dateien nach `data/` (unter ihrem
 * Standardnamen), dazu Manifest und, wenn Anzeigenamen angegeben sind, `vehicle_names.lua`. Alles andere bleibt draußen.
 */
export function buildVehicleResource(files: PackFiles, analysis: VehiclePackAnalysis, options: BuildResourceOptions): BuiltResource {
  const out: PackFiles = {};
  for (const s of analysis.stream) {
    let target = `stream/${s.name}`;
    for (let n = 2; target in out; n++) target = `stream/${n}_${s.name}`;
    out[target] = files[s.path]!;
  }
  for (const m of analysis.metas) out[m.target] = files[m.path]!;

  const names = options.displayNames ?? {};
  const named = analysis.models.filter((m) => (names[m.name.toLowerCase()] ?? '').trim() !== '');
  if (named.length > 0) {
    const entries = named.map((m) => `  AddTextEntry(${luaString(m.gameName)}, ${luaString(names[m.name.toLowerCase()]!.trim())})`);
    out['vehicle_names.lua'] = new TextEncoder().encode(`-- Anzeigenamen der Fahrzeuge (gameName aus vehicles.meta)\nCreateThread(function()\n${entries.join('\n')}\nend)\n`);
  }
  const manifest = buildManifest(analysis.metas, named.length > 0);
  out['fxmanifest.lua'] = new TextEncoder().encode(manifest);
  return { files: out, manifest };
}
