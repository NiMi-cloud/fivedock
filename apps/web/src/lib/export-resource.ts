import { addTextures, analyzeVehiclePack, applyAddedParts, buildVehicleResource, removeParts, ruleOfPart, writeZip } from '@toolkit/forge-core';
import type { AddedPart, PackFiles, PartRule, PlannedTexture, VehiclePart } from '@toolkit/forge-core';
import { readYtd } from '@toolkit/rage-formats';
import type { Yft } from '@toolkit/rage-formats';

export interface EditedResourceInput {
  files: PackFiles;
  yft: Yft;
  parts: VehiclePart[];
  /** Zum Entfernen markierte Teile. */
  removed: ReadonlySet<string>;
  /** Alle .yft-Dateien des Pakets. */
  yftPaths: string[];
  /** Geänderte Meta-Dateien, Pfad → Inhalt. */
  metaFiles: Record<string, Uint8Array>;
  resourceName: string;
  /** Anzeigename des Fahrzeugs im Spiel, leer = keiner. */
  displayName?: string;
  /** Neue Anbauteile (zum Beispiel Lichtbalken), die in alle Modelldateien eingebaut werden. */
  added?: AddedPart[];
}

export interface EditedResourceResult {
  zip: Uint8Array;
  /** Entfernte Dreiecke in allen Modelldateien zusammen. */
  removedTriangles: number;
  patchedModels: string[];
  changedMetas: string[];
  /** Modelldateien, in die die Anbauteile eingebaut wurden. */
  addedModels: string[];
  /** Modelldateien, in die sie nicht passten, mit der Meldung. Die Datei bleibt dort ohne Anbauteile. */
  addedFailures: Array<{ file: string; message: string }>;
  /** Texturdateien, in die Texturen der Anbauteile aufgenommen wurden. */
  texturedFiles: string[];
}

const baseName = (path: string) => path.split('/').pop() ?? path;

/** Wendet alle Änderungen an und baut daraus eine fertige Resource als ZIP: geänderte Modelle, geänderte Metas, neues Manifest. */
export function buildEditedResource(input: EditedResourceInput): EditedResourceResult {
  const files: PackFiles = { ...input.files, ...input.metaFiles };

  const unique = new Map<string, PartRule>();
  for (const p of input.parts) {
    if (!input.removed.has(p.id)) continue;
    const rule = ruleOfPart(input.yft, p);
    unique.set(JSON.stringify(rule), rule);
  }
  const rules = [...unique.values()];

  let removedTriangles = 0;
  const patchedModels: string[] = [];
  if (rules.length > 0) {
    for (const path of input.yftPaths) {
      const result = removeParts(files[path]!, rules);
      if (result.removed > 0) {
        files[path] = result.file;
        removedTriangles += result.removed;
        patchedModels.push(baseName(path));
      }
    }
  }

  const addedModels: string[] = [];
  const addedFailures: Array<{ file: string; message: string }> = [];
  const texturedFiles: string[] = [];
  if (input.added && input.added.length > 0) {
    // Die Texturdateien des Fahrzeugs (normal und +hi): Namen vorhandener Texturen, damit neue nicht kollidieren, und Ziel für neue.
    const normalized = (path: string) => baseName(path).toLowerCase().replace(/\+hi(?=\.ytd$)/, '');
    const ytdPaths = Object.keys(files).filter((path) => /\.ytd$/i.test(path) && normalized(path) === `${input.resourceName.toLowerCase()}.ytd`);
    const taken = new Set<string>();
    for (const path of ytdPaths) {
      try {
        for (const t of readYtd(files[path]!)) taken.add(t.name.toLowerCase());
      } catch {
        // eine nicht lesbare Texturdatei trägt keine Namen bei
      }
    }
    let textures: PlannedTexture[] = [];
    for (const path of input.yftPaths) {
      try {
        const applied = applyAddedParts(files[path]!, input.added, input.yft, { takenTextures: taken });
        files[path] = applied.file;
        if (textures.length === 0) textures = applied.textures;
        addedModels.push(baseName(path));
      } catch (e) {
        addedFailures.push({ file: baseName(path), message: e instanceof Error ? e.message : String(e) });
      }
    }
    if (textures.length > 0) {
      if (ytdPaths.length === 0) {
        addedFailures.push({ file: `${input.resourceName}.ytd`, message: 'Es gibt keine Texturdatei des Fahrzeugs, in die die Texturen der Anbauteile passen.' });
      }
      for (const path of ytdPaths) {
        try {
          files[path] = addTextures(files[path]!, textures.map((t) => ({ name: t.name, width: t.width, height: t.height, rgba: t.rgba }))).ytd;
          texturedFiles.push(baseName(path));
        } catch (e) {
          addedFailures.push({ file: baseName(path), message: e instanceof Error ? e.message : String(e) });
        }
      }
    }
  }

  const analysis = analyzeVehiclePack(files);
  const built = buildVehicleResource(files, analysis, {
    resourceName: input.resourceName,
    displayNames: input.displayName?.trim() ? Object.fromEntries(analysis.models.map((m) => [m.name.toLowerCase(), input.displayName!.trim()])) : undefined,
  });
  const prefixed: PackFiles = {};
  for (const [path, bytes] of Object.entries(built.files)) prefixed[`${input.resourceName}/${path}`] = bytes;
  return { zip: writeZip(prefixed), removedTriangles, patchedModels, changedMetas: Object.keys(input.metaFiles).map(baseName), addedModels, addedFailures, texturedFiles };
}
