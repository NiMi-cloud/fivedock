import { describe, expect, it } from 'vitest';
import { readHandlings, setHandlingText, setHandlingValue } from './handling.ts';
import {
  addSirenSetting,
  buildSirenSetting,
  formatSirenColor,
  newCarcols,
  parseSirenColor,
  presetLights,
  readSirenSettings,
  sequenceOn,
  setSirenLight,
  setSirenLightCount,
  setSirenName,
  setSirenSetting,
  sirenBoneNumbers,
  suggestSirenId,
} from './sirens.ts';
import {
  listVehicles,
  readVariation,
  readVehicle,
  setAllVariationColors,
  setVariationColor,
  setVariationLiveries,
  setVariationSiren,
  setVehicleFlags,
  setVehicleNumber,
  setVehicleText,
} from './vehicle-meta.ts';
import { boneWorldPositions } from './vehicle.ts';
import { isKnownFlag, otherFlags, parseFlags, FLAG_CATALOG } from './vehicle-flags.ts';
import { VEHICLE_FLAGS } from './vehicle-enums.ts';
import { analyzeVehiclePack } from './vehicle-pack.ts';

const HANDLING = `<?xml version="1.0" encoding="UTF-8"?>
<CHandlingDataMgr>
  <HandlingData>
    <Item type="CHandlingData">
      <handlingName>TESTCAR</handlingName>
      <fMass value="2104.000000" />
      <fInitialDragCoeff value="8.000000" />
      <vecCentreOfMassOffset x="0.000000" y="0.050000" z="0.000000" />
      <nInitialDriveGears value="6" />
      <fCamberStiffnesss value="0.000000" />
      <strModelFlags>440010</strModelFlags>
      <AIHandling>AVERAGE</AIHandling>
      <SubHandlingData>
        <Item type="CCarHandlingData">
          <fBackEndPopUpCarImpulseMult value="0.100000" />
        </Item>
      </SubHandlingData>
    </Item>
    <Item type="CHandlingData">
      <handlingName>OTHER</handlingName>
      <fMass value="1000.000000" />
    </Item>
  </HandlingData>
</CHandlingDataMgr>
`;

const VEHICLES = `<?xml version="1.0" encoding="UTF-8"?>
<CVehicleModelInfo__InitDataList>
  <InitDatas>
    <Item>
      <modelName>testcar</modelName>
      <txdName>testcar</txdName>
      <handlingId>TESTCAR</handlingId>
      <gameName>TESTCAR</gameName>
      <wheelScale value="0.259000" />
      <defaultBodyHealth value="1000.000000" />
      <maxNum value="999" />
      <flags>FLAG_HAS_LIVERY FLAG_LAW_ENFORCEMENT</flags>
      <type>VEHICLE_TYPE_CAR</type>
      <vehicleClass>VC_EMERGENCY</vehicleClass>
      <trailers />
    </Item>
  </InitDatas>
</CVehicleModelInfo__InitDataList>
`;

const VARIATIONS = `<CVehicleModelInfoVariation>
  <variationData>
    <Item>
      <modelName>testcar</modelName>
      <colors>
        <Item>
          <indices content="char_array">
            134
            140
            0
            0
          </indices>
          <liveries>
            <Item value="false" />
          </liveries>
        </Item>
        <Item>
          <indices content="char_array">
            12
            13
            0
            0
          </indices>
          <liveries>
            <Item value="false" />
          </liveries>
        </Item>
      </colors>
      <kits>
        <Item>0_default_modkit</Item>
      </kits>
      <lightSettings value="0" />
      <sirenSettings value="3124" />
    </Item>
  </variationData>
</CVehicleModelInfoVariation>
`;

