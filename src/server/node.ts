/**
 * Servidor Node: sirve la API (/api) y la web compilada (dist/web).
 *
 * Variables de entorno:
 *   PORT           Puerto (por defecto 3000).
 *   DATABASE_URL   PostgreSQL. Si no se define, usa PGlite en ./.data (cómodo en local).
 *   PUBLIC_URL     URL pública para los enlaces de los emails (en Render se detecta sola).
 *   SEED_DEMO      "false" para no crear los datos de demostración con la BD vacía.
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM   Envío de emails (opcional).
 */
import { mkdirSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Hono } from 'hono';
import nodemailer from 'nodemailer';
import pg from 'pg';
import { createApi } from './app';
import type { AppDeps } from './context';
import { migrate, schema, type DB } from './db';
import { createMailer, type MailTransport } from './lib/mailer';
import { pruneRateLimits } from './lib/rate-limit';
import { seedIfEmpty } from './seed';

const env = process.env;
const port = Number(env.PORT ?? 3000);
const publicUrl = (env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/+$/, '');
const behindProxy = !!(env.RENDER || env.TRUST_PROXY === 'true');

function createDb(): { db: DB; label: string } {
  if (env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5 });
    return { db: drizzlePg(pool, { schema }) as unknown as DB, label: 'PostgreSQL' };
  }
  mkdirSync('.data', { recursive: true });
  const client = new PGlite('.data/pglite');
  return { db: drizzlePglite(client, { schema }) as unknown as DB, label: 'PGlite (.data/pglite)' };
}

function createTransport(): MailTransport | undefined {
  if (!env.SMTP_HOST) return undefined;
  const smtpPort = Number(env.SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return async (msg) => {
    await transporter.sendMail({ from: env.MAIL_FROM || env.SMTP_USER, ...msg });
  };
}

async function main() {
  const { db, label } = createDb();
  await migrate(db);

  const transport = createTransport();
  const deps: AppDeps = {
    db,
    config: {
      mode: 'server',
      authMode: 'cookie',
      secureCookies: publicUrl.startsWith('https://'),
      linkFor: (path) => `${publicUrl}${path}`,
      passwordIterations: 600_000,
      exposeOutbox: false,
    },
    mailer: createMailer({ transport, storeBodies: false }),
    clientIp: (c) => {
      if (behindProxy) {
        const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
        if (forwarded) return forwarded;
      }
      try {
        return getConnInfo(c).remote.address ?? 'desconocida';
      } catch {
        return 'desconocida';
      }
    },
    now: () => new Date(),
  };

  if (env.SEED_DEMO !== 'false' && (await seedIfEmpty(deps))) console.log('Datos de demostración creados.');
  setInterval(() => void pruneRateLimits(db).catch(() => undefined), 3_600_000).unref();

  const app = new Hono();
  app.route('/', createApi(deps));

  // Cabeceras de seguridad para la web.
  app.use('*', async (c, next) => {
    await next();
    if (c.req.path.startsWith('/api')) return;
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  });
  app.use(
    '/assets/*',
    serveStatic({
      root: './dist/web',
      onFound: (_path, c) => {
        c.header('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );
  app.use('*', serveStatic({ root: './dist/web' }));
  // SPA: cualquier otra ruta devuelve index.html y el enrutado lo hace el navegador.
  app.get('*', serveStatic({ path: './dist/web/index.html' }));

  serve({ fetch: app.fetch, port }, () => {
    console.log(`Bandeja escuchando en http://localhost:${port} · BD: ${label} · URL pública: ${publicUrl}`);
    if (!transport) console.log('SMTP no configurado: los emails se registran pero no se envían.');
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
