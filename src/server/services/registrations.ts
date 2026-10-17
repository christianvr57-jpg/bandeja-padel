import { and, asc, count, eq, inArray, ne } from 'drizzle-orm';
import { PRIVACY_VERSION } from '../../shared/api';
import { categoryLabel } from '../../shared/labels';
import type { AppDeps } from '../context';
import type { DB } from '../db';
import { categories, clubs, players, registrations } from '../db/schema';
import { cancelledEmail, promotedEmail, registrationEmail, type EmailContext } from '../emails';
import { randomToken, sha256Hex } from '../lib/crypto';
import { badRequest, conflict, notFound } from '../lib/http';
import type { CategoryRow, RegistrationRow, TournamentRow } from './access';
import { isInDraw } from './draws';

export interface PlayerInput {
  fullName: string;
  email: string;
  phone: string;
  dni: string;
}

export interface PlayerUpdate {
  fullName: string;
  email: string;
  phone: string;
  dni?: string;
}

type Tx = DB;

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

const DUPLICATE_MSG = 'Ya hay una inscripción activa con este DNI/NIE en esta categoría.';

export async function playersOf(db: DB, registrationId: string) {
  return db.select().from(players).where(eq(players.registrationId, registrationId)).orderBy(asc(players.position));
}

/** Posición en lista de espera de cada inscripción en espera de una categoría (1 = la primera). */
export async function waitlistPositions(db: DB, categoryId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: registrations.id })
    .from(registrations)
    .where(and(eq(registrations.categoryId, categoryId), eq(registrations.status, 'waitlist')))
    .orderBy(asc(registrations.createdAt), asc(registrations.id));
  return new Map(rows.map((r, i) => [r.id, i + 1]));
}

async function confirmedCount(db: Tx, categoryId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(registrations)
    .where(and(eq(registrations.categoryId, categoryId), eq(registrations.status, 'confirmed')));
  return Number(row?.n ?? 0);
}

async function emailContext(
  deps: AppDeps,
  tournament: TournamentRow,
  category: CategoryRow,
  registrationId: string,
  token: string | null,
): Promise<EmailContext> {
  const [club] = await deps.db.select({ name: clubs.name }).from(clubs).where(eq(clubs.id, tournament.clubId));
  const ps = await playersOf(deps.db, registrationId);
  return {
    to: ps.map((p) => p.email ?? '').filter(Boolean),
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    clubName: club?.name ?? '',
    startDate: tournament.startDate,
    endDate: tournament.endDate,
    categoryLabel: categoryLabel(category),
    players: ps.map((p) => p.fullName),
    manageUrl: token ? deps.config.linkFor(`/inscripcion/${token}`) : null,
    publicUrl: deps.config.linkFor(`/t/${tournament.slug}`),
    priceCents: tournament.priceCents,
  };
}

/**
 * Pasa parejas de la lista de espera a confirmadas mientras haya plazas libres
 * (y no se haya generado el cuadro). Rota el token para enviar un enlace nuevo.
 */
async function promoteWaitlist(tx: Tx, categoryId: string): Promise<Array<{ id: string; token: string | null }>> {
  const [cat] = await tx.select().from(categories).where(eq(categories.id, categoryId)).for('update');
  if (!cat || cat.drawGeneratedAt) return [];
  const free = cat.maxPairs - (await confirmedCount(tx, categoryId));
  if (free <= 0) return [];
  const waiting = await tx
    .select()
    .from(registrations)
    .where(and(eq(registrations.categoryId, categoryId), eq(registrations.status, 'waitlist')))
    .orderBy(asc(registrations.createdAt), asc(registrations.id))
    .limit(free);
  const out: Array<{ id: string; token: string | null }> = [];
  for (const w of waiting) {
    const token = w.tokenHash ? randomToken() : null;
    await tx
      .update(registrations)
      .set({ status: 'confirmed', tokenHash: token ? await sha256Hex(token) : null, updatedAt: new Date() })
      .where(eq(registrations.id, w.id));
    out.push({ id: w.id, token });
  }
  return out;
}

async function notifyPromoted(deps: AppDeps, tournament: TournamentRow, category: CategoryRow, promoted: Array<{ id: string; token: string | null }>) {
  for (const p of promoted) {
    await deps.mailer.send(deps.db, promotedEmail(await emailContext(deps, tournament, category, p.id, p.token)));
  }
}

/** Revisa la lista de espera tras un cambio de plazas (p. ej. al ampliar el límite de la categoría). */
export async function fillFromWaitlist(deps: AppDeps, tournament: TournamentRow, category: CategoryRow): Promise<void> {
  const promoted = await deps.db.transaction((tx) => promoteWaitlist(tx, category.id));
  await notifyPromoted(deps, tournament, category, promoted);
}

