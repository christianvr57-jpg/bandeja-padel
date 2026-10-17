/**
 * Sustituye a demo/backend.ts fuera del modo demo (ver vite.config.ts), para
 * que el build normal no incluya PGlite ni el código del servidor.
 */
export type DemoStatus = 'starting' | 'seeding' | 'ready' | 'locked';

export function onDemoStatus(fn: (s: DemoStatus) => void): () => void {
  fn('ready');
  return () => undefined;
}

export function demoFetch(): Promise<Response> {
  return Promise.reject(new Error('El modo demo no está activo en esta versión.'));
}

export async function resetDemo(): Promise<void> {
  /* sin efecto fuera de la demo */
}
