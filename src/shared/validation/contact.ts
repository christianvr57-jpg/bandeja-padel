/** Validación de teléfono español y email. */

export type PhoneValidation = { valid: true; value: string } | { valid: false; reason: string };

/**
 * Acepta móviles (6, 7) y fijos (8, 9) españoles de 9 cifras, con o sin
 * prefijo +34 / 0034, y con espacios, puntos, guiones o paréntesis.
 * Devuelve el número normalizado como "+34 612 345 678".
 */
export function validateSpanishPhone(input: string): PhoneValidation {
  let digits = (input ?? '').replace(/[\s.\-()]/g, '');
  if (!digits) return { valid: false, reason: 'Introduce un teléfono.' };
  if (digits.startsWith('+34')) digits = digits.slice(3);
  else if (digits.startsWith('0034')) digits = digits.slice(4);
  else if (digits.length === 11 && digits.startsWith('34')) digits = digits.slice(2);

  if (!/^[6789]\d{8}$/.test(digits)) {
    return { valid: false, reason: 'Teléfono español no válido (9 cifras, empieza por 6, 7, 8 o 9).' };
  }
  return { valid: true, value: `+34 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` };
}

export type EmailValidation = { valid: true; value: string } | { valid: false; reason: string };

const EMAIL_RE = /^[^\s@"<>(),;:]+@[^\s@"<>(),;:]+\.[a-z]{2,}$/i;

export function validateEmail(input: string): EmailValidation {
  const value = (input ?? '').trim().toLowerCase();
  if (!value) return { valid: false, reason: 'Introduce un email.' };
  if (value.length > 254 || !EMAIL_RE.test(value) || value.includes('..')) {
    return { valid: false, reason: 'Email no válido.' };
  }
  return { valid: true, value };
}

/** Normaliza nombres: recorta y colapsa espacios. */
export function normalizeName(input: string): string {
  return (input ?? '').trim().replace(/\s+/g, ' ');
}
