import type { IssueCode, IssueLevel, PartCategory, SkipReason, TextureAction, TextureNote } from '@toolkit/forge-core';

export type Lang = 'de' | 'en';

export type ToolGroup = 'vehicles' | 'props' | 'textures' | 'peds' | 'later';

export interface Strings {
  brand: string;
  navTools: string;
  navPropCreator: string;
  navTextures: string;
  navLivery: string;
  themeToggle: string;
  langToggle: string;

  heroTitle: string;
  heroText: string;
  heroCta: string;
  heroCtaLivery: string;
  privacyTitle: string;
  privacyText: string;
  toolsTitle: string;
  toolsIntro: string;
  statusAvailable: string;
  statusProgress: string;
  statusPlanned: string;
  statusLater: string;
  groupTitles: Record<ToolGroup, string>;
  openTool: string;
  footerNote: string;
  footerImprint: string;
  footerPrivacy: string;

  propTitle: string;
  propIntro: string;
  dropTitle: string;
  dropHint: string;
  dropButton: string;
  loading: string;
  loadFailed: string;
  noModel: string;
  fileLabel: string;
  clearModel: string;
  loadSample: string;
  warnHuge: string;
  warnTiny: string;
  warnTriangles: string;
  warnTextures: string;
  warnNoTexture: string;
  nameResult: string;

  settings: string;
  nameLabel: string;
  nameHelp: string;
  upAxisLabel: string;
  upY: string;
  upZ: string;
  sizeLabel: string;
  sizeHelp: string;
  scaleFactor: string;
  collisionLabel: string;
  collisionNone: string;
  collisionBox: string;
  collisionBoxes: string;
  collisionHull: string;
  collisionMesh: string;
  lodLabel: string;
  lodHelp: string;
  textureSizeLabel: string;
  textureSizeHelp: string;
  compressLabel: string;
  compressHelp: string;
  estimateTitle: string;
  estimateTextures: string;
  estimateMesh: string;
  estimateTotal: string;
  estimateLarge: string;
  showReference: string;
  showCollision: string;
  stats: string;
  statVertices: string;
  statTriangles: string;
  statMaterials: string;
  statTextures: string;
  statSize: string;
  problems: string;

  exportTitle: string;
  exportButton: string;
  exportBusy: string;
  exportDone: string;
  exportFailed: string;
  pipelineTitle: string;
  pipelineDone: string;
  pipelineTodo: string;
  pipelineActive: string;
  howToUse: string;
  howToUseText: string;

  labTitle: string;
  labIntro: string;
  labLimits: string;
  labDropTitle: string;
  labDropHint: string;
  labDropButton: string;
  labLoading: string;
  labLoadFailed: string;
  labNoYtd: string;
  labClear: string;
  labSummaryTitle: string;
  labFiles: string;
  labTextures: string;
  labMemory: string;
  labOptimizeTitle: string;
  labMaxSize: string;
  labMaxSizeHelp: string;
  labRecompress: string;
  labRecompressHelp: string;
  labOptimizeButton: string;
  labOptimizing: string;
  labUndo: string;
  labDownload: string;
  labDownloadHint: string;
  labReplaceSettings: string;
  labReplaceSize: string;
  labReplaceKeep: string;
  labReplaceFit: string;
  labReplaceHelp: string;
  labResultTitle: string;
  labResultNothing: string;
  labResultMemory: string;
  labResultFile: string;
  labResultChanged: string;
  labEmbedded: string;
  labStatusOptimized: string;
  labStatusUnchanged: string;
  labStatusSkipped: string;
  labTexturesTitle: string;
  labReplace: string;
  labReplaceBusy: string;
  labReplaced: string;
  labReplaceFailed: string;
  labSavePng: string;
  labSaveDds: string;
  labNoPreview: string;
  labNoMips: string;
  labNotPow2: string;
  labMips: string;
  labErrorFile: string;
  labSkipReasons: Record<SkipReason, string>;
  labNotes: Record<TextureNote, string>;
  labActions: Record<TextureAction, string>;

  vehTitle: string;
  vehIntro: string;
  vehStatus: string;
  vehDropTitle: string;
  vehDropHint: string;
  vehDropButton: string;
  vehDropFolder: string;
  vehUnpacking: string;
  vehArchiveFailed: string;
  vehArchiveEncrypted: string;
  vehLoading: string;
  vehLoadFailed: string;
  vehNoYft: string;
  vehErrors: Record<'encrypted' | 'not-rsc7' | 'wrong-version' | 'corrupt' | 'unsupported', string>;
  vehClear: string;
  vehFile: string;
  vehParts: string;
  vehTriangles: string;
  vehMaterials: string;
  vehBones: string;
  vehPartList: string;
  vehSearch: string;
  vehCategories: Record<PartCategory, string>;
  vehShowAll: string;
  vehOnlySelection: string;
  vehHide: string;
  vehNoSelection: string;
  vehDetails: string;
  vehBone: string;
  vehCategory: string;
  vehGeometries: string;
  vehShaders: string;
  vehTextures: string;
  vehUv: string;
  vehSize: string;
  vehViewFront: string;
  vehViewRear: string;
  vehViewSide: string;
  vehViewTop: string;
  vehViewIso: string;
  vehWireframe: string;
  vehHint: string;
  vehLiveryTitle: string;
  vehStepView: string;
  vehStepTemplate: string;
  vehStepWrite: string;
  vehStepGame: string;
  vehStateDone: string;
  vehStateWip: string;
  vehStateOpen: string;
  vehNoWebGL: string;
  vehNoMatch: string;
  navImporter: string;
  impTitle: string;
  impIntro: string;
  impStatus: string;
  impDropTitle: string;
  impDropHint: string;
  impResourceName: string;
  impResourceNameHint: string;
  impDisplayName: string;
  impDisplayNameHint: string;
  impModels: string;
  impChipModel: string;
  impChipHigh: string;
  impChipTexture: string;
  impChipHandling: string;
  impChipVariation: string;
  impIssues: string;
  impNoIssues: string;
  impFiles: string;
  impStream: string;
  impMetas: string;
  impIgnored: string;
  impUnreadable: string;
  impDownload: string;
  impDownloadAnyway: string;
  impPreparing: string;
  impNext: string;
  impNextSteps: string;
  impClear: string;
  impSiren: string;
  impTotal: string;
  impFailed: string;
  impLevels: Record<IssueLevel, string>;
  impIssueText: Record<IssueCode, string>;
  vehTab3d: string;
  vehTabSheet: string;
  tplTitle: string;
  tplIntro: string;
  tplLayerLabel: string;
  tplNoLayer: string;
  tplSet: string;
  tplSetHint: string;
  tplScope: string;
  tplScopeAll: string;
  tplScopeSelection: string;
  tplScopeNeedsPaint: string;
  tplSize: string;
  tplFill: string;
  tplLabels: string;
  tplBase: string;
  tplBaseMissing: string;
  tplBaseUndecodable: string;
  tplDownload: string;
  tplPreparing: string;
  tplFailed: string;
  tplReport: string;
  tplCoverage: string;
  tplOverlap: string;
  tplOverlapNote: string;
  tplPairs: string;
  tplOutside: string;
  tplDegenerate: string;
  tplEmpty: string;
  tplSheetHint: string;
  tplNoPaint: string;
  tplSelfOverlap: string;
  vehShowLivery: string;
  vehShowTextures: string;
  vehPanelParts: string;
  vehPanelTemplate: string;
  vehPanelPaint: string;
  edtPanel: string;
  edtPageTitle: string;
  edtPageIntro: string;
  edtStatus: string;
  edtTitle: string;
  edtIntro: string;
  edtPickHint: string;
  edtMarked: string;
  edtMarkedCount: string;
  edtNone: string;
  edtRemove: string;
  edtRestore: string;
  edtClear: string;
  edtExport: string;
  edtExporting: string;
  edtDecals: string;
  edtNote: string;
  edtResult: string;
  edtNothing: string;
  edtFailed: string;
  prpPanelVehicle: string;
  prpDisplayName: string;
  prpDisplayNameHint: string;
  prpPanelHandling: string;
  prpPanelLights: string;
  prpNoMeta: string;
  prpReset: string;
  prpResetAll: string;
  prpAdd: string;
  prpVehicleTitle: string;
  prpVehicleIntro: string;
  prpFlagsOther: string;
  prpFlagsMore: string;
  prpVariations: string;
  prpVariationsIntro: string;
  prpLiveries: string;
  prpLiveryHint: string;
  prpColors: string;
  prpColorHint: string;
  prpColorBody: string;
  prpColorSecond: string;
  prpColorPearl: string;
  prpColorWheels: string;
  prpSirenId: string;
  prpSirenIdNote: string;
  prpHandlingTitle: string;
  prpHandlingIntro: string;
  prpAdvanced: string;
  prpAdvancedHint: string;
  prpLightsTitle: string;
  prpLightsIntro: string;
  prpNoSirenBones: string;
  prpSirenBones: string;
  prpPreset: string;
  prpApplyPreset: string;
  prpPlay: string;
  prpStop: string;
  prpCreateSiren: string;
  prpNoSiren: string;
  prpPreviewNote: string;
  prpBpm: string;
  prpBpmHint: string;
  prpRealLights: string;
  prpAddLight: string;
  prpRemoveLight: string;
  prpLights: string;
  prpLight: string;
  prpNoBone: string;
  prpColor: string;
  prpOn: string;
  prpBlinks: string;
  prpPattern: string;
  prpIntensity: string;
  prpSize: string;
  expTitle: string;
  expNothing: string;
  expParts: string;
  expMeta: string;
  expDownload: string;
  expBusy: string;
  expNote: string;
  addPanel: string;
  addTitle: string;
  addIntro: string;
  addLightbar: string;
  addEmpty: string;
  addListTitle: string;
  addLightbarName: string;
  addRemove: string;
  addSize: string;
  addLength: string;
  addDepth: string;
  addHeight: string;
  addModules: string;
  addStyle: string;
  addStyleFlat: string;
  addStyleDome: string;
  addFeet: string;
  addPosition: string;
  addX: string;
  addY: string;
  addZ: string;
  addToRoof: string;
  addToRoofNote: string;
  addMaterials: string;
  addHousing: string;
  addLens: string;
  addLensSame: string;
  addMaterialHint: string;
  addNoMaterial: string;
  addSirens: string;
  addSirensHint: string;
  addSirenNumbers: string;
  addSetupLights: string;
  addSetupHint: string;
  addSetupDone: string;
  addSetupNeedSiren: string;
  addNote: string;
  addModel: string;
  addModelHint: string;
  addModelFailed: string;
  addModelProblems: string;
  addModelScale: string;
  addModelSize: string;
  addModelRotation: string;
  addRotX: string;
  addRotY: string;
  addRotZ: string;
  addModelUpright: string;
  addModelMaterials: string;
  addModelBone: string;
  addModelTriangles: string;
  addModelHeavy: string;
  addModelName: string;
  addModelOwnTexture: string;
  addModelTextureNote: string;
  donorTitle: string;
  donorIntro: string;
  donorLoad: string;
  donorClose: string;
  donorFile: string;
  donorPick: string;
  donorNone: string;
  donorSelection: string;
  donorTake: string;
  donorNote: string;
  donorName: string;
  donorMore: string;
  donorFilter: string;
  donorNoTextures: string;
  expAdded: string;
  expAddedFailed: string;
  expDone: string;
  expFailed: string;
  vehPaintColor: string;
  lvrTitle: string;
  lvrIntro: string;
  lvrHowTo: string;
  lvrLoad: string;
  lvrRemove: string;
  lvrLoaded: string;
  lvrFailed: string;
  lvrWarnResized: string;
  lvrWarnAspect: string;
  lvrWarnOpaque: string;
  lvrWarnEmpty: string;
  lvrWrite: string;
  lvrWriting: string;
  lvrWriteDone: string;
  lvrWriteDoneMany: string;
  lvrWriteFailed: string;
  lvrNoLayerWrite: string;
  lvrLayerTitle: string;
  lvrLayerIntro: string;
  lvrLayerWhich: string;
  lvrLayerTriangles: string;
  lvrLayerNoUv1: string;
  lvrLayerNone: string;
  lvrLayerTexture: string;
  lvrLayerNeedPng: string;
  lvrLayerWrite: string;
  lvrLayerWriting: string;
  lvrLayerDone: string;
  lvrLayerWarn: string;
  lvrLayerNote: string;
  lvrNoTexture: string;
  lvrFormatNote: string;
}