const CARCOLS = `<?xml version="1.0" encoding="UTF-8"?>
<CVehicleModelInfoVarGlobal>
  <Sirens>
    <Item>
      <id value="3124"/>
      <name>testcar</name>
      <timeMultiplier value="1.0"/>
      <sequencerBpm value="650"/>
      <useRealLights value="true"/>
      <sirens>
        <Item>
          <!-- Siren 1 -->
          <rotation>
            <delta value="0.00000000"/>
            <speed value="3.00000000"/>
            <sequencer value="4294967295"/>
            <multiples value="1"/>
            <direction value="false"/>
            <syncToBpm value="true"/>
          </rotation>
          <flashiness>
            <delta value="0"/>
            <speed value="0.00000000"/>
            <sequencer value="3435302092"/>
            <multiples value="1"/>
            <direction value="true"/>
            <syncToBpm value="true"/>
          </flashiness>
          <corona>
            <intensity value="25.00000000"/>
            <size value="0.50000000"/>
            <pull value="0.15000000"/>
            <faceCamera value="false"/>
          </corona>
          <color value="0xFF0000FF"/>
          <intensity value="4"/>
          <lightGroup value="2"/>
          <rotate value="false"/>
          <scale value="true"/>
          <scaleFactor value="100"/>
          <flash value="true"/>
          <light value="true"/>
          <spotLight value="false"/>
          <castShadows value="false"/>
        </Item>
      </sirens>
    </Item>
  </Sirens>
</CVehicleModelInfoVarGlobal>
`;

describe('Handling', () => {
  it('liest Zahlen, Vektoren und Texte jedes Eintrags', () => {
    const [a, b] = readHandlings(HANDLING);
    expect(a!.name).toBe('TESTCAR');
    expect(a!.numbers['fMass']).toBe(2104);
    expect(a!.numbers['nInitialDriveGears']).toBe(6);
    expect(a!.vectors['vecCentreOfMassOffset']).toEqual([0, 0.05, 0]);
    expect(a!.texts['strModelFlags']).toBe('440010');
    expect(a!.texts['AIHandling']).toBe('AVERAGE');
    expect(b!.name).toBe('OTHER');
    // Untereinträge (SubHandlingData) gehören nicht zu den Feldern des Eintrags
    expect(a!.numbers['fBackEndPopUpCarImpulseMult']).toBeUndefined();
  });

  it('ändert nur den gewählten Wert und lässt Format und andere Einträge unberührt', () => {
    const out = setHandlingValue(HANDLING, 'testcar', 'fMass', 1850.5);
    expect(out).toBe(HANDLING.replace('<fMass value="2104.000000" />', '<fMass value="1850.500000" />'));
    expect(readHandlings(out)[1]!.numbers['fMass']).toBe(1000);
  });

  it('schreibt Ganzzahlen ohne Nachkommastellen und Vektoren komplett', () => {
    expect(setHandlingValue(HANDLING, 'TESTCAR', 'nInitialDriveGears', 7.4)).toContain('<nInitialDriveGears value="7" />');
    const v = setHandlingValue(HANDLING, 'TESTCAR', 'vecCentreOfMassOffset', [0.1, 0.2, -0.3]);
    expect(v).toContain('<vecCentreOfMassOffset x="0.100000" y="0.200000" z="-0.300000" />');
  });

  it('ändert Texte und meldet unbekannte Einträge und Felder', () => {
    expect(setHandlingText(HANDLING, 'TESTCAR', 'AIHandling', 'SPORTS_CAR')).toContain('<AIHandling>SPORTS_CAR</AIHandling>');
    expect(() => setHandlingValue(HANDLING, 'GIBTSNICHT', 'fMass', 1)).toThrow(/steht nicht/);
    expect(() => setHandlingValue(HANDLING, 'TESTCAR', 'fGibtsNicht', 1)).toThrow(/steht nicht/);
    expect(() => setHandlingValue(HANDLING, 'TESTCAR', 'fMass', Number.NaN)).toThrow();
  });
});