export async function createRegistration(
  deps: AppDeps,
  args: {
    tournament: TournamentRow;
    category: CategoryRow;
    players: [PlayerInput, PlayerInput];
    source: 'public' | 'club';
    paid?: boolean;
    notes?: string;
    sendEmail?: boolean;
  },
): Promise<{ id: string; token: string; status: 'confirmed' | 'waitlist'; waitlistPosition: number | null }> {
  const { db } = deps;
  const [p1, p2] = args.players;
  if (p1.dni === p2.dni) {
    throw badRequest('Los dos jugadores no pueden tener el mismo DNI/NIE.', {
      'player2.dni': 'Es el mismo DNI/NIE que el del jugador 1.',
    });
  }
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const now = deps.now();

  let created: { id: string; status: 'confirmed' | 'waitlist' };
  try {
    created = await db.transaction(async (tx) => {
      // Bloquea la categoría: serializa el cálculo de plazas entre inscripciones simultáneas.
      const [cat] = await tx.select().from(categories).where(eq(categories.id, args.category.id)).for('update');
      if (!cat) throw notFound('Categoría no encontrada.');
      if (cat.drawGeneratedAt) throw conflict('El cuadro de esta categoría ya está hecho: no se admiten más inscripciones.');

      const dup = await tx
        .select({ dni: players.dni })
        .from(players)
        .where(and(eq(players.categoryId, cat.id), eq(players.active, true), inArray(players.dni, [p1.dni, p2.dni])));
      if (dup.length) {
        const fields: Record<string, string> = {};
        if (dup.some((d) => d.dni === p1.dni)) fields['player1.dni'] = DUPLICATE_MSG;
        if (dup.some((d) => d.dni === p2.dni)) fields['player2.dni'] = DUPLICATE_MSG;
        throw conflict('Uno de los jugadores ya está inscrito en esta categoría.', fields);
      }

      const status = (await confirmedCount(tx, cat.id)) < cat.maxPairs ? 'confirmed' : 'waitlist';
      const [reg] = await tx
        .insert(registrations)
        .values({
          tournamentId: args.tournament.id,
          categoryId: cat.id,
          status,
          paid: args.paid ?? false,
          tokenHash,
          consentAt: now,
          consentVersion: PRIVACY_VERSION,
          notes: args.notes ?? '',
          source: args.source,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: registrations.id });
      await tx.insert(players).values(
        [p1, p2].map((p, i) => ({
          registrationId: reg!.id,
          categoryId: cat.id,
          position: i + 1,
          fullName: p.fullName,
          email: p.email,
          phone: p.phone,
          dni: p.dni,
        })),
      );
      return { id: reg!.id, status };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('Uno de los jugadores ya está inscrito en esta categoría.');
    throw err;
  }

  const waitlistPosition = created.status === 'waitlist' ? ((await waitlistPositions(db, args.category.id)).get(created.id) ?? null) : null;
  if (args.sendEmail !== false) {
    const ctx = await emailContext(deps, args.tournament, args.category, created.id, token);
    await deps.mailer.send(db, registrationEmail(ctx, created.status, waitlistPosition));
  }
  return { ...created, token, waitlistPosition };
}

export async function cancelRegistration(
  deps: AppDeps,
  ctx: { registration: RegistrationRow; tournament: TournamentRow; category: CategoryRow },
  byClub: boolean,
): Promise<void> {
  const { registration, tournament, category } = ctx;
  if (registration.status === 'cancelled') throw conflict('La inscripción ya estaba cancelada.');
  if (await isInDraw(deps.db, category, registration.id)) {
    throw conflict(
      byClub
        ? 'La pareja ya está en el cuadro. Si se retira, marca W.O. en sus partidos o borra el cuadro y vuelve a sortear.'
        : 'El cuadro ya está hecho: para darte de baja contacta con el club organizador.',
    );
  }
  const emailCtx = await emailContext(deps, tournament, category, registration.id, null);
  const promoted = await deps.db.transaction(async (tx) => {
    await tx
      .update(registrations)
      .set({ status: 'cancelled', cancelledAt: deps.now(), updatedAt: deps.now() })
      .where(eq(registrations.id, registration.id));
    await tx.update(players).set({ active: false }).where(eq(players.registrationId, registration.id));
    return registration.status === 'confirmed' ? promoteWaitlist(tx, category.id) : [];
  });
  await deps.mailer.send(deps.db, cancelledEmail(emailCtx, byClub));
  await notifyPromoted(deps, tournament, category, promoted);
}

/** Modifica los datos de la pareja comprobando que no se dupliquen DNIs en la categoría. */
export async function updateRegistrationPlayers(
  deps: AppDeps,
  registration: RegistrationRow,
  input: [PlayerUpdate, PlayerUpdate],
): Promise<void> {
  const current = await playersOf(deps.db, registration.id);
  if (current.length !== 2) throw notFound('Inscripción incompleta.');
  const next = input.map((p, i) => ({
    id: current[i]!.id,
    fullName: p.fullName,
    email: p.email,
    phone: p.phone,
    dni: p.dni ? p.dni : current[i]!.dni,
  }));
  if (next[0]!.dni && next[0]!.dni === next[1]!.dni) {
    throw badRequest('Los dos jugadores no pueden tener el mismo DNI/NIE.', {
      'player2.dni': 'Es el mismo DNI/NIE que el del jugador 1.',
    });
  }
  const dnis = next.map((p) => p.dni).filter((d): d is string => !!d);
  if (registration.status !== 'cancelled' && dnis.length) {
    const dup = await deps.db
      .select({ dni: players.dni })
      .from(players)
      .where(
        and(
          eq(players.categoryId, registration.categoryId),
          eq(players.active, true),
          ne(players.registrationId, registration.id),
          inArray(players.dni, dnis),
        ),
      );
    if (dup.length) {
      const fields: Record<string, string> = {};
      next.forEach((p, i) => {
        if (dup.some((d) => d.dni === p.dni)) fields[`player${i + 1}.dni`] = DUPLICATE_MSG;
      });
      throw conflict('Uno de los jugadores ya está inscrito en esta categoría.', fields);
    }
  }
  try {
    await deps.db.transaction(async (tx) => {
      for (const p of next) {
        await tx
          .update(players)
          .set({ fullName: p.fullName, email: p.email, phone: p.phone, dni: p.dni })
          .where(eq(players.id, p.id));
      }
      await tx.update(registrations).set({ updatedAt: deps.now() }).where(eq(registrations.id, registration.id));
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(DUPLICATE_MSG);
    throw err;
  }
}

/** Mueve una pareja a otra categoría del mismo torneo (a lista de espera si está llena). */
export async function moveRegistration(
  deps: AppDeps,
  ctx: { registration: RegistrationRow; tournament: TournamentRow; category: CategoryRow },
  targetCategoryId: string,
): Promise<void> {
  const { registration, tournament, category } = ctx;
  if (targetCategoryId === category.id) return;
  const [target] = await deps.db
    .select()
    .from(categories)
    .where(and(eq(categories.id, targetCategoryId), eq(categories.tournamentId, tournament.id)));
  if (!target) throw notFound('Categoría de destino no encontrada.');
  if (target.drawGeneratedAt) throw conflict('La categoría de destino ya tiene el cuadro hecho.');
  if (await isInDraw(deps.db, category, registration.id)) {
    throw conflict('La pareja ya está en el cuadro de su categoría actual: no se puede mover.');
  }
  const ps = await playersOf(deps.db, registration.id);
  const dnis = ps.map((p) => p.dni).filter((d): d is string => !!d);

  let promoted: Array<{ id: string; token: string | null }> = [];
  try {
    promoted = await deps.db.transaction(async (tx) => {
      const [locked] = await tx.select().from(categories).where(eq(categories.id, target.id)).for('update');
      if (!locked) throw notFound('Categoría de destino no encontrada.');
      if (registration.status !== 'cancelled' && dnis.length) {
        const dup = await tx
          .select({ id: players.id })
          .from(players)
          .where(and(eq(players.categoryId, target.id), eq(players.active, true), inArray(players.dni, dnis)));
        if (dup.length) throw conflict('Uno de los jugadores ya está inscrito en la categoría de destino.');
      }
      let status = registration.status;
      if (status !== 'cancelled') {
        status = (await confirmedCount(tx, target.id)) < locked.maxPairs ? 'confirmed' : 'waitlist';
      }
      await tx
        .update(registrations)
        .set({ categoryId: target.id, status, seed: null, updatedAt: deps.now() })
        .where(eq(registrations.id, registration.id));
      await tx.update(players).set({ categoryId: target.id }).where(eq(players.registrationId, registration.id));
      return registration.status === 'confirmed' ? promoteWaitlist(tx, category.id) : [];
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('Uno de los jugadores ya está inscrito en la categoría de destino.');
    throw err;
  }
  await notifyPromoted(deps, tournament, category, promoted);
}

export async function setSeed(db: DB, registration: RegistrationRow, seed: number | null): Promise<void> {
  if (seed != null) {
    const [other] = await db
      .select({ id: registrations.id })
      .from(registrations)
      .where(
        and(
          eq(registrations.categoryId, registration.categoryId),
          eq(registrations.seed, seed),
          ne(registrations.id, registration.id),
          ne(registrations.status, 'cancelled'),
        ),
      );
    if (other) throw conflict(`Ya hay otra pareja con la cabeza de serie nº ${seed} en esta categoría.`);
  }
  await db.update(registrations).set({ seed, updatedAt: new Date() }).where(eq(registrations.id, registration.id));
}

/** Busca una inscripción por su enlace privado. */
export async function findByToken(db: DB, token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const hash = await sha256Hex(token);
  const [reg] = await db.select().from(registrations).where(eq(registrations.tokenHash, hash));
  return reg ?? null;
}
