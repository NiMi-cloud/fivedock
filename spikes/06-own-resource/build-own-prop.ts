/**
 * Baut mit der EIGENEN Pipeline (forge-core + rage-formats) eine komplette Test-Resource aus der Beispiel-Kiste,
 * prüft jede Binärdatei mit dem lokalen Vergleichswerkzeug (CodeWalker) und trägt sie in den lokalen Testserver ein.
 *
 *   node spikes/06-own-resource/build-own-prop.ts [name]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DEFAULT_GAME_SPACE, buildPropResource, toGameSpace } from '../../packages/forge-core/src/index.ts';
import { createSampleCrate } from '../../apps/web/src/lib/sample.ts';

const name = process.argv[2] ?? 'own_crate';
const root = resolve(import.meta.dirname, '..', '..');
const resourceDir = join(root, '.local', 'fxserver', 'server-data', 'resources', '[local]', name);
const dotnet = join(root, '.dotnet', 'dotnet.exe');
const oracle = join(root, '.local', 'oracle', 'bin', 'Release', 'net10.0', 'Oracle.dll');

const game = toGameSpace(createSampleCrate(), { ...DEFAULT_GAME_SPACE, scale: 1 });
const resource = await buildPropResource(game, { name, collision: 'box', lodLevels: 1 });

rmSync(resourceDir, { recursive: true, force: true });
for (const file of resource.files) {
  const target = join(resourceDir, file.path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, file.data);
}
console.log(`Resource geschrieben: ${resourceDir}`);
for (const f of resource.files) console.log(`  ${f.path.padEnd(24)} ${f.data.length} Byte`);
for (const w of resource.warnings) console.log(`  Hinweis: ${w}`);

// Prüfung mit CodeWalker (falls lokal vorhanden)
if (existsSync(dotnet) && existsSync(oracle)) {
  const env = { ...process.env, DOTNET_ROOT: join(root, '.dotnet'), DOTNET_NOLOGO: '1' };
  const tmp = join(root, '.local', 'verify', 'own-prop');
  mkdirSync(tmp, { recursive: true });
  let failed = false;
  for (const [file, mode, ext] of [
    [`stream/${name}.ydr`, 'ydr2xml', 'ydr.xml'],
    [`stream/${name}.ytd`, 'ytd2xml', 'ytd.xml'],
    [`stream/${name}.ytyp`, 'ytyp2xml', 'ytyp.xml'],
  ] as const) {
    try {
      execFileSync(dotnet, [oracle, mode, join(resourceDir, file), join(tmp, `${name}.${ext}`)], { env, stdio: 'pipe' });
      console.log(`OK      CodeWalker liest ${file}`);
    } catch (e) {
      failed = true;
      console.log(`FEHLER  CodeWalker kann ${file} nicht lesen:\n${String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 800)}`);
    }
  }
  if (failed) process.exit(1);
}

// In server.cfg freischalten
const cfg = join(root, '.local', 'fxserver', 'server-data', 'server.cfg');
if (existsSync(cfg)) {
  const text = readFileSync(cfg, 'utf8');
  if (!new RegExp(`^\\s*ensure ${name}\\s*$`, 'm').test(text)) {
    writeFileSync(cfg, `${text.replace(/\s*$/, '')}\nensure ${name}\n`);
    console.log(`server.cfg: "ensure ${name}" angehängt.`);
  }
}