describe('vehicles.meta', () => {
  it('liest Zahlen, Texte und Flags eines Fahrzeugs', () => {
    expect(listVehicles(VEHICLES)).toEqual(['testcar']);
    const v = readVehicle(VEHICLES, 'TESTCAR')!;
    expect(v.numbers['wheelScale']).toBe(0.259);
    expect(v.numbers['maxNum']).toBe(999);
    expect(v.texts['vehicleClass']).toBe('VC_EMERGENCY');
    expect(v.flags).toEqual(['FLAG_HAS_LIVERY', 'FLAG_LAW_ENFORCEMENT']);
    expect(readVehicle(VEHICLES, 'gibtsnicht')).toBeNull();
  });

  it('ändert Zahlen in der Schreibweise der Datei', () => {
    expect(setVehicleNumber(VEHICLES, 'testcar', 'wheelScale', 0.31)).toContain('<wheelScale value="0.310000" />');
    expect(setVehicleNumber(VEHICLES, 'testcar', 'maxNum', 12.7)).toContain('<maxNum value="13" />');
  });

  it('ändert Texte, auch bei leeren Elementen, und Flags', () => {
    expect(setVehicleText(VEHICLES, 'testcar', 'vehicleClass', 'VC_SUV')).toContain('<vehicleClass>VC_SUV</vehicleClass>');
    expect(setVehicleText(VEHICLES, 'testcar', 'trailers', 'trailer1')).toContain('<trailers >trailer1</trailers>');
    const flags = setVehicleFlags(VEHICLES, 'testcar', ['FLAG_LAW_ENFORCEMENT', 'FLAG_HAS_BULLETPROOF_GLASS', 'FLAG_LAW_ENFORCEMENT']);
    expect(readVehicle(flags, 'testcar')!.flags).toEqual(['FLAG_LAW_ENFORCEMENT', 'FLAG_HAS_BULLETPROOF_GLASS']);
    const removed = setVehicleFlags(VEHICLES, 'testcar', []);
    expect(readVehicle(removed, 'testcar')!.flags).toEqual([]);
  });

  it('legt <flags> an, wenn es fehlt', () => {
    const without = VEHICLES.replace('      <flags>FLAG_HAS_LIVERY FLAG_LAW_ENFORCEMENT</flags>\n', '');
    const out = setVehicleFlags(without, 'testcar', ['FLAG_HAS_BULLETPROOF_GLASS']);
    expect(readVehicle(out, 'testcar')!.flags).toEqual(['FLAG_HAS_BULLETPROOF_GLASS']);
  });

  it('der Katalog der Flags nennt nur Flags, die das Spiel kennt, und es bleiben weitere zur Auswahl', () => {
    for (const f of FLAG_CATALOG) expect(isKnownFlag(f.flag), f.flag).toBe(true);
    expect(isKnownFlag('FLAG_HAS_BULLETPROOF_GLASS')).toBe(true);
    expect(isKnownFlag('FLAG_ERFUNDEN')).toBe(false);
    expect(otherFlags().length).toBe(VEHICLE_FLAGS.length - FLAG_CATALOG.length);
    expect(parseFlags('  A  B\nC ')).toEqual(['A', 'B', 'C']);
  });
});

describe('carvariations.meta', () => {
  it('liest Farben, Liveries, Kits und Sirene', () => {
    const v = readVariation(VARIATIONS, 'testcar')!;
    expect(v.colors.map((c) => c.indices)).toEqual([[134, 140, 0, 0], [12, 13, 0, 0]]);
    expect(v.colors[0]!.liveries).toEqual([false]);
    expect(v.kits).toEqual(['0_default_modkit']);
    expect(v.sirenSettings).toBe(3124);
  });

  it('setzt die Sirenen-Nummer', () => {
    expect(readVariation(setVariationSiren(VARIATIONS, 'testcar', 777), 'testcar')!.sirenSettings).toBe(777);
  });

  it('schaltet Liveries für alle Farbkombinationen, ergänzt und entfernt Einträge', () => {
    const on = setVariationLiveries(VARIATIONS, 'testcar', [true, false, true]);
    expect(readVariation(on, 'testcar')!.colors.map((c) => c.liveries)).toEqual([[true, false, true], [true, false, true]]);
    const fewer = setVariationLiveries(on, 'testcar', [false]);
    expect(readVariation(fewer, 'testcar')!.colors.map((c) => c.liveries)).toEqual([[false], [false]]);
  });

  it('ändert Farbnummern einzeln und für alle, ohne das Zeilenformat zu verändern', () => {
    const one = setVariationColor(VARIATIONS, 'testcar', 1, [99, 98]);
    expect(readVariation(one, 'testcar')!.colors[1]!.indices).toEqual([99, 98, 0, 0]);
    expect(one).toBe(VARIATIONS.replace('12\n            13', '99\n            98'));
    const all = setAllVariationColors(VARIATIONS, 'testcar', [111, null]);
    expect(readVariation(all, 'testcar')!.colors.map((c) => c.indices)).toEqual([[111, 140, 0, 0], [111, 13, 0, 0]]);
    expect(() => setVariationColor(VARIATIONS, 'testcar', 5, [1])).toThrow(/gibt es nicht/);
  });
});

