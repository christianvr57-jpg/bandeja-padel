import { describe, expect, it } from 'vitest';
import { validateEmail, validateSpanishPhone } from '@shared/validation/contact';
import { controlLetter, maskDocument, normalizeDocument, validateDocument } from '@shared/validation/dni';

describe('DNI / NIE', () => {
  it('acepta DNIs con la letra de control correcta', () => {
    expect(validateDocument('12345678Z')).toEqual({ valid: true, value: '12345678Z', type: 'DNI' });
    expect(validateDocument('00000000T')).toMatchObject({ valid: true });
    expect(validateDocument('87654321X')).toMatchObject({ valid: true });
  });

  it('normaliza minúsculas, espacios, puntos y guiones', () => {
    expect(normalizeDocument(' 12.345.678-z ')).toBe('12345678Z');
    expect(validateDocument('12 345 678 z')).toMatchObject({ valid: true, value: '12345678Z' });
  });

  it('rechaza una letra de control incorrecta', () => {
    const r = validateDocument('12345678A');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toMatch(/letra/i);
  });

  it('acepta NIE con prefijo X, Y y Z', () => {
    expect(validateDocument('X1234567L')).toEqual({ valid: true, value: 'X1234567L', type: 'NIE' });
    expect(validateDocument('Y1234567X')).toMatchObject({ valid: true, type: 'NIE' });
    expect(validateDocument('Z1234567R')).toMatchObject({ valid: true, type: 'NIE' });
    expect(validateDocument('X1234567T').valid).toBe(false);
  });

  it('rechaza formatos incorrectos', () => {
    for (const bad of ['', '1234567Z', '123456789Z', 'A1234567L', 'X12345678L', '12345678', 'ABCDEFGHZ']) {
      expect(validateDocument(bad).valid, bad).toBe(false);
    }
  });

  it('calcula la letra de control para todo el rango de restos', () => {
    const letters = Array.from({ length: 23 }, (_, i) => controlLetter(i)).join('');
    expect(letters).toBe('TRWAGMYFPDXBNJZSQVHLCKE');
  });

  it('enmascara el documento dejando solo los 4 últimos caracteres', () => {
    expect(maskDocument('12345678Z')).toBe('•••••678Z');
  });
});

describe('Teléfono español', () => {
  it('acepta móviles y fijos con y sin prefijo', () => {
    expect(validateSpanishPhone('612345678')).toEqual({ valid: true, value: '+34 612 345 678' });
    expect(validateSpanishPhone('+34 612 34 56 78')).toEqual({ valid: true, value: '+34 612 345 678' });
    expect(validateSpanishPhone('0034-712-345-678')).toMatchObject({ valid: true, value: '+34 712 345 678' });
    expect(validateSpanishPhone('34912345678')).toMatchObject({ valid: true, value: '+34 912 345 678' });
    expect(validateSpanishPhone('(963) 123 456')).toMatchObject({ valid: true });
  });

  it('rechaza números no españoles o mal formados', () => {
    for (const bad of ['', '512345678', '61234567', '6123456789', '+33 612345678', 'teléfono']) {
      expect(validateSpanishPhone(bad).valid, bad).toBe(false);
    }
  });
});

describe('Email', () => {
  it('acepta y normaliza emails válidos', () => {
    expect(validateEmail('  Ana.Garcia@Example.COM ')).toEqual({ valid: true, value: 'ana.garcia@example.com' });
    expect(validateEmail('a+torneo@club-padel.es').valid).toBe(true);
  });

  it('rechaza emails no válidos', () => {
    for (const bad of ['', 'ana', 'ana@', '@example.com', 'ana@example', 'ana garcia@example.com', 'a..b@example.com']) {
      expect(validateEmail(bad).valid, bad).toBe(false);
    }
  });
});
