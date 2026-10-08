import { describe, expect, it } from 'vitest';
import { hasAddress, missingLegalFields, readOperator, variableName } from './legal.config.ts';

describe('Betreiberangaben', () => {
  it('liest sie aus VITE_OPERATOR_* und schneidet Leerraum ab', () => {
    const operator = readOperator({
      VITE_OPERATOR_NAME: '  Erika Muster ',
      VITE_OPERATOR_STREET: 'Musterweg 1',
      VITE_OPERATOR_CITY: '12345 Musterstadt',
      VITE_OPERATOR_EMAIL: 'kontakt@example.org',
      VITE_OPERATOR_PHONE: '',
    });
    expect(operator).toEqual({ name: 'Erika Muster', street: 'Musterweg 1', city: '12345 Musterstadt', country: 'Deutschland', email: 'kontakt@example.org', phone: '' });
    expect(missingLegalFields(operator)).toEqual([]);
    expect(hasAddress(operator)).toBe(true);
  });

  it('meldet jedes fehlende Pflichtfeld, Anschrift, Land und Telefon sind freiwillig', () => {
    expect(missingLegalFields(readOperator({}))).toEqual(['name', 'email']);
    expect(missingLegalFields(readOperator({ VITE_OPERATOR_NAME: 'NiMi' }))).toEqual(['email']);
    const withoutAddress = readOperator({ VITE_OPERATOR_NAME: 'NiMi', VITE_OPERATOR_EMAIL: 'a@b.de' });
    expect(missingLegalFields(withoutAddress)).toEqual([]);
    expect(hasAddress(withoutAddress)).toBe(false);
    // eine halbe Anschrift zählt nicht als Anschrift
    expect(hasAddress(readOperator({ VITE_OPERATOR_STREET: 'Weg 1' }))).toBe(false);
  });

  it('nimmt ein anderes Land, wenn eines gesetzt ist', () => {
    expect(readOperator({ VITE_OPERATOR_COUNTRY: 'Österreich' }).country).toBe('Österreich');
  });

  it('nennt die Variable zu einem Feld', () => {
    expect(variableName('email')).toBe('VITE_OPERATOR_EMAIL');
  });
});