describe('Sirenen', () => {
  it('liest Einstellung und Lichter', () => {
    const [s] = readSirenSettings(CARCOLS);
    expect(s).toMatchObject({ id: 3124, name: 'testcar', bpm: 650, useRealLights: true });
    expect(s!.lights).toHaveLength(1);
    const l = s!.lights[0]!;
    expect(l).toMatchObject({ index: 0, color: '#0000ff', alpha: 255, intensity: 4, scaleFactor: 100, flashing: true, light: true, spotLight: false, lightGroup: 2 });
    expect(l.flash.sequencer).toBe(3435302092);
    expect(l.rotation.sequencer).toBe(4294967295);
    expect(l.coronaSize).toBeCloseTo(0.5);
  });

  it('wandelt Farben zwischen 0xAARRGGBB und #rrggbb', () => {
    expect(parseSirenColor('0xFFFF0000')).toEqual({ color: '#ff0000', alpha: 255 });
    expect(parseSirenColor('0x80102030')).toEqual({ color: '#102030', alpha: 128 });
    expect(formatSirenColor('#ff8000')).toBe('0xFFFF8000');
    expect(formatSirenColor('#0000ff', 128)).toBe('0x800000FF');
  });

  it('ändert Farbe (Deckkraft bleibt), Blinkmuster, Helligkeit und Wahrheitswerte gezielt', () => {
    let t = setSirenLight(CARCOLS, 3124, 0, 'color', '#ff0000');
    expect(t).toContain('<color value="0xFFFF0000"/>');
    t = setSirenLight(t, 3124, 0, 'flashSequence', 0xaaaaaaaa);
    expect(t).toContain('<sequencer value="2863311530"/>');
    t = setSirenLight(t, 3124, 0, 'intensity', 6.4);
    expect(t).toContain('<intensity value="6"/>');
    t = setSirenLight(t, 3124, 0, 'light', false);
    expect(t).toContain('<light value="false"/>');
    t = setSirenLight(t, 3124, 0, 'coronaSize', 0.8);
    expect(t).toContain('<size value="0.80000000"/>');
    // Die Rotation hat dasselbe Feld sequencer, es darf nicht mitgeändert werden
    expect(readSirenSettings(t)[0]!.lights[0]!.rotation.sequencer).toBe(4294967295);
    expect(() => setSirenLight(CARCOLS, 3124, 4, 'color', '#000000')).toThrow(/gibt es/);
    expect(() => setSirenLight(CARCOLS, 1, 0, 'color', '#000000')).toThrow(/steht nicht/);
  });

  it('ändert Takt und Name der Einstellung', () => {
    expect(setSirenSetting(CARCOLS, 3124, 'bpm', 400)).toContain('<sequencerBpm value="400"/>');
    expect(setSirenSetting(CARCOLS, 3124, 'useRealLights', false)).toContain('<useRealLights value="false"/>');
    expect(setSirenName(CARCOLS, 3124, 'streife')).toContain('<name>streife</name>');
  });

  it('hängt Lichter an (Kopie des letzten, Kommentar nummeriert) und entfernt sie wieder', () => {
    const three = setSirenLightCount(CARCOLS, 3124, 3);
    const s = readSirenSettings(three)[0]!;
    expect(s.lights).toHaveLength(3);
    expect(three).toContain('<!-- Siren 2 -->');
    expect(three).toContain('<!-- Siren 3 -->');
    expect(s.lights[2]!.color).toBe('#0000ff');
    const back = setSirenLightCount(three, 3124, 1);
    expect(back).toBe(CARCOLS);
    expect(() => setSirenLightCount(CARCOLS, 3124, 21)).toThrow(/0 bis 20/);
  });

  it('baut eine neue Sirene aus einer Vorlage, die sich wieder lesen lässt, und hängt sie an', () => {
    const lights = presetLights('police-double', [-0.4, 0.4, 0, 0]);
    expect(lights.map((l) => l.color)).toEqual(['#ff0000', '#0000ff', '#ff0000', '#0000ff']);
    const xml = buildSirenSetting({ id: 5000, name: 'neu', lights });
    const fresh = newCarcols(xml);
    const [s] = readSirenSettings(fresh);
    expect(s).toMatchObject({ id: 5000, name: 'neu', bpm: 650 });
    expect(s!.lights).toHaveLength(4);
    expect(s!.lights[1]!.flash.sequencer).toBe(0x33333333);
    expect(s!.lights[1]!.color).toBe('#0000ff');
    const merged = addSirenSetting(CARCOLS, xml);
    expect(readSirenSettings(merged).map((x) => x.id)).toEqual([3124, 5000]);
    // Eine carcols.meta ohne <Sirens> bekommt den Abschnitt
    const bare = '<CVehicleModelInfoVarGlobal>\n</CVehicleModelInfoVarGlobal>\n';
    expect(readSirenSettings(addSirenSetting(bare, xml)).map((x) => x.id)).toEqual([5000]);
  });

  it('Vorlagen und Hilfen', () => {
    expect(presetLights('amber', [-1, 1]).map((l) => l.color)).toEqual(['#ff8000', '#ff8000']);
    expect(presetLights('ambulance', [-1, 1]).map((l) => l.color)).toEqual(['#ff0000', '#ffffff']);
    expect(sirenBoneNumbers(['chassis', 'siren3', 'siren1', 'Siren10', 'sirenx'])).toEqual([1, 3, 10]);
    const id = suggestSirenId('testcar', []);
    expect(id).toBeGreaterThanOrEqual(1000);
    expect(suggestSirenId('testcar', [id])).not.toBe(id);
    expect(sequenceOn(0b101, 0)).toBe(true);
    expect(sequenceOn(0b101, 1)).toBe(false);
    expect(sequenceOn(0b101, 33)).toBe(false);
    expect(sequenceOn(0b101, 34)).toBe(true);
    expect(sequenceOn(0xffffffff, 31)).toBe(true);
  });
});

