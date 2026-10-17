/**
 * Backend de la demo (GitHub Pages): la misma API Hono del servidor, ejecutada
 * dentro del navegador sobre PGlite (PostgreSQL en WebAssembly) persistido en
 * IndexedDB. Cada visitante tiene su propia copia de los datos.
 */
import { PGlite } from '@electric-sql/pglite';
import { count } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { createApi } from '@server/app';
import { migrate, schema, type DB } from '@server/db';
import { createMailer } from '@server/lib/mailer';
import { seedDemo } from '@server/seed';

const DB_NAME = 'bandeja-demo-v1';

type Handler = (req: Request) => Promise<Response>;
let ready: Promise<Handler> | null = null;
let client: PGlite | null = null;

export type DemoStatus = 'starting' | 'seeding' | 'ready' | 'locked';
const listeners = new Set<(s: DemoStatus) => void>();
let status: DemoStatus = 'starting';
function setStatus(s: DemoStatus) {
  status = s;
  listeners.forEach((l) => l(s));
}
export function onDemoStatus(fn: (s: DemoStatus) => void): () => void {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}

/** PGlite no admite que dos pestañas abran la misma base de datos: se reserva con la Web Locks API. */
async function acquireTabLock(): Promise<boolean> {
  if (!('locks' in navigator)) return true;
  return new Promise((resolve) => {
    navigator.locks
      .request(DB_NAME, { ifAvailable: true }, (lock) => {
        resolve(!!lock);
        return lock ? new Promise(() => undefined) : undefined;
      })
      .catch(() => resolve(true));
  });
}

async function boot(): Promise<Handler> {
  if (!(await acquireTabLock())) {
    setStatus('locked');
    throw new Error('La demo ya está abierta en otra pestaña de este navegador. Ciérrala para usarla aquí.');
  }
  client = new PGlite(`idb://${DB_NAME}`);
  const db = drizzle(client, { schema }) as unknown as DB;
  await migrate(db);
  const deps = {
    db,
    config: {
      mode: 'demo' as const,
      authMode: 'bearer' as const,
      secureCookies: false,
      linkFor: (path: string) => `${location.origin}${location.pathname}#${path}`,
      passwordIterations: 100_000,
      exposeOutbox: true,
    },
    mailer: createMailer({ storeBodies: true }),
    clientIp: () => 'navegador-demo',
    now: () => new Date(),
  };
  const [clubs] = await db.select({ n: count() }).from(schema.clubs);
  if (!Number(clubs?.n)) {
    setStatus('seeding');
    await seedDemo(deps);
  }
  const api = createApi(deps);
  setStatus('ready');
  return (req) => Promise.resolve(api.fetch(req));
}

export async function demoFetch(path: string, init: RequestInit): Promise<Response> {
  ready ??= boot();
  const handler = await ready;
  return handler(new Request(new URL(path, location.origin), init));
}

/** Borra todos los datos de la demo y recarga (vuelven a crearse los datos de ejemplo). */
export async function resetDemo(): Promise<void> {
  try {
    await client?.close();
  } catch {
    /* ya cerrada */
  }
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(`/pglite/${DB_NAME}`);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  try {
    localStorage.removeItem('bandeja.session');
  } catch {
    /* sin almacenamiento */
  }
  location.hash = '#/';
  location.reload();
}
