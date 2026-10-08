import { computeBounds } from './model.ts';
import type { Bounds, ModelData } from './model.ts';

/** 'boxes' nähert das Modell durch mehrere Boxen an, 'hull' und 'mesh' sind noch nicht in der Datei möglich. */
export type CollisionMode = 'none' | 'box' | 'boxes' | 'hull' | 'mesh';

/** Dreiecksnetz für die Kollision. Dreiecke sind gegen den Uhrzeigersinn von außen gesehen (Normale zeigt nach außen). */
export interface CollisionMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

export function computeCollision(model: ModelData, mode: CollisionMode): CollisionMesh | null {
  if (mode === 'none') return null;
  const bounds = computeBounds(model);
  if (!bounds) return null;

  switch (mode) {
    case 'box':
      return boxCollision(bounds);
    case 'boxes':
      return mergeMeshes(decomposeBoxes(model).map(boxCollision));
    case 'hull': {
      const points = collectPositions(model);
      return convexHull(points) ?? boxCollision(bounds);
    }
    case 'mesh':
      return meshCollision(model);
  }
}

/** Quader um die Begrenzung des Modells. */
export function boxCollision(b: Bounds): CollisionMesh {
  const [x0, y0, z0] = b.min;
  const [x1, y1, z1] = b.max;
  const positions = new Float32Array([
    x0, y0, z0, // 0
    x1, y0, z0, // 1
    x1, y1, z0, // 2
    x0, y1, z0, // 3
    x0, y0, z1, // 4
    x1, y0, z1, // 5
    x1, y1, z1, // 6
    x0, y1, z1, // 7
  ]);
  // Je Fläche zwei Dreiecke, Normale nach außen.
  const indices = new Uint32Array([
    0, 3, 2, 0, 2, 1, // unten (-Z)
    4, 5, 6, 4, 6, 7, // oben (+Z)
    0, 1, 5, 0, 5, 4, // vorn (-Y)
    2, 3, 7, 2, 7, 6, // hinten (+Y)
    0, 4, 7, 0, 7, 3, // links (-X)
    1, 2, 6, 1, 6, 5, // rechts (+X)
  ]);
  return { positions, indices };
}

function mergeMeshes(meshes: CollisionMesh[]): CollisionMesh {
  const vertexTotal = meshes.reduce((s, m) => s + m.positions.length / 3, 0);
  const positions = new Float32Array(vertexTotal * 3);
  const indices = new Uint32Array(meshes.reduce((s, m) => s + m.indices.length, 0));
  let vOff = 0;
  let iOff = 0;
  for (const m of meshes) {
    positions.set(m.positions, vOff * 3);
    for (let i = 0; i < m.indices.length; i++) indices[iOff + i] = m.indices[i]! + vOff;
    vOff += m.positions.length / 3;
    iOff += m.indices.length;
  }
  return { positions, indices };
}

// --- Näherung durch mehrere Boxen -------------------------------------------------------------------------------

export interface BoxDecompositionOptions {
  /** Höchstzahl der Boxen. Standard 16. */
  maxBoxes?: number;
  /** Auflösungen (Zellen entlang der längsten Kante), von fein nach grob. Die erste, die in `maxBoxes` passt, gewinnt. */
  resolutions?: number[];
}

