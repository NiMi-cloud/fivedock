/**
 * Angaben für Impressum und Datenschutzerklärung.
 *
 * Diese Werte stehen NICHT im Quelltext, denn das Repository ist öffentlich und der Git-Verlauf soll keine persönlichen Daten enthalten.
 * Sie kommen beim Bauen aus Umgebungsvariablen:
 *   VITE_OPERATOR_NAME, VITE_OPERATOR_EMAIL                                             (Pflicht)
 *   VITE_OPERATOR_STREET, VITE_OPERATOR_CITY, VITE_OPERATOR_COUNTRY (Standard: Deutschland), VITE_OPERATOR_PHONE   (freiwillig)
 * Auf GitHub sind das die Repository-Variablen OPERATOR_NAME, OPERATOR_EMAIL, OPERATOR_STREET, OPERATOR_CITY, OPERATOR_COUNTRY und
 * OPERATOR_PHONE (Settings, Secrets and variables, Actions, Variables), die der Deploy-Workflow weitergibt. Lokal geht die Datei
 * apps/web/.env.local (steht in .gitignore). Solange ein Pflichtfeld fehlt, bricht der Produktions-Build ab (siehe vite.config.ts),
 * damit die Seite nicht unvollständig online geht. Die Angaben erscheinen im Impressum der fertigen Seite. Ohne Anschrift gilt die Seite
 * als privates, nicht kommerzielles Angebot (siehe Legal.tsx); ob das rechtlich trägt, entscheidet der Betreiber, nicht der Code.
 *
 * Die Texte der Seiten sind ein Entwurf und ersetzen keine Rechtsberatung.
 */

export interface Operator {
  /** Vollständiger Name (bei Einzelpersonen) oder Firmenname. */
  name: string;
  /** Straße und Hausnummer (freiwillig). */
  street: string;
  /** Postleitzahl und Ort (freiwillig). */
  city: string;
  /** Land. */
  country: string;
  /** E-Mail-Adresse, unter der der Betreiber schnell erreichbar ist. */
  email: string;
  /** Optional: Telefonnummer. */
  phone: string;
}

type Env = Record<string, string | undefined>;

/** Liest die Betreiberangaben aus Umgebungsvariablen (VITE_OPERATOR_*). */
export function readOperator(env: Env): Operator {
  const get = (key: string) => (env[`VITE_OPERATOR_${key}`] ?? '').trim();
  return {
    name: get('NAME'),
    street: get('STREET'),
    city: get('CITY'),
    country: get('COUNTRY') || 'Deutschland',
    email: get('EMAIL'),
    phone: get('PHONE'),
  };
}

/** Die Umgebung, in der der Code läuft: im Browser die beim Bauen eingesetzten VITE_-Werte, in Node (Tests, Konfiguration) process.env. */
function currentEnv(): Env {
  const built = (import.meta as { env?: Env }).env;
  const node = (globalThis as { process?: { env?: Env } }).process?.env;
  return { ...node, ...built };
}

export const OPERATOR: Operator = readOperator(currentEnv());

/** Hoster der statischen Seite. Wird in der Datenschutzerklärung genannt. */
export const HOSTING = {
  name: 'GitHub Inc. (GitHub Pages)',
  address: '88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA',
};

export const REQUIRED_FIELDS = ['name', 'email'] as const;

/** Hat der Betreiber eine Anschrift angegeben? */
export function hasAddress(operator: Operator = OPERATOR): boolean {
  return operator.street.trim() !== '' && operator.city.trim() !== '';
}

/** Namen der Pflichtangaben, die noch fehlen. */
export function missingLegalFields(operator: Operator = OPERATOR): string[] {
  return REQUIRED_FIELDS.filter((key) => operator[key].trim() === '');
}

/** Name der Umgebungsvariablen zu einem Feld, für Hinweise. */
export function variableName(field: string): string {
  return `VITE_OPERATOR_${field.toUpperCase()}`;
}
