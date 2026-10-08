import { describe, expect, it } from 'vitest';
import { joaat } from './jenkins.ts';
import { SYSTEM_BASE, parseResource } from './rsc7.ts';
import { buildYdr, defaultShader } from './ydr.ts';
import type { Drawable, DrawableGeometry } from './ydr.ts';

/** Ein Würfel von -0,5 bis 0,5 mit 24 Eckpunkten (je Fläche eigene). */
function cube(): DrawableGeometry {
  const h = 0.5;
  const faces: Array<{ n: [number, number, number]; c: Array<[number, number, number]> }> = [
    { n: [0, 0, 1], c: [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]] },
    { n: [0, 0, -1], c: [[h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h]] },
    { n: [1, 0, 0], c: [[h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h]] },
    { n: [-1, 0, 0], c: [[-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h]] },
    { n: [0, 1, 0], c: [[-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h]] },
    { n: [0, -1, 0], c: [[-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h]] },
  ];
  const positions = new Float32Array(24 * 3);
  const normals = new Float32Array(24 * 3);
  const uvs = new Float32Array(24 * 2);
  const indices: number[] = [];
  faces.forEach((f, fi) => {
    f.c.forEach((p, i) => {
      positions.set(p, (fi * 4 + i) * 3);
      normals.set(f.n, (fi * 4 + i) * 3);
      uvs.set([i % 2, i < 2 ? 0 : 1], (fi * 4 + i) * 2);
    });
    const b = fi * 4;
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  return { positions, normals, uvs, indices, shader: 0 };
}

function drawable(extra: Partial<Drawable> = {}): Drawable {
  return {
    name: 'forge_cube',
    shaders: [defaultShader('forge_cube_diffuse')],
    high: [{ geometries: [cube()] }],
    ...extra,
  };
}

/** Liest Zeiger und Felder zurück (nur für Tests). */
function read(file: Uint8Array) {
  const parsed = parseResource(file);
  const sys = new DataView(parsed.system.buffer, parsed.system.byteOffset, parsed.system.byteLength);
  const off = (addr: number) => addr - SYSTEM_BASE;
  const ptr = (o: number) => off(sys.getUint32(o, true));
  return { parsed, sys, ptr };
}

describe('defaultShader', () => {
  it('hat die sieben Parameter von default.sps in der Referenzreihenfolge', () => {
    const s = defaultShader('tex');
    expect(s.params.map((p) => p.name)).toEqual([
      'DiffuseSampler',
      'matMaterialColorScale',
      'HardAlphaBlend',
      'useTessellation',
      'wetnessMultiplier',
      'globalAnimUV1',
      'globalAnimUV0',
    ]);
  });

  it('Parameternamen ergeben die Hashes aus der Referenz-Datei (CodeWalker-Ausgabe)', () => {
    const expected = [0xf1fe2b71, 0x948a54f2, 0xe9437406, 0x4620a35d, 0x32dd9ff5, 0xba54c190, 0xd79bfc1e];
    expect(defaultShader('t').params.map((p) => joaat(p.name))).toEqual(expected);
    expect(joaat('default')).toBe(0xe4df46d5);
    expect(joaat('default.sps')).toBe(0x18ad1594);
  });
});

describe('buildYdr', () => {
  it('schreibt Version 165 und nutzt nur den Systemspeicher', () => {
    const { parsed } = read(buildYdr(drawable()));
    expect(parsed.version).toBe(165);
    expect(parsed.graphics.length).toBe(0);
  });

  it('schreibt das Wurzelobjekt wie die Referenz', () => {
    const { sys, ptr } = read(buildYdr(drawable()));
    expect(sys.getUint32(0x00, true)).toBe(0x40573178);
    expect(sys.getUint32(0x04, true)).toBe(1);
    expect(sys.getFloat32(0x30, true)).toBe(-0.5);
    expect(sys.getFloat32(0x40, true)).toBe(0.5);
    expect(sys.getFloat32(0x2c, true)).toBeCloseTo(Math.sqrt(0.75), 6);
    expect(sys.getUint32(0x3c, true)).toBe(0x7f800001);
    expect(sys.getFloat32(0x70, true)).toBe(9998);
    expect(sys.getUint32(0x80, true)).toBe(0x0000ff01);
    expect(sys.getUint32(0x84, true)).toBe(0);
    expect(sys.getUint32(0x58, true)).toBe(0); // keine mittlere Stufe
    expect(sys.getUint32(0xc8, true)).toBe(0); // noch keine Kollision

    // Name
    const name = ptr(0xa8);
    expect(String.fromCharCode(...new Uint8Array(sys.buffer, sys.byteOffset + name, 10))).toBe('forge_cube');
    // Seitenzahl
    expect(sys.getUint8(ptr(0x08) + 8)).toBe(1);
    expect(sys.getUint8(ptr(0x08) + 9)).toBe(0);
  });

  it('schreibt Shadergruppe und Shader wie die Referenz', () => {
    const { sys, ptr } = read(buildYdr(drawable()));
    const group = ptr(0x10);
    expect(sys.getUint32(group, true)).toBe(1080113136);
    expect(sys.getUint32(group + 8, true)).toBe(0); // keine eingebettete Textur
    expect(sys.getUint16(group + 0x18, true)).toBe(1);
    expect(sys.getUint32(group + 0x30, true)).toBe(4);

    const fx = ptr(ptr(group + 0x10)); // Zeiger-Array, dann das erste ShaderFX
    expect(sys.getUint32(fx + 8, true)).toBe(0xe4df46d5);
    expect(sys.getUint8(fx + 0x10)).toBe(7); // Parameteranzahl
    expect(sys.getUint8(fx + 0x11)).toBe(0); // Render-Bucket
    expect(sys.getUint16(fx + 0x12, true)).toBe(32768);
    expect(sys.getUint16(fx + 0x14, true)).toBe(208);
    expect(sys.getUint16(fx + 0x16, true)).toBe(272);
    expect(sys.getUint32(fx + 0x18, true)).toBe(0x18ad1594);
    expect(sys.getUint32(fx + 0x20, true)).toBe(0xff01);
    expect(sys.getUint8(fx + 0x27)).toBe(1); // Textur-Parameter
  });

  it('schreibt die Parameterköpfe mit den Registerhinweisen der Referenz', () => {
    const { sys, ptr } = read(buildYdr(drawable()));
    const fx = ptr(ptr(ptr(0x10) + 0x10));
    const params = ptr(fx);
    const heads = Array.from({ length: 7 }, (_, i) => [sys.getUint8(params + i * 16), sys.getUint8(params + i * 16 + 1)]);
    expect(heads).toEqual([[0, 2], [1, 165], [1, 164], [1, 163], [1, 162], [1, 161], [1, 160]]);

    // erster Vektor (matMaterialColorScale) ist (1, 0, 0, 1)
    const first = ptr(params + 16 + 8);
    expect([0, 4, 8, 12].map((o) => sys.getFloat32(first + o, true))).toEqual([1, 0, 0, 1]);

    // Hashes direkt nach den Vektordaten
    const hashes = params + 7 * 16 + 6 * 16;
    expect(sys.getUint32(hashes, true)).toBe(0xf1fe2b71);
    expect(sys.getUint32(hashes + 24, true)).toBe(0xd79bfc1e);
  });

  it('verweist per Texturreferenz auf die Textur im YTD', () => {
    const { sys, ptr } = read(buildYdr(drawable()));
    const fx = ptr(ptr(ptr(0x10) + 0x10));
    const params = ptr(fx);
    const texture = ptr(params + 8);
    expect(sys.getUint32(texture + 0x04, true)).toBe(1);
    expect(sys.getUint16(texture + 0x30, true)).toBe(1);
    expect(sys.getUint16(texture + 0x32, true)).toBe(2);
    const nameAt = ptr(texture + 0x28);
    expect(String.fromCharCode(...new Uint8Array(sys.buffer, sys.byteOffset + nameAt, 18))).toBe('forge_cube_diffuse');
  });

  it('schreibt Modell, Geometrie und Puffer wie die Referenz', () => {
    const { sys, ptr } = read(buildYdr(drawable()));
    const list = ptr(0x50);
    expect(sys.getUint16(list + 8, true)).toBe(1);
    expect(sys.getUint16(list + 10, true)).toBe(1);
    const model = ptr(list + 16);
    expect(sys.getUint32(model, true)).toBe(1080101528);
    expect(sys.getUint16(model + 0x10, true)).toBe(1);
    expect(sys.getUint16(model + 0x2c, true)).toBe(0x00ff);
    expect(sys.getUint16(model + 0x2e, true)).toBe(1);
    expect(ptr(model + 0x20)).toBe(model + 48); // Shader-Zuordnung direkt nach dem Kopf
    expect(ptr(model + 0x08)).toBe(model + 56); // Geometrie-Zeiger, nach 2 + 6 Byte
    expect(ptr(model + 0x18)).toBe(model + 64); // Begrenzung

    const geometry = ptr(model + 56);
    expect(geometry).toBe(model + 96);
    expect(sys.getUint32(geometry, true)).toBe(1080133528);
    expect(sys.getUint32(geometry + 0x58, true)).toBe(36);
    expect(sys.getUint32(geometry + 0x5c, true)).toBe(12);
    expect(sys.getUint16(geometry + 0x60, true)).toBe(24);
    expect(sys.getUint16(geometry + 0x62, true)).toBe(3);
    expect(sys.getUint16(geometry + 0x70, true)).toBe(36);

    const vb = ptr(geometry + 0x18);
    expect(sys.getUint32(vb, true)).toBe(1080153080);
    expect(sys.getUint16(vb + 8, true)).toBe(36);
    expect(sys.getUint32(vb + 0x18, true)).toBe(24);
    expect(sys.getUint32(vb + 0x10, true)).toBe(sys.getUint32(vb + 0x20, true)); // beide Zeiger gleich
    const decl = ptr(vb + 0x30);
    expect(sys.getUint32(decl, true)).toBe(89);
    expect(sys.getUint16(decl + 4, true)).toBe(36);
    expect(sys.getUint8(decl + 7)).toBe(4);
    expect(sys.getBigUint64(decl + 8, true)).toBe(0x7755555555996996n);

    const ib = ptr(geometry + 0x38);
    expect(sys.getUint32(ib, true)).toBe(1080152408);
    expect(sys.getUint32(ib + 8, true)).toBe(36);
    const indices = ptr(ib + 0x10);
    expect(sys.getUint16(indices, true)).toBe(0);
    expect(sys.getUint16(indices + 2, true)).toBe(1);
    expect(sys.getUint16(indices + 4, true)).toBe(2);
  });

  it('legt die Vertexdaten in der Reihenfolge Position, Normale, Farbe, UV ab', () => {
    const geometry = cube();
    geometry.colors = new Uint8Array(24 * 4).fill(0);
    geometry.colors.set([10, 20, 30, 40], 4); // zweiter Eckpunkt
    const { sys, ptr } = read(buildYdr(drawable({ high: [{ geometries: [geometry] }] })));
    const model = ptr(ptr(0x50) + 16);
    const data = ptr(ptr(ptr(model + 56) + 0x18) + 0x10);
    const v1 = data + 36;
    expect(sys.getFloat32(v1, true)).toBe(0.5); // x des zweiten Eckpunkts (h, -h, h)
    expect(sys.getFloat32(v1 + 12, true)).toBe(0); // Normale x
    expect(sys.getFloat32(v1 + 20, true)).toBe(1); // Normale z
    expect([0, 1, 2, 3].map((o) => sys.getUint8(v1 + 24 + o))).toEqual([10, 20, 30, 40]); // R G B A
    expect(sys.getFloat32(v1 + 28, true)).toBe(1); // u
  });

  it('unterstützt mehrere Geometrien mit eigener Gesamtbegrenzung', () => {
    const a = cube();
    const b = cube();
    b.positions = b.positions.map((v) => v + 10);
    const { sys, ptr } = read(buildYdr(drawable({ high: [{ geometries: [a, b] }] })));
    const model = ptr(ptr(0x50) + 16);
    expect(sys.getUint16(model + 0x10, true)).toBe(2);
    const bounds = ptr(model + 0x18);
    // erste Box ist die gesamte: von -0,5 bis 10,5
    expect(sys.getFloat32(bounds, true)).toBe(-0.5);
    expect(sys.getFloat32(bounds + 16, true)).toBe(10.5);
    // zweite ist die der ersten Geometrie
    expect(sys.getFloat32(bounds + 32 + 16, true)).toBe(0.5);
  });

  it('schreibt weitere Detailstufen mit eigenem Zeiger und eigenen Flags', () => {
    const { sys } = read(buildYdr(drawable({ med: [{ geometries: [cube()] }], lodDist: { med: 40 } })));
    expect(sys.getUint32(0x58, true)).toBeGreaterThan(0);
    expect(sys.getFloat32(0x74, true)).toBe(40);
    expect(sys.getUint32(0x84, true)).toBe(0xff00);
  });

  it('lehnt fehlerhafte Eingaben ab', () => {
    expect(() => buildYdr(drawable({ name: 'mit leerzeichen' }))).toThrow(/Drawable-Name/);
    expect(() => buildYdr(drawable({ shaders: [] }))).toThrow(/Shader/);
    expect(() => buildYdr(drawable({ high: [] }))).toThrow(/Modell/);

    const bad = cube();
    bad.indices = [0, 1, 99];
    expect(() => buildYdr(drawable({ high: [{ geometries: [bad] }] }))).toThrow(/Index 99/);

    const wrongShader = cube();
    wrongShader.shader = 3;
    expect(() => buildYdr(drawable({ high: [{ geometries: [wrongShader] }] }))).toThrow(/Shader-Index/);

    const big = cube();
    big.positions = new Float32Array(70000 * 3);
    big.normals = new Float32Array(70000 * 3);
    big.uvs = new Float32Array(70000 * 2);
    expect(() => buildYdr(drawable({ high: [{ geometries: [big] }] }))).toThrow(/65535/);
  });
});
