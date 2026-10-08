/**
 * Erzeugt aus dem Sollumz-Referenz-XML eine Variante, bei der die Kollision ein Komposit mit einem Box-Kind ist.
 * CodeWalker baut daraus die Referenz-Binärdatei, gegen die der eigene Schreiber geprüft wird.
 *
 *   node spikes/05-ydr/make-box-reference.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const ref = readFileSync(join(root, '.local', 'reference-exports', 'cube', 'gen8', 'forge_cube.ydr.xml'), 'utf8');
const outDir = join(root, '.local', 'verify', 'ydr');
mkdirSync(outDir, { recursive: true });

interface Fields {
  min: number;
  max: number;
  radius: number;
  margin: number;
  volume: number;
}

const base = (indent: string, f: Fields, extra = '') => `${indent}<BoxMin x="${f.min}" y="${f.min}" z="${f.min}" />
${indent}<BoxMax x="${f.max}" y="${f.max}" z="${f.max}" />
${indent}<BoxCenter x="0" y="0" z="0" />
${indent}<SphereCenter x="0" y="0" z="0" />
${indent}<SphereRadius value="${f.radius}" />
${indent}<Margin value="${f.margin}" />
${indent}<Volume value="${f.volume}" />
${indent}<Inertia x="1" y="1" z="1" />
${indent}<MaterialIndex value="0" />
${indent}<MaterialColourIndex value="0" />
${indent}<ProceduralID value="0" />
${indent}<RoomID value="0" />
${indent}<PedDensity value="0" />
${indent}<UnkFlags value="0" />
${indent}<PolyFlags value="0" />
${indent}<UnkType value="1" />
${extra}`;

const child = `      <Item type="Box">
${base('        ', { min: -0.5, max: 0.5, radius: 0.8660254, margin: 0.04, volume: 1 }, `        <CompositeTransform>
          1 0 0 0
          0 1 0 0
          0 0 1 0
          0 0 0 1
        </CompositeTransform>
        <CompositeFlags1>MAP_WEAPON, MAP_DYNAMIC, MAP_ANIMAL, MAP_COVER, MAP_VEHICLE</CompositeFlags1>
        <CompositeFlags2>VEHICLE_NOT_BVH, VEHICLE_BVH, PED, RAGDOLL, ANIMAL, ANIMAL_RAGDOLL, OBJECT, PLANT, PROJECTILE, EXPLOSION, FORKLIFT_FORKS, TEST_WEAPON, TEST_CAMERA, TEST_AI, TEST_SCRIPT, TEST_VEHICLE_WHEEL, GLASS</CompositeFlags2>
`)}      </Item>`;

// Komposit wie bei Sollumz: umschließt das Kind samt Margin (0,5 + 0,04), selbst ohne Margin.
const composite = `  <Bounds type="Composite">
${base('    ', { min: -0.54, max: 0.54, radius: 0.93530744, margin: 0, volume: 1 })}    <Children>
${child}
    </Children>
  </Bounds>`;

writeFileSync(join(outDir, 'box.ydr.xml'), ref.replace(/<Bounds[\s\S]*?<\/Bounds>/, composite));
console.log('geschrieben:', join(outDir, 'box.ydr.xml'));
