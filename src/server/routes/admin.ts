import { and, count, desc, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AdminCompetitionView, TournamentListItem } from '../../shared/api';
import { zonedLocalToUtc } from '../../shared/time';
import type { AppEnv } from '../context';
import { categories, registrations, tournaments } from '../db/schema';
import { badRequest, conflict, parse } from '../lib/http';
import {
  adminRegistrationPatchSchema,
  autoScheduleSchema,
  categorySchema,
  clubRegistrationSchema,
  generateDrawSchema,
  resultSchema,
  scheduleSchema,
  swapSchema,
  tournamentSchema,
  tournamentStatusSchema,
} from '../schemas';
import { ownedCategory, ownedMatch, ownedRegistration, ownedTournament } from '../services/access';
import {
  clearMatchResult,
  deleteCategoryDraw,
  generateCategoryDraw,
  setMatchResult,
  swapInDraw,
} from '../services/draws';
import {
  cancelRegistration,
  createRegistration,
  fillFromWaitlist,
  moveRegistration,
  setSeed,
  updateRegistrationPlayers,
} from '../services/registrations';
import {
  adminRegistrations,
  clearSchedule,
  purgePersonalData,
  registrationsCsv,
  runAutoSchedule,
  saveCourts,
  setMatchSchedule,
  uniqueSlug,
} from '../services/tournaments';
import { adminTournament, competitionData, courtsOf, scheduleConflicts, tournamentOpen } from '../services/views';
import { currentClub, requireClub } from './auth';
import { readJson } from './util';

function tournamentValues(body: ReturnType<typeof tournamentSchema.parse>) {
  return {
    name: body.name,
    description: body.description,
    startDate: body.startDate,
    endDate: body.endDate,
    venue: body.venue,
    address: body.address,
    timezone: body.timezone,
    priceCents: body.priceCents,
    registrationDeadline: body.registrationDeadline ? zonedLocalToUtc(body.registrationDeadline, body.timezone) : null,
    rules: body.rules,
    image: body.image,
    matchDurationMin: body.matchDurationMin,
    contactEmail: body.contactEmail,
    contactPhone: body.contactPhone,
    registrationOpen: body.registrationOpen,
  };
}