describe('boneWorldPositions', () => {
  it('addiert die Lagen entlang der Eltern', () => {
    const bones = [
      { index: 0, parent: -1, position: [0, 0, 0] as [number, number, number] },
      { index: 1, parent: 0, position: [0, -0.19, 1.24] as [number, number, number] },
      { index: 2, parent: 1, position: [0.42, 0.06, 0] as [number, number, number] },
    ];
    const world = boneWorldPositions(bones);
    expect(world[2]![0]).toBeCloseTo(0.42);
    expect(world[2]![1]).toBeCloseTo(-0.13);
    expect(world[2]![2]).toBeCloseTo(1.24);
  });

  it('übersteht Schleifen in der Elternliste', () => {
    const bones = [
      { index: 0, parent: 1, position: [1, 0, 0] as [number, number, number] },
      { index: 1, parent: 0, position: [1, 0, 0] as [number, number, number] },
    ];
    expect(() => boneWorldPositions(bones)).not.toThrow();
  });
});

describe('zusammen mit der Paketanalyse', () => {
  it('bearbeitete Meta-Dateien bleiben gültig und werden weiter erkannt', () => {
    const edited = setVehicleFlags(VEHICLES, 'testcar', ['FLAG_HAS_BULLETPROOF_GLASS']);
    const files = {
      'stream/testcar.yft': Uint8Array.from([0x52, 0x53, 0x43, 0x37, 1]),
      'stream/testcar.ytd': Uint8Array.from([0x52, 0x53, 0x43, 0x37, 1]),
      'vehicles.meta': new TextEncoder().encode(edited),
      'handling.meta': new TextEncoder().encode(setHandlingValue(HANDLING, 'TESTCAR', 'fMass', 1800)),
    };
    const a = analyzeVehiclePack(files);
    expect(a.models[0]).toMatchObject({ name: 'testcar', hasHandling: true });
    expect(a.issues.filter((i) => i.level === 'error')).toEqual([]);
  });
});
