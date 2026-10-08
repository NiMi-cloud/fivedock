/**
 * Neutrales Modellformat zwischen Import (three.js-Loader) und Export (RAGE-Schreiber).
 *
 * Konventionen:
 *  - Positionen und Normalen sind Float32 (x, y, z je Vertex).
 *  - UVs haben den Ursprung OBEN LINKS (wie DirectX, glTF und DDS): v = 0 ist die oberste Bildzeile.
 *  - Texturen sind RGBA mit 8 Bit pro Kanal, oberste Zeile zuerst.
 *  - Der Import liefert das Koordinatensystem der Quelldatei. `toGameSpace` rechnet nach GTA (Z oben).
 */

export interface TextureSource {
  name: string;
  width: number;
  height: number;
  /** RGBA, length = width * height * 4. */
  rgba: Uint8Array;
}

/** Wie ein Material Durchsichtigkeit behandelt (wie in glTF: OPAQUE, MASK, BLEND). */
export type AlphaMode = 'opaque' | 'mask' | 'blend';

export interface MaterialSource {
  name: string;
  /** Grundfarbe RGBA, je 0..1. */
  baseColor: [number, number, number, number];
  /** Index in `ModelData.textures` oder null. */
  textureIndex: number | null;
  /**
   * Angabe der Quelldatei. Fehlt sie (OBJ, FBX, DAE), entscheidet der Alpha-Kanal der Textur:
   * ohne Alpha undurchsichtig, mit scharfen Kanten Alpha-Test, mit weichen Verläufen Überblendung.
   */
  alphaMode?: AlphaMode;
}

export interface MeshPart {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  /** Zwei Werte je Vertex (u, v). */
  uvs: Float32Array;
  /** Dreiecksliste. */
  indices: Uint32Array;
  /** Index in `ModelData.materials`. */
  materialIndex: number;
}

export interface ModelData {
  name: string;
  parts: MeshPart[];
  materials: MaterialSource[];
  textures: TextureSource[];
}

export type Vec3 = [number, number, number];

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export interface ModelStats {
  vertices: number;
  triangles: number;
  materials: number;
  textures: number;
}

export function modelStats(model: ModelData): ModelStats {
  let vertices = 0;
  let triangles = 0;
  for (const part of model.parts) {
    vertices += part.positions.length / 3;
    triangles += part.indices.length / 3;
  }
  return {
    vertices,
    triangles,
    materials: model.materials.length,
    textures: model.textures.length,
  };
}

/** Achsenparallele Begrenzung aller Teile. Leeres Modell ergibt null. */
export function computeBounds(model: ModelData): Bounds | null {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  let any = false;

  for (const part of model.parts) {
    const p = part.positions;
    for (let i = 0; i + 2 < p.length; i += 3) {
      any = true;
      for (let k = 0; k < 3; k++) {
        const v = p[i + k]!;
        if (v < min[k]!) min[k] = v;
        if (v > max[k]!) max[k] = v;
      }
    }
  }
  return any ? { min, max } : null;
}

export function boundsSize(b: Bounds): Vec3 {
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
}

/**
 * Prüft ein Modell auf Fehler, die später im Spiel zu unsichtbaren oder fehlerhaften Props führen.
 * Gibt eine Liste lesbarer Meldungen zurück (leer = in Ordnung).
 */
export function validateModel(model: ModelData): string[] {
  const problems: string[] = [];
  if (model.parts.length === 0) problems.push('Das Modell enthält keine Dreiecke.');

  for (const part of model.parts) {
    const vertexCount = part.positions.length / 3;
    if (part.positions.length % 3 !== 0) problems.push(`${part.name}: Positionsdaten sind unvollständig.`);
    if (part.normals.length !== part.positions.length) problems.push(`${part.name}: Normalen passen nicht zu den Positionen.`);
    if (part.uvs.length !== vertexCount * 2) problems.push(`${part.name}: UVs passen nicht zu den Positionen.`);
    if (part.indices.length % 3 !== 0) problems.push(`${part.name}: Indexliste ist keine Dreiecksliste.`);
    for (let i = 0; i < part.indices.length; i++) {
      if (part.indices[i]! >= vertexCount) {
        problems.push(`${part.name}: Index ${part.indices[i]} zeigt hinter das Ende der Vertexliste.`);
        break;
      }
    }
    if (part.materialIndex < 0 || part.materialIndex >= model.materials.length) {
      problems.push(`${part.name}: Material ${part.materialIndex} existiert nicht.`);
    }
  }

  for (const tex of model.textures) {
    if (tex.rgba.length !== tex.width * tex.height * 4) problems.push(`Textur ${tex.name}: Pixeldaten passen nicht zur Größe.`);
  }
  return problems;
}
