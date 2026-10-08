import { pickLayoutGroup } from '@toolkit/forge-core';
import type { GroupOutline, LayoutIsland, UvLayout } from '@toolkit/forge-core';
import { useEffect, useRef, useState } from 'react';
import { drawSheet } from '../lib/uv-draw.ts';
import type { SheetGroupStyle } from '../lib/uv-draw.ts';

interface Props {
  layout: UvLayout | null;
  outlines: GroupOutline[];
  islands: LayoutIsland[];
  styles: ReadonlyMap<string, SheetGroupStyle>;
  base: CanvasImageSource | null;
  fill: boolean;
  labels: boolean;
  selectedKeys: ReadonlySet<string>;
  onPick: (key: string | null) => void;
  emptyText: string;
}

/** Bildschirmgröße der Zeichenfläche. Der PNG-Export zeichnet getrennt in der gewählten Größe. */
const PREVIEW_SIZE = 1024;

export function UvSheet({ layout, outlines, islands, styles, base, fill, labels, selectedKeys, onPick, emptyText }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    if (!layout) {
      ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
      return;
    }
    drawSheet(ctx, layout, outlines, islands, styles, { size: PREVIEW_SIZE, fill, labels, base, selectedKeys, hoverKey });
  }, [layout, outlines, islands, styles, base, fill, labels, selectedKeys, hoverKey]);

  const locate = (event: React.MouseEvent<HTMLCanvasElement>): string | null => {
    if (!layout) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    return pickLayoutGroup(layout, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  };

  const hovered = hoverKey ? styles.get(hoverKey)?.label : null;
  const selected = selectedKeys.size === 1 ? styles.get([...selectedKeys][0]!)?.label : null;

  return (
    <div className="uv-sheet">
      <div className="uv-sheet-frame">
        <canvas
          ref={canvas}
          width={PREVIEW_SIZE}
          height={PREVIEW_SIZE}
          className="uv-sheet-canvas"
          role="img"
          aria-label="UV-Blatt"
          style={{ cursor: hoverKey ? 'pointer' : 'default' }}
          onPointerMove={(e) => {
            const key = locate(e);
            setHoverKey((prev) => (prev === key ? prev : key));
          }}
          onPointerLeave={() => setHoverKey(null)}
          onClick={(e) => onPick(locate(e))}
        />
        {!layout ? <p className="uv-sheet-empty muted">{emptyText}</p> : null}
      </div>
      <p className="uv-sheet-caption muted small" aria-live="polite">
        {hovered ?? selected ?? ' '}
      </p>
    </div>
  );
}
