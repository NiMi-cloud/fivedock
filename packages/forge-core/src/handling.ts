/**
 * Fahrverhalten (handling.meta): Werte lesen und gezielt ändern. Geändert wird nur der Wert selbst, die Datei bleibt sonst
 * Zeichen für Zeichen gleich (siehe xml-edit.ts).
 */

import { XmlEditError, applyEdits, setAttribute, setContent } from './xml-edit.ts';
import { child, childText, descendants, parseXml } from './xml.ts';
import type { XmlElement } from './xml.ts';

export type HandlingGroup = 'engine' | 'brakes' | 'traction' | 'suspension' | 'damage' | 'other';

export const HANDLING_GROUPS: HandlingGroup[] = ['engine', 'brakes', 'traction', 'suspension', 'damage', 'other'];

export const HANDLING_GROUP_TITLES: Record<HandlingGroup, { de: string; en: string }> = {
  engine: { de: 'Gewicht und Antrieb', en: 'Weight and drive' },
  brakes: { de: 'Bremsen und Lenkung', en: 'Brakes and steering' },
  traction: { de: 'Haftung', en: 'Traction' },
  suspension: { de: 'Federung', en: 'Suspension' },
  damage: { de: 'Schaden', en: 'Damage' },
  other: { de: 'Sonstiges', en: 'Other' },
};

export interface HandlingField {
  /** Name des Elements in der Datei. */
  key: string;
  group: HandlingGroup;
  kind: 'number' | 'integer';
  label: { de: string; en: string };
  hint: { de: string; en: string };
  /** Bereich des Reglers. Eingaben außerhalb sind erlaubt. */
  min: number;
  max: number;
  step: number;
  unit?: string;
}

const f = (
  key: string,
  group: HandlingGroup,
  label: [string, string],
  hint: [string, string],
  min: number,
  max: number,
  step: number,
  options: { kind?: 'number' | 'integer'; unit?: string } = {},
): HandlingField => ({ key, group, kind: options.kind ?? 'number', label: { de: label[0], en: label[1] }, hint: { de: hint[0], en: hint[1] }, min, max, step, unit: options.unit });

