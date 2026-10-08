import { describe, expect, it } from 'vitest';
import { joaat } from './jenkins.ts';

describe('joaat', () => {
  it('liefert den bekannten Hash des Fahrzeugs "adder"', () => {
    expect(joaat('adder')).toBe(0xb779a091);
  });

  it('stimmt mit dem Hash im Referenz-YTD überein (aus CodeWalker-Ausgabe)', () => {
    // Im Referenz-YTD stehen die Bytes b7 ad b7 c8 (Little Endian) für "forge_cube_diffuse".
    expect(joaat('forge_cube_diffuse')).toBe(0xc8b7adb7);
  });

  it('ignoriert Groß- und Kleinschreibung', () => {
    expect(joaat('ADDER')).toBe(joaat('adder'));
    expect(joaat('Forge_Cube')).toBe(joaat('forge_cube'));
  });

  it('liefert für den leeren String 0', () => {
    expect(joaat('')).toBe(0);
  });
});
