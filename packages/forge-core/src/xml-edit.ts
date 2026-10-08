/**
 * Gezielte Änderungen an XML-Quelltext. Statt eine Datei neu zu schreiben, wird nur die Stelle ersetzt, die sich ändert
 * (ein Attributwert, der Text eines Elements, ein ganzes Element). Alles andere bleibt Zeichen für Zeichen gleich:
 * Einrückung, Kommentare, Reihenfolge und Zahlenformate der Stellen, die niemand angefasst hat.
 */

import type { XmlElement } from './xml.ts';

export interface TextEdit {
  start: number;
  end: number;
  text: string;
}

export class XmlEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XmlEditError';
  }
}

/** Wendet Änderungen an. Sie dürfen sich nicht überlappen, die Reihenfolge der Liste ist egal. */
export function applyEdits(source: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let out = source;
  let limit = source.length + 1;
  for (const e of sorted) {
    if (e.end > limit) throw new XmlEditError('Zwei Änderungen überschneiden sich.');
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    limit = e.start;
  }
  return out;
}

export function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeXml(value).replace(/"/g, '&quot;');
}

/** Ändert den Wert eines Attributs, zum Beispiel `<fMass value="2104" />`. */
export function setAttribute(element: XmlElement, name: string, value: string): TextEdit {
  const span = element.attributeSpans[name];
  if (!span) throw new XmlEditError(`<${element.name}> hat kein Attribut "${name}".`);
  return { start: span[0], end: span[1], text: escapeAttribute(value) };
}

/**
 * Ändert den Text eines Elements ohne Kinder, zum Beispiel `<flags>FLAG_A FLAG_B</flags>`. Ein selbstschließendes Element
 * (`<flags />`) wird dabei zu einem Element mit Inhalt.
 */
export function setContent(element: XmlElement, value: string): TextEdit {
  if (element.children.length > 0) throw new XmlEditError(`<${element.name}> hat Kinder, sein Text lässt sich nicht ersetzen.`);
  if (element.selfClosing) {
    // Aus "/>" wird ">Inhalt</name>".
    return { start: element.end - 2, end: element.end, text: `>${escapeXml(value)}</${element.name}>` };
  }
  return { start: element.contentStart, end: element.contentEnd, text: escapeXml(value) };
}

/** Ersetzt ein ganzes Element durch neuen Quelltext. */
export function replaceElement(element: XmlElement, xml: string): TextEdit {
  return { start: element.start, end: element.end, text: xml };
}

/**
 * Fügt ein neues letztes Kind ein. `indent` ist die Einrückung der neuen Zeile. Steht das schließende Tag allein in seiner Zeile,
 * kommt das Kind als eigene Zeile davor; bei einem selbstschließenden Element wird es aufgeklappt.
 */
export function appendChild(source: string, element: XmlElement, xml: string, indent: string): TextEdit {
  if (element.selfClosing) {
    return { start: element.end - 2, end: element.end, text: `>\n${indent}${xml}\n</${element.name}>` };
  }
  const lineStart = source.lastIndexOf('\n', element.contentEnd - 1) + 1;
  if (lineStart > element.contentStart && source.slice(lineStart, element.contentEnd).trim() === '') {
    return { start: lineStart, end: lineStart, text: `${indent}${xml}\n` };
  }
  return { start: element.contentEnd, end: element.contentEnd, text: xml };
}

/** Entfernt ein Element samt seiner Zeile, wenn es allein in seiner Zeile steht. */
export function removeElement(source: string, element: XmlElement): TextEdit {
  let start = element.start;
  let end = element.end;
  const lineStart = source.lastIndexOf('\n', start - 1) + 1;
  const before = source.slice(lineStart, start);
  const after = source.slice(end, source.indexOf('\n', end) < 0 ? source.length : source.indexOf('\n', end));
  if (before.trim() === '' && after.trim() === '') {
    start = lineStart;
    end = source.indexOf('\n', end) < 0 ? source.length : source.indexOf('\n', end) + 1;
  }
  return { start, end, text: '' };
}

/** Einrückung (Leerzeichen und Tabulatoren) der Zeile, in der das Element beginnt. */
export function indentOf(source: string, element: XmlElement): string {
  const lineStart = source.lastIndexOf('\n', element.start - 1) + 1;
  const m = /^[ \t]*/.exec(source.slice(lineStart, element.start));
  return m ? m[0] : '';
}