export const STRINGS: Record<Lang, Strings> = {
  de: {
    brand: 'FiveDock',
    navTools: 'Tools',
    navPropCreator: 'Prop Creator',
    navTextures: 'Texturen',
    navLivery: 'Livery',
    themeToggle: 'Design wechseln',
    langToggle: 'English',

    heroTitle: 'FiveM-Dateien ansehen, bemalen und bauen, direkt im Browser.',
    heroText:
      'Fahrzeuge drehen und umlackieren, Modelle zu Props umwandeln, Texturen verkleinern oder tauschen. Kein Blender, kein CodeWalker, keine Anmeldung.',
    heroCta: 'Prop Creator öffnen',
    heroCtaLivery: 'Livery Mapper öffnen',
    privacyTitle: 'Deine Dateien bleiben bei dir',
    privacyText:
      'Die Umwandlung läuft komplett in deinem Browser. Es gibt keinen Upload-Server, und die Seite sieht deine Modelle nie.',
    toolsTitle: 'Werkzeuge',
    toolsIntro: 'Was heute funktioniert und was als Nächstes kommt. Wir bauen ein Werkzeug nach dem anderen. Jedes gilt erst als fertig, wenn es im echten Spiel getestet ist.',
    statusAvailable: 'Verfügbar',
    statusProgress: 'In Arbeit',
    statusPlanned: 'Geplant',
    statusLater: 'Später',
    groupTitles: { vehicles: 'Fahrzeuge', props: 'Props und Karten', textures: 'Texturen', peds: 'Kleidung und Spielfiguren', later: 'Vielleicht später' },
    openTool: 'Öffnen',
    footerNote: 'Unabhängiges Projekt. Nicht verbunden mit Rockstar Games, Take-Two oder Cfx.re.',
    footerImprint: 'Impressum',
    footerPrivacy: 'Datenschutz',

    propTitle: 'Prop Creator',
    propIntro: 'Lade ein 3D-Modell (GLB, glTF, OBJ, FBX oder DAE). Du siehst sofort, wie es im Spiel stehen würde.',
    dropTitle: 'Modell hier ablegen',
    dropHint: 'GLB, glTF, OBJ, FBX oder DAE. Texturen und MTL-Dateien kannst du gleich mit hineinziehen.',
    dropButton: 'Datei wählen',
    loading: 'Modell wird gelesen …',
    loadFailed: 'Das Modell konnte nicht gelesen werden.',
    noModel: 'Noch kein Modell geladen.',
    fileLabel: 'Datei',
    clearModel: 'Anderes Modell',
    loadSample: 'Beispiel-Kiste laden',
    warnHuge: 'Das Modell ist sehr groß (über 50 m). Prüfe die Größe.',
    warnTiny: 'Das Modell ist sehr klein (unter 5 cm). Prüfe die Größe.',
    warnTriangles: 'Sehr viele Dreiecke für ein Prop. Das kostet Leistung im Spiel.',
    warnTextures: 'Texturen werden auf Zweierpotenzen skaliert, weil das Spiel nur diese liest.',
    warnNoTexture: 'Das Modell hat keine Textur und wird einfarbig dargestellt.',
    nameResult: 'Im Spiel heißt es',

    settings: 'Einstellungen',
    nameLabel: 'Modellname',
    nameHelp: 'Kleinbuchstaben, Ziffern und Unterstriche. So rufst du das Prop im Spiel auf.',
    upAxisLabel: 'Oben-Achse im Modell',
    upY: 'Y oben (glTF, FBX, Standard)',
    upZ: 'Z oben (Blender, 3ds Max)',
    sizeLabel: 'Größe (längste Kante in Metern)',
    sizeHelp: 'Eine Spielfigur ist etwa 1,8 m groß.',
    scaleFactor: 'Faktor',
    collisionLabel: 'Kollision',
    collisionNone: 'Keine (man läuft durch)',
    collisionBox: 'Box (schnell, einfach)',
    collisionBoxes: 'Mehrere Boxen (Näherung, lässt Durchgänge frei)',
    collisionHull: 'Hülle (in Arbeit: Vorschau, Export nutzt Box)',
    collisionMesh: 'Mesh (in Arbeit: Vorschau, Export nutzt Box)',
    lodLabel: 'Detailstufen (LOD)',
    lodHelp: 'Weniger Dreiecke in der Ferne spart Leistung. Erst ab etwa 120 Dreiecken sinnvoll. Die Umschaltentfernungen sind noch nicht im Spiel geprüft.',
    textureSizeLabel: 'Größte Texturkante (Pixel)',
    textureSizeHelp: 'Größere Texturen werden verkleinert. 1024 reicht für die meisten Props.',
    compressLabel: 'Texturen komprimieren (DXT)',
    compressHelp: 'Etwa 4- bis 8-mal kleiner im Speicher, bei kaum sichtbarem Qualitätsverlust. Empfohlen.',
    estimateTitle: 'Geschätzter Speicherbedarf im Spiel',
    estimateTextures: 'Texturen',
    estimateMesh: 'Modell',
    estimateTotal: 'Gesamt',
    estimateLarge: 'Das ist viel für ein einzelnes Prop. Kleinere Texturen oder Kompression sparen Speicher und Ladezeit.',
    showReference: 'Spielfigur zum Größenvergleich',
    showCollision: 'Kollision anzeigen',
    stats: 'Modell',
    statVertices: 'Eckpunkte',
    statTriangles: 'Dreiecke',
    statMaterials: 'Materialien',
    statTextures: 'Texturen',
    statSize: 'Größe',
    problems: 'Hinweise',

    exportTitle: 'Resource erstellen',
    exportButton: 'Resource herunterladen',
    exportBusy: 'Wird erstellt …',
    exportDone: 'Resource erstellt.',
    exportFailed: 'Die Resource konnte nicht erstellt werden.',
    pipelineTitle: 'Stand der Umwandlung',
    pipelineDone: 'fertig',
    pipelineTodo: 'offen',
    pipelineActive: 'in Arbeit',
    howToUse: 'So benutzt du die Resource',
    howToUseText:
      'Entpacke den Ordner nach resources/, trage „ensure <name>“ in die server.cfg ein und starte den Server. Im Spiel erzeugst du das Prop mit CreateObject und dem Modellnamen.',

    labTitle: 'Textur-Werkstatt',
    labIntro:
      'Lade eine Resource als ZIP oder einzelne YTD-Dateien. Du kannst Texturen verkleinern, um Speicher und Ladezeit zu sparen, und einzelne Texturen gegen eigene Bilder austauschen.',
    labLimits:
      'Stand: Die Ausgabe wird mit CodeWalker gegengeprüft, aber noch nicht im Spiel getestet. Texturen, die direkt in YDR-, YFT- oder YDD-Dateien stecken, werden nicht bearbeitet. Verschlüsselte Dateien (Escrow) und GTA V Enhanced lassen sich nicht lesen.',
    labDropTitle: 'Resource oder YTD hier ablegen',
    labDropHint: 'ZIP, RAR oder 7z einer Resource, ein entpackter Ordner oder einzelne .ytd-Dateien. Alles bleibt in deinem Browser.',
    labDropButton: 'Dateien wählen',
    labLoading: 'Texturen werden gelesen …',
    labLoadFailed: 'Die Dateien konnten nicht gelesen werden.',
    labNoYtd: 'In den Dateien wurde keine YTD-Datei gefunden.',
    labClear: 'Andere Resource',
    labSummaryTitle: 'Inhalt',
    labFiles: 'YTD-Dateien',
    labTextures: 'Texturen',
    labMemory: 'Texturspeicher',
    labOptimizeTitle: 'Verkleinern',
    labMaxSize: 'Größte Texturkante (Pixel)',
    labMaxSizeHelp:
      'Größere Texturen werden Stufe für Stufe halbiert. Dazu werden die obersten Mip-Stufen weggelassen, die schon in der Datei liegen. Das ist verlustfrei im Sinne der vorhandenen Stufen und sehr schnell.',
    labRecompress: 'Unkomprimierte Texturen in DXT umwandeln',
    labRecompressHelp: 'Spart etwa 4- bis 8-mal Speicher, kostet aber etwas Qualität. Normalenkarten bleiben unberührt.',
    labOptimizeButton: 'Verkleinern',
    labOptimizing: 'Wird verkleinert …',
    labUndo: 'Letzte Änderung rückgängig',
    labDownload: 'Resource herunterladen',
    labDownloadHint: 'Dateien ohne Änderung bleiben Byte für Byte gleich.',
    labReplaceSettings: 'Austausch',
    labReplaceSize: 'Größe der neuen Textur',
    labReplaceKeep: 'Wie die alte Textur (empfohlen)',
    labReplaceFit: 'Wie das neue Bild (Zweierpotenz)',
    labReplaceHelp:
      'Name, Format und Verwendungszweck der Textur bleiben erhalten, damit das Modell sie weiter findet. Du kannst PNG, JPEG, WebP oder DDS wählen. Ein DDS wird ohne Qualitätsverlust direkt übernommen, die Größe-Einstellung gilt dann nicht.',
    labResultTitle: 'Ergebnis',
    labResultNothing: 'Hier gab es nichts zu verkleinern. Alle Texturen sind schon klein genug oder lassen sich nicht ändern.',
    labResultMemory: 'Texturspeicher',
    labResultFile: 'Dateigröße',
    labResultChanged: '{n} von {m} Texturen geändert',
    labEmbedded: '{n} Dateien (YDR, YFT, YDD) können eingebettete Texturen enthalten. Diese werden noch nicht bearbeitet.',
    labStatusOptimized: 'geändert',
    labStatusUnchanged: 'unverändert',
    labStatusSkipped: 'übersprungen',
    labTexturesTitle: 'Texturen',
    labReplace: 'Ersetzen …',
    labReplaceBusy: 'Wird ersetzt …',
    labReplaced: '„{name}“ wurde ersetzt.',
    labReplaceFailed: 'Die Textur konnte nicht ersetzt werden.',
    labSavePng: 'PNG',
    labSaveDds: 'DDS',
    labNoPreview: 'Keine Vorschau',
    labNoMips: 'Keine Mip-Stufen',
    labNotPow2: 'Keine Zweierpotenz',
    labMips: 'Mips',
    labErrorFile: 'Datei nicht lesbar',
    labSkipReasons: {
      encrypted: 'Verschlüsselt (Escrow), kann nicht gelesen werden.',
      'not-rsc7': 'Keine gültige Resource-Datei.',
      enhanced: 'GTA V Enhanced, FiveM lädt nur das Legacy-Format.',
      'wrong-version': 'Kein Texture Dictionary.',
      'unsupported-format': 'Enthält ein Pixelformat, das noch nicht unterstützt wird.',
      corrupt: 'Beschädigt oder unvollständig.',
    },
    labNotes: {
      'not-power-of-two': 'Größe ist keine Zweierpotenz, unverändert gelassen.',
      'normal-map-kept': 'Normalenkarte nicht umkomprimiert.',
      'too-small-to-compress': 'Zu klein zum Komprimieren.',
      'cannot-shrink': 'Keine Mip-Stufen vorhanden und das Format lässt sich noch nicht neu schreiben.',
      'unsupported-format': 'Pixelformat wird nicht bearbeitet.',
      'alpha-needs-dxt5': 'Das neue Bild hat Transparenz, darum DXT5 statt DXT1.',
      'bc7-replaced': 'Die alte Textur war BC7. BC7 lässt sich noch nicht schreiben, es wurde DXT verwendet.',
      'aspect-stretched': 'Das Seitenverhältnis des Bildes weicht ab, es wurde gestreckt.',
      'size-adjusted': 'Größe wurde auf eine Zweierpotenz angepasst.',
      'dds-size-differs': 'Das DDS hat eine andere Größe als die alte Textur. Prüfe, ob das Modell damit richtig aussieht.',
      'mips-added': 'Fehlende kleine Mip-Stufen wurden ergänzt.',
      'mips-missing': 'Die Mip-Kette ist unvollständig und lässt sich bei diesem Format noch nicht ergänzen.',
    },
    labActions: {
      unchanged: 'unverändert',
      resized: 'verkleinert',
      recompressed: 'komprimiert',
      'resized-recompressed': 'verkleinert und komprimiert',
      replaced: 'ersetzt',
    },

    vehTitle: 'Livery Mapper',
    vehIntro: 'Lade ein Fahrzeug als ZIP oder .yft. Du siehst das ganze Auto, kannst es drehen und einzelne Teile wie Motorhaube, Türen oder Stoßfänger anklicken.',
    vehStatus: 'Stand: Ansicht, Teile-Auswahl, UV-Vorlage als PNG und das Einsetzen der Livery funktionieren. Hat das Fahrzeug noch keine Livery-Ebene, wird sie angelegt (Lack auf paint3, neue Textur). Nichts davon ist im Spiel getestet.',
    vehDropTitle: 'Fahrzeug hier ablegen',
    vehDropHint: 'ZIP, RAR oder 7z einer Fahrzeug-Resource, ein entpackter Ordner oder einzelne .yft- und .ytd-Dateien (am besten beide). Alles bleibt in deinem Browser.',
    vehDropButton: 'Dateien wählen',
    vehDropFolder: 'Ordner wählen',
    vehUnpacking: 'Archiv wird entpackt …',
    vehArchiveFailed: 'Das Archiv konnte nicht entpackt werden.',
    vehArchiveEncrypted: 'Das Archiv ist mit einem Passwort geschützt und kann nicht gelesen werden.',
    vehLoading: 'Fahrzeug wird gelesen …',
    vehLoadFailed: 'Das Fahrzeug konnte nicht gelesen werden.',
    vehNoYft: 'In den Dateien wurde keine .yft-Datei gefunden.',
    vehErrors: {
      encrypted: 'Die Datei ist verschlüsselt (Escrow) und kann nicht gelesen werden.',
      'not-rsc7': 'Das ist keine gültige Fahrzeugdatei.',
      'wrong-version': 'Das ist keine Fahrzeugdatei im Format, das FiveM lädt (GTA V Legacy).',
      corrupt: 'Die Datei ist beschädigt oder unvollständig.',
      unsupported: 'Das Fahrzeug enthält ein Format, das noch nicht unterstützt wird.',
    },
    vehClear: 'Anderes Fahrzeug',
    vehFile: 'Datei',
    vehParts: 'Teile',
    vehTriangles: 'Dreiecke',
    vehMaterials: 'Materialien',
    vehBones: 'Knochen',
    vehPartList: 'Teile',
    vehSearch: 'Teil suchen …',
    vehCategories: { paint: 'Lack', glass: 'Glas', light: 'Licht', tire: 'Reifen', other: 'Sonstiges' },
    vehShowAll: 'Alle zeigen',
    vehOnlySelection: 'Nur Auswahl zeigen',
    vehHide: 'Ausblenden',
    vehNoSelection: 'Klicke ein Teil im Fahrzeug oder in der Liste an.',
    vehDetails: 'Auswahl',
    vehBone: 'Knochen',
    vehCategory: 'Art',
    vehGeometries: 'Geometrien',
    vehShaders: 'Shader',
    vehTextures: 'Texturen',
    vehUv: 'Texturkoordinaten',
    vehSize: 'Größe',
    vehViewFront: 'Vorne',
    vehViewRear: 'Hinten',
    vehViewSide: 'Seite',
    vehViewTop: 'Oben',
    vehViewIso: 'Schräg',
    vehWireframe: 'Drahtgitter',
    vehHint: 'Ziehen: drehen. Mausrad: zoomen. Rechte Maustaste: verschieben. Klick: Teil wählen.',
    vehLiveryTitle: 'So geht es weiter',
    vehStepView: 'Fahrzeug ansehen und Teile wählen',
    vehStepTemplate: 'UV-Vorlage der gewählten Teile als PNG',
    vehStepWrite: 'Bemalte Livery ins Fahrzeug schreiben (fehlt die Ebene, wird sie angelegt)',
    vehStepGame: 'Im Spiel testen',
    vehStateDone: 'fertig',
    vehStateWip: 'in Arbeit',
    vehStateOpen: 'offen',
    vehNoWebGL: 'WebGL wird von diesem Browser nicht unterstützt.',
    vehNoMatch: 'Kein Teil passt zur Suche.',
    navImporter: 'Fahrzeug einrichten',
    impTitle: 'Add-on-Fahrzeug einrichten',
    impIntro: 'Lade ein heruntergeladenes Fahrzeug (ZIP, RAR, 7z, Ordner oder die einzelnen Dateien). Das Werkzeug erkennt Modelle, Texturen und Meta-Dateien, prüft, ob sie zusammenpassen, und baut daraus eine fertige Resource mit fxmanifest.lua.',
    impStatus: 'Stand: Erkennen, Prüfen und Zusammenstellen funktionieren und sind an einem echten Fahrzeug getestet. Ob das Ergebnis im Spiel läuft, ist noch nicht getestet. Die Dateien selbst werden nicht verändert.',
    impDropTitle: 'Fahrzeug hier ablegen',
    impDropHint: 'ZIP, RAR oder 7z, ein entpackter Ordner oder die Dateien einzeln (.yft, .ytd, .meta). Alles bleibt in deinem Browser.',
    impResourceName: 'Name der Resource',
    impResourceNameHint: 'So heißt der Ordner im resources-Verzeichnis und der Eintrag in der server.cfg. Kleinbuchstaben, Ziffern, Unterstrich und Bindestrich.',
    impDisplayName: 'Anzeigename',
    impDisplayNameHint: 'Optional. Der Name, den das Spiel anzeigt, zum Beispiel im Fahrzeugkatalog. Ohne Eintrag bleibt der Name aus der Meta-Datei.',
    impModels: 'Gefundene Fahrzeuge',
    impChipModel: 'Modell',
    impChipHigh: 'Hochmodell',
    impChipTexture: 'Textur',
    impChipHandling: 'Handling',
    impChipVariation: 'Varianten',
    impIssues: 'Prüfung',
    impNoIssues: 'Alles passt zusammen: Zu jedem Fahrzeug gibt es Modell, Textur, Handling und Varianten.',
    impFiles: 'Dateien',
    impStream: 'Modelle und Texturen (stream)',
    impMetas: 'Meta-Dateien (data)',
    impIgnored: 'Nicht übernommen',
    impUnreadable: 'nicht lesbar',
    impDownload: 'Resource als ZIP laden',
    impDownloadAnyway: 'Trotz Fehlern als ZIP laden',
    impPreparing: 'ZIP wird erstellt …',
    impNext: 'So geht es weiter',
    impNextSteps: '1. ZIP entpacken und den Ordner „{name}“ in das resources-Verzeichnis deines Servers legen. 2. „ensure {name}“ in die server.cfg schreiben. 3. Server starten und das Fahrzeug über seinen Spawn-Namen rufen.',
    impClear: 'Anderes Fahrzeug',
    impSiren: 'Sirene',
    impTotal: 'Gesamt',
    impFailed: 'Die Dateien konnten nicht gelesen werden.',
    impLevels: { error: 'Fehler', warning: 'Warnung', info: 'Hinweis' },
    impIssueText: {
      'no-vehicles-meta': 'Es gibt keine vehicles.meta. Ohne sie weiß das Spiel nicht, dass die Modelldateien ein Fahrzeug sind.',
      'no-model-files': 'Es wurde keine .yft-Datei gefunden. Das Fahrzeugmodell fehlt.',
      'meta-unreadable': 'Die Datei „{file}“ ist kein gültiges XML und wird nicht übernommen. {detail}',
      'meta-unknown': 'Die Meta-Datei „{file}“ gehört zu keinem Fahrzeugtyp, den dieses Werkzeug kennt, und wird nicht übernommen.',
      'model-missing': 'Für „{model}“ fehlt die Modelldatei {file}.',
      'high-model-missing': 'Für „{model}“ gibt es keine {file}. Das ist in Ordnung, viele Fahrzeuge haben sie für eine feinere Darstellung aus der Nähe.',
      'texture-missing': 'Für „{model}“ fehlt die Texturdatei {file}. Das ist nur in Ordnung, wenn die Textur im Originalspiel liegt, sonst erscheint das Fahrzeug ohne Texturen.',
      'handling-missing': 'Das Handling „{handling}“ von „{model}“ steht in keiner handling.meta. Das ist nur in Ordnung, wenn es ein Handling des Originalspiels ist.',
      'variation-orphan': 'carvariations.meta beschreibt „{model}“, aber keine vehicles.meta kennt dieses Fahrzeug.',
      'siren-missing': 'Die Sirene {id} von „{model}“ steht in keiner carcols.meta. Das ist nur in Ordnung, wenn es eine Sirene des Originalspiels ist.',
      'encrypted-file': 'Die Datei „{file}“ ist verschlüsselt (Escrow) oder keine Spieldatei. Sie wird unverändert übernommen, aber nicht geprüft.',
      'bad-spawn-name': 'Der Name „{model}“ enthält Zeichen, die Spawn-Befehle und Skripte nicht vertragen. Erlaubt sind Buchstaben, Ziffern und Unterstrich.',
      'duplicate-model': 'Das Fahrzeug „{model}“ steht in mehreren vehicles.meta-Dateien. Es wird nur einmal gezählt.',
      'model-without-meta': 'Die Modelldatei „{file}“ gehört zu keinem Fahrzeug in vehicles.meta. Bei Rädern und Zusatzmodellen ist das in Ordnung.',
      'old-manifest': 'Die vorhandene Datei „{file}“ wird nicht übernommen, es entsteht ein neues fxmanifest.lua.',
    },
    vehTab3d: '3D-Ansicht',
    vehTabSheet: 'UV-Blatt',
    tplTitle: 'UV-Vorlage zum Bemalen',
    tplIntro: 'Das Malblatt der Livery: die Flächen, auf die dein Motiv im Fahrzeug trifft. Als PNG laden, in Photopea, GIMP oder Photoshop bemalen.',
    tplLayerLabel: 'Livery-Textur',
    tplNoLayer: 'Dieses Fahrzeug hat noch keine Livery-Ebene (keine zweite Textur im Lack-Shader). Das Blatt zeigt den gewählten UV-Satz aller Lack-Teile. Die Ebene legst du im Schritt Livery an, gemalt wird auf UV1.',
    tplSet: 'UV-Satz',
    tplSetHint: 'Bei Fahrzeugen mit Livery-Ebene trägt meist UV1 das Motiv. UV0 gehört der Grundtextur und liegt oft gespiegelt übereinander.',
    tplScope: 'Teile im Blatt',
    tplScopeAll: 'Alle Lack-Teile mit Livery-Ebene',
    tplScopeSelection: 'Nur das gewählte Teil',
    tplScopeNeedsPaint: 'Wähle zuerst ein Lack-Teil, dann zeigt das Blatt nur dieses.',
    tplSize: 'Größe des PNG',
    tplFill: 'Flächen einfärben',
    tplLabels: 'Namen in die Flächen schreiben',
    tplBase: 'Vorhandene Livery darunter legen',
    tplBaseMissing: 'Die Textur „{name}“ liegt nicht in den geladenen Dateien. Lade die .ytd des Fahrzeugs zusätzlich, dann erscheint sie hier.',
    tplBaseUndecodable: 'Das Format der vorhandenen Textur kann noch nicht angezeigt werden.',
    tplDownload: 'PNG herunterladen',
    tplPreparing: 'PNG wird erzeugt …',
    tplFailed: 'Das PNG konnte nicht erzeugt werden.',
    tplReport: 'Prüfung des Blatts',
    tplCoverage: 'Belegte Fläche',
    tplOverlap: 'Mehrfach belegt',
    tplOverlapNote: 'Wo Flächen übereinanderliegen, erscheint dasselbe Motiv doppelt: auf Außen- und Innenseite oder gespiegelt auf zwei Seiten.',
    tplPairs: 'Teile, die dieselbe Fläche belegen',
    tplOutside: 'Dreiecke außerhalb des Blatts',
    tplDegenerate: 'Dreiecke ohne Fläche',
    tplEmpty: 'Für diese Auswahl gibt es keinen UV-Satz mit Flächen.',
    tplSheetHint: 'Klick auf eine Fläche wählt das Teil. Das Blatt liegt wie die Textur: oben links ist der Anfang.',
    tplNoPaint: 'Dieses Fahrzeug hat keine Lack-Teile.',
    tplSelfOverlap: 'Teile, deren Flächen sich selbst überdecken',
    vehShowLivery: 'Livery im Fahrzeug zeigen',
    vehShowTextures: 'Texturen zeigen',
    vehPanelParts: 'Teile',
    vehPanelTemplate: 'Vorlage',
    vehPanelPaint: 'Livery',
    edtPanel: 'Bearbeiten',
    edtPageTitle: 'Fahrzeug-Editor',
    edtPageIntro: 'Lade ein Fahrzeug (ZIP, RAR, 7z oder Ordner mit den Meta-Dateien). Entferne Teile (Abzeichen, Dachträger), setze neue Teile auf (Lichtbalken mit Sirenen, eigene 3D-Modelle oder Teile aus einem anderen Fahrzeug), stelle Fahrzeugdaten ein (Klasse, kugelsichere Scheiben, Flags), ändere das Fahrverhalten und die Sirenen und Lichter, und lade die fertige Resource.',
    edtStatus: 'Stand: Teile entfernen und Lichtbalken mit Sirenen-Knochen hinzufügen (beides gegen CodeWalker geprüft), Fahrzeugdaten, Fahrverhalten, Sirenen und Varianten einstellen. Löcher im Blech schließen, Felgen tauschen und Teile anderer Fahrzeuge übernehmen fehlen noch. Nichts davon ist im Spiel getestet.',
    edtTitle: 'Teile entfernen',
    edtIntro: 'Klicke ein Teil im Bild oder in der Liste an und markiere es zum Entfernen. Es verschwindet sofort in der Ansicht. Die Datei wird erst beim Laden des geänderten Fahrzeugs geändert.',
    edtPickHint: 'Noch kein Teil gewählt. Abzeichen und Aufkleber findest du mit dem Filter in der Liste.',
    edtMarked: 'Zum Entfernen markiert',
    edtMarkedCount: '{parts} Teile mit {triangles} Dreiecken.',
    edtNone: 'Noch nichts markiert.',
    edtRemove: 'Entfernen',
    edtRestore: 'Zurückholen',
    edtClear: 'Alle zurückholen',
    edtExport: 'Geändertes Fahrzeug laden',
    edtExporting: 'Wird geändert …',
    edtDecals: 'Nur Abzeichen und Aufkleber',
    edtNote: 'Entfernt werden die Dreiecke dieser Teile in allen Detailstufen und in allen Fahrzeugmodellen der Dateien (zum Beispiel auch _hi.yft). Eckpunkte und Texturen bleiben in der Datei, sie wird dadurch nicht kleiner. Bei mehreren Dateien entsteht ein ZIP.',
    edtResult: '{count} Dreiecke entfernt (Stufen {levels})',
    edtNothing: 'nichts gefunden, unverändert',
    edtFailed: 'Das Fahrzeug konnte nicht geändert werden.',
    prpPanelVehicle: 'Fahrzeug',
    prpDisplayName: 'Anzeigename im Spiel',
    prpDisplayNameHint: 'Optional. Der Name, den das Spiel zeigt (zum Beispiel im Fahrzeugkatalog). Er wird als vehicle_names.lua in die Resource gelegt.',
    prpPanelHandling: 'Fahren',
    prpPanelLights: 'Lichter',
    prpNoMeta: 'Zu diesem Fahrzeug gibt es in den geladenen Dateien keine passende {file}. Lade die Meta-Dateien mit (ZIP, RAR oder Ordner).',
    prpReset: 'Zurücksetzen',
    prpResetAll: 'Alles zurücksetzen',
    prpAdd: 'Hinzufügen',
    prpVehicleTitle: 'Fahrzeugdaten',
    prpVehicleIntro: 'Stammdaten aus der vehicles.meta: Name, Klasse, Typ, Größe der Räder und mehr.',
    prpFlagsOther: 'Weitere Flags',
    prpFlagsMore: 'Weiteres Flag hinzufügen',
    prpVariations: 'Varianten',
    prpVariationsIntro: 'Aus der carvariations.meta. Das Fahrzeug hat {count} Farbkombinationen.',
    prpLiveries: 'Lackierungen (Liveries) freischalten',
    prpLiveryHint: 'Welche Lackierungen im Tuning wählbar sind. Das Fahrzeug braucht dafür das Flag „Hat Lackierungen“.',
    prpColors: 'Farbnummern',
    prpColorHint: 'Nummern aus der Farbtabelle des Spiels. Gilt für alle Farbkombinationen des Fahrzeugs.',
    prpColorBody: 'Karosserie',
    prpColorSecond: 'Zweitfarbe',
    prpColorPearl: 'Perleffekt',
    prpColorWheels: 'Felgen',
    prpSirenId: 'Sirenen-Nummer',
    prpSirenIdNote: 'Verweist auf eine Sirene in der carcols.meta. Die Nummer muss auf deinem Server einmalig sein.',
    prpHandlingTitle: 'Fahrverhalten',
    prpHandlingIntro: 'Handling „{name}“ aus der handling.meta. Jede Änderung wird sofort in die Datei übernommen, nichts davon ist im Spiel getestet.',
    prpAdvanced: 'Erweitert',
    prpAdvancedHint: 'Rohwerte der Datei. Die Flags sind Hexzahlen, deren Bedeutung hier nicht erklärt wird.',
    prpLightsTitle: 'Sirenen und Lichter',
    prpLightsIntro: 'Die nativen Sirenen des Spiels: Farbe, Blinkmuster und Helligkeit je Licht. Jedes Licht gehört zum Knochen siren1, siren2 … des Fahrzeugmodells und erscheint im Bild als leuchtender Punkt.',
    prpNoSirenBones: 'Dieses Modell hat keine Sirenen-Knochen (siren1 bis siren20). Die Einstellungen lassen sich trotzdem ändern, leuchten aber nur an Knochen, die es gibt. Lichtbalken als neue 3D-Teile lassen sich noch nicht hinzufügen.',
    prpSirenBones: 'Das Modell hat {count} Sirenen-Knochen (Nummern {list}).',
    prpPreset: 'Vorlage',
    prpApplyPreset: 'Vorlage auf alle Lichter anwenden',
    prpPlay: 'Blinken zeigen',
    prpStop: 'Anhalten',
    prpCreateSiren: 'Sirene mit dieser Vorlage anlegen',
    prpNoSiren: 'Diesem Fahrzeug ist noch keine Sirene zugewiesen.',
    prpPreviewNote: 'Die Vorschau zeigt das Blinken ungefähr. Wie das Spiel die 32 Schritte genau abspielt, ist nicht belegt.',
    prpBpm: 'Takt',
    prpBpmHint: 'Schritte pro Minute. Jedes Bit des Blinkmusters dauert einen Schritt.',
    prpRealLights: 'Echte Lichtquellen (leuchten die Umgebung an)',
    prpAddLight: 'Licht anhängen',
    prpRemoveLight: 'Letztes Licht entfernen',
    prpLights: 'Lichter',
    prpLight: 'Licht',
    prpNoBone: 'kein Knochen im Modell',
    prpColor: 'Farbe',
    prpOn: 'an',
    prpBlinks: 'blinkt',
    prpPattern: 'Blinkmuster',
    prpIntensity: 'Helligkeit',
    prpSize: 'Größe',
    expTitle: 'Ergebnis',
    expNothing: 'Noch nichts geändert.',
    expParts: '{count} Teile zum Entfernen markiert',
    expMeta: '{file} geändert',
    expDownload: 'Komplette Resource laden',
    expBusy: 'Wird gebaut …',
    expNote: 'Das ZIP enthält das Fahrzeug mit allen Änderungen, die Meta-Dateien und ein neues fxmanifest.lua. Im Spiel noch nicht getestet.',
    addPanel: 'Anbauteile',
    addTitle: 'Teile hinzufügen',
    addIntro: 'Setze neue Teile auf das Fahrzeug: einen Lichtbalken, ein eigenes 3D-Modell oder Teile aus einem anderen Fahrzeug. Beim Laden der Resource werden sie in alle Modelldateien eingebaut (auch in die Hochdetail-Fassung). Das Aussehen leihen sie sich von einem Material, das dein Fahrzeug schon hat.',
    addLightbar: 'Lichtbalken hinzufügen',
    addEmpty: 'Noch nichts hinzugefügt.',
    addListTitle: 'Hinzugefügt',
    addLightbarName: 'Lichtbalken {n}',
    addRemove: 'Entfernen',
    addSize: 'Maße',
    addLength: 'Länge (quer)',
    addDepth: 'Tiefe',
    addHeight: 'Höhe',
    addModules: 'Leuchtmodule',
    addStyle: 'Form',
    addStyleFlat: 'Flach (Streifen)',
    addStyleDome: 'Hoch (Kuppeln)',
    addFeet: 'Standfüße am Dach',
    addPosition: 'Lage im Fahrzeug',
    addX: 'Seite (x)',
    addY: 'Vorn/hinten (y)',
    addZ: 'Höhe (z)',
    addToRoof: 'Aufs Dach setzen',
    addToRoofNote: 'Setzt die Höhe auf die höchste Lackfläche an dieser Stelle.',
    addMaterials: 'Material',
    addHousing: 'Gehäuse',
    addLens: 'Linsen',
    addLensSame: 'wie das Gehäuse',
    addMaterialHint: 'Nur Materialien, die ein Teil deines Fahrzeugs benutzt, taugen als Vorlage. Die Vorschlagswerte sind meist richtig.',
    addNoMaterial: 'Dein Fahrzeug hat kein passendes Material, wähle eines aus der Liste.',
    addSirens: 'Sirenen-Knochen für die Leuchtmodule anlegen',
    addSirensHint: 'Jedes Leuchtmodul bekommt einen Knochen siren<Nummer>. Nur damit können die Sirenen-Lichter aus der carcols.meta dort leuchten. Ohne bleibt der Balken ein Anbauteil ohne blinkende Lichter.',
    addSirenNumbers: 'Sirenen-Nummern: {list}',
    addSetupLights: 'Lichter in der Sirenen-Einstellung einrichten',
    addSetupHint: 'Legt die Lichter {list} an (falls es sie noch nicht gibt) und gibt ihnen Farbe und Blinkmuster der gewählten Voreinstellung im Reiter Lichter.',
    addSetupDone: 'Lichter eingerichtet.',
    addSetupNeedSiren: 'Lege zuerst im Reiter Lichter eine Sirenen-Einstellung an.',
    addNote: 'Neue Teile und Knochen sind noch nicht im Spiel getestet. Prüfe dort: Sitzt der Balken auf dem Dach, sind die Linsen sichtbar, blinken die Lichter?',
    addModel: 'Eigenes 3D-Modell hinzufügen',
    addModelHint: 'GLB, glTF, OBJ, FBX oder DAE, zusammen mit den Texturen. Das Modell nimmt das Aussehen von Materialien deines Fahrzeugs an (einfarbig); eigene Texturen auf dem Teil folgen später.',
    addModelFailed: 'Das Modell konnte nicht gelesen werden.',
    addModelProblems: 'Probleme im Modell:',
    addModelScale: 'Größe (Faktor)',
    addModelSize: 'Maße mit diesem Faktor: {size} m',
    addModelRotation: 'Drehung',
    addRotX: 'Kippen vor/zurück (x)',
    addRotY: 'Kippen seitlich (y)',
    addRotZ: 'Drehen (z)',
    addModelUpright: 'Um 90° aufrichten',
    addModelMaterials: 'Materialien des Modells',
    addModelBone: 'Hängt am Knochen',
    addModelTriangles: '{count} Dreiecke',
    addModelHeavy: 'Das sind viele Dreiecke. Fahrzeuge mit sehr viel Geometrie belasten Spieler mit schwächerem Rechner, bis etwa 20.000 bleibt es leicht.',
    addModelName: 'Modell: {name}',
    addModelOwnTexture: 'Eigene Textur des Modells verwenden',
    addModelTextureNote: 'Die Textur kommt in die .ytd des Fahrzeugs (normal und +hi). Das Material wird als Kopie des gewählten Fahrzeug-Materials mit dieser Textur angelegt; dessen Glanz und Normalen bleiben. Durchsichtige Stellen bleiben im Spiel undurchsichtig (das Material ist es auch).',
    donorTitle: 'Teile aus einem anderen Fahrzeug',
    donorIntro: 'Lade ein anderes Fahrzeug (.yft oder .ydr, dazu die .ytd, oder ein ZIP/RAR) und übernimm einzelne Teile davon, zum Beispiel Stoßfänger, Spoiler oder Dachaufbauten. Sie kommen als Anbauteil in dein Fahrzeug und behalten zuerst ihre Lage.',
    donorLoad: 'Anderes Fahrzeug laden …',
    donorClose: 'Spender schließen',
    donorFile: 'Datei',
    donorPick: 'Teile wählen (auch per Klick im Bild)',
    donorNone: 'Alle abwählen',
    donorSelection: '{parts} Teile gewählt · {triangles} Dreiecke',
    donorTake: 'Gewählte Teile übernehmen',
    donorNote: 'Lack, Glas, Licht und Reifen des Spenders bekommen die Materialien deines Fahrzeugs. Alles andere wird das schwarze Gehäusematerial, mit der Textur des Spenders, wenn sie in den geladenen Dateien steht (undurchsichtig). Übernimm nur Teile, die du verwenden darfst.',
    donorName: '{file}: {label}',
    donorMore: '+{count}',
    donorFilter: 'Teile suchen …',
    donorNoTextures: 'Zu diesem Fahrzeug wurde keine .ytd geladen, die Teile bekommen deshalb einfarbige Materialien. Lade die .ytd des Spenders mit, um seine Texturen zu übernehmen.',
    expAdded: '{count} Anbauteile werden eingebaut',
    expAddedFailed: 'Anbauteile konnten in {file} nicht eingebaut werden: {message}',
    expDone: '„{file}“ ist fertig. Entfernte Dreiecke: {triangles}. Geänderte Meta-Dateien: {metas}.',
    expFailed: 'Die Resource konnte nicht gebaut werden.',
    vehPaintColor: 'Lackfarbe',
    lvrTitle: 'Bemalte Livery einsetzen',
    lvrIntro: 'Lade dein bemaltes PNG. Es erscheint sofort auf dem Fahrzeug und im UV-Blatt. Danach schreibst du die Livery in eine neue .ytd, in der die Livery-Textur des Fahrzeugs ersetzt ist.',
    lvrHowTo: 'Beim Bemalen die Vorlage als Ebene benutzen, vor dem Export aber ausblenden. Durchsichtige Stellen zeigen den Lack, nur bemalte Stellen decken ihn ab.',
    lvrLoad: 'Bemaltes PNG wählen',
    lvrRemove: 'Entfernen',
    lvrLoaded: 'Geladen',
    lvrFailed: 'Das Bild konnte nicht gelesen werden.',
    lvrWarnResized: 'Das Bild hat eine andere Größe als die Livery-Textur ({size}) und wird skaliert.',
    lvrWarnAspect: 'Das Seitenverhältnis weicht von der Livery-Textur ({size}) ab. Das Bild wird verzerrt, die Livery sitzt dann falsch.',
    lvrWarnOpaque: 'Das Bild hat kaum durchsichtige Stellen und deckt die ganze Lackfarbe ab.',
    lvrWarnEmpty: 'Das Bild ist völlig durchsichtig, du siehst keine Livery.',
    lvrWrite: 'Livery in .ytd schreiben',
    lvrWriting: 'Livery wird geschrieben …',
    lvrWriteDone: '„{file}“ ist fertig. Ersetze damit die gleichnamige Datei im stream-Ordner des Fahrzeugs. Im Spiel noch nicht getestet.',
    lvrWriteDoneMany: '„{file}“ enthält {count} Dateien ({list}): die normale und die Hochdetail-Textur der Livery. Ersetze die gleichnamigen Dateien im stream-Ordner des Fahrzeugs. Im Spiel noch nicht getestet.',
    lvrWriteFailed: 'Das Schreiben ist fehlgeschlagen.',
    lvrNoLayerWrite: 'Diesem Fahrzeug fehlt die Livery-Ebene. Dort die Livery einzusetzen geht noch nicht; eine neue Ebene anzulegen kommt später.',
    lvrLayerTitle: 'Livery-Ebene anlegen',
    lvrLayerIntro: 'Dieses Fahrzeug hat noch keine Livery-Ebene. Ich lege sie an: Der Lack wird auf den Shader vehicle_paint3 umgestellt (er zeigt eine zweite Textur über dem Lack), und deine Livery kommt als neue Textur ins Texturwörterbuch. Sie liegt auf der zweiten Texturkoordinate (UV1).',
    lvrLayerWhich: 'Diese Lack-Materialien bekommen die Ebene:',
    lvrLayerTriangles: '{count} Dreiecke',
    lvrLayerNoUv1: 'keine zweite Texturkoordinate (UV1), geht nicht',
    lvrLayerNone: 'Auf diesem Fahrzeug gibt es kein Lack-Material, das sich umstellen lässt. Nötig ist vehicle_paint1 oder vehicle_paint2 mit einer zweiten Texturkoordinate (UV1).',
    lvrLayerTexture: 'Neue Textur: {name}',
    lvrLayerNeedPng: 'Wähle zuerst dein bemaltes PNG, gemalt nach der Vorlage im UV-Satz UV1.',
    lvrLayerWrite: 'Livery-Ebene anlegen und schreiben',
    lvrLayerWriting: 'Schreibe …',
    lvrLayerDone: '„{file}“ ist fertig. Sie enthält {count} Dateien (Modelle und Texturen), kopiere sie in den stream-Ordner der Resource und überschreibe die alten.',
    lvrLayerWarn: 'Nicht angepasst: {list}',
    lvrLayerNote: 'Im Spiel noch nicht getestet. Prüfe dort: Erscheint die Livery, stimmen die Farben, sieht der Lack sonst gleich aus?',
    lvrNoTexture: 'Die Livery-Textur „{name}“ liegt nicht in den geladenen .ytd-Dateien. Lade die .ytd des Fahrzeugs zusätzlich.',
    lvrFormatNote: 'Größe und Format der alten Textur bleiben ({size}, {format}). Die Mip-Stufen werden neu berechnet.',
  },
  en: {
    brand: 'FiveDock',
    navTools: 'Tools',
    navPropCreator: 'Prop Creator',
    navTextures: 'Textures',
    navLivery: 'Livery',
    themeToggle: 'Switch theme',
    langToggle: 'Deutsch',

    heroTitle: 'View, paint and build FiveM files, right in your browser.',
    heroText:
      'Rotate and repaint vehicles, turn models into props, shrink or swap textures. No Blender, no CodeWalker, no sign-up.',
    heroCta: 'Open Prop Creator',
    heroCtaLivery: 'Open Livery Mapper',
    privacyTitle: 'Your files stay with you',
    privacyText: 'Everything runs in your browser. There is no upload server, and this site never sees your models.',
    toolsTitle: 'Tools',
    toolsIntro: 'What works today and what comes next. We build one tool at a time. Each counts as finished only once it is tested in the real game.',
    statusAvailable: 'Available',
    statusProgress: 'In progress',
    statusPlanned: 'Planned',
    statusLater: 'Later',
    groupTitles: { vehicles: 'Vehicles', props: 'Props and maps', textures: 'Textures', peds: 'Clothing and characters', later: 'Maybe later' },
    openTool: 'Open',
    footerNote: 'Independent project. Not affiliated with Rockstar Games, Take-Two or Cfx.re.',
    footerImprint: 'Legal notice',
    footerPrivacy: 'Privacy',

    propTitle: 'Prop Creator',
    propIntro: 'Load a 3D model (GLB, glTF, OBJ, FBX or DAE). You see right away how it would stand in the game.',
    dropTitle: 'Drop a model here',
    dropHint: 'GLB, glTF, OBJ, FBX or DAE. You can drop textures and MTL files along with it.',
    dropButton: 'Choose file',
    loading: 'Reading model …',
    loadFailed: 'The model could not be read.',
    noModel: 'No model loaded yet.',
    fileLabel: 'File',
    clearModel: 'Different model',
    loadSample: 'Load example crate',
    warnHuge: 'The model is very large (over 50 m). Check its size.',
    warnTiny: 'The model is very small (under 5 cm). Check its size.',
    warnTriangles: 'A lot of triangles for a prop. This costs performance in game.',
    warnTextures: 'Textures are scaled to powers of two because the game only reads those.',
    warnNoTexture: 'The model has no texture and is shown in a single colour.',
    nameResult: 'In game it is called',

    settings: 'Settings',
    nameLabel: 'Model name',
    nameHelp: 'Lowercase letters, digits and underscores. This is how you spawn the prop in game.',
    upAxisLabel: 'Up axis in the model',
    upY: 'Y up (glTF, FBX, default)',
    upZ: 'Z up (Blender, 3ds Max)',
    sizeLabel: 'Size (longest edge in metres)',
    sizeHelp: 'A player character is about 1.8 m tall.',
    scaleFactor: 'Factor',
    collisionLabel: 'Collision',
    collisionNone: 'None (walk through)',
    collisionBox: 'Box (fast, simple)',
    collisionBoxes: 'Several boxes (approximation, keeps gaps open)',
    collisionHull: 'Hull (in progress: preview only, export uses a box)',
    collisionMesh: 'Mesh (in progress: preview only, export uses a box)',
    lodLabel: 'Levels of detail (LOD)',
    lodHelp: 'Fewer triangles at a distance saves performance. Only useful from about 120 triangles. The switch distances are not yet tested in game.',
    textureSizeLabel: 'Largest texture edge (pixels)',
    textureSizeHelp: 'Larger textures are scaled down. 1024 is enough for most props.',
    compressLabel: 'Compress textures (DXT)',
    compressHelp: 'About 4 to 8 times smaller in memory with hardly visible quality loss. Recommended.',
    estimateTitle: 'Estimated memory use in game',
    estimateTextures: 'Textures',
    estimateMesh: 'Model',
    estimateTotal: 'Total',
    estimateLarge: 'That is a lot for a single prop. Smaller textures or compression save memory and load time.',
    showReference: 'Player figure for scale',
    showCollision: 'Show collision',
    stats: 'Model',
    statVertices: 'Vertices',
    statTriangles: 'Triangles',
    statMaterials: 'Materials',
    statTextures: 'Textures',
    statSize: 'Size',
    problems: 'Notes',

    exportTitle: 'Create resource',
    exportButton: 'Download resource',
    exportBusy: 'Building …',
    exportDone: 'Resource created.',
    exportFailed: 'The resource could not be created.',
    pipelineTitle: 'Conversion status',
    pipelineDone: 'done',
    pipelineTodo: 'open',
    pipelineActive: 'in progress',
    howToUse: 'How to use the resource',
    howToUseText:
      'Extract the folder into resources/, add "ensure <name>" to server.cfg and start the server. In game, spawn the prop with CreateObject and the model name.',

    labTitle: 'Texture Lab',
    labIntro:
      'Load a resource as ZIP or single YTD files. You can shrink textures to save memory and load time, and swap individual textures for your own images.',
    labLimits:
      'Status: The output is cross-checked with CodeWalker but not yet tested in game. Textures embedded directly in YDR, YFT or YDD files are not edited. Encrypted files (escrow) and GTA V Enhanced cannot be read.',
    labDropTitle: 'Drop a resource or YTD here',
    labDropHint: 'A resource ZIP or single .ytd files. Everything stays in your browser.',
    labDropButton: 'Choose files',
    labLoading: 'Reading textures …',
    labLoadFailed: 'The files could not be read.',
    labNoYtd: 'No YTD file was found in the files.',
    labClear: 'Different resource',
    labSummaryTitle: 'Contents',
    labFiles: 'YTD files',
    labTextures: 'Textures',
    labMemory: 'Texture memory',
    labOptimizeTitle: 'Shrink',
    labMaxSize: 'Largest texture edge (pixels)',
    labMaxSizeHelp:
      'Larger textures are halved step by step. This drops the top mip levels that are already in the file, so it is lossless with respect to the existing levels and very fast.',
    labRecompress: 'Convert uncompressed textures to DXT',
    labRecompressHelp: 'Saves about 4 to 8 times the memory but costs some quality. Normal maps are left alone.',
    labOptimizeButton: 'Shrink',
    labOptimizing: 'Shrinking …',
    labUndo: 'Undo last change',
    labDownload: 'Download resource',
    labDownloadHint: 'Files without changes stay byte for byte identical.',
    labReplaceSettings: 'Replacement',
    labReplaceSize: 'Size of the new texture',
    labReplaceKeep: 'Same as the old texture (recommended)',
    labReplaceFit: 'Same as the new image (power of two)',
    labReplaceHelp:
      'Name, format and usage of the texture are kept so the model still finds it. You can pick PNG, JPEG, WebP or DDS. A DDS is taken over directly without quality loss, so the size setting does not apply.',
    labResultTitle: 'Result',
    labResultNothing: 'Nothing to shrink here. All textures are already small enough or cannot be changed.',
    labResultMemory: 'Texture memory',
    labResultFile: 'File size',
    labResultChanged: '{n} of {m} textures changed',
    labEmbedded: '{n} files (YDR, YFT, YDD) may contain embedded textures. These are not edited yet.',
    labStatusOptimized: 'changed',
    labStatusUnchanged: 'unchanged',
    labStatusSkipped: 'skipped',
    labTexturesTitle: 'Textures',
    labReplace: 'Replace …',
    labReplaceBusy: 'Replacing …',
    labReplaced: '"{name}" was replaced.',
    labReplaceFailed: 'The texture could not be replaced.',
    labSavePng: 'PNG',
    labSaveDds: 'DDS',
    labNoPreview: 'No preview',
    labNoMips: 'No mip levels',
    labNotPow2: 'Not a power of two',
    labMips: 'mips',
    labErrorFile: 'File not readable',
    labSkipReasons: {
      encrypted: 'Encrypted (escrow), cannot be read.',
      'not-rsc7': 'Not a valid resource file.',
      enhanced: 'GTA V Enhanced, FiveM only loads the legacy format.',
      'wrong-version': 'Not a texture dictionary.',
      'unsupported-format': 'Contains a pixel format that is not supported yet.',
      corrupt: 'Damaged or incomplete.',
    },
    labNotes: {
      'not-power-of-two': 'Size is not a power of two, left unchanged.',
      'normal-map-kept': 'Normal map not recompressed.',
      'too-small-to-compress': 'Too small to compress.',
      'cannot-shrink': 'No mip levels and the format cannot be rewritten yet.',
      'unsupported-format': 'Pixel format is not edited.',
      'alpha-needs-dxt5': 'The new image has transparency, so DXT5 instead of DXT1.',
      'bc7-replaced': 'The old texture was BC7. BC7 cannot be written yet, DXT was used.',
      'aspect-stretched': 'The image aspect ratio differs and it was stretched.',
      'size-adjusted': 'Size was adjusted to a power of two.',
      'dds-size-differs': 'The DDS has a different size than the old texture. Check that the model still looks right.',
      'mips-added': 'Missing small mip levels were added.',
      'mips-missing': 'The mip chain is incomplete and cannot be completed for this format yet.',
    },
    labActions: {
      unchanged: 'unchanged',
      resized: 'shrunk',
      recompressed: 'compressed',
      'resized-recompressed': 'shrunk and compressed',
      replaced: 'replaced',
    },

    vehTitle: 'Livery Mapper',
    vehIntro: 'Load a vehicle as ZIP or .yft. You see the whole car, can rotate it and click individual parts such as the hood, doors or bumpers.',
    vehStatus: 'Status: The view, part selection, the UV template as PNG and applying the livery work. If the vehicle has no livery layer yet, it is created (paint on paint3, new texture). None of this is tested in game.',
    vehDropTitle: 'Drop a vehicle here',
    vehDropHint: 'A ZIP, RAR or 7z of a vehicle resource, an unpacked folder, or single .yft and .ytd files (ideally both). Everything stays in your browser.',
    vehDropButton: 'Choose files',
    vehDropFolder: 'Choose folder',
    vehUnpacking: 'Unpacking archive …',
    vehArchiveFailed: 'The archive could not be unpacked.',
    vehArchiveEncrypted: 'The archive is password protected and cannot be read.',
    vehLoading: 'Reading vehicle …',
    vehLoadFailed: 'The vehicle could not be read.',
    vehNoYft: 'No .yft file was found in the files.',
    vehErrors: {
      encrypted: 'The file is encrypted (escrow) and cannot be read.',
      'not-rsc7': 'This is not a valid vehicle file.',
      'wrong-version': 'This is not a vehicle file in the format FiveM loads (GTA V Legacy).',
      corrupt: 'The file is damaged or incomplete.',
      unsupported: 'The vehicle contains a format that is not supported yet.',
    },
    vehClear: 'Different vehicle',
    vehFile: 'File',
    vehParts: 'Parts',
    vehTriangles: 'Triangles',
    vehMaterials: 'Materials',
    vehBones: 'Bones',
    vehPartList: 'Parts',
    vehSearch: 'Search parts …',
    vehCategories: { paint: 'Paint', glass: 'Glass', light: 'Lights', tire: 'Tyres', other: 'Other' },
    vehShowAll: 'Show all',
    vehOnlySelection: 'Show selection only',
    vehHide: 'Hide',
    vehNoSelection: 'Click a part on the vehicle or in the list.',
    vehDetails: 'Selection',
    vehBone: 'Bone',
    vehCategory: 'Type',
    vehGeometries: 'Geometries',
    vehShaders: 'Shaders',
    vehTextures: 'Textures',
    vehUv: 'Texture coordinates',
    vehSize: 'Size',
    vehViewFront: 'Front',
    vehViewRear: 'Rear',
    vehViewSide: 'Side',
    vehViewTop: 'Top',
    vehViewIso: 'Angle',
    vehWireframe: 'Wireframe',
    vehHint: 'Drag: rotate. Wheel: zoom. Right mouse button: pan. Click: select a part.',
    vehLiveryTitle: 'What comes next',
    vehStepView: 'View the vehicle and pick parts',
    vehStepTemplate: 'UV template of the chosen parts as PNG',
    vehStepWrite: 'Write the painted livery into the vehicle (a missing layer is created)',
    vehStepGame: 'Test in game',
    vehStateDone: 'done',
    vehStateWip: 'in progress',
    vehStateOpen: 'open',
    vehNoWebGL: 'WebGL is not supported by this browser.',
    vehNoMatch: 'No part matches the search.',
    navImporter: 'Set up vehicle',
    impTitle: 'Set up an add-on vehicle',
    impIntro: 'Load a downloaded vehicle (ZIP, RAR, 7z, folder or the single files). The tool recognises models, textures and meta files, checks that they fit together and builds a finished resource with fxmanifest.lua.',
    impStatus: 'Status: Recognising, checking and assembling work and are tested on a real vehicle. Whether the result runs in game is not tested yet. The files themselves are not changed.',
    impDropTitle: 'Drop a vehicle here',
    impDropHint: 'ZIP, RAR or 7z, an unpacked folder or the single files (.yft, .ytd, .meta). Everything stays in your browser.',
    impResourceName: 'Resource name',
    impResourceNameHint: 'This is the folder name in the resources directory and the entry in server.cfg. Lowercase letters, digits, underscore and hyphen.',
    impDisplayName: 'Display name',
    impDisplayNameHint: 'Optional. The name the game shows, for example in the vehicle catalogue. Without an entry the name from the meta file stays.',
    impModels: 'Vehicles found',
    impChipModel: 'Model',
    impChipHigh: 'High model',
    impChipTexture: 'Texture',
    impChipHandling: 'Handling',
    impChipVariation: 'Variations',
    impIssues: 'Check',
    impNoIssues: 'Everything fits together: every vehicle has a model, texture, handling and variations.',
    impFiles: 'Files',
    impStream: 'Models and textures (stream)',
    impMetas: 'Meta files (data)',
    impIgnored: 'Not included',
    impUnreadable: 'unreadable',
    impDownload: 'Download resource as ZIP',
    impDownloadAnyway: 'Download as ZIP despite errors',
    impPreparing: 'Creating ZIP …',
    impNext: 'What comes next',
    impNextSteps: '1. Unpack the ZIP and put the folder "{name}" into your server\'s resources directory. 2. Add "ensure {name}" to server.cfg. 3. Start the server and call the vehicle by its spawn name.',
    impClear: 'Different vehicle',
    impSiren: 'Siren',
    impTotal: 'Total',
    impFailed: 'The files could not be read.',
    impLevels: { error: 'Error', warning: 'Warning', info: 'Note' },
    impIssueText: {
      'no-vehicles-meta': 'There is no vehicles.meta. Without it the game does not know that the model files are a vehicle.',
      'no-model-files': 'No .yft file was found. The vehicle model is missing.',
      'meta-unreadable': 'The file "{file}" is not valid XML and is not included. {detail}',
      'meta-unknown': 'The meta file "{file}" belongs to no vehicle type this tool knows and is not included.',
      'model-missing': 'The model file {file} for "{model}" is missing.',
      'high-model-missing': 'There is no {file} for "{model}". That is fine, many vehicles have one for finer detail up close.',
      'texture-missing': 'The texture file {file} for "{model}" is missing. That is only fine if the texture is part of the original game, otherwise the vehicle shows without textures.',
      'handling-missing': 'The handling "{handling}" of "{model}" is in no handling.meta. That is only fine if it is a handling of the original game.',
      'variation-orphan': 'carvariations.meta describes "{model}", but no vehicles.meta knows this vehicle.',
      'siren-missing': 'The siren {id} of "{model}" is in no carcols.meta. That is only fine if it is a siren of the original game.',
      'encrypted-file': 'The file "{file}" is encrypted (escrow) or not a game file. It is included unchanged but not checked.',
      'bad-spawn-name': 'The name "{model}" contains characters that spawn commands and scripts do not handle. Allowed are letters, digits and underscore.',
      'duplicate-model': 'The vehicle "{model}" appears in several vehicles.meta files. It is counted once.',
      'model-without-meta': 'The model file "{file}" belongs to no vehicle in vehicles.meta. For wheels and extra models that is fine.',
      'old-manifest': 'The existing file "{file}" is not included, a new fxmanifest.lua is created.',
    },
    vehTab3d: '3D view',
    vehTabSheet: 'UV sheet',
    tplTitle: 'UV template for painting',
    tplIntro: 'The livery paint sheet: the areas your artwork lands on in the vehicle. Download it as PNG and paint in Photopea, GIMP or Photoshop.',
    tplLayerLabel: 'Livery texture',
    tplNoLayer: 'This vehicle has no livery layer yet (no second texture in the paint shader). The sheet shows the chosen UV set of all paint parts. You create the layer in the Livery step; paint on UV1.',
    tplSet: 'UV set',
    tplSetHint: 'On vehicles with a livery layer, UV1 usually carries the artwork. UV0 belongs to the base texture and is often mirrored on top of itself.',
    tplScope: 'Parts on the sheet',
    tplScopeAll: 'All paint parts with a livery layer',
    tplScopeSelection: 'Only the selected part',
    tplScopeNeedsPaint: 'Pick a paint part first, then the sheet shows only that one.',
    tplSize: 'PNG size',
    tplFill: 'Tint the areas',
    tplLabels: 'Write names into the areas',
    tplBase: 'Put the existing livery underneath',
    tplBaseMissing: 'The texture "{name}" is not in the loaded files. Also load the vehicle\'s .ytd and it will show here.',
    tplBaseUndecodable: 'The format of the existing texture cannot be displayed yet.',
    tplDownload: 'Download PNG',
    tplPreparing: 'Creating PNG …',
    tplFailed: 'The PNG could not be created.',
    tplReport: 'Sheet check',
    tplCoverage: 'Area used',
    tplOverlap: 'Used more than once',
    tplOverlapNote: 'Where areas lie on top of each other, the same artwork shows twice: on outside and inside, or mirrored on two sides.',
    tplPairs: 'Parts sharing the same area',
    tplOutside: 'Triangles outside the sheet',
    tplDegenerate: 'Triangles without area',
    tplEmpty: 'There is no UV set with areas for this selection.',
    tplSheetHint: 'Click an area to select the part. The sheet is laid out like the texture: top left is the start.',
    tplNoPaint: 'This vehicle has no paint parts.',
    tplSelfOverlap: 'Parts whose areas cover themselves',
    vehShowLivery: 'Show livery on the vehicle',
    vehShowTextures: 'Show textures',
    vehPanelParts: 'Parts',
    vehPanelTemplate: 'Template',
    vehPanelPaint: 'Livery',
    edtPanel: 'Edit',
    edtPageTitle: 'Vehicle editor',
    edtPageIntro: 'Load a vehicle (ZIP, RAR, 7z or a folder with the meta files). Remove parts (badges, roof racks), put new parts on (lightbar with sirens, your own 3D models or parts from another vehicle), set vehicle data (class, bulletproof glass, flags), change the driving behaviour and the sirens and lights, and download the finished resource.',
    edtStatus: 'Status: Removing parts and adding lightbars with siren bones (both checked against CodeWalker), vehicle data, driving behaviour, sirens and variations can be set. Closing holes in the bodywork, swapping rims and taking parts from other vehicles are still missing. None of this is tested in game.',
    edtTitle: 'Remove parts',
    edtIntro: 'Click a part in the view or in the list and mark it for removal. It disappears in the view right away. The file is only changed when you download the modified vehicle.',
    edtPickHint: 'No part picked yet. Use the filter in the list to find badges and decals.',
    edtMarked: 'Marked for removal',
    edtMarkedCount: '{parts} parts with {triangles} triangles.',
    edtNone: 'Nothing marked yet.',
    edtRemove: 'Remove',
    edtRestore: 'Restore',
    edtClear: 'Restore all',
    edtExport: 'Download modified vehicle',
    edtExporting: 'Modifying …',
    edtDecals: 'Only badges and decals',
    edtNote: 'The triangles of these parts are removed in all levels of detail and in all vehicle models of the files (for example _hi.yft too). Vertices and textures stay in the file, so it does not get smaller. With several files you get a ZIP.',
    edtResult: '{count} triangles removed (levels {levels})',
    edtNothing: 'nothing found, unchanged',
    edtFailed: 'The vehicle could not be modified.',
    prpPanelVehicle: 'Vehicle',
    prpDisplayName: 'Display name in game',
    prpDisplayNameHint: 'Optional. The name the game shows (for example in the vehicle catalogue). It is added to the resource as vehicle_names.lua.',
    prpPanelHandling: 'Driving',
    prpPanelLights: 'Lights',
    prpNoMeta: 'There is no matching {file} for this vehicle in the loaded files. Also load the meta files (ZIP, RAR or folder).',
    prpReset: 'Reset',
    prpResetAll: 'Reset all',
    prpAdd: 'Add',
    prpVehicleTitle: 'Vehicle data',
    prpVehicleIntro: 'Master data from vehicles.meta: name, class, type, wheel size and more.',
    prpFlagsOther: 'Other flags',
    prpFlagsMore: 'Add another flag',
    prpVariations: 'Variations',
    prpVariationsIntro: 'From carvariations.meta. The vehicle has {count} colour combinations.',
    prpLiveries: 'Unlock liveries',
    prpLiveryHint: 'Which liveries can be chosen in tuning. The vehicle needs the flag "Has liveries" for this.',
    prpColors: 'Colour numbers',
    prpColorHint: 'Numbers from the game colour table. Applies to all colour combinations of the vehicle.',
    prpColorBody: 'Body',
    prpColorSecond: 'Secondary',
    prpColorPearl: 'Pearl',
    prpColorWheels: 'Wheels',
    prpSirenId: 'Siren number',
    prpSirenIdNote: 'Points to a siren in carcols.meta. The number must be unique on your server.',
    prpHandlingTitle: 'Driving behaviour',
    prpHandlingIntro: 'Handling "{name}" from handling.meta. Every change goes into the file right away; none of it is tested in game.',
    prpAdvanced: 'Advanced',
    prpAdvancedHint: 'Raw values of the file. The flags are hex numbers whose meaning is not explained here.',
    prpLightsTitle: 'Sirens and lights',
    prpLightsIntro: 'The game\'s native sirens: colour, flash pattern and brightness per light. Each light belongs to the bone siren1, siren2 … of the vehicle model and shows as a glowing dot in the view.',
    prpNoSirenBones: 'This model has no siren bones (siren1 to siren20). You can still change the settings, but they only light up on bones that exist. Adding lightbars as new 3D parts is not possible yet.',
    prpSirenBones: 'The model has {count} siren bones (numbers {list}).',
    prpPreset: 'Preset',
    prpApplyPreset: 'Apply preset to all lights',
    prpPlay: 'Show flashing',
    prpStop: 'Stop',
    prpCreateSiren: 'Create siren with this preset',
    prpNoSiren: 'This vehicle has no siren assigned yet.',
    prpPreviewNote: 'The preview shows the flashing roughly. How the game plays the 32 steps exactly is not documented.',
    prpBpm: 'Tempo',
    prpBpmHint: 'Steps per minute. Each bit of the flash pattern lasts one step.',
    prpRealLights: 'Real light sources (light up the surroundings)',
    prpAddLight: 'Add light',
    prpRemoveLight: 'Remove last light',
    prpLights: 'Lights',
    prpLight: 'Light',
    prpNoBone: 'no bone in the model',
    prpColor: 'Colour',
    prpOn: 'on',
    prpBlinks: 'flashes',
    prpPattern: 'Flash pattern',
    prpIntensity: 'Brightness',
    prpSize: 'Size',
    expTitle: 'Result',
    expNothing: 'Nothing changed yet.',
    expParts: '{count} parts marked for removal',
    expMeta: '{file} changed',
    expDownload: 'Download complete resource',
    expBusy: 'Building …',
    expNote: 'The ZIP contains the vehicle with all changes, the meta files and a new fxmanifest.lua. Not tested in game yet.',
    addPanel: 'Add-ons',
    addTitle: 'Add parts',
    addIntro: 'Put new parts on the vehicle: a lightbar, your own 3D model or parts from another vehicle. They are built into all model files when you download the resource (including the high-detail version). They borrow their look from a material your vehicle already has.',
    addLightbar: 'Add lightbar',
    addEmpty: 'Nothing added yet.',
    addListTitle: 'Added',
    addLightbarName: 'Lightbar {n}',
    addRemove: 'Remove',
    addSize: 'Size',
    addLength: 'Length (across)',
    addDepth: 'Depth',
    addHeight: 'Height',
    addModules: 'Light modules',
    addStyle: 'Shape',
    addStyleFlat: 'Flat (strips)',
    addStyleDome: 'Tall (domes)',
    addFeet: 'Mounting feet on the roof',
    addPosition: 'Position on the vehicle',
    addX: 'Side (x)',
    addY: 'Front/back (y)',
    addZ: 'Height (z)',
    addToRoof: 'Place on roof',
    addToRoofNote: 'Sets the height to the highest paint surface at this spot.',
    addMaterials: 'Material',
    addHousing: 'Housing',
    addLens: 'Lenses',
    addLensSame: 'same as housing',
    addMaterialHint: 'Only materials that some part of your vehicle uses can serve as a template. The suggested values are usually right.',
    addNoMaterial: 'Your vehicle has no suitable material, pick one from the list.',
    addSirens: 'Create siren bones for the light modules',
    addSirensHint: 'Each light module gets a bone siren<number>. Only with it can the siren lights from carcols.meta shine there. Without it the bar is just an add-on without flashing lights.',
    addSirenNumbers: 'Siren numbers: {list}',
    addSetupLights: 'Set up the lights in the siren setting',
    addSetupHint: 'Creates the lights {list} (if they do not exist yet) and gives them the colour and flash pattern of the preset chosen in the Lights tab.',
    addSetupDone: 'Lights set up.',
    addSetupNeedSiren: 'First create a siren setting in the Lights tab.',
    addNote: 'New parts and bones are not tested in game yet. Check there: is the bar on the roof, are the lenses visible, do the lights flash?',
    addModel: 'Add your own 3D model',
    addModelHint: 'GLB, glTF, OBJ, FBX or DAE, together with the textures. The model takes on the look of materials of your vehicle (single colour); your own textures on the part follow later.',
    addModelFailed: 'The model could not be read.',
    addModelProblems: 'Problems in the model:',
    addModelScale: 'Size (factor)',
    addModelSize: 'Size with this factor: {size} m',
    addModelRotation: 'Rotation',
    addRotX: 'Tilt forward/back (x)',
    addRotY: 'Tilt sideways (y)',
    addRotZ: 'Turn (z)',
    addModelUpright: 'Stand up by 90°',
    addModelMaterials: 'Materials of the model',
    addModelBone: 'Attached to bone',
    addModelTriangles: '{count} triangles',
    addModelHeavy: 'That is a lot of triangles. Vehicles with a lot of geometry burden players with weaker computers; up to about 20,000 stays light.',
    addModelName: 'Model: {name}',
    addModelOwnTexture: 'Use the model\'s own texture',
    addModelTextureNote: 'The texture goes into the vehicle\'s .ytd (normal and +hi). The material is created as a copy of the chosen vehicle material with this texture; its gloss and normals stay. Transparent areas stay opaque in game (the material is opaque too).',
    donorTitle: 'Parts from another vehicle',
    donorIntro: 'Load another vehicle (.yft or .ydr, plus its .ytd, or a ZIP/RAR) and take individual parts from it, for example bumpers, spoilers or roof fittings. They become an add-on part of your vehicle and first keep their position.',
    donorLoad: 'Load another vehicle …',
    donorClose: 'Close donor',
    donorFile: 'File',
    donorPick: 'Choose parts (or click them in the view)',
    donorNone: 'Clear selection',
    donorSelection: '{parts} parts chosen · {triangles} triangles',
    donorTake: 'Take chosen parts',
    donorNote: 'Paint, glass, lights and tyres of the donor get the materials of your vehicle. Everything else becomes the black housing material, with the donor\'s texture if it is in the loaded files (opaque). Only take parts you are allowed to use.',
    donorName: '{file}: {label}',
    donorMore: '+{count}',
    donorFilter: 'Search parts …',
    donorNoTextures: 'No .ytd was loaded with this vehicle, so the parts get plain materials. Load the donor\'s .ytd as well to take its textures.',
    expAdded: '{count} add-on parts will be built in',
    expAddedFailed: 'Add-on parts could not be built into {file}: {message}',
    expDone: '"{file}" is ready. Triangles removed: {triangles}. Meta files changed: {metas}.',
    expFailed: 'The resource could not be built.',
    vehPaintColor: 'Paint colour',
    lvrTitle: 'Apply painted livery',
    lvrIntro: 'Load your painted PNG. It shows on the vehicle and in the UV sheet right away. Then write the livery into a new .ytd in which the vehicle\'s livery texture is replaced.',
    lvrHowTo: 'While painting, use the template as a layer, but hide it before you export. Transparent areas show the paint; only painted areas cover it.',
    lvrLoad: 'Choose painted PNG',
    lvrRemove: 'Remove',
    lvrLoaded: 'Loaded',
    lvrFailed: 'The image could not be read.',
    lvrWarnResized: 'The image has a different size than the livery texture ({size}) and will be scaled.',
    lvrWarnAspect: 'The aspect ratio differs from the livery texture ({size}). The image will be distorted and the livery will sit wrong.',
    lvrWarnOpaque: 'The image has hardly any transparent areas and covers the whole paint colour.',
    lvrWarnEmpty: 'The image is completely transparent, so no livery will show.',
    lvrWrite: 'Write livery to .ytd',
    lvrWriting: 'Writing livery …',
    lvrWriteDone: '"{file}" is ready. Use it to replace the file of the same name in the vehicle\'s stream folder. Not tested in game yet.',
    lvrWriteDoneMany: '"{file}" contains {count} files ({list}): the normal and the high-detail texture of the livery. Replace the files of the same names in the vehicle\'s stream folder. Not tested in game yet.',
    lvrWriteFailed: 'Writing failed.',
    lvrNoLayerWrite: 'This vehicle has no livery layer. Applying a livery there is not possible yet; creating a new layer comes later.',
    lvrLayerTitle: 'Create livery layer',
    lvrLayerIntro: 'This vehicle has no livery layer yet. I create it: the paint is switched to the vehicle_paint3 shader (it shows a second texture on top of the paint), and your livery is added to the texture dictionary as a new texture. It sits on the second texture coordinate (UV1).',
    lvrLayerWhich: 'These paint materials get the layer:',
    lvrLayerTriangles: '{count} triangles',
    lvrLayerNoUv1: 'no second texture coordinate (UV1), not possible',
    lvrLayerNone: 'This vehicle has no paint material that can be switched. It needs vehicle_paint1 or vehicle_paint2 with a second texture coordinate (UV1).',
    lvrLayerTexture: 'New texture: {name}',
    lvrLayerNeedPng: 'First choose your painted PNG, painted on the template in UV set UV1.',
    lvrLayerWrite: 'Create the livery layer and write',
    lvrLayerWriting: 'Writing …',
    lvrLayerDone: '"{file}" is ready. It contains {count} files (models and textures); copy them into the stream folder of the resource and overwrite the old ones.',
    lvrLayerWarn: 'Not adjusted: {list}',
    lvrLayerNote: 'Not tested in game yet. Check there: does the livery show, are the colours right, does the paint otherwise look the same?',
    lvrNoTexture: 'The livery texture "{name}" is not in the loaded .ytd files. Also load the vehicle\'s .ytd.',
    lvrFormatNote: 'Size and format of the old texture stay ({size}, {format}). The mip levels are recalculated.',
  },
};

