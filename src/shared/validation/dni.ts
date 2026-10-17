/**
 * Validación de documentos de identidad españoles (DNI y NIE).
 *
 * - DNI: 8 dígitos + letra de control.
 * - NIE: X, Y o Z + 7 dígitos + letra de control. Para calcular la letra se
 *   sustituye la letra inicial por 0, 1 o 2 respectivamente.
 *
 * La letra de control es LETTERS[número % 23].
 */
const LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const NIE_PREFIX: Record<string, string> = { X: '0', Y: '1', Z: '2' };

export type DocumentType = 'DNI' | 'NIE';

export type DocumentValidation =
  | { valid: true; value: string; type: DocumentType }
  | { valid: false; reason: string };

/** Quita espacios, puntos y guiones y pasa a mayúsculas: "12.345.678-z" -> "12345678Z". */
export function normalizeDocument(input: string): string {
  return input.toUpperCase().replace(/[\s.\-]/g, '');
}

export function controlLetter(number: number): string {
  return LETTERS[number % 23]!;
}

export function validateDocument(input: string): DocumentValidation {
  const value = normalizeDocument(input ?? '');
  if (!value) return { valid: false, reason: 'Introduce el DNI o NIE.' };

  let digits: string;
  let type: DocumentType;
  if (/^\d{8}[A-Z]$/.test(value)) {
    digits = value.slice(0, 8);
    type = 'DNI';
  } else if (/^[XYZ]\d{7}[A-Z]$/.test(value)) {
    digits = NIE_PREFIX[value[0]!]! + value.slice(1, 8);
    type = 'NIE';
  } else {
    return {
      valid: false,
      reason: 'Formato no válido. Ejemplos: 12345678Z (DNI) o X1234567L (NIE).',
    };
  }

  const expected = controlLetter(Number(digits));
  if (value[8] !== expected) {
    return { valid: false, reason: 'La letra del documento no es correcta.' };
  }
  return { valid: true, value, type };
}

export function isValidDocument(input: string): boolean {
  return validateDocument(input).valid;
}

/** "12345678Z" -> "•••••678Z". Para mostrar el documento sin exponerlo entero. */
export function maskDocument(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '•'.repeat(value.length);
  return '•'.repeat(value.length - 4) + value.slice(-4);
}
