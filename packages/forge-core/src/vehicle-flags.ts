/**
 * Die wichtigsten Fahrzeug-Flags aus vehicles.meta mit verständlichen Namen. Alle anderen Flags des Spiels bleiben wählbar
 * (siehe `VEHICLE_FLAGS`), werden aber nur mit ihrem Namen gezeigt.
 */

import { VEHICLE_FLAGS } from './vehicle-enums.ts';

export type FlagGroup = 'service' | 'glass' | 'paint' | 'extras' | 'body' | 'behaviour' | 'spawn';

export interface FlagInfo {
  flag: string;
  group: FlagGroup;
  label: { de: string; en: string };
  hint?: { de: string; en: string };
}

export const FLAG_GROUPS: FlagGroup[] = ['service', 'glass', 'paint', 'extras', 'body', 'behaviour', 'spawn'];

export const FLAG_GROUP_TITLES: Record<FlagGroup, { de: string; en: string }> = {
  service: { de: 'Einsatzfahrzeug', en: 'Emergency vehicle' },
  glass: { de: 'Scheiben und Schutz', en: 'Glass and protection' },
  paint: { de: 'Lackierung und Tuning', en: 'Paint and tuning' },
  extras: { de: 'Extras (zuschaltbare Anbauteile)', en: 'Extras (switchable add-ons)' },
  body: { de: 'Karosserie und Licht', en: 'Body and lights' },
  behaviour: { de: 'Verhalten', en: 'Behaviour' },
  spawn: { de: 'Auftauchen im Spiel', en: 'Spawning' },
};

