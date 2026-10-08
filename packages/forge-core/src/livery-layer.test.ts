import { buildTestYft, buildYtd, readYft, readYtd } from '@toolkit/rage-formats';
import type { RgbaImage, YtdTexture } from '@toolkit/rage-formats';
import { describe, expect, it } from 'vitest';
import { applyLiveryLayer, liveryCandidates, liveryTextureName } from './livery-layer.ts';
import { addLiveryTexture } from './livery-write.ts';
import { buildVehicleParts } from './vehicle.ts';

describe('liveryCandidates', () => {
  it('findet Lack-Shader, die sich umstellen lassen, mit ihren Teilen', () => {
    const yft = readYft(buildTestYft({ paint: 'paint2' }));
    const list = liveryCandidates(yft, buildVehicleParts(yft).parts);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ shader: 2, preset: 'vehicle_paint2', diffuse: 'body_diffuse', hasUv1: true, recommended: true });
    expect(list[0]!.triangles).toBe(1);
    expect(list[0]!.partIds.length).toBeGreaterThan(0);
  });

  it('ohne zweite Texturkoordinate gibt es keine Empfehlung', () => {
    const yft = readYft(buildTestYft({ paint: 'paint1', paintUv1: false }));
    const list = liveryCandidates(yft, buildVehicleParts(yft).parts);
    expect(list[0]).toMatchObject({ preset: 'vehicle_paint1', hasUv1: false, recommended: false });
  });

  it('ohne Lack-Material oder mit schon vorhandener Ebene bleibt die Liste leer', () => {
    const plain = readYft(buildTestYft());
    expect(liveryCandidates(plain, buildVehicleParts(plain).parts)).toEqual([]);
    const done = readYft(applyLiveryLayer(buildTestYft({ paint: 'paint2' }), { shaders: [2], textureName: 'x' }));
    expect(liveryCandidates(done, buildVehicleParts(done).parts)).toEqual([]);
  });
});

describe('liveryTextureName', () => {
  it('heißt <Fahrzeug>_livery, bei Kollision mit Zahl', () => {
    expect(liveryTextureName('Fpiu', [])).toBe('fpiu_livery');
    expect(liveryTextureName('fpiu', ['FPIU_LIVERY'])).toBe('fpiu_livery2');
    expect(liveryTextureName('fpiu', ['fpiu_livery', 'fpiu_livery2'])).toBe('fpiu_livery3');
    expect(liveryTextureName('my car!', [])).toBe('my_car__livery');
    expect(liveryTextureName('', [])).toBe('vehicle_livery');
  });
});

describe('applyLiveryLayer', () => {
  it('stellt die gewählten Lack-Shader auf paint3 mit der Livery-Textur um', () => {
    const file = buildTestYft({ paint: 'paint2' });
    const out = applyLiveryLayer(file, { shaders: [2], textureName: 'testcar_livery' });
    const yft = readYft(out);
    expect(yft.shaders[2]!.preset).toBe('vehicle_paint3');
    expect(yft.shaders[2]!.textures.some((t) => t.param === 'DiffuseSampler2' && t.name === 'testcar_livery')).toBe(true);
  });

  it('übersetzt die Shader-Nummer für eine andere Datei über das Aussehen', () => {
    const reference = readYft(buildTestYft({ paint: 'paint2' }));
    const out = applyLiveryLayer(buildTestYft({ paint: 'paint2' }), { shaders: [2], textureName: 'x' }, reference);
    expect(readYft(out).shaders[2]!.preset).toBe('vehicle_paint3');
  });

  it('meldet ein Material, das es in der Datei nicht gibt', () => {
    const reference = readYft(buildTestYft({ paint: 'paint2' }));
    expect(() => applyLiveryLayer(buildTestYft(), { shaders: [2], textureName: 'x' }, reference)).toThrow(/gibt es in dieser Modelldatei nicht/);
  });
});

describe('addLiveryTexture', () => {
  const small = (name: string): YtdTexture => ({ name, width: 4, height: 4, levels: 1, format: 'A8R8G8B8', data: new Uint8Array(64).fill(7) });
  const image = (w: number, h: number): RgbaImage => ({ width: w, height: h, data: new Uint8Array(w * h * 4).fill(255) });

  it('legt eine neue Textur an: DXT5 mit Mip-Kette, Größe aus dem Bild, die anderen Texturen bleiben', () => {
    const ytd = buildYtd([small('a'), small('b')]);
    const { ytd: out, texture } = addLiveryTexture(ytd, 'car_livery', image(256, 128));
    const textures = readYtd(out);
    // das Wörterbuch ordnet nach Namens-Hash, deshalb wird nach Namen gesucht
    expect(textures.map((t) => t.name).sort()).toEqual(['a', 'b', 'car_livery']);
    const added = textures.find((t) => t.name === 'car_livery')!;
    expect(added).toMatchObject({ format: 'DXT5', width: 256, height: 128 });
    expect(added.levels).toBeGreaterThan(1);
    expect(texture.name).toBe('car_livery');
    // alte Texturen unverändert
    expect(Array.from(textures.find((t) => t.name === 'a')!.data)).toEqual(Array.from(small('a').data));
  });

  it('rundet die Größe auf eine Zweierpotenz und begrenzt sie', () => {
    const out = readYtd(addLiveryTexture(buildYtd([small('a')]), 'x', image(300, 40), { maxSize: 128 }).ytd);
    expect(out.find((t) => t.name === 'x')).toMatchObject({ width: 128, height: 32 });
  });

  it('ersetzt eine vorhandene Textur gleichen Namens, statt eine zweite anzulegen', () => {
    const ytd = buildYtd([small('a'), small('car_livery')]);
    const out = readYtd(addLiveryTexture(ytd, 'CAR_LIVERY', image(8, 8)).ytd);
    expect(out.map((t) => t.name).sort()).toEqual(['a', 'car_livery']);
  });
});
