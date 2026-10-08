import type { GroupOutline, LayoutIsland, UvLayout } from '@toolkit/forge-core';

export interface SheetGroupStyle {
  label: string;
  /** Farbton 0 bis 359. */
  hue: number;
}

export interface SheetOptions {
  /** Kantenlänge der Zeichenfläche in Pixel. */
  size: number;
  fill: boolean;
  labels: boolean;
  /** Bild unter den Flächen, zum Beispiel die vorhandene Livery. */
  base: CanvasImageSource | null;
  selectedKeys: ReadonlySet<string>;
  hoverKey: string | null;
}

/** Farbton je Gruppe: gleichmäßig über den Farbkreis gestreut, damit Nachbarn sich unterscheiden. */
export function hueFor(index: number): number {
  return (index * 137.508) % 360;
}

/** Dreiecke, die kleiner als ein Viertel Pixel sind, malen nichts und würden nur als Strich auftauchen. */
const MIN_AREA_PX = 0.25;

function colorOf(hue: number, alpha: number): string {
  return `hsl(${hue.toFixed(0)} 78% 62% / ${alpha})`;
}

/** Zeichnet das UV-Blatt: Flächen je Teil, Außenränder und optional Namen. Das Blatt ist V-nach-unten wie die Textur. */
export function drawSheet(
  ctx: CanvasRenderingContext2D,
  layout: UvLayout,
  outlines: GroupOutline[],
  islands: LayoutIsland[],
  styles: ReadonlyMap<string, SheetGroupStyle>,
  o: SheetOptions,
): void {
  const S = o.size;
  ctx.clearRect(0, 0, S, S);
  if (o.base) ctx.drawImage(o.base, 0, 0, S, S);
  const outlineByKey = new Map(outlines.map((x) => [x.key, x.edges]));
  const thin = Math.max(1.25, S / 800);

  for (const span of layout.spans) {
    const style = styles.get(span.key) ?? { label: span.key, hue: 0 };
    const emphasized = o.selectedKeys.has(span.key) || o.hoverKey === span.key;

    if (o.fill) {
      ctx.beginPath();
      for (let t = span.start; t < span.start + span.count; t++) {
        const i = t * 6;
        const ax = layout.triangles[i]! * S;
        const ay = layout.triangles[i + 1]! * S;
        let bx = layout.triangles[i + 2]! * S;
        let by = layout.triangles[i + 3]! * S;
        let cx = layout.triangles[i + 4]! * S;
        let cy = layout.triangles[i + 5]! * S;
        const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
        if (Math.abs(area) / 2 < MIN_AREA_PX) continue;
        // Einheitlicher Umlaufsinn: sonst löschen sich überlagerte, gespiegelte Dreiecke im Pfad gegenseitig aus.
        if (area < 0) {
          [bx, cx] = [cx, bx];
          [by, cy] = [cy, by];
        }
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.lineTo(cx, cy);
        ctx.closePath();
      }
      ctx.fillStyle = colorOf(style.hue, emphasized ? 0.5 : 0.2);
      ctx.fill('nonzero');
    }

    const edges = outlineByKey.get(span.key);
    if (edges && edges.length > 0) {
      ctx.beginPath();
      for (let e = 0; e < edges.length; e += 4) {
        ctx.moveTo(edges[e]! * S, edges[e + 1]! * S);
        ctx.lineTo(edges[e + 2]! * S, edges[e + 3]! * S);
      }
      ctx.lineWidth = emphasized ? thin * 2.2 : thin;
      ctx.strokeStyle = colorOf(style.hue, emphasized ? 1 : 0.9);
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  if (o.labels) {
    const fontSize = Math.max(11, Math.round(S / 70));
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, fontSize / 3);
    for (const island of islands) {
      // Kleine Flächen bekommen keinen Namen, er würde sie verdecken.
      if ((island.max[0] - island.min[0]) * S < fontSize * 4 || (island.max[1] - island.min[1]) * S < fontSize * 1.6) continue;
      const style = styles.get(island.key);
      if (!style) continue;
      // Der Name bleibt vollständig im Bild, auch wenn die Fläche am Rand liegt.
      const half = ctx.measureText(style.label).width / 2 + 4;
      const x = Math.min(Math.max(island.centroid[0] * S, half), S - half);
      const y = island.centroid[1] * S;
      ctx.strokeStyle = 'rgba(10, 12, 16, 0.85)';
      ctx.strokeText(style.label, x, y);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(style.label, x, y);
    }
  }
}

/** Zeichnet das Blatt in voller Größe auf eine eigene Fläche und gibt es als PNG zurück (ohne Hervorhebung). */
export function sheetToPng(
  layout: UvLayout,
  outlines: GroupOutline[],
  islands: LayoutIsland[],
  styles: ReadonlyMap<string, SheetGroupStyle>,
  o: Omit<SheetOptions, 'selectedKeys' | 'hoverKey'>,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = o.size;
  canvas.height = o.size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Der Browser kann keine Bilder zeichnen.'));
  drawSheet(ctx, layout, outlines, islands, styles, { ...o, selectedKeys: new Set(), hoverKey: null });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG konnte nicht erzeugt werden.'))), 'image/png');
  });
}
