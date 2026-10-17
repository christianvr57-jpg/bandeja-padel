import { and, eq, gt } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { AppEnv, SessionClub } from '../context';
import { clubs, sessions } from '../db/schema';
import { hashPassword, randomToken, sha256Hex, verifyPassword } from '../lib/crypto';
import { HttpError, conflict, parse } from '../lib/http';
import { rateLimit } from '../lib/rate-limit';
import { loginSchema, signupSchema } from '../schemas';
import { readJson } from './util';

export const SESSION_COOKIE = 'bandeja_sid';
const SESSION_DAYS = 30;
let dummyHash: Promise<string> | null = null;

function tokenFrom(c: Context<AppEnv>): string | null {
  const auth = c.req.header('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim() || null;
  return getCookie(c, SESSION_COOKIE) ?? null;
}

/** Carga el club de la sesión (si la hay) en c.var.club. */
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set('club', null);
  c.set('sessionToken', null);
  const token = tokenFrom(c);
  if (token && token.length < 200) {
    const { db } = c.var.deps;
    const [row] = await db
      .select({ id: clubs.id, name: clubs.name, email: clubs.email, city: clubs.city })
      .from(sessions)
      .innerJoin(clubs, eq(sessions.clubId, clubs.id))
      .where(and(eq(sessions.id, await sha256Hex(token)), gt(sessions.expiresAt, c.var.deps.now())));
    if (row) {
      c.set('club', row);
      c.set('sessionToken', token);
    }
  }
  await next();
});

export const requireClub = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.club) throw new HttpError(401, 'Inicia sesión para continuar.');
  await next();
});

export function currentClub(c: Context<AppEnv>): SessionClub {
  const club = c.var.club;
  if (!club) throw new HttpError(401, 'Inicia sesión para continuar.');
  return club;
}

async function startSession(c: Context<AppEnv>, clubId: string) {
  const { db, config, now } = c.var.deps;
  const token = randomToken();
  const expiresAt = new Date(now().getTime() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: await sha256Hex(token), clubId, expiresAt });
  if (config.authMode === 'cookie') {
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: 'Lax',
      path: '/',
      expires: expiresAt,
    });
    return null;
  }
  return token;
}

export const authRoutes = new Hono<AppEnv>()
  .post('/signup', async (c) => {
    const { db, config, clientIp } = c.var.deps;
    await rateLimit(db, 'signup', clientIp(c), 5, 3600);
    const body = parse(signupSchema, await readJson(c));
    const [exists] = await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.email, body.email));
    if (exists) throw conflict('Ya existe un club con ese email.', { email: 'Ya existe un club con ese email.' });
    const [club] = await db
      .insert(clubs)
      .values({
        name: body.clubName,
        city: body.city,
        email: body.email,
        passwordHash: await hashPassword(body.password, config.passwordIterations),
      })
      .returning({ id: clubs.id, name: clubs.name, email: clubs.email, city: clubs.city });
    const token = await startSession(c, club!.id);
    return c.json({ club, token }, 201);
  })
  .post('/login', async (c) => {
    const { db, clientIp } = c.var.deps;
    const body = parse(loginSchema, await readJson(c));
    await rateLimit(db, 'login-ip', clientIp(c), 20, 900);
    await rateLimit(db, 'login-email', body.email, 10, 900);
    const [club] = await db.select().from(clubs).where(eq(clubs.email, body.email));
    // Si el email no existe se verifica igualmente contra un hash ficticio: no se revela por tiempos.
    dummyHash ??= hashPassword('contraseña-ficticia', c.var.deps.config.passwordIterations);
    const ok = await verifyPassword(body.password, club?.passwordHash ?? (await dummyHash));
    if (!club || !ok) throw new HttpError(401, 'Email o contraseña incorrectos.');
    const token = await startSession(c, club.id);
    return c.json({ club: { id: club.id, name: club.name, email: club.email, city: club.city }, token });
  })
  .post('/logout', async (c) => {
    const token = c.var.sessionToken;
    if (token) await c.var.deps.db.delete(sessions).where(eq(sessions.id, await sha256Hex(token)));
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  })
  .get('/me', (c) => c.json({ club: c.var.club }));