export const HANDLING_FIELDS: HandlingField[] = [
  f('fMass', 'engine', ['Gewicht', 'Mass'], ['Schwerere Autos beschleunigen träger und schieben bei Unfällen mehr.', 'Heavier cars accelerate slower and push more in crashes.'], 300, 20000, 10, { unit: 'kg' }),
  f('fInitialDriveForce', 'engine', ['Antriebskraft', 'Drive force'], ['Wie stark das Auto beschleunigt. Höher ist schneller.', 'How hard the car accelerates. Higher is faster.'], 0.02, 1.5, 0.01),
  f('fInitialDriveMaxFlatVel', 'engine', ['Höchstgeschwindigkeit (Richtwert)', 'Top speed (guide value)'], ['Obergrenze des Antriebs, die tatsächliche Geschwindigkeit hängt auch von Luftwiderstand und Kraft ab.', 'Upper limit of the drive; real speed also depends on drag and force.'], 60, 500, 5, { unit: 'km/h' }),
  f('nInitialDriveGears', 'engine', ['Gänge', 'Gears'], ['Zahl der Vorwärtsgänge.', 'Number of forward gears.'], 1, 10, 1, { kind: 'integer' }),
  f('fDriveBiasFront', 'engine', ['Antrieb vorn', 'Drive bias front'], ['0 = Hinterradantrieb, 1 = Vorderradantrieb, 0,5 = Allrad.', '0 = rear-wheel drive, 1 = front-wheel drive, 0.5 = all-wheel drive.'], 0, 1, 0.05),
  f('fDriveInertia', 'engine', ['Motorträgheit', 'Drive inertia'], ['Wie schnell der Motor hochdreht. Höher dreht schneller hoch.', 'How quickly the engine revs up. Higher revs up faster.'], 0.1, 2, 0.05),
  f('fClutchChangeRateScaleUpShift', 'engine', ['Hochschalten', 'Upshift speed'], ['Wie schnell hochgeschaltet wird.', 'How fast upshifts are.'], 0.1, 10, 0.1),
  f('fClutchChangeRateScaleDownShift', 'engine', ['Runterschalten', 'Downshift speed'], ['Wie schnell heruntergeschaltet wird.', 'How fast downshifts are.'], 0.1, 10, 0.1),
  f('fInitialDragCoeff', 'engine', ['Luftwiderstand', 'Drag'], ['Höher bremst bei hoher Geschwindigkeit stärker.', 'Higher slows the car more at speed.'], 0, 50, 0.5),

  f('fBrakeForce', 'brakes', ['Bremskraft', 'Brake force'], ['Höher bremst stärker.', 'Higher brakes harder.'], 0.1, 3, 0.05),
  f('fBrakeBiasFront', 'brakes', ['Bremsverteilung vorn', 'Brake bias front'], ['Anteil der Bremskraft auf der Vorderachse.', 'Share of braking force on the front axle.'], 0, 1, 0.05),
  f('fHandBrakeForce', 'brakes', ['Handbremse', 'Handbrake'], ['Stärke der Handbremse (Heck bricht leichter aus).', 'Handbrake strength (the rear breaks away more easily).'], 0, 3, 0.05),
  f('fSteeringLock', 'brakes', ['Lenkeinschlag', 'Steering lock'], ['Größter Lenkwinkel der Räder.', 'Largest wheel steering angle.'], 20, 80, 1, { unit: '°' }),

  f('fTractionCurveMax', 'traction', ['Haftung (Maximum)', 'Traction (maximum)'], ['Höchste Haftung der Reifen. Höher klebt mehr.', 'Highest tyre grip. Higher sticks more.'], 0.5, 5, 0.05),
  f('fTractionCurveMin', 'traction', ['Haftung (rutschend)', 'Traction (sliding)'], ['Haftung, wenn die Reifen schon rutschen.', 'Grip once the tyres are already sliding.'], 0.5, 5, 0.05),
  f('fTractionCurveLateral', 'traction', ['Seitlicher Haftungswinkel', 'Lateral traction angle'], ['Bei welchem Schräglauf die Haftung nachlässt.', 'At which slip angle grip fades.'], 5, 45, 0.5, { unit: '°' }),
  f('fTractionSpringDeltaMax', 'traction', ['Haftung bei Bodenwellen', 'Traction over bumps'], ['Wie viel Federweg die Haftung ausgleicht.', 'How much suspension travel traction compensates.'], 0, 0.5, 0.01),
  f('fLowSpeedTractionLossMult', 'traction', ['Durchdrehen bei niedrigem Tempo', 'Low-speed wheelspin'], ['Höher dreht stärker durch (Burnouts).', 'Higher spins more (burnouts).'], 0, 5, 0.05),
  f('fCamberStiffnesss', 'traction', ['Sturz-Steifigkeit', 'Camber stiffness'], ['Wie stark die Räder bei Schräglage nachgeben.', 'How much wheels give in when leaning.'], 0, 1, 0.05),
  f('fTractionBiasFront', 'traction', ['Haftung vorn', 'Traction bias front'], ['Anteil der Haftung auf der Vorderachse.', 'Share of grip on the front axle.'], 0.2, 0.8, 0.01),
  f('fTractionLossMult', 'traction', ['Haftungsverlust auf Untergrund', 'Surface traction loss'], ['Wie stark Schotter, Nässe und Gras die Haftung senken.', 'How much gravel, wet and grass reduce grip.'], 0, 5, 0.05),

  f('fSuspensionForce', 'suspension', ['Federhärte', 'Suspension stiffness'], ['Höher ist härter.', 'Higher is stiffer.'], 0.3, 10, 0.1),
  f('fSuspensionCompDamp', 'suspension', ['Dämpfung beim Einfedern', 'Compression damping'], ['Wie stark das Einfedern gebremst wird.', 'How much compression is damped.'], 0.2, 5, 0.05),
  f('fSuspensionReboundDamp', 'suspension', ['Dämpfung beim Ausfedern', 'Rebound damping'], ['Wie stark das Ausfedern gebremst wird.', 'How much rebound is damped.'], 0.2, 5, 0.05),
  f('fSuspensionUpperLimit', 'suspension', ['Federweg nach oben', 'Upper travel'], ['Wie weit das Rad einfedern kann.', 'How far the wheel can compress.'], 0, 0.5, 0.01, { unit: 'm' }),
  f('fSuspensionLowerLimit', 'suspension', ['Federweg nach unten', 'Lower travel'], ['Wie weit das Rad ausfedern kann (negativ).', 'How far the wheel can extend (negative).'], -0.5, 0, 0.01, { unit: 'm' }),
  f('fSuspensionRaise', 'suspension', ['Höherlegung', 'Ride height offset'], ['Positiv legt das Auto höher, negativ tiefer.', 'Positive raises the car, negative lowers it.'], -0.3, 0.3, 0.01, { unit: 'm' }),
  f('fSuspensionBiasFront', 'suspension', ['Federung vorn', 'Suspension bias front'], ['Anteil der Federkraft auf der Vorderachse.', 'Share of spring force on the front axle.'], 0, 1, 0.01),
  f('fAntiRollBarForce', 'suspension', ['Stabilisator', 'Anti-roll bar'], ['Höher neigt sich weniger in Kurven.', 'Higher leans less in corners.'], 0, 2, 0.05),
  f('fAntiRollBarBiasFront', 'suspension', ['Stabilisator vorn', 'Anti-roll bar bias front'], ['Anteil des Stabilisators auf der Vorderachse.', 'Share of the anti-roll bar on the front axle.'], 0, 1, 0.01),
  f('fRollCentreHeightFront', 'suspension', ['Wankzentrum vorn', 'Roll centre height front'], ['Höhe des Drehpunkts der Karosserie vorn.', 'Height of the body roll pivot at the front.'], 0, 1, 0.01),
  f('fRollCentreHeightRear', 'suspension', ['Wankzentrum hinten', 'Roll centre height rear'], ['Höhe des Drehpunkts der Karosserie hinten.', 'Height of the body roll pivot at the rear.'], 0, 1, 0.01),

  f('fCollisionDamageMult', 'damage', ['Schaden bei Kollision', 'Collision damage'], ['1 = normal, höher geht schneller kaputt.', '1 = normal, higher breaks sooner.'], 0, 10, 0.1),
  f('fWeaponDamageMult', 'damage', ['Schaden durch Waffen', 'Weapon damage'], ['Kleiner hält mehr Beschuss aus.', 'Smaller takes more gunfire.'], 0, 10, 0.1),
  f('fDeformationDamageMult', 'damage', ['Verformung', 'Deformation'], ['Wie stark sich das Blech verformt.', 'How much the bodywork deforms.'], 0, 10, 0.1),
  f('fEngineDamageMult', 'damage', ['Motorschaden', 'Engine damage'], ['Wie schnell der Motor Schaden nimmt.', 'How quickly the engine takes damage.'], 0, 10, 0.1),

  f('fPercentSubmerged', 'other', ['Eintauchtiefe', 'Submerged share'], ['Wie tief das Auto im Wasser steht, bevor es treibt.', 'How deep the car sits in water before floating.'], 0, 100, 1, { unit: '%' }),
  f('fPetrolTankVolume', 'other', ['Tankgröße', 'Fuel tank'], ['Menge, die bei einem Leck auslaufen kann.', 'Amount that can leak when damaged.'], 0, 500, 1),
  f('fOilVolume', 'other', ['Ölmenge', 'Oil volume'], ['Menge, die bei Motorschaden verloren geht.', 'Amount lost on engine damage.'], 0, 50, 0.5),
  f('nMonetaryValue', 'other', ['Wert', 'Value'], ['Preis im Spiel (zum Beispiel für Versicherung oder Verkauf).', 'In-game price (for example for insurance or selling).'], 0, 10000000, 1000, { kind: 'integer' }),
];

