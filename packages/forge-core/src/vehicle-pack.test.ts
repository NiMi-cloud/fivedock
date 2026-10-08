import { describe, expect, it } from 'vitest';
import { analyzeVehiclePack, buildManifest, buildVehicleResource } from './vehicle-pack.ts';
import type { Issue } from './vehicle-pack.ts';
import type { PackFiles } from './texture-lab.ts';

const text = (s: string) => new TextEncoder().encode(s);
const rsc7 = (extra = 4) => Uint8Array.from([0x52, 0x53, 0x43, 0x37, ...new Array<number>(extra).fill(1)]);

const vehiclesMeta = (model: string, txd = model, handling = model.toUpperCase()) => `<?xml version="1.0" encoding="UTF-8"?>
<CVehicleModelInfo__InitDataList>
  <residentTxd>vehshare</residentTxd>
  <InitDatas>
    <Item>
      <modelName>${model}</modelName>
      <txdName>${txd}</txdName>
      <handlingId>${handling}</handlingId>
      <gameName>${model.toUpperCase()}</gameName>
      <FirstPersonMobilePhoneSeatIKOffset>
        <Item><SeatIndex value="2" /></Item>
      </FirstPersonMobilePhoneSeatIKOffset>
    </Item>
  </InitDatas>
</CVehicleModelInfo__InitDataList>`;

const handlingMeta = (name: string) =>
  `<CHandlingDataMgr><HandlingData><Item type="CHandlingData"><handlingName>${name}</handlingName><SubHandlingData><Item type="NULL" /></SubHandlingData></Item></HandlingData></CHandlingDataMgr>`;
const variationsMeta = (model: string, siren = '0') =>
  `<CVehicleModelInfoVariation><variationData><Item><modelName>${model}</modelName><sirenSettings value="${siren}" /></Item></variationData></CVehicleModelInfoVariation>`;
const carcolsMeta = (...ids: number[]) =>
  `<CVehicleModelInfoVarGlobal><Sirens>${ids.map((id) => `<Item><id value="${id}"/><name>s${id}</name></Item>`).join('')}</Sirens></CVehicleModelInfoVarGlobal>`;

function goodPack(model = 'testcar'): PackFiles {
  return {
    [`stream/${model}.yft`]: rsc7(),
    [`stream/${model}_hi.yft`]: rsc7(),
    [`stream/${model}.ytd`]: rsc7(),
    'vehicles.meta': text(vehiclesMeta(model)),
    'handling.meta': text(handlingMeta(model.toUpperCase())),
    'carvariations.meta': text(variationsMeta(model)),
  };
}

const codes = (issues: Issue[]) => issues.map((i) => i.code);

