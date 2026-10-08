/**
 * Durchsichtige Materialien durch die komplette Prop-Pipeline: Ein Blatt-Modell wird einmal mit Alpha-Test (MASK) und
 * einmal mit Überblendung (BLEND) gebaut. CodeWalker liest YDR, YTD und YTYP, und im XML müssen Shader-Datei,
 * Zeichen-Eimer und Texturformat stimmen.
 *
 *   node spikes/06-own-resource/verify-alpha.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildPropResource } from '../../packages/forge-core/src/index.ts';
import type { ModelData } from '../../packages/forge-core/src/index.ts';
import { joaat } from '../../packages/rage-formats/src/index.ts';

const root = resolve(import.meta.dirname, '..', '..');
const dotnet = join(root, '.dotnet', 'dotnet.exe');
const oracle = join(root, '.local', 'oracle', 'bin', 'Release', 'net10.0', 'Oracle.dll');
const outDir = join(root, '.local', 'verify', 'alpha');

if (!existsSync(dotnet) || !existsSync(oracle)) {
  console.log('ÜBERSPRUNGEN: lokales Vergleichswerkzeug fehlt (.local/).');
  process.exit(0);
}
mkdirSync(outDir, { recursive: true });
const env = { ...process.env, DOTNET_ROOT: join(root, '.dotnet'), DOTNET_NOLOGO: '1' };
const run = (mode: string, input: string, output: string) => execFileSync(dotnet, [oracle, mode, input, output], { env, stdio: 'pipe' });

let failed = false;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'OK    ' : 'FEHLER'}  ${label}${detail ? ` – ${detail}` : ''}`);
  if (!ok) failed = true;
}

/** Zwei gekreuzte Karten mit einer 64x64-Textur: Kreis, entweder scharfkantig oder mit weichem Rand. */
function leaf(soft: boolean, mode: 'mask' | 'blend'): ModelData {
  const size = 64;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - 31.5, y - 31.5) / 30;
      const alpha = soft ? Math.max(0, Math.min(1, 1.5 - 1.5 * d)) : d < 1 ? 1 : 0;
      rgba.set([50, 180, 50, Math.round(alpha * 255)], (y * size + x) * 4);
    }
  }
  const positions = new Float32Array([-0.25, 0, 0, 0.25, 0, 0, 0.25, 0, 0.5, -0.25, 0, 0.5]);
  const normals = new Float32Array([0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0]);
  const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
  return {
    name: 'leaf',
    parts: [{ name: 'card', positions, normals, uvs, indices: new Uint32Array([0, 1, 2, 0, 2, 3]), materialIndex: 0 }],
    materials: [{ name: 'leaf', baseColor: [1, 1, 1, 1], textureIndex: 0, alphaMode: mode }],
    textures: [{ name: 'leaf', width: size, height: size, rgba }],
  };
}

const cases = [
  { name: 'leaf_cutout', model: leaf(false, 'mask'), fileName: 'cutout.sps', bucket: 3 },
  { name: 'leaf_blend', model: leaf(true, 'blend'), fileName: 'alpha.sps', bucket: 1 },
];

for (const c of cases) {
  console.log(`\n--- ${c.name} ---`);
  const resource = await buildPropResource(c.model, { name: c.name, collision: 'box', lodLevels: 1 });
  const files = new Map<string, string>();
  for (const [kind, mode, ext] of [['ydr', 'ydr2xml', 'ydr.xml'], ['ytd', 'ytd2xml', 'ytd.xml'], ['ytyp', 'ytyp2xml', 'ytyp.xml']] as const) {
    const file = resource.files.find((f) => f.path === `stream/${c.name}.${kind}`)!;
    const path = join(outDir, `${c.name}.${kind}`);
    writeFileSync(path, file.data);
    try {
      run(mode, path, join(outDir, `${c.name}.${ext}`));
      files.set(kind, readFileSync(join(outDir, `${c.name}.${ext}`), 'utf8'));
      check(`CodeWalker liest ${c.name}.${kind}`, true);
    } catch (e) {
      check(`CodeWalker liest ${c.name}.${kind}`, false, String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 400));
    }
  }
  const ydr = files.get('ydr') ?? '';
  // Das Vergleichswerkzeug hat kein Namenswörterbuch und schreibt Hashes statt Namen.
  const hex = (name: string) => `hash_${joaat(name).toString(16).toUpperCase().padStart(8, '0')}`;
  check(`Shader-Datei ist ${c.fileName} (${hex(c.fileName)})`, ydr.includes(`<FileName>${hex(c.fileName)}</FileName>`));
  check(`Shader-Name ist default (${hex('default')})`, ydr.includes(`<Name>${hex('default')}</Name>`));
  check(`Render-Bucket ist ${c.bucket}`, new RegExp(`<RenderBucket value="${c.bucket}" />`).test(ydr));
  const ytd = files.get('ytd') ?? '';
  check('Textur im YTD ist DXT5 (mit Alpha)', ytd.includes('D3DFMT_DXT5'));
  check('Textur ist 64x64 mit voller Mip-Kette (7 Stufen)', /<Width value="64" \/>/.test(ytd) && /<MipLevels value="7" \/>/.test(ytd));
  console.log(`INFO    Warnungen: ${resource.warnings.join(' | ')}`);
}

process.exit(failed ? 1 : 0);
