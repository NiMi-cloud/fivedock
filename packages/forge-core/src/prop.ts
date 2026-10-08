import { buildYdr, buildYtd, buildYtyp, simpleShader } from '@toolkit/rage-formats';
import type { CollisionSpec, DrawableGeometry, DrawableShader } from '@toolkit/rage-formats';
import type { ExportedFile, PropExportOptions, PropResource } from './export.ts';
import { decomposeBoxes } from './collision.ts';
import { buildGeometries } from './geometry.ts';
import { MIN_TRIANGLES_FOR_LOD, lodPlan, simplifyGeometries, triangleCount } from './lod.ts';
import { boundsSize, computeBounds, validateModel } from './model.ts';
import type { ModelData } from './model.ts';
import { prepareTextures } from './texture.ts';

const NAME_PATTERN = /^[a-z0-9_]{1,40}$/;

type DrawableGeometryList = DrawableGeometry[];

const encoder = new TextEncoder();
const text = (path: string, content: string): ExportedFile => ({ path, data: encoder.encode(content) });

function manifest(name: string): string {
  return `fx_version 'cerulean'
game 'gta5'

author 'FiveDock'
description 'Prop "${name}", erstellt mit FiveDock'
version '1.0.0'

files {
    'stream/${name}.ytyp',
}

data_file 'DLC_ITYP_REQUEST' 'stream/${name}.ytyp'

client_script 'client.lua'
`;
}

function spawnScript(name: string): string {
  return `-- Spawnt das Prop "${name}" 3 m vor dir. Aufruf im Chat: /spawn_${name}
-- Entfernen mit /clear_${name}

local spawned = {}

RegisterCommand('spawn_${name}', function()
    local hash = joaat('${name}')
    RequestModel(hash)
    local waited = 0
    while not HasModelLoaded(hash) and waited < 5000 do
        Wait(50)
        waited = waited + 50
    end
    if not HasModelLoaded(hash) then
        print('[${name}] Modell konnte nicht geladen werden.')
        return
    end

    local pos = GetOffsetFromEntityInWorldCoords(PlayerPedId(), 0.0, 3.0, 0.0)
    local obj = CreateObject(hash, pos.x, pos.y, pos.z, false, false, false)
    PlaceObjectOnGroundProperly(obj)
    FreezeEntityPosition(obj, true)
    spawned[#spawned + 1] = obj
    SetModelAsNoLongerNeeded(hash)
end, false)

RegisterCommand('clear_${name}', function()
    for _, obj in ipairs(spawned) do
        if DoesEntityExist(obj) then DeleteEntity(obj) end
    end
    spawned = {}
end, false)
`;
}

function readme(name: string, warnings: string[]): string {
  const notes = warnings.length > 0 ? `\nHinweise zur Umwandlung:\n${warnings.map((w) => ` - ${w}`).join('\n')}\n` : '';
  return `Prop "${name}"

Benutzung
 1. Diesen Ordner nach resources/ auf deinem Server kopieren.
 2. In der server.cfg eintragen:  ensure ${name}
 3. Server starten. Im Spiel: /spawn_${name}
 4. Im eigenen Script: CreateObject(joaat('${name}'), x, y, z, false, false, false)
${notes}`;
}

/**
 * Baut aus einem Modell im GTA-Koordinatensystem (Z oben, siehe `toGameSpace`) die fertige Resource:
 * fxmanifest.lua, stream/<name>.ydr, .ytd, .ytyp sowie ein kleines Spawn-Skript.
 */