export const FLAG_CATALOG: FlagInfo[] = [
  { flag: 'FLAG_LAW_ENFORCEMENT', group: 'service', label: { de: 'Polizeifahrzeug', en: 'Police vehicle' }, hint: { de: 'Wird vom Spiel als Streifenwagen behandelt.', en: 'Treated as a police car by the game.' } },
  { flag: 'FLAG_EMERGENCY_SERVICE', group: 'service', label: { de: 'Rettungsfahrzeug', en: 'Emergency service vehicle' }, hint: { de: 'Feuerwehr und Rettung: Sirene, Vorfahrt.', en: 'Fire and ambulance: siren, right of way.' } },
  { flag: 'FLAG_USE_INTERIOR_RED_LIGHT', group: 'service', label: { de: 'Rotes Licht im Innenraum', en: 'Red interior light' } },
  { flag: 'FLAG_USE_FAT_INTERIOR_LIGHT', group: 'service', label: { de: 'Breites Innenlicht', en: 'Wide interior light' } },

  { flag: 'FLAG_HAS_BULLETPROOF_GLASS', group: 'glass', label: { de: 'Kugelsichere Scheiben', en: 'Bulletproof glass' }, hint: { de: 'Schüsse gehen nicht durch die Scheiben.', en: 'Bullets do not pass through the windows.' } },
  { flag: 'FLAG_HAS_BULLET_RESISTANT_GLASS', group: 'glass', label: { de: 'Kugelhemmende Scheiben', en: 'Bullet-resistant glass' }, hint: { de: 'Scheiben halten mehrere Treffer aus, bevor sie brechen.', en: 'Windows take several hits before they break.' } },
  { flag: 'FLAG_DISABLE_THROUGH_WINDSCREEN', group: 'glass', label: { de: 'Insassen fliegen nicht durch die Frontscheibe', en: 'Occupants cannot fly through the windscreen' } },
  { flag: 'FLAG_DISABLE_DEFORMATION', group: 'glass', label: { de: 'Keine Verformung bei Unfällen', en: 'No deformation in crashes' } },
  { flag: 'FLAG_HAS_CAPPED_EXPLOSION_DAMAGE', group: 'glass', label: { de: 'Begrenzter Explosionsschaden', en: 'Capped explosion damage' } },
  { flag: 'FLAG_CRUSHES_OTHER_VEHICLES', group: 'glass', label: { de: 'Zerquetscht andere Fahrzeuge', en: 'Crushes other vehicles' } },

  { flag: 'FLAG_HAS_LIVERY', group: 'paint', label: { de: 'Hat Lackierungen (Liveries)', en: 'Has liveries' } },
  { flag: 'FLAG_NO_RESPRAY', group: 'paint', label: { de: 'Nicht umlackierbar', en: 'Cannot be resprayed' } },
  { flag: 'FLAG_CANNOT_BE_MODDED', group: 'paint', label: { de: 'Nicht tunebar', en: 'Cannot be modded' } },
  { flag: 'FLAG_CAN_HAVE_NEONS', group: 'paint', label: { de: 'Neonlicht möglich', en: 'Neon lights possible' } },
  { flag: 'FLAG_EXTRAS_MATCH_LIVERY', group: 'paint', label: { de: 'Extras folgen der Lackierung', en: 'Extras follow the livery' } },

  { flag: 'FLAG_EXTRAS_ALL', group: 'extras', label: { de: 'Alle Extras sind an', en: 'All extras are on' } },
  { flag: 'FLAG_EXTRAS_REQUIRE', group: 'extras', label: { de: 'Mindestens ein Extra ist an', en: 'At least one extra is on' } },
  { flag: 'FLAG_EXTRAS_STRONG', group: 'extras', label: { de: 'Extras sind stabil (brechen nicht ab)', en: 'Extras are sturdy (do not break off)' } },
  { flag: 'FLAG_EXTRAS_ONLY_BREAK_WHEN_DESTROYED', group: 'extras', label: { de: 'Extras brechen nur beim Zerstören ab', en: 'Extras break only when destroyed' } },
  { flag: 'FLAG_EXTRAS_SCRIPT', group: 'extras', label: { de: 'Extras nur per Skript', en: 'Extras via script only' } },
  { flag: 'FLAG_HAS_INTERIOR_EXTRAS', group: 'extras', label: { de: 'Extras im Innenraum', en: 'Interior extras' } },
  { flag: 'FLAG_FAKE_EXTRALIGHTS', group: 'extras', label: { de: 'Zusatzlichter als Attrappe', en: 'Fake extra lights' } },

  { flag: 'FLAG_HAS_NO_ROOF', group: 'body', label: { de: 'Ohne Dach (Cabrio)', en: 'No roof (convertible)' } },
  { flag: 'FLAG_IS_ELECTRIC', group: 'body', label: { de: 'Elektroantrieb', en: 'Electric drive' } },
  { flag: 'FLAG_HAS_GULL_WING_DOORS', group: 'body', label: { de: 'Flügeltüren', en: 'Gull-wing doors' } },
  { flag: 'FLAG_BOOT_IN_FRONT', group: 'body', label: { de: 'Kofferraum vorn', en: 'Boot in front' } },
  { flag: 'FLAG_NO_BOOT', group: 'body', label: { de: 'Ohne Kofferraum', en: 'No boot' } },
  { flag: 'FLAG_TWO_DOORS_ONE_SEAT', group: 'body', label: { de: 'Zwei Türen, ein Sitz', en: 'Two doors, one seat' } },
  { flag: 'FLAG_RECESSED_HEADLIGHT_CORONAS', group: 'body', label: { de: 'Scheinwerferlicht liegt zurückgesetzt', en: 'Recessed headlight coronas' } },
  { flag: 'FLAG_RECESSED_TAILLIGHT_CORONAS', group: 'body', label: { de: 'Rücklicht liegt zurückgesetzt', en: 'Recessed taillight coronas' } },
  { flag: 'FLAG_HEADLIGHTS_USE_ACTUAL_BONE_POS', group: 'body', label: { de: 'Scheinwerfer an der Lage des Knochens', en: 'Headlights at the actual bone position' } },
  { flag: 'FLAG_PARKING_SENSORS', group: 'body', label: { de: 'Parksensoren', en: 'Parking sensors' } },

  { flag: 'FLAG_FORCE_BONNET_CAMERA_INSTEAD_OF_POV', group: 'behaviour', label: { de: 'Motorhaubenkamera statt Fahrersicht', en: 'Bonnet camera instead of driver view' } },
  { flag: 'FLAG_CANNOT_BE_DRIVEN_BY_PLAYER', group: 'behaviour', label: { de: 'Spieler können nicht fahren', en: 'Players cannot drive it' } },
  { flag: 'FLAG_DISABLE_BUSTING', group: 'behaviour', label: { de: 'Insassen können nicht festgenommen werden', en: 'Occupants cannot be busted' } },
  { flag: 'FLAG_USE_HIGHER_DOOR_TORQUE', group: 'behaviour', label: { de: 'Türen schwingen kräftiger', en: 'Doors swing harder' } },
  { flag: 'FLAG_IS_OFFROAD_VEHICLE', group: 'behaviour', label: { de: 'Geländewagen', en: 'Off-road vehicle' } },
  { flag: 'FLAG_IS_VAN', group: 'behaviour', label: { de: 'Transporter', en: 'Van' } },
  { flag: 'FLAG_IS_BUS', group: 'behaviour', label: { de: 'Bus', en: 'Bus' } },
  { flag: 'FLAG_BIG', group: 'behaviour', label: { de: 'Großes Fahrzeug', en: 'Big vehicle' } },

  { flag: 'FLAG_DONT_SPAWN_IN_CARGEN', group: 'spawn', label: { de: 'Nicht auf Parkplätzen', en: 'Not in car generators' } },
  { flag: 'FLAG_DONT_SPAWN_AS_AMBIENT', group: 'spawn', label: { de: 'Nicht im Verkehr', en: 'Not in ambient traffic' } },
  { flag: 'FLAG_SPORTS', group: 'spawn', label: { de: 'Sportwagen (Verkehrsklasse)', en: 'Sports car (traffic class)' } },
  { flag: 'FLAG_AVERAGE_CAR', group: 'spawn', label: { de: 'Normales Auto (Verkehrsklasse)', en: 'Average car (traffic class)' } },
  { flag: 'FLAG_POOR_CAR', group: 'spawn', label: { de: 'Günstiges Auto (Verkehrsklasse)', en: 'Poor car (traffic class)' } },
  { flag: 'FLAG_RICH_CAR', group: 'spawn', label: { de: 'Luxusauto (Verkehrsklasse)', en: 'Rich car (traffic class)' } },
];

const VALID = new Set(VEHICLE_FLAGS);

/** true, wenn das Spiel das Flag kennt. */
export function isKnownFlag(flag: string): boolean {
  return VALID.has(flag);
}

/** Flags, die das Spiel kennt, aber nicht im Katalog stehen (für die Auswahl „weitere Flags“). */
export function otherFlags(): string[] {
  const listed = new Set(FLAG_CATALOG.map((f) => f.flag));
  return VEHICLE_FLAGS.filter((f) => !listed.has(f));
}

/** Zerlegt den Text von `<flags>` in einzelne Flags. */
export function parseFlags(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}
