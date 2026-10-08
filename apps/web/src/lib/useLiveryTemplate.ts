import { analyzeLayout, availableUvSets, buildIslands, buildOutlines, buildUvLayout, liveryScope, suggestUvSet } from '@toolkit/forge-core';
import type { LayoutGroup, VehiclePart } from '@toolkit/forge-core';
import { canDecode, decodeTexture } from '@toolkit/rage-formats';
import type { Yft } from '@toolkit/rage-formats';
import { useMemo, useState } from 'react';
import { drawRgba } from './image.ts';
import { hueFor } from './uv-draw.ts';
import type { PackTexture } from './vehicle-textures.ts';
import type { SheetGroupStyle } from './uv-draw.ts';

export interface VehicleGroup {
  key: string;
  category: string;
  label: { de: string; en: string };
  parts: VehiclePart[];
}

export type BaseStatus = 'none' | 'missing' | 'undecodable' | 'ready';

export const SHEET_SIZES = [1024, 2048, 4096] as const;
export type SheetSize = (typeof SHEET_SIZES)[number];

/** Zustand und abgeleitete Daten der UV-Vorlage: welche Teile, welcher UV-Satz, Prüfbericht, vorhandene Livery-Textur. */
export function useLiveryTemplate(
  yft: Yft | null,
  groups: VehicleGroup[],
  textures: ReadonlyMap<string, PackTexture>,
  selectedKey: string | null,
  lang: 'de' | 'en',
) {
  const [uvSetChoice, setUvSetChoice] = useState<number | null>(null);
  const [onlySelection, setOnlySelection] = useState(false);
  const [fill, setFill] = useState(true);
  const [labels, setLabels] = useState(true);
  const [useBase, setUseBase] = useState(false);
  const [size, setSize] = useState<SheetSize>(2048);

  const paintGroups = useMemo<LayoutGroup[]>(() => groups.filter((g) => g.category === 'paint').map((g) => ({ key: g.key, parts: g.parts })), [groups]);
  const scope = useMemo(() => (yft && paintGroups.length > 0 ? liveryScope(yft, paintGroups) : null), [yft, paintGroups]);

  const chosenGroups = useMemo<LayoutGroup[]>(() => {
    if (!scope) return [];
    if (onlySelection && selectedKey) return scope.groups.filter((g) => g.key === selectedKey);
    return scope.groups;
  }, [scope, onlySelection, selectedKey]);

  const sets = useMemo(() => (yft && scope ? availableUvSets(yft, scope.groups) : []), [yft, scope]);
  const suggested = useMemo(() => (yft && scope ? suggestUvSet(yft, scope.groups) : 0), [yft, scope]);
  const uvSet = uvSetChoice !== null && sets.includes(uvSetChoice) ? uvSetChoice : suggested;

  const layout = useMemo(() => (yft && chosenGroups.length > 0 && sets.includes(uvSet) ? buildUvLayout(yft, chosenGroups, uvSet) : null), [yft, chosenGroups, sets, uvSet]);
  const outlines = useMemo(() => (layout ? buildOutlines(layout) : []), [layout]);
  const islands = useMemo(() => (layout ? buildIslands(layout) : []), [layout]);
  const report = useMemo(() => (layout ? analyzeLayout(layout, 512) : null), [layout]);

  const styles = useMemo(() => {
    const map = new Map<string, SheetGroupStyle>();
    paintGroups.forEach((g, i) => {
      const info = groups.find((x) => x.key === g.key);
      map.set(g.key, { label: info ? info.label[lang] : g.key, hue: hueFor(i) });
    });
    return map;
  }, [paintGroups, groups, lang]);

  const textureName = scope?.hasLayer ? (scope.textures[0] ?? null) : null;
  const found = textureName ? (textures.get(textureName.toLowerCase()) ?? null) : null;
  const texture = found?.texture ?? null;
  const { baseImage, baseStatus } = useMemo<{ baseImage: HTMLCanvasElement | null; baseStatus: BaseStatus }>(() => {
    if (!textureName) return { baseImage: null, baseStatus: 'none' };
    if (!texture) return { baseImage: null, baseStatus: 'missing' };
    if (!canDecode(texture.format)) return { baseImage: null, baseStatus: 'undecodable' };
    try {
      const canvas = document.createElement('canvas');
      drawRgba(canvas, decodeTexture(texture, 0));
      return { baseImage: canvas, baseStatus: 'ready' };
    } catch {
      return { baseImage: null, baseStatus: 'undecodable' };
    }
  }, [textureName, texture]);

  return {
    scope,
    paintGroupCount: paintGroups.length,
    sets,
    uvSet,
    setUvSet: setUvSetChoice,
    onlySelection,
    setOnlySelection,
    fill,
    setFill,
    labels,
    setLabels,
    useBase,
    setUseBase,
    size,
    setSize,
    layout,
    outlines,
    islands,
    report,
    styles,
    textureName,
    texture,
    texturePath: found?.path ?? null,
    textureAllPaths: found?.allPaths ?? [],
    /** Die vorhandene Livery als Bild (unabhängig vom Schalter), zum Beispiel für die 3D-Ansicht. */
    existingImage: baseImage,
    /** UV-Satz, auf dem das Spiel die Livery darstellt (nicht der im Blatt gewählte). */
    liveryUvSet: suggested,
    baseImage: useBase ? baseImage : null,
    baseStatus,
  };
}