export const HANDLING_VECTORS = [
  { key: 'vecCentreOfMassOffset', label: { de: 'Schwerpunkt-Verschiebung', en: 'Centre of mass offset' }, hint: { de: 'x seitlich, y nach vorn, z nach oben. Ein tieferer Schwerpunkt (z negativ) kippt weniger.', en: 'x sideways, y forward, z up. A lower centre (negative z) tips less.' } },
  { key: 'vecInertiaMultiplier', label: { de: 'Trägheit', en: 'Inertia' }, hint: { de: 'Wie träge das Auto um die drei Achsen dreht.', en: 'How sluggishly the car rotates around the three axes.' } },
] as const;

export type HandlingTextKey = 'strModelFlags' | 'strHandlingFlags' | 'strDamageFlags' | 'AIHandling';

export interface HandlingEntry {
  name: string;
  numbers: Record<string, number>;
  vectors: Record<string, [number, number, number]>;
  texts: Record<string, string>;
}

function handlingItems(root: XmlElement): XmlElement[] {
  return descendants(root, 'Item').filter((i) => child(i, 'handlingName'));
}

/** Liest alle Handling-Einträge einer handling.meta. */
export function readHandlings(text: string): HandlingEntry[] {
  const root = parseXml(text);
  return handlingItems(root).map((item) => {
    const numbers: Record<string, number> = {};
    const vectors: HandlingEntry['vectors'] = {};
    const texts: Record<string, string> = {};
    for (const c of item.children) {
      if (c.attributes['value'] !== undefined && c.children.length === 0) {
        const n = Number(c.attributes['value']);
        if (Number.isFinite(n)) numbers[c.name] = n;
      } else if (c.attributes['x'] !== undefined) {
        vectors[c.name] = [Number(c.attributes['x']), Number(c.attributes['y']), Number(c.attributes['z'])];
      } else if (c.children.length === 0 && c.name !== 'handlingName') {
        texts[c.name] = c.text;
      }
    }
    return { name: childText(item, 'handlingName'), numbers, vectors, texts };
  });
}