/** Rastert die Oberfläche in Zellen, füllt den von außen unerreichbaren Innenraum und gibt die belegten Zellen zurück. */
function voxelize(model: ModelData, bounds: Bounds, cell: number, dims: [number, number, number]): Uint8Array {
  const [nx, ny, nz] = dims;
  const index = (x: number, y: number, z: number) => (z * ny + y) * nx + x;
  const surface = new Uint8Array(nx * ny * nz);
  const clamp = (v: number, n: number) => Math.min(n - 1, Math.max(0, v));
  const mark = (px: number, py: number, pz: number) => {
    const x = clamp(Math.floor((px - bounds.min[0]) / cell), nx);
    const y = clamp(Math.floor((py - bounds.min[1]) / cell), ny);
    const z = clamp(Math.floor((pz - bounds.min[2]) / cell), nz);
    surface[index(x, y, z)] = 1;
  };

  for (const part of model.parts) {
    const p = part.positions;
    for (let t = 0; t + 2 < part.indices.length; t += 3) {
      const a = part.indices[t]! * 3;
      const b = part.indices[t + 1]! * 3;
      const c = part.indices[t + 2]! * 3;
      const edge = Math.max(
        Math.hypot(p[b]! - p[a]!, p[b + 1]! - p[a + 1]!, p[b + 2]! - p[a + 2]!),
        Math.hypot(p[c]! - p[a]!, p[c + 1]! - p[a + 1]!, p[c + 2]! - p[a + 2]!),
        Math.hypot(p[c]! - p[b]!, p[c + 1]! - p[b + 1]!, p[c + 2]! - p[b + 2]!),
      );
      // Abtastpunkte im Abstand von höchstens einer halben Zelle, damit keine Zelle der Fläche ausgelassen wird.
      const steps = Math.max(1, Math.ceil(edge / (cell * 0.5)));
      for (let i = 0; i <= steps; i++) {
        for (let j = 0; j <= steps - i; j++) {
          const u = i / steps;
          const v = j / steps;
          const w = 1 - u - v;
          mark(
            p[a]! * w + p[b]! * u + p[c]! * v,
            p[a + 1]! * w + p[b + 1]! * u + p[c + 1]! * v,
            p[a + 2]! * w + p[b + 2]! * u + p[c + 2]! * v,
          );
        }
      }
    }
  }

  // Von außen fluten: Zellen, die nicht erreichbar sind, liegen im Innenraum geschlossener Körper.
  const outside = new Uint8Array(nx * ny * nz);
  const stack: number[] = [];
  const push = (x: number, y: number, z: number) => {
    const i = index(x, y, z);
    if (surface[i] === 0 && outside[i] === 0) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) { push(x, y, 0); push(x, y, nz - 1); }
  for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) { push(x, 0, z); push(x, ny - 1, z); }
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) { push(0, y, z); push(nx - 1, y, z); }
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % nx;
    const y = Math.floor(i / nx) % ny;
    const z = Math.floor(i / (nx * ny));
    if (x > 0) push(x - 1, y, z);
    if (x < nx - 1) push(x + 1, y, z);
    if (y > 0) push(x, y - 1, z);
    if (y < ny - 1) push(x, y + 1, z);
    if (z > 0) push(x, y, z - 1);
    if (z < nz - 1) push(x, y, z + 1);
  }
  const solid = new Uint8Array(nx * ny * nz);
  for (let i = 0; i < solid.length; i++) solid[i] = outside[i] === 0 ? 1 : 0;
  return solid;
}

/** Deckt die belegten Zellen mit Quadern ab: von jeder freien Zelle aus erst in X, dann in Y, dann in Z so weit wie möglich. */
function coverWithBoxes(solid: Uint8Array, dims: [number, number, number]): Array<[number, number, number, number, number, number]> {
  const [nx, ny, nz] = dims;
  const index = (x: number, y: number, z: number) => (z * ny + y) * nx + x;
  const free = (x: number, y: number, z: number) => solid[index(x, y, z)] === 1;
  const boxes: Array<[number, number, number, number, number, number]> = [];

  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        if (!free(x, y, z)) continue;
        let x1 = x;
        while (x1 + 1 < nx && free(x1 + 1, y, z)) x1++;
        let y1 = y;
        const rowFree = (yy: number) => {
          for (let xx = x; xx <= x1; xx++) if (!free(xx, yy, z)) return false;
          return true;
        };
        while (y1 + 1 < ny && rowFree(y1 + 1)) y1++;
        let z1 = z;
        const layerFree = (zz: number) => {
          for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) if (!free(xx, yy, zz)) return false;
          return true;
        };
        while (z1 + 1 < nz && layerFree(z1 + 1)) z1++;
        for (let zz = z; zz <= z1; zz++) for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) solid[index(xx, yy, zz)] = 0;
        boxes.push([x, y, z, x1, y1, z1]);
      }
    }
  }
  return boxes;
}

/**
 * Nähert das Modell durch achsenparallele Quader an: Oberfläche und geschlossener Innenraum werden in Zellen
 * gerastert und mit möglichst wenigen Quadern abgedeckt. So bleiben Durchgänge, Aussparungen und Beine frei,
 * ohne dass eine Mesh-Kollision nötig ist. Passt das Ergebnis nicht in `maxBoxes`, wird gröber gerastert,
 * zuletzt bleibt eine einzige Box um das ganze Modell.
 */
