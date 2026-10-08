import { buildMipChain, encodeMipChain, packBgra } from '@toolkit/rage-formats';
import type { RgbaImage, SimpleShaderKind, YtdTexture } from '@toolkit/rage-formats';
import type { MaterialSource, ModelData } from './model.ts';

export interface TextureOptions {
  /** Größte erlaubte Kantenlänge in Pixeln. Standard 2048. */
  maxSize?: number;
  /** Texturen mit Blockkompression (DXT1/DXT5) speichern. Standard: ja. Spart etwa Faktor 8 (DXT1) beziehungsweise 4 (DXT5). */
  compress?: boolean;
}

export interface PreparedTextures {
  /** Texturen für das YTD. */
  ytd: YtdTexture[];
  /** Name der Textur für jedes Material (gleicher Index wie `model.materials`). */
  materialTexture: string[];
  /** Shader-Art für jedes Material (gleicher Index): undurchsichtig, Alpha-Test oder Überblendung. */
  materialShader: SimpleShaderKind[];
  /** true, wenn mindestens ein Material Durchsichtigkeit nutzt. */
  hasAlpha: boolean;
  warnings: string[];
}

export type AlphaClass = 'none' | 'hard' | 'soft';

/**
 * Untersucht den Alpha-Kanal: 'none' (alles deckend), 'hard' (nur ganz da oder ganz weg, wie bei Zäunen und Laub)
 * oder 'soft' (Verläufe, wie bei Glas).
 */
export function classifyAlpha(rgba: Uint8Array): AlphaClass {
  let see = 0;
  let partial = 0;
  const pixels = rgba.length / 4;
  for (let p = 3; p < rgba.length; p += 4) {
    const a = rgba[p]!;
    if (a < 250) see++;
    if (a >= 10 && a <= 245) partial++;
  }
  if (see === 0) return 'none';
  return partial / pixels < 0.02 ? 'hard' : 'soft';
}

/** Welche Shader-Art ein Material braucht. */
export function materialShaderKind(material: MaterialSource, alpha: AlphaClass[]): SimpleShaderKind {
  const textureAlpha: AlphaClass = material.textureIndex !== null ? (alpha[material.textureIndex] ?? 'none') : 'none';
  const colorAlpha = material.baseColor[3] < 0.98;
  switch (material.alphaMode) {
    case 'opaque':
      return 'opaque';
    case 'mask':
      return textureAlpha === 'none' ? 'opaque' : 'cutout';
    case 'blend':
      // Ohne Alpha in der Textur und ohne Textur-Verweis hat Überblendung nichts zu tun, die Deckkraft des
      // Materials wird bei Texturen nicht übernommen.
      return textureAlpha !== 'none' || (material.textureIndex === null && colorAlpha) ? 'alpha' : 'opaque';
    default:
      if (material.textureIndex !== null) return textureAlpha === 'none' ? 'opaque' : textureAlpha === 'hard' ? 'cutout' : 'alpha';
      return colorAlpha ? 'alpha' : 'opaque';
  }
}

/** Kopie mit vollem Alpha (255) in allen Pixeln. */
function withoutAlpha(image: RgbaImage): RgbaImage {
  const data = image.data.slice();
  for (let p = 3; p < data.length; p += 4) data[p] = 255;
  return { width: image.width, height: image.height, data };
}

/** Nächstgelegene Zweierpotenz (auf einer logarithmischen Skala), begrenzt auf [min, max]. */
export function nearestPowerOfTwo(n: number, min = 4, max = 2048): number {
  const clamped = Math.min(Math.max(n, 1), max * 2);
  const p = 2 ** Math.round(Math.log2(clamped));
  return Math.min(Math.max(p, min), max);
}

/** Skaliert ein RGBA-Bild bilinear. Nur für Verkleinern und moderates Vergrößern gedacht. */
export function resizeBilinear(src: RgbaImage, width: number, height: number): RgbaImage {
  if (src.width === width && src.height === height) return src;
  const out = new Uint8Array(width * height * 4);
  const sx = src.width / width;
  const sy = src.height / height;

  for (let y = 0; y < height; y++) {
    const fy = Math.max(0, (y + 0.5) * sy - 0.5);
    const y0 = Math.min(src.height - 1, Math.floor(fy));
    const y1 = Math.min(src.height - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.max(0, (x + 0.5) * sx - 0.5);
      const x0 = Math.min(src.width - 1, Math.floor(fx));
      const x1 = Math.min(src.width - 1, x0 + 1);
      const tx = fx - x0;
      for (let c = 0; c < 4; c++) {
        const p00 = src.data[(y0 * src.width + x0) * 4 + c]!;
        const p10 = src.data[(y0 * src.width + x1) * 4 + c]!;
        const p01 = src.data[(y1 * src.width + x0) * 4 + c]!;
        const p11 = src.data[(y1 * src.width + x1) * 4 + c]!;
        const top = p00 + (p10 - p00) * tx;
        const bottom = p01 + (p11 - p01) * tx;
        out[(y * width + x) * 4 + c] = Math.round(top + (bottom - top) * ty);
      }
    }
  }
  return { width, height, data: out };
}

