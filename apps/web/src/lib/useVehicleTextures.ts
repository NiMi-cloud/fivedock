import type { VehiclePart } from '@toolkit/forge-core';
import { decodeTexture, levelForPreview } from '@toolkit/rage-formats';
import type { Yft } from '@toolkit/rage-formats';
import { useEffect, useState } from 'react';
import { drawRgba } from './image.ts';
import type { PackTexture } from './vehicle-textures.ts';

/** Kantenlänge, ab der eine Textur in der Vorschau nicht mehr feiner dekodiert wird. */
const PREVIEW_EDGE = 512;

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Name der Diffuse-Textur eines Shaders (`DiffuseSampler`), sonst null. */
function diffuseName(yft: Yft, shader: number): string | null {
  return yft.shaders[shader]?.textures.find((t) => t.param === 'DiffuseSampler' && t.name)?.name ?? null;
}

export interface VehicleTextureState {
  images: ReadonlyMap<number, HTMLCanvasElement> | null;
  /** [fertig, gesamt] während des Dekodierens, sonst null. */
  progress: [number, number] | null;
}

/**
 * Dekodiert die Diffuse-Texturen der Teile ohne Lack (Innenraum, Licht, Reifen, Anbauteile) nacheinander, ohne die Seite zu
 * blockieren. Jede Textur wird nur einmal dekodiert, auch wenn mehrere Shader sie benutzen. Große Texturen werden in einer
 * kleineren Mip-Stufe gelesen (höchstens etwa 512 Pixel), das reicht für die Ansicht.
 */
export function useVehicleTextures(
  yft: Yft | null,
  parts: VehiclePart[],
  textures: ReadonlyMap<string, PackTexture>,
  enabled: boolean,
): VehicleTextureState {
  const [state, setState] = useState<VehicleTextureState>({ images: null, progress: null });

  useEffect(() => {
    if (!yft || !enabled || textures.size === 0) {
      setState({ images: null, progress: null });
      return;
    }
    let cancelled = false;
    const shaders = new Set<number>();
    for (const p of parts) if (p.category !== 'paint' && p.category !== 'glass') shaders.add(p.shader);
    const jobs = [...shaders].flatMap((shader) => {
      const name = diffuseName(yft, shader);
      const found = name ? textures.get(name.toLowerCase()) : undefined;
      return found ? [{ shader, name: name!.toLowerCase(), texture: found.texture }] : [];
    });
    const byTexture = new Map<string, HTMLCanvasElement>();
    const images = new Map<number, HTMLCanvasElement>();
    const publish = (done: number) => setState({ images: new Map(images), progress: done < jobs.length ? [done, jobs.length] : null });

    void (async () => {
      let done = 0;
      for (const job of jobs) {
        await yieldToUi();
        if (cancelled) return;
        let canvas = byTexture.get(job.name);
        if (!canvas) {
          try {
            canvas = document.createElement('canvas');
            drawRgba(canvas, decodeTexture(job.texture, levelForPreview(job.texture, PREVIEW_EDGE)));
            byTexture.set(job.name, canvas);
          } catch {
            canvas = undefined; // Textur nicht lesbar: das Teil bleibt einfarbig.
          }
        }
        if (canvas) images.set(job.shader, canvas);
        done++;
        if (done % 6 === 0 || done === jobs.length) publish(done);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [yft, parts, textures, enabled]);

  return state;
}
