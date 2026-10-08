import type { DrawableGeometry } from '@toolkit/rage-formats';
import { MeshoptSimplifier } from 'meshoptimizer';

/** Unter dieser Dreieckszahl lohnen sich Detailstufen nicht. */
export const MIN_TRIANGLES_FOR_LOD = 120;

/** Mindestens so viele Dreiecke bleiben in einer Detailstufe erhalten. */
const MIN_LOD_TRIANGLES = 12;

export interface LodSettings {
  /** Anteil der Dreiecke der höchsten Stufe, der erhalten bleibt (0..1). */
  ratio: number;
  /** Größter erlaubter Fehler, relativ zur Größe des Modells. */
  error: number;
}

/**
 * Vorgaben je Stufe. Bei zwei Stufen wird neben der höchsten nur eine niedrige geschrieben.
 */
export function lodPlan(levels: 1 | 2 | 3): { med?: LodSettings; low?: LodSettings } {
  if (levels === 1) return {};
  if (levels === 2) return { low: { ratio: 0.25, error: 0.1 } };
  return { med: { ratio: 0.5, error: 0.05 }, low: { ratio: 0.15, error: 0.15 } };
}

export function triangleCount(geometries: DrawableGeometry[]): number {
  return geometries.reduce((s, g) => s + g.indices.length / 3, 0);
}

/** Entfernt nicht mehr benutzte Eckpunkte und ordnet die Indizes neu. */
function compact(g: DrawableGeometry, indices: Uint32Array): DrawableGeometry {
  const remap = new Map<number, number>();
  const order: number[] = [];
  const out = new Uint16Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i]!;
    let m = remap.get(v);
    if (m === undefined) {
      m = order.length;
      remap.set(v, m);
      order.push(v);
    }
    out[i] = m;
  }

  const positions = new Float32Array(order.length * 3);
  const normals = new Float32Array(order.length * 3);
  const uvs = new Float32Array(order.length * 2);
  const colors = g.colors ? new Uint8Array(order.length * 4) : undefined;
  order.forEach((v, i) => {
    positions.set(g.positions.subarray(v * 3, v * 3 + 3), i * 3);
    normals.set(g.normals.subarray(v * 3, v * 3 + 3), i * 3);
    uvs.set(g.uvs.subarray(v * 2, v * 2 + 2), i * 2);
    if (colors && g.colors) colors.set(g.colors.subarray(v * 4, v * 4 + 4), i * 4);
  });
  return { positions, normals, uvs, colors, indices: out, shader: g.shader };
}

/**
 * Vereinfacht eine Geometrie auf einen Anteil ihrer Dreiecke. Normalen und Textur-Koordinaten fließen in den
 * Fehler ein, damit Nähte und Schattierung möglichst erhalten bleiben.
 */
export async function simplifyGeometry(g: DrawableGeometry, settings: LodSettings): Promise<DrawableGeometry> {
  await MeshoptSimplifier.ready;
  if (!MeshoptSimplifier.supported) throw new Error('Die Modellvereinfachung wird von diesem Browser nicht unterstützt.');

  const vertexCount = g.positions.length / 3;
  const indices = Uint32Array.from(g.indices as ArrayLike<number>);
  const triangles = indices.length / 3;
  const targetTriangles = Math.max(MIN_LOD_TRIANGLES, Math.floor(triangles * settings.ratio));
  if (targetTriangles >= triangles) return g;

  const attributes = new Float32Array(vertexCount * 5);
  for (let v = 0; v < vertexCount; v++) {
    attributes[v * 5] = g.normals[v * 3]!;
    attributes[v * 5 + 1] = g.normals[v * 3 + 1]!;
    attributes[v * 5 + 2] = g.normals[v * 3 + 2]!;
    attributes[v * 5 + 3] = g.uvs[v * 2]!;
    attributes[v * 5 + 4] = g.uvs[v * 2 + 1]!;
  }

  const [simplified] = MeshoptSimplifier.simplifyWithAttributes(
    indices,
    g.positions,
    3,
    attributes,
    5,
    [0.5, 0.5, 0.5, 1, 1],
    null,
    targetTriangles * 3,
    settings.error,
  );
  if (simplified.length < 3) return g;
  return compact(g, simplified);
}

/** Vereinfacht alle Geometrien einer Stufe. */
export async function simplifyGeometries(geometries: DrawableGeometry[], settings: LodSettings): Promise<DrawableGeometry[]> {
  const out: DrawableGeometry[] = [];
  for (const g of geometries) out.push(await simplifyGeometry(g, settings));
  return out;
}
