import { describe, expect, it } from 'vitest';
import { XmlEditError, appendChild, applyEdits, indentOf, removeElement, replaceElement, setAttribute, setContent } from './xml-edit.ts';
import { child, childrenNamed, parseXml } from './xml.ts';

const SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<Root>
  <!-- Kommentar bleibt -->
  <fMass value="2104.000000" />
  <name>20FPIU</name>
  <flags />
  <list>
    <Item>a</Item>
    <Item>b</Item>
  </list>
</Root>
`;

describe('Positionen im XML-Leser', () => {
  it('liefert Bereiche für Elemente, Inhalt und Attributwerte', () => {
    const root = parseXml(SOURCE);
    const mass = child(root, 'fMass')!;
    expect(SOURCE.slice(...mass.attributeSpans['value']!)).toBe('2104.000000');
    expect(SOURCE.slice(mass.start, mass.end)).toBe('<fMass value="2104.000000" />');
    const name = child(root, 'name')!;
    expect(SOURCE.slice(name.contentStart, name.contentEnd)).toBe('20FPIU');
    expect(SOURCE.slice(name.start, name.end)).toBe('<name>20FPIU</name>');
    expect(child(root, 'flags')!.selfClosing).toBe(true);
    expect(SOURCE.slice(root.start, root.end)).toBe(SOURCE.slice(SOURCE.indexOf('<Root>'), SOURCE.indexOf('</Root>') + 7));
  });

  it('rechnet auch mit einer Bytefolge-Marke am Anfang richtig', () => {
    const bom = `﻿${SOURCE}`;
    const mass = child(parseXml(bom), 'fMass')!;
    expect(bom.slice(...mass.attributeSpans['value']!)).toBe('2104.000000');
  });

  it('findet Attributwerte mit Einzelanführungszeichen und mehreren Attributen', () => {
    const src = `<a><b x='1' y="two" /></a>`;
    const b = child(parseXml(src), 'b')!;
    expect(src.slice(...b.attributeSpans['x']!)).toBe('1');
    expect(src.slice(...b.attributeSpans['y']!)).toBe('two');
  });
});

describe('Änderungen', () => {
  it('ändert nur den Attributwert, alles andere bleibt Zeichen für Zeichen', () => {
    const root = parseXml(SOURCE);
    const out = applyEdits(SOURCE, [setAttribute(child(root, 'fMass')!, 'value', '1500.5')]);
    expect(out).toBe(SOURCE.replace('2104.000000', '1500.5'));
  });

  it('ändert Text, auch bei selbstschließenden Elementen, und maskiert Sonderzeichen', () => {
    const root = parseXml(SOURCE);
    const out = applyEdits(SOURCE, [setContent(child(root, 'name')!, 'A & B <1>'), setContent(child(root, 'flags')!, 'FLAG_A FLAG_B')]);
    expect(out).toContain('<name>A &amp; B &lt;1&gt;</name>');
    expect(out).toContain('<flags >FLAG_A FLAG_B</flags>');
    const again = parseXml(out);
    expect(childText(again, 'name')).toBe('A & B <1>');
    expect(childText(again, 'flags')).toBe('FLAG_A FLAG_B');
  });

  it('mehrere Änderungen in beliebiger Reihenfolge überlappen sich nicht', () => {
    const root = parseXml(SOURCE);
    const items = childrenNamed(child(root, 'list')!, 'Item');
    const out = applyEdits(SOURCE, [setContent(items[1]!, 'zweitens'), setContent(items[0]!, 'erstens'), setAttribute(child(root, 'fMass')!, 'value', '1')]);
    expect(out).toContain('<Item>erstens</Item>');
    expect(out).toContain('<Item>zweitens</Item>');
    expect(out).toContain('value="1"');
  });

  it('meldet Änderungen, die sich überschneiden, und fehlende Attribute', () => {
    const root = parseXml(SOURCE);
    const list = child(root, 'list')!;
    const items = childrenNamed(list, 'Item');
    expect(() => applyEdits(SOURCE, [replaceElement(list, '<list/>'), setContent(items[0]!, 'x')])).toThrow(XmlEditError);
    expect(() => setAttribute(child(root, 'fMass')!, 'x', '1')).toThrow(XmlEditError);
    expect(() => setContent(list, 'x')).toThrow(XmlEditError);
  });

  it('hängt ein Kind an, auch an ein selbstschließendes Element, und entfernt ein Element samt Zeile', () => {
    const root = parseXml(SOURCE);
    const list = child(root, 'list')!;
    const indent = indentOf(SOURCE, childrenNamed(list, 'Item')[0]!);
    expect(indent).toBe('    ');
    const appended = applyEdits(SOURCE, [appendChild(SOURCE, list, '<Item>c</Item>', indent)]);
    expect(childrenNamed(child(parseXml(appended), 'list')!, 'Item').map((e) => e.text)).toEqual(['a', 'b', 'c']);
    expect(appended).toContain('    <Item>b</Item>\n    <Item>c</Item>\n  </list>');

    const filled = applyEdits(SOURCE, [appendChild(SOURCE, child(root, 'flags')!, '<Item>x</Item>', '    ')]);
    expect(child(parseXml(filled), 'flags')!.children).toHaveLength(1);

    const removed = applyEdits(SOURCE, [removeElement(SOURCE, childrenNamed(list, 'Item')[0]!)]);
    expect(removed).not.toContain('<Item>a</Item>');
    expect(removed).toContain('  <list>\n    <Item>b</Item>\n  </list>');
  });
});

function childText(root: ReturnType<typeof parseXml>, name: string): string {
  return child(root, name)?.text ?? '';
}