/** Zähler, ob das Bild halbtransparente Pixel enthält. */
function hasTransparency(image: RgbaImage): boolean {
  for (let p = 3; p < image.data.length; p += 4) if (image.data[p]! < 250) return true;
  return false;
}

function toYtdTexture(name: string, image: RgbaImage, compress: boolean): YtdTexture {
  // Sehr kleine Bilder (einfarbige Ersatztexturen) bleiben unkomprimiert, damit die Farbe exakt bleibt.
  if (compress && image.width >= 8 && image.height >= 8) {
    const format = hasTransparency(image) ? 'DXT5' : 'DXT1';
    const { levels, data } = encodeMipChain(image, format);
    return { name, width: image.width, height: image.height, levels, format, data };
  }
  const chain = buildMipChain(image);
  return {
    name,
    width: image.width,
    height: image.height,
    levels: chain.length,
    format: 'A8R8G8B8',
    data: packBgra(chain),
  };
}

function solidImage(rgba: [number, number, number, number]): RgbaImage {
  const size = 4;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) data.set(rgba, i * 4);
  return { width: size, height: size, data };
}

/**
 * Bereitet die Texturen eines Modells für das Spiel auf:
 * Zweierpotenz-Größen, Mip-Kette, eindeutige Namen. Materialien ohne Textur erhalten eine einfarbige Textur
 * in ihrer Grundfarbe, weil der Standard-Shader immer eine Textur erwartet. Je Material wird die Shader-Art
 * (undurchsichtig, Alpha-Test, Überblendung) bestimmt; nur Texturen, die ein durchsichtiges Material braucht,
 * behalten ihren Alpha-Kanal.
 */
export function prepareTextures(model: ModelData, propName: string, options: TextureOptions = {}): PreparedTextures {
  const maxSize = options.maxSize ?? 2048;
  const compress = options.compress ?? true;
  const warnings: string[] = [];
  const ytd: YtdTexture[] = [];
  const used = new Set<string>();

  const unique = (base: string) => {
    let name = base;
    let i = 2;
    while (used.has(name)) name = `${base}_${i++}`;
    used.add(name);
    return name;
  };

  // Welche Shader-Art jedes Material braucht, und welche Texturen deshalb einen Alpha-Kanal behalten müssen.
  const alphaClass = model.textures.map((t) => classifyAlpha(t.rgba));
  const materialShader = model.materials.map((m) => materialShaderKind(m, alphaClass));
  const keepsAlpha = new Set<number>();
  model.materials.forEach((m, i) => {
    if (m.textureIndex !== null && materialShader[i] !== 'opaque') keepsAlpha.add(m.textureIndex);
  });
  const hasAlpha = materialShader.some((k) => k !== 'opaque');

  // Echte Texturen: je Quelltextur genau eine Textur im YTD, auch wenn mehrere Materialien sie nutzen.
  const sourceNames: string[] = model.textures.map((t, i) => {
    const wantW = nearestPowerOfTwo(t.width, 4, maxSize);
    const wantH = nearestPowerOfTwo(t.height, 4, maxSize);
    let image = resizeBilinear({ width: t.width, height: t.height, data: t.rgba }, wantW, wantH);
    if (wantW !== t.width || wantH !== t.height) {
      warnings.push(`Textur ${t.name || i}: ${t.width}x${t.height} wurde auf ${wantW}x${wantH} angepasst.`);
    }
    // Ohne Material, das den Alpha-Kanal braucht, wird er verworfen: kleiner im Speicher (DXT1 statt DXT5).
    if (!keepsAlpha.has(i) && alphaClass[i] !== 'none') image = withoutAlpha(image);
    const name = unique(model.textures.length === 1 ? `${propName}_diffuse` : `${propName}_tex${i}`);
    ytd.push(toYtdTexture(name, image, compress));
    return name;
  });

  const colorNames = new Map<string, string>();
  const materialTexture = model.materials.map((m, i) => {
    if (m.textureIndex !== null && sourceNames[m.textureIndex] !== undefined) return sourceNames[m.textureIndex]!;

    // Einfarbige Ersatztextur. Die Deckkraft zählt nur, wenn das Material überblendet wird.
    const alpha = materialShader[i] === 'alpha' ? m.baseColor[3] : 1;
    const rgba = [m.baseColor[0], m.baseColor[1], m.baseColor[2], alpha].map((v) => Math.round(Math.min(Math.max(v, 0), 1) * 255)) as [
      number,
      number,
      number,
      number,
    ];
    const key = rgba.join(',');
    let name = colorNames.get(key);
    if (!name) {
      name = unique(`${propName}_col${colorNames.size}`);
      colorNames.set(key, name);
      ytd.push(toYtdTexture(name, solidImage(rgba), false));
    }
    return name;
  });

  return { ytd, materialTexture, materialShader, hasAlpha, warnings };
}