export function decomposeBoxes(model: ModelData, options: BoxDecompositionOptions = {}): Bounds[] {
  const bounds = computeBounds(model);
  if (!bounds) return [];
  const maxBoxes = Math.max(1, options.maxBoxes ?? 16);
  const extent = [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]];
  const longest = Math.max(...extent);
  if (longest <= 0) return [bounds];

  for (const resolution of options.resolutions ?? [32, 24, 16, 12, 8, 6, 4]) {
    const cell = longest / resolution;
    const dims = extent.map((e) => Math.max(1, Math.ceil(e / cell - 1e-6))) as [number, number, number];
    const boxes = coverWithBoxes(voxelize(model, bounds, cell, dims), dims);
    if (boxes.length === 0 || boxes.length > maxBoxes) continue;
    return boxes.map(([x0, y0, z0, x1, y1, z1]) => ({
      min: [
        Math.max(bounds.min[0], bounds.min[0] + x0 * cell),
        Math.max(bounds.min[1], bounds.min[1] + y0 * cell),
        Math.max(bounds.min[2], bounds.min[2] + z0 * cell),
      ],
      max: [
        Math.min(bounds.max[0], bounds.min[0] + (x1 + 1) * cell),
        Math.min(bounds.max[1], bounds.min[1] + (y1 + 1) * cell),
        Math.min(bounds.max[2], bounds.min[2] + (z1 + 1) * cell),
      ],
    }));
  }
  return [bounds];
}

/** Fasst alle Teile des Modells zu einem Netz zusammen (ohne Vereinfachung). */
export function meshCollision(model: ModelData): CollisionMesh {
  let vertexTotal = 0;
  let indexTotal = 0;
  for (const p of model.parts) {
    vertexTotal += p.positions.length / 3;
    indexTotal += p.indices.length;
  }
  const positions = new Float32Array(vertexTotal * 3);
  const indices = new Uint32Array(indexTotal);
  let vOff = 0;
  let iOff = 0;
  for (const p of model.parts) {
    positions.set(p.positions, vOff * 3);
    for (let i = 0; i < p.indices.length; i++) indices[iOff + i] = p.indices[i]! + vOff;
    vOff += p.positions.length / 3;
    iOff += p.indices.length;
  }
  return { positions, indices };
}

function collectPositions(model: ModelData): Float32Array {
  let total = 0;
  for (const p of model.parts) total += p.positions.length;
  const out = new Float32Array(total);
  let off = 0;
  for (const p of model.parts) {
    out.set(p.positions, off);
    off += p.positions.length;
  }
  return out;
}

// --- Konvexe Hülle (inkrementell) -----------------------------------------------------------------

interface Face {
  a: number;
  b: number;
  c: number;
  nx: number;
  ny: number;
  nz: number;
  d: number;
  alive: boolean;
}

/**
 * Berechnet die konvexe Hülle einer Punktwolke. Gibt null zurück, wenn die Punkte (nahezu) in einer
 * Ebene oder auf einer Linie liegen und es keine dreidimensionale Hülle gibt.
 */
export function convexHull(points: Float32Array): CollisionMesh | null {
  const n = Math.floor(points.length / 3);
  if (n < 4) return null;

  let maxAbs = 0;
  for (let i = 0; i < points.length; i++) maxAbs = Math.max(maxAbs, Math.abs(points[i]!));
  if (maxAbs === 0) return null;
  const eps = maxAbs * 1e-6;

  const px = (i: number) => points[i * 3]!;
  const py = (i: number) => points[i * 3 + 1]!;
  const pz = (i: number) => points[i * 3 + 2]!;

  // 1. Startkörper (Tetraeder) aus vier Punkten, die nicht in einer Ebene liegen.
  const simplex = findSimplex(points, n, eps);
  if (!simplex) return null;
  const [i0, i1, i2, i3] = simplex;

  const faces: Face[] = [];
  const addFace = (a: number, b: number, c: number): Face => {
    const ux = px(b) - px(a);
    const uy = py(b) - py(a);
    const uz = pz(b) - pz(a);
    const vx = px(c) - px(a);
    const vy = py(c) - py(a);
    const vz = pz(c) - pz(a);
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    const f: Face = { a, b, c, nx, ny, nz, d: nx * px(a) + ny * py(a) + nz * pz(a), alive: true };
    faces.push(f);
    return f;
  };

  // Mittelpunkt des Startkörpers liegt sicher innen. Flächen so ausrichten, dass er hinter ihnen liegt.
  const gx = (px(i0) + px(i1) + px(i2) + px(i3)) / 4;
  const gy = (py(i0) + py(i1) + py(i2) + py(i3)) / 4;
  const gz = (pz(i0) + pz(i1) + pz(i2) + pz(i3)) / 4;
  const orient = (a: number, b: number, c: number) => {
    const f = addFace(a, b, c);
    if (f.nx * gx + f.ny * gy + f.nz * gz - f.d > 0) {
      faces.pop();
      addFace(a, c, b);
    }
  };
  orient(i0, i1, i2);
  orient(i0, i1, i3);
  orient(i0, i2, i3);
  orient(i1, i2, i3);

  // 2. Jeden weiteren Punkt einfügen, der außerhalb der aktuellen Hülle liegt.
  const used = new Set<number>(simplex);
  const edgeKey = (u: number, v: number) => u * n + v;

  for (let p = 0; p < n; p++) {
    if (used.has(p)) continue;
    const x = px(p);
    const y = py(p);
    const z = pz(p);

    const visible: Face[] = [];
    for (const f of faces) {
      if (f.alive && f.nx * x + f.ny * y + f.nz * z - f.d > eps) visible.push(f);
    }
    if (visible.length === 0) continue;

    // Horizontkanten: Kanten sichtbarer Flächen, deren Gegenkante zu keiner sichtbaren Fläche gehört.
    const directed = new Set<number>();
    for (const f of visible) {
      directed.add(edgeKey(f.a, f.b));
      directed.add(edgeKey(f.b, f.c));
      directed.add(edgeKey(f.c, f.a));
    }
    const horizon: Array<[number, number]> = [];
    for (const f of visible) {
      for (const [u, v] of [[f.a, f.b], [f.b, f.c], [f.c, f.a]] as Array<[number, number]>) {
        if (!directed.has(edgeKey(v, u))) horizon.push([u, v]);
      }
    }

    for (const f of visible) f.alive = false;
    for (const [u, v] of horizon) addFace(u, v, p);
  }

  // 3. Nur benutzte Eckpunkte übernehmen.
  const remap = new Map<number, number>();
  const verts: number[] = [];
  const idx: number[] = [];
  for (const f of faces) {
    if (!f.alive) continue;
    for (const v of [f.a, f.b, f.c]) {
      let m = remap.get(v);
      if (m === undefined) {
        m = verts.length;
        remap.set(v, m);
        verts.push(v);
      }
      idx.push(m);
    }
  }

  const positions = new Float32Array(verts.length * 3);
  verts.forEach((v, i) => positions.set([px(v), py(v), pz(v)], i * 3));
  return { positions, indices: Uint32Array.from(idx) };
}

