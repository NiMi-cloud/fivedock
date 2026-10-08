import type { DrawableGeometry } from '@toolkit/rage-formats';
import type { ModelData } from './model.ts';

/** Höchstzahl an Eckpunkten je Geometrie (Indizes sind 16 Bit breit). */
export const MAX_VERTICES_PER_GEOMETRY = 65535;

/** Normiert Normalen. Fehlende oder Null-Normalen werden auf (0, 0, 1) gesetzt. */
function normalized(n: Float32Array): Float32Array {
  const out = new Float32Array(n.length);
  for (let i = 0; i + 2 < n.length; i += 3) {
    const x = n[i]!;
    const y = n[i + 1]!;
    const z = n[i + 2]!;
    const len = Math.hypot(x, y, z);
    if (len > 1e-8) {
      out[i] = x / len;
      out[i + 1] = y / len;
      out[i + 2] = z / len;
    } else {
      out[i + 2] = 1;
    }
  }
  return out;
}

interface Builder {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  /** Quell-Eckpunkt (Teilnummer * 2^32 + Index) -> Eckpunkt in der neuen Geometrie. */
  remap: Map<number, number>;
}

function newBuilder(): Builder {
  return { positions: [], normals: [], uvs: [], indices: [], remap: new Map() };
}

/**
 * Fasst alle Teile eines Modells nach Material zusammen und teilt sie bei Bedarf, damit keine Geometrie mehr
 * als 65.535 Eckpunkte hat. Jede Geometrie bekommt den Shader-Index ihres Materials.
 */
export function buildGeometries(model: ModelData, shaderOfMaterial: (materialIndex: number) => number): DrawableGeometry[] {
  const byMaterial = new Map<number, typeof model.parts>();
  for (const part of model.parts) {
    const list = byMaterial.get(part.materialIndex) ?? [];
    list.push(part);
    byMaterial.set(part.materialIndex, list);
  }

  const result: DrawableGeometry[] = [];
  for (const [materialIndex, parts] of [...byMaterial.entries()].sort((a, b) => a[0] - b[0])) {
    let builder = newBuilder();

    const flush = () => {
      if (builder.indices.length === 0) return;
      result.push({
        positions: Float32Array.from(builder.positions),
        normals: normalized(Float32Array.from(builder.normals)),
        uvs: Float32Array.from(builder.uvs),
        indices: Uint16Array.from(builder.indices),
        shader: shaderOfMaterial(materialIndex),
      });
      builder = newBuilder();
    };

    for (const [partNumber, part] of parts.entries()) {
      const keyOf = (v: number) => partNumber * 0x100000000 + v;
      for (let t = 0; t + 2 < part.indices.length; t += 3) {
        const tri = [part.indices[t]!, part.indices[t + 1]!, part.indices[t + 2]!];

        // Würde das Dreieck die Geometrie über das Limit bringen, beginnt eine neue.
        let fresh = 0;
        for (const v of tri) if (!builder.remap.has(keyOf(v))) fresh++;
        if (builder.positions.length / 3 + fresh > MAX_VERTICES_PER_GEOMETRY) flush();

        for (const v of tri) {
          const key = keyOf(v);
          let mapped = builder.remap.get(key);
          if (mapped === undefined) {
            mapped = builder.positions.length / 3;
            builder.remap.set(key, mapped);
            builder.positions.push(part.positions[v * 3]!, part.positions[v * 3 + 1]!, part.positions[v * 3 + 2]!);
            builder.normals.push(part.normals[v * 3]!, part.normals[v * 3 + 1]!, part.normals[v * 3 + 2]!);
            builder.uvs.push(part.uvs[v * 2]!, part.uvs[v * 2 + 1]!);
          }
          builder.indices.push(mapped);
        }
      }
    }
    flush();
  }
  return result;
}