describe('analyzeVehiclePack', () => {
  it('erkennt ein vollständiges Fahrzeug ohne Beanstandung', () => {
    const a = analyzeVehiclePack(goodPack());
    expect(a.issues).toEqual([]);
    expect(a.models).toHaveLength(1);
    expect(a.models[0]).toMatchObject({
      name: 'testcar',
      txdName: 'testcar',
      handlingId: 'TESTCAR',
      hasModel: true,
      hasHighModel: true,
      hasTexture: true,
      hasHandling: true,
      hasVariation: true,
    });
    expect(a.metas.map((m) => m.kind).sort()).toEqual(['handling', 'variations', 'vehicles']);
    expect(a.stream).toHaveLength(3);
    expect(a.resourceName).toBe('testcar');
  });

  it('erkennt Meta-Dateien am Inhalt, auch bei fremden Dateinamen und in Unterordnern', () => {
    const files: PackFiles = {
      'Pack/Resource/stream/testcar.yft': rsc7(),
      'Pack/Resource/stream/testcar.ytd': rsc7(),
      'Pack/Resource/daten1.xml': text(vehiclesMeta('testcar')),
      'Pack/Resource/zwei.meta': text(handlingMeta('TESTCAR')),
      'Pack/Resource/drei.meta': text(carcolsMeta(11)),
    };
    const a = analyzeVehiclePack(files);
    expect(a.metas.map((m) => `${m.kind}:${m.target}`).sort()).toEqual(['carcols:data/carcols.meta', 'handling:data/handling.meta', 'vehicles:data/vehicles.meta']);
    expect(a.models[0]!.hasHandling).toBe(true);
  });

  it('meldet fehlende Textur und fehlendes Handling als Warnung (beides kann zum Originalspiel gehören), ein fehlendes _hi-Modell nur als Hinweis', () => {
    const files = goodPack();
    delete files['stream/testcar.ytd'];
    delete files['stream/testcar_hi.yft'];
    files['handling.meta'] = text(handlingMeta('ANDERS'));
    const a = analyzeVehiclePack(files);
    expect(a.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(a.issues.filter((i) => i.level === 'warning').map((i) => i.code).sort()).toEqual(['handling-missing', 'texture-missing']);
    expect(a.issues.find((i) => i.code === 'high-model-missing')).toMatchObject({ level: 'info', params: { file: 'testcar_hi.yft' } });
    const none = analyzeVehiclePack({
      'stream/testcar_hi.yft': rsc7(),
      'vehicles.meta': text(vehiclesMeta('testcar')),
      'handling.meta': text(handlingMeta('TESTCAR')),
    });
    expect(none.issues.find((i) => i.code === 'model-missing')).toMatchObject({ level: 'error', params: { file: 'testcar.yft' } });
  });

  it('nutzt den txdName für die Textur, wenn er vom Modellnamen abweicht', () => {
    const files = goodPack();
    files['vehicles.meta'] = text(vehiclesMeta('testcar', 'gemeinsam'));
    expect(analyzeVehiclePack(files).issues.map((i) => `${i.code}:${i.params.file}`)).toContain('texture-missing:gemeinsam.ytd');
    files['stream/gemeinsam.ytd'] = rsc7();
    expect(codes(analyzeVehiclePack(files).issues)).not.toContain('texture-missing');
  });

  it('vergleicht Groß- und Kleinschreibung nicht (Windows-Dateien, Meta in Großbuchstaben)', () => {
    const files: PackFiles = {
      'stream/TestCar.YFT': rsc7(),
      'stream/TESTCAR.ytd': rsc7(),
      'vehicles.meta': text(vehiclesMeta('testcar', 'TestCar', 'testcar')),
      'handling.meta': text(handlingMeta('TESTCAR')),
    };
    const a = analyzeVehiclePack(files);
    expect(a.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('prüft die Sirene: die Nummer aus carvariations.meta muss in carcols.meta stehen', () => {
    const files = goodPack();
    files['carvariations.meta'] = text(variationsMeta('testcar', '3124'));
    expect(codes(analyzeVehiclePack(files).issues)).toContain('siren-missing');
    files['carcols.meta'] = text(carcolsMeta(3124));
    const ok = analyzeVehiclePack(files);
    expect(codes(ok.issues)).not.toContain('siren-missing');
    expect(ok.models[0]!.sirenSetting).toBe('3124');
  });

  it('meldet Varianten ohne Fahrzeug, Modelle ohne Meta, doppelte Fahrzeuge und ungültige Namen', () => {
    const files = goodPack();
    files['carvariations.meta'] = text(variationsMeta('andere'));
    files['stream/fremd.yft'] = rsc7();
    files['vehicles.meta'] = text(vehiclesMeta('test car'));
    const a = analyzeVehiclePack(files);
    expect(codes(a.issues)).toEqual(expect.arrayContaining(['variation-orphan', 'model-without-meta', 'bad-spawn-name']));

    const dup = goodPack();
    dup['zwei.meta'] = text(vehiclesMeta('testcar'));
    expect(codes(analyzeVehiclePack(dup).issues)).toContain('duplicate-model');
    expect(analyzeVehiclePack(dup).models).toHaveLength(1);
  });

  it('warnt vor verschlüsselten oder fremden Dateien und meldet kaputtes XML mit Zeile', () => {
    const files = goodPack();
    files['stream/testcar.yft'] = Uint8Array.from([0x46, 0x58, 0x41, 0x50, 0, 0, 0, 0]);
    files['kaputt.meta'] = text('<CHandlingDataMgr>\n<HandlingData>\n</CHandlingDataMgr>');
    files['was.meta'] = text('<Irgendwas />');
    const a = analyzeVehiclePack(files);
    expect(codes(a.issues)).toEqual(expect.arrayContaining(['encrypted-file', 'meta-unreadable', 'meta-unknown']));
    expect(a.issues.find((i) => i.code === 'meta-unreadable')!.params.detail).toMatch(/Zeile 3/);
    expect(a.stream.find((s) => s.name === 'testcar.yft')!.unreadable).toBe(true);
    expect(a.ignored).toEqual(expect.arrayContaining(['kaputt.meta', 'was.meta']));
  });

  it('meldet fehlende vehicles.meta und fehlende Modelle, sortiert Fehler vor Warnungen vor Hinweisen', () => {
    const a = analyzeVehiclePack({ 'readme.txt': text('hallo'), 'fxmanifest.lua': text("fx_version 'cerulean'") });
    const order = ['error', 'warning', 'info'];
    expect(a.issues.map((i) => i.level)).toEqual([...a.issues.map((i) => i.level)].sort((x, y) => order.indexOf(x) - order.indexOf(y)));
    expect(codes(a.issues)).toEqual(expect.arrayContaining(['no-vehicles-meta', 'no-model-files', 'old-manifest']));
    expect(a.ignored).toEqual(['fxmanifest.lua', 'readme.txt']);
    expect(a.resourceName).toBe('fahrzeug');
  });

  it('übernimmt mehrere Fahrzeuge einer Meta-Datei', () => {
    const two = `<CVehicleModelInfo__InitDataList><InitDatas>
      <Item><modelName>eins</modelName><txdName>eins</txdName><handlingId>EINS</handlingId></Item>
      <Item><modelName>zwei</modelName><txdName>zwei</txdName><handlingId>ZWEI</handlingId></Item>
    </InitDatas></CVehicleModelInfo__InitDataList>`;
    const files: PackFiles = {
      'stream/eins.yft': rsc7(),
      'stream/eins.ytd': rsc7(),
      'stream/zwei.yft': rsc7(),
      'stream/zwei.ytd': rsc7(),
      'vehicles.meta': text(two),
      'handling.meta': text(
        '<CHandlingDataMgr><HandlingData><Item><handlingName>EINS</handlingName></Item><Item><handlingName>ZWEI</handlingName></Item></HandlingData></CHandlingDataMgr>',
      ),
    };
    const a = analyzeVehiclePack(files);
    expect(a.models.map((m) => m.name)).toEqual(['eins', 'zwei']);
    expect(a.issues.filter((i) => i.level === 'error')).toEqual([]);
  });
});

describe('buildVehicleResource', () => {
  it('ordnet Modelle nach stream/, Metas nach data/ und schreibt ein Manifest mit allen data_file-Zeilen', () => {
    const files = goodPack();
    files['carcols.meta'] = text(carcolsMeta(5));
    files['Vorschau.png'] = text('png');
    const a = analyzeVehiclePack(files);
    const built = buildVehicleResource(files, a, { resourceName: 'testcar' });
    expect(Object.keys(built.files).sort()).toEqual(
      [
        'data/carcols.meta',
        'data/carvariations.meta',
        'data/handling.meta',
        'data/vehicles.meta',
        'fxmanifest.lua',
        'stream/testcar.ytd',
        'stream/testcar.yft',
        'stream/testcar_hi.yft',
      ].sort(),
    );
    expect(built.manifest).toContain("fx_version 'cerulean'");
    expect(built.manifest).toContain("data_file 'HANDLING_FILE' 'data/handling.meta'");
    expect(built.manifest).toContain("data_file 'VEHICLE_METADATA_FILE' 'data/vehicles.meta'");
    expect(built.manifest).toContain("data_file 'CARCOLS_FILE' 'data/carcols.meta'");
    expect(built.manifest).toContain("data_file 'VEHICLE_VARIATION_FILE' 'data/carvariations.meta'");
    expect(built.manifest).toContain("  'data/vehicles.meta',");
    expect(built.manifest).not.toContain('vehicle_names.lua');
    // Die Bytes der Dateien bleiben unverändert.
    expect(built.files['data/vehicles.meta']).toBe(files['vehicles.meta']);
    expect(built.files['stream/testcar.yft']).toBe(files['stream/testcar.yft']);
  });

  it('schreibt Anzeigenamen als Skript und trägt es im Manifest ein', () => {
    const files = goodPack();
    const a = analyzeVehiclePack(files);
    const built = buildVehicleResource(files, a, { resourceName: 'x', displayNames: { testcar: "Polizei 'Sheriff'" } });
    const lua = new TextDecoder().decode(built.files['vehicle_names.lua']!);
    expect(lua).toContain("AddTextEntry('TESTCAR', 'Polizei \\'Sheriff\\'')");
    expect(built.manifest).toContain("client_script 'vehicle_names.lua'");
  });

  it('nummeriert Meta-Dateien gleichen Typs und gleichnamige Modelle aus verschiedenen Ordnern', () => {
    const files: PackFiles = {
      'a/stream/eins.yft': rsc7(),
      'a/stream/eins.ytd': rsc7(),
      'b/stream/eins.yft': rsc7(),
      'a/vehicles.meta': text(vehiclesMeta('eins')),
      'b/vehicles.meta': text(vehiclesMeta('zwei')),
      'a/handling.meta': text(handlingMeta('EINS')),
    };
    const a = analyzeVehiclePack(files);
    expect(a.metas.filter((m) => m.kind === 'vehicles').map((m) => m.target)).toEqual(['data/vehicles.meta', 'data/vehicles_2.meta']);
    const built = buildVehicleResource(files, a, { resourceName: 'x' });
    expect(Object.keys(built.files).filter((p) => p.startsWith('stream/'))).toHaveLength(3);
  });
});

describe('buildManifest', () => {
  it('lässt files und data_file weg, wenn es keine Metas gibt', () => {
    expect(buildManifest([], false)).toBe("fx_version 'cerulean'\ngame 'gta5'\n\n");
  });
});
