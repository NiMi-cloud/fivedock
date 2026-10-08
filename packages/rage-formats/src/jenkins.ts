/**
 * Jenkins-"one-at-a-time"-Hash ("joaat"), wie ihn GTA V für Namen verwendet.
 *
 * Wichtig: Der Name wird vorher in Kleinbuchstaben umgewandelt. In Binärdateien stehen Namen nur als
 * dieser Hash. Die Funktion ist öffentlich bekannt und von vielen Werkzeugen implementiert.
 */
export function joaat(input: string): number {
  return hash(input, true);
}

/**
 * Derselbe Hash, aber ohne Umwandlung in Kleinbuchstaben. So werden die Namen von Strukturen und
 * ihren Feldern in den Typtabellen der Meta-Dateien gebildet (z. B. "lodDist" oder "CMapTypes").
 */
export function joaatLiteral(input: string): number {
  return hash(input, false);
}

function hash(input: string, lowercase: boolean): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    let c = input.charCodeAt(i) & 0xff;
    if (lowercase && c >= 0x41 && c <= 0x5a) c += 0x20; // A-Z -> a-z
    h = (h + c) >>> 0;
    h = (h + (h << 10)) >>> 0;
    h = (h ^ (h >>> 6)) >>> 0;
  }
  h = (h + (h << 3)) >>> 0;
  h = (h ^ (h >>> 11)) >>> 0;
  h = (h + (h << 15)) >>> 0;
  return h >>> 0;
}
