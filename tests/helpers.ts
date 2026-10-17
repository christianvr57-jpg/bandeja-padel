import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { createApi } from '@server/app';
import type { AppDeps } from '@server/context';
import { migrate, schema, type DB } from '@server/db';
import type { OutgoingEmail } from '@server/lib/mailer';
import { controlLetter } from '@shared/validation/dni';

export async function setupApi(overrides: Partial<AppDeps['config']> = {}) {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as DB;
  await migrate(db);
  const sent: OutgoingEmail[] = [];
  const deps: AppDeps = {
    db,
    config: {
      mode: 'server',
      authMode: 'bearer',
      secureCookies: false,
      linkFor: (p) => `https://bandeja.test${p}`,
      passwordIterations: 1000,
      exposeOutbox: false,
      ...overrides,
    },
    mailer: {
      async send(_db, email) {
        sent.push(email);
      },
    },
    clientIp: (c) => c.req.header('x-test-ip') ?? '10.0.0.1',
    now: () => new Date(),
  };
  const app = createApi(deps);

  async function call<T = any>(
    method: string,
    path: string,
    body?: unknown,
    opts: { token?: string; ip?: string; csrf?: boolean } = {},
  ): Promise<{ status: number; json: T; res: Response }> {
    const headers: Record<string, string> = {};
    if (opts.csrf !== false) headers['x-requested-with'] = 'bandeja';
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.ip) headers['x-test-ip'] = opts.ip;
    const res = await app.request(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.clone().text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, json, res };
  }

  return { deps, db, app, call, sent, close: () => client.close() };
}

let dniCounter = 20_000_000;
export function fakeDni(): string {
  const n = dniCounter++;
  return `${n}${controlLetter(n)}`;
}

let phoneCounter = 600_100_000;
export function fakePlayer(name = 'Jugador') {
  const dni = fakeDni();
  return {
    fullName: `${name} Prueba ${dni.slice(-4, -1)}`,
    email: `j${dni.toLowerCase()}@example.com`,
    phone: String(phoneCounter++),
    dni,
  };
}