export async function buildPropResource(model: ModelData, options: PropExportOptions): Promise<PropResource> {
  const { name } = options;
  if (!NAME_PATTERN.test(name)) {
    throw new Error('Der Modellname darf nur Kleinbuchstaben, Ziffern und Unterstriche enthalten (1 bis 40 Zeichen).');
  }
  const problems = validateModel(model);
  if (problems.length > 0) throw new Error(`Das Modell ist fehlerhaft: ${problems[0]}`);

  const bounds = computeBounds(model);
  if (!bounds) throw new Error('Das Modell enthält keine Eckpunkte.');

  const warnings: string[] = [];

  // Texturen und Shader: je benutztes Material ein Shader mit der passenden Textur.
  const textures = prepareTextures(model, name, { maxSize: options.maxTextureSize, compress: options.compressTextures });
  warnings.push(...textures.warnings);

  const usedMaterials = [...new Set(model.parts.map((p) => p.materialIndex))].sort((a, b) => a - b);
  const shaderIndex = new Map<number, number>();
  const shaders: DrawableShader[] = usedMaterials.map((materialIndex, i) => {
    shaderIndex.set(materialIndex, i);
    return simpleShader(textures.materialShader[materialIndex]!, textures.materialTexture[materialIndex]!);
  });
  const cutouts = usedMaterials.filter((m) => textures.materialShader[m] === 'cutout').length;
  const blended = usedMaterials.filter((m) => textures.materialShader[m] === 'alpha').length;
  if (cutouts + blended > 0) {
    const parts = [cutouts > 0 ? `${cutouts} mit Alpha-Test` : '', blended > 0 ? `${blended} mit Überblendung` : ''].filter(Boolean);
    const sorting = blended > 0 ? ' Überblendete Materialien können bei Überlappung falsch sortiert erscheinen.' : '';
    warnings.push(`Durchsichtige Materialien: ${parts.join(', ')}. Das ist noch nicht im Spiel getestet.${sorting}`);
  }

  const geometries = buildGeometries(model, (m) => shaderIndex.get(m)!);
  if (geometries.length > 1) warnings.push(`Das Modell wurde in ${geometries.length} Geometrien nach Material aufgeteilt.`);

  // Kollision
  let collision: CollisionSpec | undefined;
  if (options.collision !== 'none') {
    if (options.collision === 'boxes') {
      const boxes = decomposeBoxes(model);
      collision = { children: boxes.map((b) => ({ type: 'box' as const, min: b.min, max: b.max })) };
      if (boxes.length === 1) warnings.push('Die Kollision ließ sich nicht sinnvoll in mehrere Boxen aufteilen. Es wird eine Box verwendet.');
    } else {
      collision = { children: [{ type: 'box', min: bounds.min, max: bounds.max }] };
      if (options.collision !== 'box') {
        warnings.push('Die Kollision "Hülle" und "Mesh" ist noch nicht verfügbar. Es wird eine Box verwendet.');
      }
    }
  }

  const size = boundsSize(bounds);
  const centre: [number, number, number] = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const radius = Math.hypot(size[0], size[1], size[2]) / 2;
  const longest = Math.max(...size);
  /** Entfernung, ab der das Prop nicht mehr gezeichnet wird. */
  const visibleDistance = Math.round(Math.min(300, Math.max(100, longest * 40)));

  // Detailstufen: vereinfachte Kopien der höchsten Stufe, mit gestaffelten Entfernungen.
  let med: DrawableGeometryList | undefined;
  let low: DrawableGeometryList | undefined;
  let lodDist: { high?: number; med?: number; low?: number } | undefined;
  if (options.lodLevels > 1) {
    if (triangleCount(geometries) < MIN_TRIANGLES_FOR_LOD) {
      warnings.push(`Das Modell hat nur ${triangleCount(geometries)} Dreiecke. Detailstufen lohnen sich erst ab etwa ${MIN_TRIANGLES_FOR_LOD}.`);
    } else {
      const plan = lodPlan(options.lodLevels);
      if (plan.med) med = await simplifyGeometries(geometries, plan.med);
      if (plan.low) low = await simplifyGeometries(geometries, plan.low);
      lodDist = options.lodLevels === 2
        ? { high: visibleDistance * 0.5, low: visibleDistance }
        : { high: visibleDistance * 0.3, med: visibleDistance * 0.6, low: visibleDistance };
    }
  }

  const ydr = buildYdr({
    name,
    shaders,
    high: [{ geometries }],
    med: med ? [{ geometries: med }] : undefined,
    low: low ? [{ geometries: low }] : undefined,
    lodDist,
    collision,
  });
  const ytd = buildYtd(textures.ytd);
  const ytyp = buildYtyp(name, [
    {
      name,
      bbMin: bounds.min,
      bbMax: bounds.max,
      bsCentre: centre,
      bsRadius: radius,
      lodDist: visibleDistance,
      textureDictionary: name,
      physicsDictionary: collision ? name : undefined,
      assetType: 'drawable',
      assetName: name,
    },
  ]);

  const files: ExportedFile[] = [
    text('fxmanifest.lua', manifest(name)),
    text('client.lua', spawnScript(name)),
    text('README.txt', readme(name, warnings)),
    { path: `stream/${name}.ydr`, data: ydr },
    { path: `stream/${name}.ytd`, data: ytd },
    { path: `stream/${name}.ytyp`, data: ytyp },
  ];
  return { files, warnings };
}
