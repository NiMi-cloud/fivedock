/**
 * Eine kleine, von Hand gebaute Fahrzeugdatei (YFT, Version 162) für Tests: Skelett, zwei Materialien (optional ein Lack-Material),
 * eine Geometrie mit Skinning (Aufbau wie in echten Fahrzeugen: Position, Blend-Gewichte und -Indizes, Normale, Farbe, zwei
 * Texturkoordinaten) in zwei Detailstufen, Knochen-Matrizen des Fragments. Nur für Tests und die Überprüfungsskripte, nicht für die
 * Anwendung.
 */

import { joaat } from './jenkins.ts';
import { type BlockWriter, ResourceBlock, buildResource } from './rsc7.ts';

export interface TestYftOptions {
  boneNames?: string[];
  boneParents?: number[];
  /** Fragment-Matrizen je Knochen (FragType + 0xA8), Standard: ja. */
  boneTransforms?: boolean;
  /** Eckpunktdaten und Indizes im Grafikspeicher, Standard: ja (so liegen sie in den Spieldateien). */
  graphicsData?: boolean;
  /** Ein Lack-Material (Nummer 2) mit den Parametern eines echten paint1/paint2-Shaders und eine zweite Geometrie, die es benutzt. */
  paint?: 'paint1' | 'paint2';
  /** Hat die Lack-Geometrie eine zweite Texturkoordinate? Standard: ja. */
  paintUv1?: boolean;
  /** Das Gehäuse-Material (Nummer 0) bekommt Parameter mit einer Haupttextur, damit es kopiert werden kann. */
  meshTexture?: boolean;
}

const TYPES_LOW = 0x55996996;
const TYPES_HIGH = 0x77555555;
const STRIDE = 52;
const FLAGS = 0xdf;
/** Ohne zweite Texturkoordinate: 44 Byte, Deklaration wie in den echten Dateien. */
const STRIDE_NO_UV1 = 44;
const FLAGS_NO_UV1 = 0x5f;

/** Positionen der drei Eckpunkte der Vorlage-Geometrie. */
export const FIXTURE_TRIANGLE = [0, 0, 0.5, 0.4, 0, 0.5, 0, 0.4, 0.5];

type FxParam = { name: string; texture: string | null } | { name: string; vectors: number[][] };

