import type { ModelData } from '@toolkit/forge-core';

/**
 * Beispielmodell: eine Holzkiste (1 m Kantenlänge) mit Schachbrett-Textur, Y oben.
 * So kann jeder das Tool ausprobieren, ohne eine eigene Datei zu haben.
 */
export function createSampleCrate(): ModelData {
  const h = 0.5;
  // Jede Fläche hat eigene Eckpunkte (Normalen und UVs unterscheiden sich).
  const faces: Array<{ n: [number, number, number]; corners: Array<[number, number, number]> }> = [
    { n: [0, 0, 1], corners: [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]] },
    { n: [0, 0, -1], corners: [[h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h]] },
    { n: [1, 0, 0], corners: [[h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h]] },
    { n: [-1, 0, 0], corners: [[-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h]] },
    { n: [0, 1, 0], corners: [[-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h]] },
    { n: [0, -1, 0], corners: [[-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h]] },
  ];
  const uvCorners: Array<[number, number]> = [[0, 1], [1, 1], [1, 0], [0, 0]];

  const positions = new Float32Array(faces.length * 4 * 3);
  const normals = new Float32Array(faces.length * 4 * 3);
  const uvs = new Float32Array(faces.length * 4 * 2);
  const indices = new Uint32Array(faces.length * 6);

  faces.forEach((face, f) => {
    face.corners.forEach((c, i) => {
      const v = f * 4 + i;
      positions.set(c, v * 3);
      normals.set(face.n, v * 3);
      uvs.set(uvCorners[i]!, v * 2);
    });
    const base = f * 4;
    indices.set([base, base + 1, base + 2, base, base + 2, base + 3], f * 6);
  });

  const size = 64;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const light = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
      const edge = x < 2 || y < 2 || x >= size - 2 || y >= size - 2;
      const i = (y * size + x) * 4;
      const base = edge ? [92, 60, 28] : light ? [196, 142, 78] : [166, 112, 58];
      rgba[i] = base[0]!;
      rgba[i + 1] = base[1]!;
      rgba[i + 2] = base[2]!;
      rgba[i + 3] = 255;
    }
  }

  return {
    name: 'crate',
    parts: [{ name: 'crate', positions, normals, uvs, indices, materialIndex: 0 }],
    materials: [{ name: 'wood', baseColor: [1, 1, 1, 1], textureIndex: 0 }],
    textures: [{ name: 'crate_diffuse', width: size, height: size, rgba }],
  };
}
