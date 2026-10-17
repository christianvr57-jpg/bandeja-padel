import { and, asc, count, desc, eq, inArray, or } from 'drizzle-orm';
import { Hono } from 'hono';
import type {
  ManagedRegistration,
  OutboxEmail,
  PublicTournamentView,
  RegistrationResult,
  RegistrationStatus,
  TournamentListItem,
} from '../../shared/api';
import { numberMatches, roundLabelFor } from '../../shared/draw/numbering';
import { formatScore } from '../../shared/draw/score';
import type { MatchStatus, Phase } from '../../shared/draw/types';
import { categoryLabel } from '../../shared/labels';
import { maskDocument } from '../../shared/validation/dni';
import type { AppEnv } from '../context';
import { categories, clubs, courts, emails, matches, players, registrations, tournaments } from '../db/schema';
import { badRequest, conflict, notFound, parse } from '../lib/http';
import { rateLimit } from '../lib/rate-limit';
import { publicRegistrationSchema, updateRegistrationPlayersSchema } from '../schemas';
import { registrationOpen, type TournamentRow } from '../services/access';
import { isInDraw, rowResult, rowsToDef } from '../services/draws';
import {
  cancelRegistration,
  createRegistration,
  findByToken,
  playersOf,
  updateRegistrationPlayers,
  waitlistPositions,
} from '../services/registrations';
import { competitionData, courtsOf, tournamentInfo, tournamentOpen } from '../services/views';
import { readJson } from './util';

async function bySlug(c: { var: AppEnv['Variables'] }, slug: string, allowOwnerDraft: boolean): Promise<TournamentRow> {
  const { db } = c.var.deps;
  const [t] = await db.select().from(tournaments).where(eq(tournaments.slug, slug.slice(0, 80)));
  if (!t) throw notFound('Torneo no encontrado.');
  if (t.status === 'draft' && !(allowOwnerDraft && c.var.club?.id === t.clubId)) throw notFound('Torneo no encontrado.');
  return t;
}

async function managedContext(c: { var: AppEnv['Variables'] }, token: string) {
  const { db } = c.var.deps;
  const reg = await findByToken(db, token);
  if (!reg) throw notFound('Este enlace no es válido o la inscripción ya no existe.');
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, reg.tournamentId));
  const [cat] = await db.select().from(categories).where(eq(categories.id, reg.categoryId));
  if (!t || !cat) throw notFound('Inscripción no encontrada.');
  return { registration: reg, tournament: t, category: cat };
}

