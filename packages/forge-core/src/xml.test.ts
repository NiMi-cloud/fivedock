import { describe, expect, it } from 'vitest';
import { XmlError, child, childText, childrenNamed, descendants, parseXml } from './xml.ts';

describe('parseXml', () => {
  it('liest Elemente, Attribute, Text und selbstschließende Elemente', () => {
    const root = parseXml(`<?xml version="1.0" encoding="UTF-8"?>
<!-- Kommentar -->
<Wurzel a="1">
  <Item type='x'>Text &amp; mehr</Item>
  <Leer />
  <Zahl value="4.5"/>
</Wurzel>`);
    expect(root.name).toBe('Wurzel');
    expect(root.attributes).toEqual({ a: '1' });
    expect(root.children.map((c) => c.name)).toEqual(['Item', 'Leer', 'Zahl']);
    expect(child(root, 'Item')).toMatchObject({ text: 'Text & mehr', attributes: { type: 'x' } });
    expect(child(root, 'Zahl')!.attributes['value']).toBe('4.5');
    expect(child(root, 'Leer')!.children).toEqual([]);
    expect(childText(root, 'Item')).toBe('Text & mehr');
    expect(childText(root, 'Fehlt', 'ersatz')).toBe('ersatz');
  });

  it('verträgt eine Bytefolge-Marke am Anfang, CDATA und ">" in Attributen', () => {
    const root = parseXml('﻿<a><b x="1>2"><![CDATA[<roh>]]></b></a>');
    expect(child(root, 'b')).toMatchObject({ text: '<roh>', attributes: { x: '1>2' } });
  });

  it('findet Kinder und Nachkommen', () => {
    const root = parseXml('<a><i>1</i><b><i>2</i><c><i>3</i></c></b><i>4</i></a>');
    expect(childrenNamed(root, 'i').map((e) => e.text)).toEqual(['1', '4']);
    expect(descendants(root, 'i').map((e) => e.text).sort()).toEqual(['1', '2', '3', '4']);
  });

  it('merkt sich die Zeile jedes Elements', () => {
    const root = parseXml('<a>\n  <b>\n    <c/>\n  </b>\n</a>');
    expect(root.line).toBe(1);
    expect(child(root, 'b')!.line).toBe(2);
    expect(child(child(root, 'b')!, 'c')!.line).toBe(3);
  });

  it('meldet falsch verschachtelte, nicht geschlossene und doppelte Wurzeln mit Zeile', () => {
    expect(() => parseXml('<a>\n<b></a>')).toThrow(XmlError);
    expect(() => parseXml('<a>\n<b></a>')).toThrow(/Zeile 2/);
    expect(() => parseXml('<a><b></b>')).toThrow(/<a> ist nicht geschlossen/);
    expect(() => parseXml('<a></a><b></b>')).toThrow(/Wurzel/);
    expect(() => parseXml('')).toThrow(XmlError);
    expect(() => parseXml('<a><!-- offen')).toThrow(/Kommentar/);
  });

  it('ist auch bei großen Dateien schnell (Zeilen werden mitgezählt)', () => {
    const body = Array.from({ length: 20000 }, (_, i) => `  <Item><v value="${i}"/></Item>`).join('\n');
    const started = performance.now();
    const root = parseXml(`<r>\n${body}\n</r>`);
    expect(root.children).toHaveLength(20000);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