/** Sucht vier Punkte, die einen Körper mit Volumen aufspannen. */
function findSimplex(points: Float32Array, n: number, eps: number): [number, number, number, number] | null {
  const get = (i: number): [number, number, number] => [points[i * 3]!, points[i * 3 + 1]!, points[i * 3 + 2]!];

  // Extrempunkte entlang der Achsen.
  const ext: number[] = [];
  for (let axis = 0; axis < 3; axis++) {
    let lo = 0;
    let hi = 0;
    for (let i = 1; i < n; i++) {
      if (points[i * 3 + axis]! < points[lo * 3 + axis]!) lo = i;
      if (points[i * 3 + axis]! > points[hi * 3 + axis]!) hi = i;
    }
    ext.push(lo, hi);
  }

  // Die zwei am weitesten entfernten Extrempunkte.
  let a = ext[0]!;
  let b = ext[1]!;
  let best = -1;
  for (const i of ext) {
    for (const j of ext) {
      const [x0, y0, z0] = get(i);
      const [x1, y1, z1] = get(j);
      const d = (x1 - x0) ** 2 + (y1 - y0) ** 2 + (z1 - z0) ** 2;
      if (d > best) {
        best = d;
        a = i;
        b = j;
      }
    }
  }
  if (Math.sqrt(best) <= eps) return null;

  // Dritter Punkt: am weitesten von der Geraden a-b.
  const [ax, ay, az] = get(a);
  const [bx, by, bz] = get(b);
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const ulen = Math.hypot(ux, uy, uz);
  let c = -1;
  let bestC = eps;
  for (let i = 0; i < n; i++) {
    const [x, y, z] = get(i);
    const wx = x - ax;
    const wy = y - ay;
    const wz = z - az;
    const cx = uy * wz - uz * wy;
    const cy = uz * wx - ux * wz;
    const cz = ux * wy - uy * wx;
    const dist = Math.hypot(cx, cy, cz) / ulen;
    if (dist > bestC) {
      bestC = dist;
      c = i;
    }
  }
  if (c < 0) return null;

  // Vierter Punkt: am weitesten von der Ebene a-b-c.
  const [cx0, cy0, cz0] = get(c);
  const vx = cx0 - ax;
  const vy = cy0 - ay;
  const vz = cz0 - az;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const nlen = Math.hypot(nx, ny, nz);
  if (nlen <= eps) return null;
  nx /= nlen;
  ny /= nlen;
  nz /= nlen;
  let dpt = -1;
  let bestD = eps;
  for (let i = 0; i < n; i++) {
    const [x, y, z] = get(i);
    const dist = Math.abs(nx * (x - ax) + ny * (y - ay) + nz * (z - az));
    if (dist > bestD) {
      bestD = dist;
      dpt = i;
    }
  }
  if (dpt < 0) return null;
  return [a, b, c, dpt];
}