export interface ToolInfo {
  id: string;
  group: ToolGroup;
  /** Anzeigename je Sprache. */
  name: Record<Lang, string>;
  text: Record<Lang, string>;
  status: 'available' | 'progress' | 'planned' | 'later';
  /** Route, falls das Tool geöffnet werden kann. */
  route?: string;
}

/** Ehrliche Übersicht: Nur was wirklich läuft, ist als „Verfügbar“ markiert. Reihenfolge: offene Werkzeuge zuerst. */
export const TOOLS: ToolInfo[] = [
  {
    id: 'livery',
    group: 'vehicles',
    name: { de: 'Livery Mapper', en: 'Livery Mapper' },
    text: {
      de: 'Fahrzeug drehen und ansehen, Teile anklicken, UV-Vorlage als PNG laden, bemalte Livery auf dem Auto sehen und ins Fahrzeug schreiben. Hat das Auto keine Livery-Ebene, legt das Werkzeug sie an. Noch nicht im Spiel getestet.',
      en: 'Rotate and view a vehicle, click parts, download a UV template as PNG, see your painted livery on the car and write it into the vehicle. If the car has no livery layer, the tool creates it. Not tested in game yet.',
    },
    status: 'progress',
    route: '/livery',
  },
  {
    id: 'vehicle-optimiser',
    group: 'vehicles',
    name: { de: 'Fahrzeug verkleinern', en: 'Vehicle optimiser' },
    text: {
      de: 'Fahrzeugtexturen verkleinern, ohne das Modell anzufassen. Geht schon in der Textur-Werkstatt (ZIP laden, Größe wählen).',
      en: 'Shrink vehicle textures without touching the model. Already possible in the Texture Lab (load the ZIP, pick a size).',
    },
    status: 'progress',
    route: '/textures',
  },
  {
    id: 'vehicle-editor',
    group: 'vehicles',
    name: { de: 'Fahrzeug-Editor', en: 'Vehicle editor' },
    text: {
      de: 'Teile entfernen (Abzeichen, Dachträger), Lichtbalken mit Sirenen hinzufügen, Fahrzeugdaten und Flags (kugelsichere Scheiben, Klasse), Fahrverhalten, Sirenen und Lichter mit Blinkvorschau, Varianten. Löcher schließen, Felgen tauschen und Teile anderer Fahrzeuge übernehmen folgen. Noch nicht im Spiel getestet.',
      en: 'Remove parts (badges, roof racks), add lightbars with sirens, vehicle data and flags (bulletproof glass, class), driving behaviour, sirens and lights with flash preview, variations. Closing holes, swapping rims and taking parts from other vehicles follow. Not tested in game yet.',
    },
    status: 'progress',
    route: '/editor',
  },
  {
    id: 'addon-importer',
    group: 'vehicles',
    name: { de: 'Add-on-Fahrzeug einrichten', en: 'Set up add-on vehicle' },
    text: {
      de: 'Ein heruntergeladenes Fahrzeug einlesen (ZIP, RAR, 7z, Ordner), Modelle, Texturen und Metas prüfen und zu einer fertigen Resource mit Manifest ordnen. Noch nicht im Spiel getestet.',
      en: 'Read a downloaded vehicle (ZIP, RAR, 7z, folder), check models, textures and metas and arrange them into a finished resource with manifest. Not tested in game yet.',
    },
    status: 'progress',
    route: '/importer',
  },
  {
    id: 'els',
    group: 'vehicles',
    name: { de: 'ELS zu Non-ELS', en: 'ELS to Non-ELS' },
    text: { de: 'Polizeiautos auf native GTA-Sirenen umstellen.', en: 'Convert emergency vehicles to native GTA sirens.' },
    status: 'planned',
  },
  {
    id: 'boat',
    group: 'vehicles',
    name: { de: 'Boat Creator', en: 'Boat Creator' },
    text: { de: 'Bootsmodell zu fahrbarem GTA-Boot.', en: 'Boat model to a drivable GTA boat.' },
    status: 'planned',
  },
  {
    id: 'prop',
    group: 'props',
    name: { de: 'Prop Creator', en: 'Prop Creator' },
    text: { de: '3D-Modell zu spawnbarem Prop mit Textur, Kollision und LODs.', en: '3D model to a spawnable prop with texture, collision and LODs.' },
    status: 'progress',
    route: '/prop',
  },
  {
    id: 'map-optimiser',
    group: 'props',
    name: { de: 'Karten verkleinern', en: 'Map optimiser' },
    text: {
      de: 'Maps und Innenräume (MLO) prüfen, die Streaming-Kosten je Datei zeigen und Texturen verkleinern.',
      en: 'Check maps and interiors (MLO), show the streaming cost per file and shrink textures.',
    },
    status: 'planned',
  },
  {
    id: 'shell',
    group: 'props',
    name: { de: 'Shell Creator', en: 'Shell Creator' },
    text: { de: 'Wohnungs-Shells im Browser bauen und einrichten.', en: 'Build and furnish housing shells in the browser.' },
    status: 'planned',
  },
  {
    id: 'textures',
    group: 'textures',
    name: { de: 'Textur-Werkstatt', en: 'Texture Lab' },
    text: {
      de: 'Texturen in Resources verkleinern (Optimiser) und einzelne Texturen austauschen (Retexture). Arbeitet mit YTD-Dateien.',
      en: 'Shrink textures in resources (optimiser) and swap individual textures (retexture). Works on YTD files.',
    },
    status: 'progress',
    route: '/textures',
  },
  {
    id: 'weapon-skins',
    group: 'textures',
    name: { de: 'Waffen-Skins', en: 'Weapon skins' },
    text: { de: 'Tarnmuster und Lackierungen für Waffen mit 3D-Vorschau.', en: 'Camo patterns and finishes for weapons with a 3D preview.' },
    status: 'planned',
  },
  {
    id: 'clothing',
    group: 'peds',
    name: { de: 'Kleidung und Tattoos', en: 'Clothing and tattoos' },
    text: { de: 'Freemode-Kleidung bemalen, Tattoos platzieren.', en: 'Paint freemode clothing, place tattoos.' },
    status: 'planned',
  },
  {
    id: 'chains',
    group: 'peds',
    name: { de: 'Ketten und Schmuck', en: 'Chains and jewellery' },
    text: { de: 'Ketten, Anhänger und Schriftzüge für die Spielfigur gestalten.', en: 'Design chains, pendants and lettering for the character.' },
    status: 'planned',
  },
  {
    id: 'face-skin',
    group: 'peds',
    name: { de: 'Gesichtstextur', en: 'Face skin' },
    text: { de: 'Aus einem Foto eine Gesichtstextur für die Spielfigur machen.', en: 'Turn a photo into a face texture for the character.' },
    status: 'planned',
  },
  {
    id: 'ai-tools',
    group: 'later',
    name: { de: 'KI-Werkzeuge (Prop und Spielfigur aus Bild)', en: 'AI tools (prop and character from an image)' },
    text: {
      de: 'Brauchen einen KI-Dienst, der pro Aufruf kostet. Das passt nicht zu einer kostenlosen Seite ohne Server und kommt erst, wenn es dafür eine Lösung gibt.',
      en: 'Need an AI service that costs per call. That does not fit a free site without a server and only comes once there is a solution.',
    },
    status: 'later',
  },
  {
    id: 'server-hub',
    group: 'later',
    name: { de: 'Server-Zentrale (Logs, Screenshots)', en: 'Server hub (logs, screenshots)' },
    text: {
      de: 'Ein eigenes Produkt mit Server, Datenbank und Datenschutzpflichten. Nicht Teil dieser Seite.',
      en: 'A product of its own with a server, database and privacy duties. Not part of this site.',
    },
    status: 'later',
  },
];

export const TOOL_GROUPS: ToolGroup[] = ['vehicles', 'props', 'textures', 'peds', 'later'];
