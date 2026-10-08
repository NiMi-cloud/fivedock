import type { RgbaImage } from '@toolkit/rage-formats';

/** Größte Kantenlänge, die wir beim Einlesen eines Bildes zulassen (Schutz vor Speicherüberlauf im Browser). */
export const MAX_IMAGE_EDGE = 8192;

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Liest PNG, JPEG, WebP oder ein anderes vom Browser verstandenes Bild als RGBA. */
export async function decodeImageFile(file: File): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width > MAX_IMAGE_EDGE || bitmap.height > MAX_IMAGE_EDGE) {
      throw new Error(`Das Bild ist zu groß (${bitmap.width}×${bitmap.height}, erlaubt sind höchstens ${MAX_IMAGE_EDGE} Pixel je Kante).`);
    }
    const canvas = createCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Der Browser kann keine Bilder verarbeiten.');
    ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: pixels.width, height: pixels.height, data: new Uint8Array(pixels.data.buffer.slice(0)) };
  } finally {
    bitmap.close();
  }
}

/** Zeichnet ein RGBA-Bild auf eine Zeichenfläche und passt deren Größe an. */
export function drawRgba(canvas: HTMLCanvasElement, image: RgbaImage): void {
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const pixels = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  ctx.putImageData(pixels, 0, 0);
}

export function rgbaToPngBlob(image: RgbaImage): Promise<Blob> {
  const canvas = createCanvas(image.width, image.height);
  drawRgba(canvas, image);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG konnte nicht erzeugt werden.'))), 'image/png');
  });
}
