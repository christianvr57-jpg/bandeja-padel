/**
 * Criptografía con Web Crypto (disponible en Node 20+ y en navegadores), para
 * que la misma API funcione en el servidor y en la demo del navegador.
 */
const subtle = globalThis.crypto.subtle;
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Token aleatorio de 256 bits en base64url (43 caracteres). */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return toBase64Url(buf);
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = new Uint8Array(await subtle.digest('SHA-256', encoder.encode(input)));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Comparación en tiempo constante. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await subtle.importKey('raw', encoder.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

/**
 * PBKDF2-HMAC-SHA256 con sal aleatoria (600.000 iteraciones, recomendación OWASP).
 * Formato: pbkdf2$<iteraciones>$<sal>$<hash>.
 */
export async function hashPassword(password: string, iterations = 600_000): Promise<string> {
  const salt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(salt);
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2$${iterations}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const computed = await pbkdf2(password, fromBase64Url(salt), Number(iter));
  return timingSafeEqual(computed, fromBase64Url(hash));
}
