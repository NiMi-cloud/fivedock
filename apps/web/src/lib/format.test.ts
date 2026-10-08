import { describe, expect, it } from 'vitest';
import { fill, formatBytes, savedPercent } from './format.ts';

describe('formatBytes', () => {
  it('wählt eine passende Einheit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.00 GB');
  });
});

describe('fill', () => {
  it('ersetzt Platzhalter und lässt unbekannte stehen', () => {
    expect(fill('{n} von {m}', { n: 2, m: 5 })).toBe('2 von 5');
    expect(fill('Hallo {name}', {})).toBe('Hallo {name}');
  });
});

describe('savedPercent', () => {
  it('rechnet die Ersparnis aus', () => {
    expect(savedPercent(1000, 250)).toBe(75);
    expect(savedPercent(0, 0)).toBe(0);
    expect(savedPercent(100, 100)).toBe(0);
  });
});