export const adminRoutes = new Hono<AppEnv>()
  .use(requireClub)

  // ---- Torneos ----
  .get('/tournaments', async (c) => {
    const club = currentClub(c);
    const { db, now } = c.var.deps;
    const list = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.clubId, club.id))
      .orderBy(desc(tournaments.startDate));
    const items: TournamentListItem[] = [];
    for (const t of list) {
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
        clubName: club.name,
        clubCity: club.city,
        categoriesCount: Number(cats?.n ?? 0),
        pairsCount: Number(pairs?.n ?? 0),
        registrationOpen: tournamentOpen(t, now()),
      });
    }
    // Primero los que están en juego o por venir; los finalizados al final.
    const today = now().toISOString().slice(0, 10);
    const active = items.filter((i) => i.status !== 'finished' && i.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
    return c.json([...active, ...items.filter((i) => !active.includes(i))]);
  })
  .post('/tournaments', async (c) => {
    const club = currentClub(c);
    const { db } = c.var.deps;
    const body = parse(tournamentSchema, await readJson(c));
    const [t] = await db
      .insert(tournaments)
      .values({ ...tournamentValues(body), clubId: club.id, slug: await uniqueSlug(db, body.name), status: 'draft' })
      .returning({ id: tournaments.id });
    await saveCourts(db, t!.id, body.courts);
    return c.json({ id: t!.id }, 201);
  })
  .get('/tournaments/:id', async (c) => {
    const t = await ownedTournament(c.var.deps.db, currentClub(c).id, c.req.param('id'));
    return c.json(await adminTournament(c.var.deps, t));
  })
  .put('/tournaments/:id', async (c) => {
    const { db, now } = c.var.deps;
    const t = await ownedTournament(db, currentClub(c).id, c.req.param('id'));
    const body = parse(tournamentSchema, await readJson(c));
    await db.update(tournaments).set({ ...tournamentValues(body), updatedAt: now() }).where(eq(tournaments.id, t.id));
    await saveCourts(db, t.id, body.courts);
    return c.json({ ok: true });
  })
  .patch('/tournaments/:id/status', async (c) => {
    const { db, now } = c.var.deps;
    const t = await ownedTournament(db, currentClub(c).id, c.req.param('id'));
    const { status } = parse(tournamentStatusSchema, await readJson(c));
    if (status === 'published') {
      const [cats] = await db.select({ n: count() }).from(categories).where(eq(categories.tournamentId, t.id));
      if (!Number(cats?.n)) throw badRequest('Añade al menos una categoría antes de publicar el torneo.');
    }
    await db.update(tournaments).set({ status, updatedAt: now() }).where(eq(tournaments.id, t.id));
    return c.json({ ok: true });
  })
  .delete('/tournaments/:id', async (c) => {
    const { db } = c.var.deps;
    const t = await ownedTournament(db, currentClub(c).id, c.req.param('id'));
    await db.delete(tournaments).where(eq(tournaments.id, t.id));
    return c.json({ ok: true });
  })
  .post('/tournaments/:id/purge', async (c) => {
    const t = await ownedTournament(c.var.deps.db, currentClub(c).id, c.req.param('id'));
    await purgePersonalData(c.var.deps, t);
    return c.json({ ok: true });
  })

  // ---- Categorías ----
  .post('/tournaments/:id/categories', async (c) => {
    const { db } = c.var.deps;
    const t = await ownedTournament(db, currentClub(c).id, c.req.param('id'));
    const body = parse(categorySchema, await readJson(c));
    const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(categories).where(eq(categories.tournamentId, t.id));
    if (Number(n) >= 30) throw badRequest('Máximo 30 categorías por torneo.');
    const [cat] = await db
      .insert(categories)
      .values({ ...body, tournamentId: t.id, position: Number(n) })
      .returning({ id: categories.id });
    return c.json({ id: cat!.id }, 201);
  })
  .put('/categories/:id', async (c) => {
    const { db } = c.var.deps;
    const { category, tournament } = await ownedCategory(db, currentClub(c).id, c.req.param('id'));
    const body = parse(categorySchema, await readJson(c));
    if (
      category.drawGeneratedAt &&
      (body.format !== category.format ||
        body.matchFormat !== category.matchFormat ||
        body.groupSize !== category.groupSize ||
        body.qualifiersPerGroup !== category.qualifiersPerGroup)
    ) {
      throw conflict('El cuadro ya está generado: bórralo antes de cambiar el formato.');
    }
    const [updated] = await db.update(categories).set(body).where(eq(categories.id, category.id)).returning();
    if (updated && body.maxPairs > category.maxPairs) await fillFromWaitlist(c.var.deps, tournament, updated);
    return c.json({ ok: true });
  })
  .delete('/categories/:id', async (c) => {
    const { db } = c.var.deps;
    const { category } = await ownedCategory(db, currentClub(c).id, c.req.param('id'));
    const [active] = await db
      .select({ n: count() })
      .from(registrations)
      .where(and(eq(registrations.categoryId, category.id), ne(registrations.status, 'cancelled')));
    if (Number(active?.n)) throw conflict('La categoría tiene parejas inscritas: muévelas o dalas de baja antes de borrarla.');
    await db.delete(categories).where(eq(categories.id, category.id));
    return c.json({ ok: true });
  })

  // ---- Inscripciones ----
  .get('/tournaments/:id/registrations', async (c) => {
    const t = await ownedTournament(c.var.deps.db, currentClub(c).id, c.req.param('id'));
    return c.json(await adminRegistrations(c.var.deps, t));
  })
  .post('/tournaments/:id/registrations', async (c) => {
    const { db } = c.var.deps;
    const t = await ownedTournament(db, currentClub(c).id, c.req.param('id'));
    const body = parse(clubRegistrationSchema, await readJson(c));
    const [cat] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, body.categoryId), eq(categories.tournamentId, t.id)));
    if (!cat) throw badRequest('Categoría no encontrada.');
    const res = await createRegistration(c.var.deps, {
      tournament: t,
      category: cat,
      players: [body.player1, body.player2],
      source: 'club',
      paid: body.paid,
      notes: body.notes,
    });
    return c.json({ id: res.id, status: res.status, waitlistPosition: res.waitlistPosition }, 201);
  })
  .get('/tournaments/:id/registrations.csv', async (c) => {
    const t = await ownedTournament(c.var.deps.db, currentClub(c).id, c.req.param('id'));
    const csv = await registrationsCsv(c.var.deps, t, c.req.query('categoryId') || undefined);
    return c.body(csv, 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="inscritos-${t.slug}.csv"`,
      'Cache-Control': 'no-store',
    });
  })
  .patch('/registrations/:id', async (c) => {
    const { db, now } = c.var.deps;
    const ctx = await ownedRegistration(db, currentClub(c).id, c.req.param('id'));
    const body = parse(adminRegistrationPatchSchema, await readJson(c));
    if (body.player1 && body.player2) {
      await updateRegistrationPlayers(c.var.deps, ctx.registration, [body.player1, body.player2]);
    }
    if (body.paid !== undefined || body.notes !== undefined) {
      await db
        .update(registrations)
        .set({
          ...(body.paid !== undefined ? { paid: body.paid } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          updatedAt: now(),
        })
        .where(eq(registrations.id, ctx.registration.id));
    }
    if (body.seed !== undefined) {
      if (ctx.category.drawGeneratedAt) throw conflict('El cuadro ya está hecho: las cabezas de serie ya no se pueden cambiar.');
      await setSeed(db, ctx.registration, body.seed);
    }
    if (body.categoryId && body.categoryId !== ctx.registration.categoryId) {
      await moveRegistration(c.var.deps, ctx, body.categoryId);
    }
    return c.json({ ok: true });
  })
  .post('/registrations/:id/cancel', async (c) => {
    const ctx = await ownedRegistration(c.var.deps.db, currentClub(c).id, c.req.param('id'));
    await cancelRegistration(c.var.deps, ctx, true);
    return c.json({ ok: true });
  })

  // ---- Cuadros, resultados y horarios ----
  .get('/tournaments/:id/competition', async (c) => {
    const t = await ownedTournament(c.var.deps.db, currentClub(c).id, c.req.param('id'));
    const data = await competitionData(c.var.deps, t);
    const view: AdminCompetitionView = {
      timezone: t.timezone,
      matchDurationMin: t.matchDurationMin,
      courts: await courtsOf(c.var.deps, t.id),
      categories: data.categories,
      conflicts: scheduleConflicts(data, t.matchDurationMin),
    };
    return c.json(view);
  })
  .post('/categories/:id/draw', async (c) => {
    const { category } = await ownedCategory(c.var.deps.db, currentClub(c).id, c.req.param('id'));
    const body = parse(generateDrawSchema, await readJson(c));
    await generateCategoryDraw(c.var.deps, category, body);
    return c.json({ ok: true }, 201);
  })
  .delete('/categories/:id/draw', async (c) => {
    const { category } = await ownedCategory(c.var.deps.db, currentClub(c).id, c.req.param('id'));
    await deleteCategoryDraw(c.var.deps.db, category);
    return c.json({ ok: true });
  })
  .post('/categories/:id/draw/swap', async (c) => {
    const { category } = await ownedCategory(c.var.deps.db, currentClub(c).id, c.req.param('id'));
    await swapInDraw(c.var.deps.db, category, parse(swapSchema, await readJson(c)));
    return c.json({ ok: true });
  })
  .put('/matches/:id/result', async (c) => {
    const { match, category } = await ownedMatch(c.var.deps.db, currentClub(c).id, c.req.param('id'));
    const body = parse(resultSchema, await readJson(c));
    await setMatchResult(c.var.deps, category, match, body);
    return c.json({ ok: true });
  })
  .delete('/matches/:id/result', async (c) => {
    const { match, category } = await ownedMatch(c.var.deps.db, currentClub(c).id, c.req.param('id'));
    await clearMatchResult(c.var.deps, category, match);
    return c.json({ ok: true });
  })
  .put('/matches/:id/schedule', async (c) => {
    const { match, tournament } = await ownedMatch(c.var.deps.db, currentClub(c).id, c.req.param('id'));
    await setMatchSchedule(c.var.deps, tournament, match, parse(scheduleSchema, await readJson(c)));
    return c.json({ ok: true });
  })
  .post('/tournaments/:id/schedule/auto', async (c) => {
    const t = await ownedTournament(c.var.deps.db, currentClub(c).id, c.req.param('id'));
    const res = await runAutoSchedule(c.var.deps, t, parse(autoScheduleSchema, await readJson(c)));
    return c.json(res);
  })
  .post('/tournaments/:id/schedule/clear', async (c) => {
    const t = await ownedTournament(c.var.deps.db, currentClub(c).id, c.req.param('id'));
    const body = (await readJson(c)) as { categoryId?: string };
    await clearSchedule(c.var.deps, t, typeof body?.categoryId === 'string' ? body.categoryId : undefined);
    return c.json({ ok: true });
  });

