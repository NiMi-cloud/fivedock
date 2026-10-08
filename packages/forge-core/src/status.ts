import type { Lang } from './lang.ts';

export type StepStatus = 'done' | 'active' | 'todo';

export interface PipelineStep {
  id: string;
  label: Record<Lang, string>;
  status: StepStatus;
}

/**
 * Ehrlicher Stand der Prop-Umwandlung. Der Wert wird in der Oberfläche angezeigt.
 * Ein Schritt steht erst auf „done“, wenn Code und Test dafür existieren. „Im Spiel getestet“ bleibt offen,
 * bis ein Export wirklich in FiveM geladen wurde.
 */
export const PROP_PIPELINE: PipelineStep[] = [
  { id: 'read', label: { de: 'Modell lesen und Vorschau', en: 'Read model and preview' }, status: 'done' },
  { id: 'space', label: { de: 'In GTA-Koordinaten umrechnen', en: 'Convert to GTA coordinates' }, status: 'done' },
  { id: 'dds', label: { de: 'Texturen aufbereiten (Zweierpotenz, Mipmaps)', en: 'Prepare textures (power of two, mipmaps)' }, status: 'done' },
  { id: 'ytd', label: { de: 'Texturen in ein YTD packen', en: 'Pack textures into a YTD' }, status: 'done' },
  { id: 'ytyp', label: { de: 'Archetyp (YTYP) schreiben', en: 'Write archetype (YTYP)' }, status: 'done' },
  { id: 'ydr', label: { de: 'Drawable (YDR) mit Shader und Textur schreiben', en: 'Write drawable (YDR) with shader and texture' }, status: 'done' },
  { id: 'box', label: { de: 'Kollision als Box in der Datei', en: 'Box collision in the file' }, status: 'done' },
  { id: 'hull', label: { de: 'Kollision als Hülle und Mesh in der Datei', en: 'Hull and mesh collision in the file' }, status: 'active' },
  { id: 'lod', label: { de: 'Detailstufen (LOD) berechnen', en: 'Compute levels of detail' }, status: 'done' },
  { id: 'alpha', label: { de: 'Durchsichtige Materialien (Alpha-Test, Überblendung)', en: 'Transparent materials (alpha test, blending)' }, status: 'done' },
  { id: 'zip', label: { de: 'Resource mit fxmanifest als ZIP packen', en: 'Pack resource with fxmanifest as ZIP' }, status: 'done' },
  { id: 'game', label: { de: 'Im Spiel (FiveM) getestet', en: 'Tested in game (FiveM)' }, status: 'todo' },
];
