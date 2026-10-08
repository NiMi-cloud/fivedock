/**
 * Kleiner XML-Leser für die Meta-Dateien von GTA (vehicles.meta, handling.meta, carcols.meta …). Er kennt Elemente, Attribute,
 * Text, Kommentare, CDATA, Verarbeitungsanweisungen und selbstschließende Elemente, aber keine Namensräume und keine DTDs.
 * Meta-Dateien sind regelmäßig genug, dass das reicht, und der Leser läuft im Browser und in Node gleich (kein DOMParser nötig).
 */

export interface XmlElement {
  name: string;
  attributes: Record<string, string>;
  children: XmlElement[];
  /** Zusammengefügter Text direkt in diesem Element (ohne Text der Kinder), getrimmt. */
  text: string;
  /** Zeile des öffnenden Tags (ab 1), für Fehlermeldungen. */
  line: number;
  /** Position des öffnenden "<" und Position hinter dem schließenden ">" (bei selbstschließenden Elementen hinter "/>"), bezogen auf den Quelltext. */
  start: number;
  end: number;
  /** Bereich zwischen öffnendem und schließendem Tag. Bei selbstschließenden Elementen leer, hinter dem Tag. */
  contentStart: number;
  contentEnd: number;
  /** Bereich des Werts je Attribut (ohne Anführungszeichen), für gezielte Änderungen am Quelltext. */
  attributeSpans: Record<string, [number, number]>;
  /** true bei selbstschließenden Elementen. */
  selfClosing: boolean;
}

export class XmlError extends Error {
  readonly line: number;
  constructor(message: string, line: number) {
    super(`Zeile ${line}: ${message}`);
    this.name = 'XmlError';
    this.line = line;
  }
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

/** Liest ein XML-Dokument und gibt das Wurzelelement zurück. Fehler (nicht geschlossene oder falsch verschachtelte Tags) sind `XmlError`. */
export function parseXml(source: string): XmlElement {
  // Positionen beziehen sich auf den Quelltext. Eine Bytefolge-Marke am Anfang bleibt stehen und wird übersprungen.
  const text = source;
  // Zeilennummer schrittweise mitzählen: Die Positionen wachsen, ein Neuzählen von vorn wäre bei großen Dateien quadratisch.
  let countedTo = 0;
  let countedLine = 1;
  const lineAt = (index: number) => {
    if (index < countedTo) {
      countedTo = 0;
      countedLine = 1;
    }
    for (; countedTo < index; countedTo++) if (text.charCodeAt(countedTo) === 10) countedLine++;
    return countedLine;
  };

  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;
  let i = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  const attachText = (value: string) => {
    const top = stack[stack.length - 1];
    if (top && value.trim()) top.text = top.text ? `${top.text} ${value.trim()}` : value.trim();
  };

  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt < 0) {
      attachText(decode(text.slice(i)));
      break;
    }
    if (lt > i) attachText(decode(text.slice(i, lt)));

    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      if (end < 0) throw new XmlError('Kommentar nicht geschlossen.', lineAt(lt));
      i = end + 3;
    } else if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9);
      if (end < 0) throw new XmlError('CDATA nicht geschlossen.', lineAt(lt));
      attachText(text.slice(lt + 9, end));
      i = end + 3;
    } else if (text.startsWith('<?', lt)) {
      const end = text.indexOf('?>', lt + 2);
      if (end < 0) throw new XmlError('Verarbeitungsanweisung nicht geschlossen.', lineAt(lt));
      i = end + 2;
    } else if (text.startsWith('<!', lt)) {
      const end = text.indexOf('>', lt + 2);
      if (end < 0) throw new XmlError('Deklaration nicht geschlossen.', lineAt(lt));
      i = end + 1;
    } else if (text.startsWith('</', lt)) {
      const end = text.indexOf('>', lt + 2);
      if (end < 0) throw new XmlError('Schließendes Tag nicht abgeschlossen.', lineAt(lt));
      const name = text.slice(lt + 2, end).trim();
      const open = stack.pop();
      if (!open) throw new XmlError(`Unerwartetes </${name}>.`, lineAt(lt));
      if (open.name !== name) throw new XmlError(`</${name}> passt nicht zu <${open.name}> aus Zeile ${open.line}.`, lineAt(lt));
      open.contentEnd = lt;
      open.end = end + 1;
      i = end + 1;
    } else {
      // Öffnendes Tag: Name, Attribute, optional "/" vor ">". Anführungszeichen dürfen ">" enthalten.
      let j = lt + 1;
      let quote = '';
      while (j < text.length) {
        const c = text[j]!;
        if (quote) {
          if (c === quote) quote = '';
        } else if (c === '"' || c === "'") {
          quote = c;
        } else if (c === '>') {
          break;
        }
        j++;
      }
      if (j >= text.length) throw new XmlError('Tag nicht abgeschlossen.', lineAt(lt));
      let inner = text.slice(lt + 1, j);
      const selfClosing = inner.endsWith('/');
      if (selfClosing) inner = inner.slice(0, -1);
      const nameMatch = /^([^\s/>]+)/.exec(inner);
      if (!nameMatch) throw new XmlError('Tag ohne Namen.', lineAt(lt));
      const attributes: Record<string, string> = {};
      const rest = inner.slice(nameMatch[0].length);
      const attributeSpans: Record<string, [number, number]> = {};
      const restStart = lt + 1 + nameMatch[0].length;
      for (const m of rest.matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
        const raw = m[3] ?? m[4] ?? '';
        attributes[m[1]!] = decode(raw);
        // Der Wert endet vor dem schließenden Anführungszeichen, das ist das letzte Zeichen des Treffers.
        const valueEnd = restStart + m.index + m[0].length - 1;
        attributeSpans[m[1]!] = [valueEnd - raw.length, valueEnd];
      }
      const element: XmlElement = {
        name: nameMatch[1]!,
        attributes,
        children: [],
        text: '',
        line: lineAt(lt),
        start: lt,
        end: j + 1,
        contentStart: j + 1,
        contentEnd: j + 1,
        attributeSpans,
        selfClosing,
      };
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(element);
      else if (!root) root = element;
      else throw new XmlError('Mehr als ein Wurzelelement.', element.line);
      if (!selfClosing) stack.push(element);
      i = j + 1;
    }
  }

  const unclosed = stack[stack.length - 1];
  if (unclosed) throw new XmlError(`<${unclosed.name}> ist nicht geschlossen.`, unclosed.line);
  if (!root) throw new XmlError('Kein Element gefunden.', 1);
  return root;
}

/** Erstes Kind mit diesem Namen. */
export function child(element: XmlElement, name: string): XmlElement | undefined {
  return element.children.find((c) => c.name === name);
}

/** Alle Kinder mit diesem Namen. */
export function childrenNamed(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((c) => c.name === name);
}

/** Text des ersten Kindes mit diesem Namen, sonst `fallback`. */
export function childText(element: XmlElement, name: string, fallback = ''): string {
  return child(element, name)?.text ?? fallback;
}

/** Alle Nachkommen mit diesem Namen (Tiefensuche). */
export function descendants(element: XmlElement, name: string): XmlElement[] {
  const out: XmlElement[] = [];
  const visit = (e: XmlElement) => {
    for (const c of e.children) {
      if (c.name === name) out.push(c);
      visit(c);
    }
  };
  visit(element);
  return out;
}