/** Parameterliste eines echten paint2-Shaders (Reihenfolge und Werte aus einer echten Fahrzeugdatei). */
const PAINT_PARAMS: FxParam[] = [
  { name: 'DiffuseSampler', texture: 'body_diffuse' },
  { name: 'DamageSampler', texture: null },
  { name: 'DirtSampler', texture: 'body_dirt' },
  { name: 'SpecSampler', texture: 'body_spec' },
  { name: 'envEffTexTileUV', vectors: [[8, 0, 0, 0]] },
  { name: 'envEffScale', vectors: [[1, 0.001, 0, 0]] },
  { name: 'envEffThickness', vectors: [[25, 0, 0, 0]] },
  { name: 'reflectivePower', vectors: [[0.45, 0, 0, 0]] },
  { name: 'specular2Color_DirLerp', vectors: [[0, 0.5, 0, 0]] },
  { name: 'specMapIntMask', vectors: [[1, 0, 0, 0]] },
  { name: 'specularIntensityMult', vectors: [[1, 0, 0, 0]] },
  { name: 'specularFalloffMult', vectors: [[50, 0, 0, 0]] },
  { name: 'specularFresnel', vectors: [[0.75, 0, 0, 0]] },
  { name: 'dirtColor', vectors: [[0.231372, 0.223529, 0.203921, 0]] },
  { name: 'dirtLevelMod', vectors: [[1, 1, 1, 1]] },
  { name: 'matDiffuseColor', vectors: [[2, 1, 1, 0]] },
  {
    name: 'DamagedWheelOffsets',
    vectors: [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  { name: 'DamageTextureOffset', vectors: [[0, 0, 0, 0]] },
  { name: 'DamageMultiplier', vectors: [[0, 0, 0, 0]] },
  { name: 'BoundRadius', vectors: [[0, 0, 0, 0]] },
];

/** Wenige Parameter eines vehicle_mesh-Shaders mit Haupttextur. */
const MESH_PARAMS: FxParam[] = [
  { name: 'DiffuseSampler', texture: 'black' },
  { name: 'DamageSampler', texture: null },
  { name: 'BumpSampler', texture: 'blank_normal' },
  { name: 'envEffTexTileUV', vectors: [[8, 0, 0, 0]] },
  { name: 'matDiffuseColor', vectors: [[2, 5, 5, 0]] },
  { name: 'BoundRadius', vectors: [[0, 0, 0, 0]] },
];

export function buildTestYft(options: TestYftOptions = {}): Uint8Array {
  const names = options.boneNames ?? ['chassis', 'door_dside_f', 'siren1'];
  const parents = options.boneParents ?? [-1, 0, 0];
  const n = names.length;
  const withTransforms = options.boneTransforms ?? true;
  const graphicsData = options.graphicsData ?? true;
  const paintUv1 = options.paintUv1 ?? true;

  const system: ResourceBlock[] = [];
  const graphics: ResourceBlock[] = [];
  const sys = (size: number, fill: (w: BlockWriter) => void, label: string) => {
    const b = new ResourceBlock(size, fill, label);
    system.push(b);
    return b;
  };
  const gfx = (size: number, fill: (w: BlockWriter) => void, label: string) => {
    const b = new ResourceBlock(size, fill, label);
    (graphicsData ? graphics : system).push(b);
    return b;
  };

  // Wurzel zuerst (steht bei 0x50000000): FragType, 304 Byte
  const drawableRef: { block: ResourceBlock | null } = { block: null };
  const transformsRef: { block: ResourceBlock | null } = { block: null };
  const nameBlock = new ResourceBlock(16, (w) => w.cstring(0, 'testcar'), 'name');
  sys(
    304,
    (w) => {
      w.pointer(0x30, drawableRef.block);
      w.pointer(0x58, nameBlock);
      w.pointer(0xa8, transformsRef.block);
    },
    'FragType',
  );
  system.push(nameBlock);

  // Skelett
  const nameBlocks = names.map((name) => sys(name.length + 1, (w) => w.cstring(0, name), `Name ${name}`));
  const bones = sys(16 + n * 80, (w) => {
    w.u32(0, n);
    names.forEach((_, i) => {
      const o = 16 + i * 80;
      w.f32(o + 12, 1); // Quaternion (0, 0, 0, 1)
      w.f32(o + 0x10, i * 0.25); // Lage
      w.f32(o + 0x14, 0);
      w.f32(o + 0x18, i * 0.1);
      for (let k = 0; k < 3; k++) w.f32(o + 0x20 + k * 4, 1);
      w.f32(o + 0x2c, 1);
      let sibling = -1;
      for (let j = i + 1; j < n; j++) {
        if (parents[j] === parents[i]) {
          sibling = j;
          break;
        }
      }
      w.u16(o + 0x30, sibling & 0xffff);
      w.u16(o + 0x32, parents[i]! & 0xffff);
      w.pointer(o + 0x38, nameBlocks[i]!);
      w.u16(o + 0x40, 7);
      w.u16(o + 0x42, i);
      w.u16(o + 0x44, i === 0 ? 0 : 1000 + i);
      w.u16(o + 0x46, i);
    });
  }, 'Knochen');
  const parentBlock = sys(Math.ceil((n * 2) / 16) * 16, (w) => parents.forEach((p, i) => w.u16(i * 2, p & 0xffff)), 'Eltern');
  const matrices = sys(n * 64, (w) => {
    for (let i = 0; i < n; i++) {
      w.f32(i * 64, 1);
      w.f32(i * 64 + 20, 1);
      w.f32(i * 64 + 28, 4);
      w.f32(i * 64 + 40, 1);
      w.f32(i * 64 + 44, -3);
      w.f32(i * 64 + 48, i * 0.25);
      w.f32(i * 64 + 56, i * 0.1);
    }
  }, 'Matrizen');
  const inverse = sys(n * 64, (w) => {
    for (let i = 0; i < n; i++) {
      w.f32(i * 64, 1);
      w.f32(i * 64 + 20, 1);
      w.f32(i * 64 + 40, 1);
      w.f32(i * 64 + 48, -i * 0.25);
      w.f32(i * 64 + 56, -i * 0.1);
    }
  }, 'Umgekehrte Matrizen');
  const childPairs: number[] = [];
  for (let i = 1; i < n; i++) childPairs.push(i, parents[i]!);
  while (childPairs.length % 8 !== 0 && childPairs.length > 0) childPairs.push(childPairs[childPairs.length - 2]!, childPairs[childPairs.length - 1]!);
  const children = sys(Math.max(16, Math.ceil((childPairs.length * 2) / 16) * 16), (w) => childPairs.forEach((c, i) => w.u16(i * 2, c & 0xffff)), 'Kind-Paare');
  const tagTable = sys(11 * 8, () => {}, 'Namens-Tabelle');
  const skeleton = sys(112, (w) => {
    w.u32(0, 1080114336);
    w.u32(4, 1);
    w.pointer(0x10, tagTable);
    w.u16(0x18, 11);
    w.u16(0x1a, n);
    w.u32(0x1c, 0x1000000);
    w.u64(0x20, bones.address + 16);
    w.pointer(0x28, inverse);
    w.pointer(0x30, matrices);
    w.pointer(0x38, parentBlock);
    w.pointer(0x40, children);
    w.u16(0x5c, 1);
    w.u16(0x5e, n);
    w.u16(0x60, childPairs.length);
  }, 'Skelett');

  // Shader: 0 = vehicle_mesh (Gehäuse), 1 = vehicle_lightsemissive (Linse), optional 2 = Lack
  /** Ein Shader mit Parametern wie in einer echten Datei (Köpfe, Vektordaten, Hashes, Texturobjekte). */
  const makeFx = (label: string, presetName: string, bucket: number, list: FxParam[]) => {
    const textureCount = list.filter((p) => "texture" in p).length;
    let heads = 0;
    let vectorCount = 0;
    for (const p of list) {
      heads += 16;
      if ("vectors" in p) vectorCount += p.vectors.length;
    }
    const base = 32 + heads + vectorCount * 16 + 4 * list.length;
    const dataSize = Math.ceil(base / 16) * 16;
    const textureNames = new Map<string, ResourceBlock>();
    for (const p of list) if ("texture" in p && p.texture) textureNames.set(p.texture, sys(p.texture.length + 1, (w) => w.cstring(0, p.texture!), `Name ${p.texture}`));
    const objectByName = new Map<string, ResourceBlock>();
    for (const p of list) {
      if ("texture" in p && p.texture) {
        objectByName.set(
          p.texture,
          sys(80, (w) => {
            w.u32(0, 0x7ff8d22f);
            w.pointer(0x28, textureNames.get(p.texture!)!);
            w.u16(0x30, 1);
            w.u16(0x32, 2);
          }, `Textur ${p.texture}`),
        );
      }
    }
    const params = sys(base + 4 * dataSize, (w) => {
      let register = 162;
      const registers = new Array<number>(list.length).fill(0);
      for (let p = list.length - 1; p >= 0; p--) {
        const param = list[p]!;
        if ("vectors" in param) {
          registers[p] = register;
          register += param.vectors.length;
        }
      }
      let texture = 0;
      let dataAt = list.length * 16;
      list.forEach((param, p) => {
        const head = p * 16;
        if ("texture" in param) {
          w.u8(head, 0);
          w.u8(head + 1, texture++ === 0 ? 0 : texture);
          if (param.texture) w.pointer(head + 8, objectByName.get(param.texture)!);
        } else {
          w.u8(head, param.vectors.length);
          w.u8(head + 1, registers[p]!);
          w.u64(head + 8, params.address + dataAt);
          param.vectors.forEach((v, i) => v.forEach((x, k) => w.f32(dataAt + i * 16 + k * 4, x)));
          dataAt += param.vectors.length * 16;
        }
        w.u32(list.length * 16 + vectorCount * 16 + p * 4, joaat(param.name));
      });
    }, `Parameter ${label}`);
    return sys(48, (w) => {
      w.pointer(0, params);
      w.u32(0x08, joaat(presetName));
      w.u8(0x10, list.length);
      w.u8(0x11, bucket);
      w.u16(0x12, 0x8000);
      w.u16(0x14, heads + vectorCount * 16);
      w.u16(0x16, dataSize);
      w.u32(0x18, joaat(`${presetName}.sps`));
      w.u32(0x20, 0xff01);
      w.u8(0x27, textureCount);
    }, `Shader ${label}`);
  };

  const emptyFx = (name: string, i: number) => {
    const params = sys(32 + 4 * 16, () => {}, `Parameter ${i}`);
    return sys(48, (w) => {
      w.pointer(0, params);
      w.u32(0x08, joaat(name));
      w.u8(0x10, 0);
      w.u8(0x11, i === 1 ? 1 : 0);
      w.u32(0x18, joaat(`${name}.sps`));
    }, `Shader ${name}`);
  };
  const shaderObjects = [options.meshTexture ? makeFx("mesh", "vehicle_mesh", 0, MESH_PARAMS) : emptyFx("vehicle_mesh", 0), emptyFx("vehicle_lightsemissive", 1)];
  if (options.paint) shaderObjects.push(makeFx("Lack", `vehicle_${options.paint}`, 0, PAINT_PARAMS));
  const shaderArray = sys(Math.max(16, shaderObjects.length * 8), (w) => shaderObjects.forEach((s, i) => w.pointer(i * 8, s)), 'Shader-Zeiger');
  const shaderGroup = sys(64, (w) => {
    w.pointer(0x10, shaderArray);
    w.u16(0x18, shaderObjects.length);
    w.u16(0x1a, shaderObjects.length);
  }, 'Shadergruppe');

  // Eckpunkt-Deklaration, Eckpunktdaten, Index (Geometrie "g0" mit Shader 0, optional "g1" für den Lack mit Shader 2)
  const makeGeometry = (label: string, uv1: boolean) => {
    const stride = uv1 ? STRIDE : STRIDE_NO_UV1;
    const decl = sys(16, (w) => {
      w.u32(0, uv1 ? FLAGS : FLAGS_NO_UV1);
      w.u16(4, stride);
      w.u8(7, 7);
      w.u32(8, TYPES_LOW);
      w.u32(12, TYPES_HIGH);
    }, `${label} Deklaration`);
    const vertexData = gfx(Math.ceil((3 * stride) / 16) * 16, (w) => {
      for (let v = 0; v < 3; v++) {
        const o = v * stride;
        w.f32(o, FIXTURE_TRIANGLE[v * 3]!);
        w.f32(o + 4, FIXTURE_TRIANGLE[v * 3 + 1]!);
        w.f32(o + 8, FIXTURE_TRIANGLE[v * 3 + 2]!);
        w.bytes.set([0, 0, 255, 0], o + 12); // Gewichte: Kanal 2 voll
        w.bytes.set([0, 0, 1, 0], o + 16); // Indizes: Knochen 1
        w.f32(o + 20, 0);
        w.f32(o + 24, 0);
        w.f32(o + 28, 1);
        w.bytes.set([255, 254, 131, 255], o + 32); // Farbe
        w.f32(o + 36, 0.25);
        w.f32(o + 40, 0.75);
        if (uv1) {
          w.f32(o + 44, 0);
          w.f32(o + 48, 1);
        }
      }
    }, `${label} Eckpunktdaten`);
    const vertexBuffer = sys(128, (w) => {
      w.u32(0, 0x1234abcd);
      w.u32(4, 1);
      w.u16(8, stride);
      w.pointer(0x10, vertexData);
      w.u32(0x18, 3);
      w.pointer(0x20, vertexData);
      w.pointer(0x30, decl);
    }, `${label} Vertex-Buffer`);
    const indexData = gfx(16, (w) => [0, 1, 2].forEach((v, i) => w.u16(i * 2, v)), `${label} Indexdaten`);
    const indexBuffer = sys(96, (w) => {
      w.u32(0, 0x1234abce);
      w.u32(4, 1);
      w.u32(8, 3);
      w.pointer(0x10, indexData);
    }, `${label} Index-Buffer`);
    const palette = Array.from({ length: n }, (_, i) => i);
    const paletteOffset = 152 + (palette.length > 4 ? 8 : 0);
    const geometry = sys(paletteOffset + palette.length * 2, (w) => {
      w.u32(0, 0x1234abcf);
      w.u32(4, 1);
      w.pointer(0x18, vertexBuffer);
      w.pointer(0x38, indexBuffer);
      w.u32(0x58, 3);
      w.u16(0x62, 3);
      w.u64(0x68, geometry.address + paletteOffset);
      w.u16(0x70, stride);
      w.u16(0x72, palette.length);
      w.pointer(0x78, vertexData);
      palette.forEach((id, i) => w.u16(paletteOffset + i * 2, id));
    }, `${label} Geometrie`);
    return geometry;
  };
  const geometries = [makeGeometry('g0', true)];
  const shaderOfGeometry = [0];
  if (options.paint) {
    geometries.push(makeGeometry('g1', paintUv1));
    shaderOfGeometry.push(2);
  }
  const count = geometries.length;

  // Modelle: zwei Detailstufen, teilen sich die Geometrien
  const makeModel = (label: string) => {
    const geometryArray = sys(Math.max(16, count * 8), (w) => geometries.forEach((g, i) => w.pointer(i * 8, g)), `${label} Geometriezeiger`);
    const bounds = sys((count > 1 ? count + 1 : count) * 32, (w) => {
      const entries = count > 1 ? count + 1 : count;
      for (let e = 0; e < entries; e++) {
        for (let k = 0; k < 3; k++) {
          w.f32(e * 32 + k * 4, Math.min(FIXTURE_TRIANGLE[k]!, FIXTURE_TRIANGLE[3 + k]!, FIXTURE_TRIANGLE[6 + k]!));
          w.f32(e * 32 + 16 + k * 4, Math.max(FIXTURE_TRIANGLE[k]!, FIXTURE_TRIANGLE[3 + k]!, FIXTURE_TRIANGLE[6 + k]!));
        }
      }
    }, `${label} Grenzen`);
    const shaderMap = sys(Math.max(16, Math.ceil((count * 2) / 16) * 16), (w) => shaderOfGeometry.forEach((s, i) => w.u16(i * 2, s)), `${label} Shader-Zuordnung`);
    const model = sys(48, (w) => {
      w.u32(0, 0x1234abd0);
      w.u32(4, 1);
      w.pointer(0x08, geometryArray);
      w.u16(0x10, count);
      w.u16(0x12, count);
      w.pointer(0x18, bounds);
      w.pointer(0x20, shaderMap);
      w.u32(0x28, 0x100 | n); // Knochenzahl im ersten Byte, Skinning-Kennzeichen im zweiten
      w.u16(0x2c, 0x01ff);
      w.u16(0x2e, count);
    }, `${label} Modell`);
    const array = sys(16, (w) => w.pointer(0, model), `${label} Modellzeiger`);
    const list = sys(16, (w) => {
      w.pointer(0, array);
      w.u16(8, 1);
      w.u16(10, 1);
    }, `${label} Liste`);
    return list;
  };
  const high = makeModel('hoch');
  const medium = makeModel('mittel');

  const drawable = sys(336, (w) => {
    w.pointer(0x10, shaderGroup);
    w.pointer(0x18, skeleton);
    w.f32(0x20, 0.2);
    w.f32(0x24, 0.2);
    w.f32(0x28, 0.5);
    w.f32(0x2c, 0.6);
    w.f32(0x30, 0);
    w.f32(0x34, 0);
    w.f32(0x38, 0.5);
    w.f32(0x40, 0.4);
    w.f32(0x44, 0.4);
    w.f32(0x48, 0.5);
    w.pointer(0x50, high);
    w.pointer(0x58, medium);
    [0x70, 0x74, 0x78, 0x7c].forEach((o) => w.f32(o, 9998));
    [0x80, 0x84, 0x88, 0x8c].forEach((o) => w.u32(o, 0xff03));
    w.pointer(0x130, nameBlock);
  }, 'FragDrawable');
  drawableRef.block = drawable;

  if (withTransforms) {
    transformsRef.block = sys(32 + n * 48, (w) => {
      w.u8(0x10, n);
      w.u8(0x11, n);
      w.u16(0x12, 1);
      for (let i = 0; i < n; i++) {
        w.f32(32 + i * 48, 1);
        w.f32(32 + i * 48 + 20, 1);
        w.f32(32 + i * 48 + 40, 1);
      }
    }, 'Knochen-Matrizen');
  }

  return buildResource({ version: 162, system, graphics });
}
