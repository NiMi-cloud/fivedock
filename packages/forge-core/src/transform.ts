import { computeBounds } from './model.ts';
import type { MeshPart, ModelData } from './model.ts';

export type UpAxis = 'y' | 'z';

export interface GameSpaceOptions {
  /** Welche Achse im Quellmodell „oben“ ist. glTF, FBX und die meisten Exporte nutzen Y. */
  upAxis: UpAxis;
  /** Gleichmäßiger Skalierungsfaktor (1 = Quellmaßeinheit entspricht einem Meter). */
  scale: number;
  /** Mittelpunkt der Grundfläche auf X/Y = 0 setzen. */
  centerXY: boolean;
  /** Unterkante auf Z = 0 setzen, damit das Prop auf dem Boden steht. */
  groundZ: boolean;
}

export const DEFAULT_GAME_SPACE: GameSpaceOptions = {
  upAxis: 'y',
  scale: 1,
  centerXY: true,
  groundZ: true,
};

/**
 * Rechnet ein Modell ins GTA-Koordinatensystem um (rechtshändig, Z oben, Y nach vorn).
 *
 * Y-oben nach Z-oben ist eine Drehung um +90° um die X-Achse: (x, y, z) -> (x, -z, y).
 * Das ist eine echte Drehung (Determinante +1), die Dreiecksreihenfolge bleibt also unverändert.
 */
export function toGameSpace(model: ModelData, options: GameSpaceOptions): ModelData {
  const s = options.scale;
  if (!Number.isFinite(s) || s <= 0) throw new Error('Der Skalierungsfaktor muss größer als 0 sein.');

  const rotate = options.upAxis === 'y';
  const parts: MeshPart[] = model.parts.map((part) => {
    const positions = new Float32Array(part.positions.length);
    const normals = new Float32Array(part.normals.length);

    for (let i = 0; i + 2 < part.positions.length; i += 3) {
      const x = part.positions[i]!;
      const y = part.positions[i + 1]!;
      const z = part.positions[i + 2]!;
      positions[i] = x * s;
      positions[i + 1] = (rotate ? -z : y) * s;
      positions[i + 2] = (rotate ? y : z) * s;

      const nx = part.normals[i] ?? 0;
      const ny = part.normals[i + 1] ?? 0;
      const nz = part.normals[i + 2] ?? 0;
      normals[i] = nx;
      normals[i + 1] = rotate ? -nz : ny;
      normals[i + 2] = rotate ? ny : nz;
    }

    return { ...part, positions, normals };
  });

  let result: ModelData = { ...model, parts };

  const bounds = computeBounds(result);
  if (bounds && (options.centerXY || options.groundZ)) {
    const dx = options.centerXY ? -(bounds.min[0] + bounds.max[0]) / 2 : 0;
    const dy = options.centerXY ? -(bounds.min[1] + bounds.max[1]) / 2 : 0;
    const dz = options.groundZ ? -bounds.min[2] : 0;
    result = {
      ...result,
      parts: result.parts.map((part) => {
        const positions = new Float32Array(part.positions);
        for (let i = 0; i + 2 < positions.length; i += 3) {
          positions[i] = positions[i]! + dx;
          positions[i + 1] = positions[i + 1]! + dy;
          positions[i + 2] = positions[i + 2]! + dz;
        }
        return { ...part, positions };
      }),
    };
  }
  return result;
}

/**
 * Macht aus einem beliebigen Eingabenamen einen gültigen Modellnamen:
 * Kleinbuchstaben, Ziffern und Unterstriche, mindestens ein Zeichen, höchstens 40.
 */
export function sanitizePropName(input: string): string {
  const base = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return base.length > 0 ? base : 'my_prop';
}