export const publicRoutes = new Hono<AppEnv>()
  .get('/tournaments', async (c) => {
    const { db, now } = c.var.deps;
    const list = await db
      .select({ t: tournaments, clubName: clubs.name, clubCity: clubs.city })
      .from(tournaments)
      .innerJoin(clubs, eq(tournaments.clubId, clubs.id))
      .where(or(eq(tournaments.status, 'published'), eq(tournaments.status, 'finished')))
      .orderBy(desc(tournaments.startDate))
      .limit(50);
    const today = now().toISOString().slice(0, 10);
    const items: TournamentListItem[] = [];
    for (const { t, clubName, clubCity } of list) {
      const [cats] = await db.select({ n: count() }).from(categories).where(eq(categories.tournamentId, t.id));
      const [pairs] = await db
        .select({ n: count() })
        .from(registrations)
        .where(and(eq(registrations.tournamentId, t.id), eq(registrations.status, 'confirmed')));
      items.push({
        id: t.id,
        slug: t.slug,
        name: t.name,
        startDate: t.startDate,
        endDate: t.endDate,
        venue: t.venue,
        status: t.status as TournamentListItem['status'],
        clubName,
        clubCity,
        categoriesCount: Number(cats?.n ?? 0),
        pairsCount: Number(pairs?.n ?? 0),
        registrationOpen: tournamentOpen(t, now()),
      });
    }
    // Primero los que están en juego o por venir (los más próximos antes); después los pasados.
    const upcoming = items.filter((i) => i.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const past = items.filter((i) => i.endDate < today);
    return c.json([...upcoming, ...past]);
  })

  .get('/tournaments/:slug', async (c) => {
    const t = await bySlug(c, c.req.param('slug'), true);
    const data = await competitionData(c.var.deps, t);
    const view: PublicTournamentView = {
      tournament: await tournamentInfo(c.var.deps, t),
      preview: t.status === 'draft',
      courts: await courtsOf(c.var.deps, t.id),
      categories: data.categories,
    };
    return c.json(view);
  })

  .post('/tournaments/:slug/registrations', async (c) => {
    const { db, clientIp, now, config } = c.var.deps;
    const t = await bySlug(c, c.req.param('slug'), false);
    await rateLimit(db, 'register', clientIp(c), 8, 600);
    const body = parse(publicRegistrationSchema, await readJson(c));
    // Anti-spam: campo trampa relleno o formulario enviado en menos de 3 segundos.
    if (body.website) throw badRequest('No se ha podido procesar la inscripción.');
    if (body.elapsedMs !== undefined && body.elapsedMs < 3000) {
      throw badRequest('Has enviado el formulario demasiado rápido. Revisa los datos y vuelve a enviarlo.');
    }
    const [cat] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, body.categoryId), eq(categories.tournamentId, t.id)));
    if (!cat) throw badRequest('Categoría no encontrada.', { categoryId: 'Elige una categoría.' });
    if (!registrationOpen(t, cat, now())) throw conflict('Las inscripciones de esta categoría están cerradas.');

    const res = await createRegistration(c.var.deps, {
      tournament: t,
      category: cat,
      players: [body.player1, body.player2],
      source: 'public',
    });
    const managePath = `/inscripcion/${res.token}`;
    const out: RegistrationResult = {
      id: res.id,
      status: res.status,
      waitlistPosition: res.waitlistPosition,
      managePath,
      manageUrl: config.linkFor(managePath),
    };
    return c.json(out, 201);
  })

  .get('/registrations/:token', async (c) => {
    const { db, clientIp } = c.var.deps;
    await rateLimit(db, 'token', clientIp(c), 120, 600);
    const { registration: reg, tournament: t, category: cat } = await managedContext(c, c.req.param('token'));
    const [club] = await db.select({ name: clubs.name }).from(clubs).where(eq(clubs.id, t.clubId));
    const ps = await playersOf(db, reg.id);
    const inDraw = await isInDraw(db, cat, reg.id);
    const finished = t.status === 'finished';

    // Partidos de la pareja, con rival y horario.
    const allRows = await db.select().from(matches).where(eq(matches.categoryId, cat.id));
    const def = rowsToDef(cat, allRows);
    const numbers = numberMatches(def.matches);
    const mine = allRows.filter((m) => m.status !== 'bye' && (m.pairAId === reg.id || m.pairBId === reg.id));
    const opponentIds = mine.map((m) => (m.pairAId === reg.id ? m.pairBId : m.pairAId)).filter((x): x is string => !!x);
    const opponentPlayers = opponentIds.length
      ? await db
          .select({ registrationId: players.registrationId, fullName: players.fullName })
          .from(players)
          .where(inArray(players.registrationId, opponentIds))
          .orderBy(asc(players.position))
      : [];
    const courtRows = await db.select().from(courts).where(eq(courts.tournamentId, t.id));

    const out: ManagedRegistration = {
      id: reg.id,
      status: reg.status as RegistrationStatus,
      paid: reg.paid,
      createdAt: reg.createdAt.toISOString(),
      waitlistPosition: reg.status === 'waitlist' ? ((await waitlistPositions(db, cat.id)).get(reg.id) ?? null) : null,
      canEdit: reg.status !== 'cancelled' && !finished,
      canCancel: reg.status !== 'cancelled' && !inDraw && !finished,
      cancelBlockedReason:
        reg.status !== 'cancelled' && inDraw ? 'El cuadro ya está hecho: para darte de baja contacta con el club organizador.' : null,
      category: { id: cat.id, label: categoryLabel(cat) },
      tournament: {
        slug: t.slug,
        name: t.name,
        startDate: t.startDate,
        endDate: t.endDate,
        venue: t.venue,
        clubName: club?.name ?? '',
        priceCents: t.priceCents,
        timezone: t.timezone,
      },
      players: ps.map((p) => ({
        fullName: p.fullName,
        email: p.email ?? '',
        phone: p.phone ?? '',
        dniMasked: p.dni ? maskDocument(p.dni) : '',
      })),
      matches: mine
        .map((m) => {
          const isA = m.pairAId === reg.id;
          const oppId = isA ? m.pairBId : m.pairAId;
          return {
            number: numbers.get(m.key) ?? 0,
            roundLabel: roundLabelFor({ phase: m.phase as Phase, round: m.round }, def.matches),
            scheduledAt: m.scheduledAt?.toISOString() ?? null,
            courtName: courtRows.find((x) => x.id === m.courtId)?.name ?? null,
            opponent: oppId ? opponentPlayers.filter((p) => p.registrationId === oppId).map((p) => p.fullName) : null,
            score: formatScore(rowResult(m), !isA),
            status: m.status as MatchStatus,
          };
        })
        .sort((a, b) => a.number - b.number),
    };
    return c.json(out);
  })

  .put('/registrations/:token', async (c) => {
    const { db, clientIp } = c.var.deps;
    await rateLimit(db, 'token-write', clientIp(c), 30, 600);
    const { registration, tournament } = await managedContext(c, c.req.param('token'));
    if (registration.status === 'cancelled') throw conflict('La inscripción está cancelada.');
    if (tournament.status === 'finished') throw conflict('El torneo ha finalizado.');
    const body = parse(updateRegistrationPlayersSchema, await readJson(c));
    await updateRegistrationPlayers(c.var.deps, registration, [body.player1, body.player2]);
    return c.json({ ok: true });
  })

  .post('/registrations/:token/cancel', async (c) => {
    const { db, clientIp } = c.var.deps;
    await rateLimit(db, 'token-write', clientIp(c), 30, 600);
    const ctx = await managedContext(c, c.req.param('token'));
    if (ctx.tournament.status === 'finished') throw conflict('El torneo ha finalizado.');
    await cancelRegistration(c.var.deps, ctx, false);
    return c.json({ ok: true });
  })

  // Bandeja de "emails enviados": solo existe en la demo, donde no se envían emails reales.
  .get('/outbox', async (c) => {
    if (!c.var.deps.config.exposeOutbox) throw notFound();
    const rows = await c.var.deps.db.select().from(emails).orderBy(desc(emails.createdAt)).limit(50);
    const out: OutboxEmail[] = rows.map((r) => ({
      id: r.id,
      toEmail: r.toEmail,
      subject: r.subject,
      kind: r.kind,
      body: r.body,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }));
    return c.json(out);
  });
