export { boxCollision, computeCollision, convexHull, decomposeBoxes, meshCollision } from './collision.ts';
export type { BoxDecompositionOptions, CollisionMesh, CollisionMode } from './collision.ts';
export { estimateExport } from './estimate.ts';
export type { ExportEstimate, TextureEstimate } from './estimate.ts';
export { NotReadyError } from './export.ts';
export type { ExportedFile, PropExportOptions, PropResource } from './export.ts';
export { MAX_VERTICES_PER_GEOMETRY, buildGeometries } from './geometry.ts';
export { MIN_TRIANGLES_FOR_LOD, lodPlan, simplifyGeometries, simplifyGeometry } from './lod.ts';
export type { LodSettings } from './lod.ts';
export type { Lang } from './lang.ts';
export { boundsSize, computeBounds, modelStats, validateModel } from './model.ts';
export type { AlphaMode, Bounds, MaterialSource, MeshPart, ModelData, ModelStats, TextureSource, Vec3 } from './model.ts';
export { buildPropResource } from './prop.ts';
export { PROP_PIPELINE } from './status.ts';
export type { PipelineStep, StepStatus } from './status.ts';
export { classifyAlpha, materialShaderKind, nearestPowerOfTwo, prepareTextures, resizeBilinear } from './texture.ts';
export type { AlphaClass, PreparedTextures } from './texture.ts';
export { completeMips, isYtdPath, optimizePack, optimizeTexture, retexture, retextureFromDds, statsOf } from './texture-lab.ts';
export type {
  FileReport,
  OptimizeOptions,
  PackFiles,
  PackReport,
  PackResult,
  Progress,
  RetextureOptions,
  RetextureResult,
  SkipReason,
  TextureAction,
  TextureNote,
  TextureReport,
  TextureResult,
  TextureStats,
} from './texture-lab.ts';
export { readZip, writeZip } from './zip.ts';
export { CATEGORY_ORDER, boneLabel, buildVehicleParts, groupPartsByBone, triangleBones } from './vehicle.ts';
export type { PartCategory, VehiclePart, VehicleParts } from './vehicle.ts';
export { analyzeLayout, availableUvSets, buildIslands, buildOutlines, buildUvLayout, liveryScope, overlayNameOfShader, pickLayoutGroup, suggestUvSet } from './livery.ts';
export type { GroupOutline, GroupOverlap, LayoutGroup, LayoutIsland, LayoutReport, LayoutSpan, LiveryScope, PairOverlap, UvLayout } from './livery.ts';
export { DEFAULT_GAME_SPACE, sanitizePropName, toGameSpace } from './transform.ts';
export type { GameSpaceOptions, UpAxis } from './transform.ts';
export { LiveryWriteError, addLiveryTexture, checkLiveryImage, replaceLiveryTexture } from './livery-write.ts';
export type { LiveryImageCheck, LiveryImageWarning, LiveryWriteErrorCode, LiveryWriteResult } from './livery-write.ts';
export { XmlError, child, childText, childrenNamed, descendants, parseXml } from './xml.ts';
export type { XmlElement } from './xml.ts';
export { analyzeVehiclePack, buildManifest, buildVehicleResource } from './vehicle-pack.ts';
export type { BuildResourceOptions, BuiltResource, Issue, IssueCode, IssueLevel, MetaFile, MetaKind, StreamFile, StreamKind, VehicleModel, VehiclePackAnalysis } from './vehicle-pack.ts';
export { diffuseTextureOf, looksLikeDecal, removeParts, ruleOfPart } from './vehicle-edit.ts';
export type { PartRule } from './vehicle-edit.ts';
export { boneWorldPositions } from './vehicle.ts';
export { VEHICLE_CLASSES, VEHICLE_FLAGS, VEHICLE_TYPES, DASHBOARD_TYPES, PLATE_TYPES, SWANKNESS, WHEEL_TYPES } from './vehicle-enums.ts';
export { FLAG_CATALOG, FLAG_GROUPS, FLAG_GROUP_TITLES, isKnownFlag, otherFlags, parseFlags } from './vehicle-flags.ts';
export type { FlagGroup, FlagInfo } from './vehicle-flags.ts';
export { HANDLING_FIELDS, HANDLING_GROUPS, HANDLING_GROUP_TITLES, HANDLING_VECTORS, formatNumber, readHandlings, setHandlingText, setHandlingValue } from './handling.ts';
export type { HandlingEntry, HandlingField, HandlingGroup, HandlingTextKey } from './handling.ts';
export { VEHICLE_ENUM_FIELDS, VEHICLE_NUMBERS, VEHICLE_TEXT_FIELDS, listVehicles, readVariation, readVehicle, setAllVariationColors, setVariationColor, setVariationLiveries, setVariationSiren, setVehicleFlags, setVehicleNumber, setVehicleText } from './vehicle-meta.ts';
export type { VariationColor, VariationData, VehicleData, VehicleEnumField, VehicleNumberField } from './vehicle-meta.ts';
export { LIGHT_FIELDS, SEQUENCES, ensureSirenLights, SETTING_FIELDS, SIREN_PRESETS, addSirenSetting, buildSirenSetting, formatSirenColor, newCarcols, parseSirenColor, presetLights, readSirenSettings, sequenceOn, setSirenLight, setSirenLightCount, setSirenName, setSirenSetting, sirenBoneNumbers, suggestSirenId } from './sirens.ts';
export type { LightField, NewSirenOptions, SettingField, SirenLight, SirenPresetId, SirenPresetLight, SirenSetting, SirenTiming } from './sirens.ts';
export { XmlEditError, appendChild, applyEdits, escapeXml, indentOf, removeElement, replaceElement, setAttribute, setContent } from './xml-edit.ts';
export type { TextEdit } from './xml-edit.ts';
export { DEFAULT_LIGHTBAR, LIGHTBAR_LIMITS, buildLightbar, freeSirenNumbers, lightbarBones, roofHeight, suggestLightbarMaterials, suggestRoofPosition, usedShaders } from './lightbar.ts';
export type { LightbarBones, LightbarBuild, LightbarMaterials, LightbarSpec } from './lightbar.ts';
export { donorModel, donorToAddedModel, targetMaterialFor } from './vehicle-transplant.ts';
export type { DonorModel, DonorRequest } from './vehicle-transplant.ts';
export { applyAddedParts, matchBone, matchShader, modelMeshes, placeModelParts, planAddedParts, retargetAdded } from './vehicle-add.ts';
export type { AddedLightbar, AddedModel, AddedPart, AddedPlan, AppliedParts, PlacedPart, PlanOptions, PlannedSiren, PlannedTexture } from './vehicle-add.ts';
export { addTextures } from './texture-add.ts';
export type { AddTexturesOptions, AddTexturesResult, NewTexture } from './texture-add.ts';
export { applyLiveryLayer, liveryCandidates, liveryTextureName } from './livery-layer.ts';
export type { LiveryCandidate, LiveryLayerPlan } from './livery-layer.ts';