function findItem(root: XmlElement, handlingName: string): XmlElement {
  const item = handlingItems(root).find((i) => childText(i, 'handlingName').toLowerCase() === handlingName.toLowerCase());
  if (!item) throw new XmlEditError(`Das Handling "${handlingName}" steht nicht in der Datei.`);
  return item;
}

/** Zahl so schreiben, wie die Dateien es tun: Ganzzahlen ohne Nachkommastellen, sonst sechs. */
export function formatNumber(value: number, integer = false): string {
  if (!Number.isFinite(value)) throw new XmlEditError('Der Wert ist keine Zahl.');
  return integer ? String(Math.round(value)) : value.toFixed(6);
}

/** Setzt einen Zahlenwert (`value="…"`) oder einen Vektor (`x`, `y`, `z`) eines Handling-Eintrags und gibt den neuen Dateitext zurück. */
export function setHandlingValue(text: string, handlingName: string, key: string, value: number | [number, number, number]): string {
  const root = parseXml(text);
  const el = child(findItem(root, handlingName), key);
  if (!el) throw new XmlEditError(`<${key}> steht nicht im Handling "${handlingName}".`);
  if (Array.isArray(value)) {
    return applyEdits(text, [setAttribute(el, 'x', formatNumber(value[0])), setAttribute(el, 'y', formatNumber(value[1])), setAttribute(el, 'z', formatNumber(value[2]))]);
  }
  const integer = /^-?\d+$/.test(el.attributes['value'] ?? '');
  return applyEdits(text, [setAttribute(el, 'value', formatNumber(value, integer))]);
}

/** Setzt einen Textwert eines Handling-Eintrags (Flags als Hexzahl, KI-Verhalten). */
export function setHandlingText(text: string, handlingName: string, key: HandlingTextKey, value: string): string {
  const root = parseXml(text);
  const el = child(findItem(root, handlingName), key);
  if (!el) throw new XmlEditError(`<${key}> steht nicht im Handling "${handlingName}".`);
  return applyEdits(text, [setContent(el, value)]);
}
