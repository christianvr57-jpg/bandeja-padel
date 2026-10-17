import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { AdminRegistration, RegistrationStatus } from '../../shared/api';
import { entriesInDraw } from '../../shared/draw/generate';
import { prerequisitesOf } from '../../shared/draw/resolve';
import { categoryLabel } from '../../shared/labels';
import { autoSchedule, type AutoScheduleMatch, type FixedBooking } from '../../shared/schedule';
import { zonedLocalToUtc } from '../../shared/time';
import type { AppDeps } from '../context';
import type { DB } from '../db';
import { categories, courts, emails, matches, players, registrations, tournaments } from '../db/schema';
import { randomToken } from '../lib/crypto';
import { badRequest, conflict } from '../lib/http';
import type { CategoryRow, MatchRow, TournamentRow } from './access';
import { loadMatches, rowsToDef } from './draws';
import { courtsOf } from './views';

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
}

export async function uniqueSlug(db: DB, name: string): Promise<string> {
  const base = slugify(name) || 'torneo';
  for (let i = 0; i < 10; i++) {
    const suffix = randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4) || String(i);
    const slug = `${base}-${suffix}`;
    const [exists] = await db.select({ id: tournaments.id }).from(tournaments).where(eq(tournaments.slug, slug));
    if (!exists) return slug;
  }
  throw new Error('No se pudo generar un enlace único.');
}

/** Sincroniza la lista de pistas conservando los ids existentes (los partidos programados mantienen su pista). */
export async function saveCourts(db: DB, tournamentId: string, list: Array<{ id?: string; name: string }>): Promise<void> {
  const existing = await db.select().from(courts).where(eq(courts.tournamentId, tournamentId));
  const keep = new Set(list.map((c) => c.id).filter(Boolean));
  for (const c of existing) if (!keep.has(c.id)) await db.delete(courts).where(eq(courts.id, c.id));
  for (const [i, c] of list.entries()) {
    if (c.id && existing.some((e) => e.id === c.id)) {
      await db.update(courts).set({ name: c.name, position: i }).where(eq(courts.id, c.id));
    } else {
      await db.insert(courts).values({ tournamentId, name: c.name, position: i });
    }
  }
}

export async function adminRegistrations(deps: AppDeps, t: TournamentRow): Promise<AdminRegistration[]> {
  const { db } = deps;
  const regs = await db
    .select()
    .from(registrations)
    .where(eq(registrations.tournamentId, t.id))
    .orderBy(asc(registrations.createdAt), asc(registrations.id));
  const ps = regs.length
    ? await db.select().from(players).where(inArray(players.registrationId, regs.map((r) => r.id))).orderBy(asc(players.position))
    : [];
  const cats = await db.select().from(categories).where(eq(categories.tournamentId, t.id));
  const inDraw = new Set<string>();
  for (const cat of cats.filter((c) => c.drawGeneratedAt)) {
    for (const id of entriesInDraw(rowsToDef(cat, await loadMatches(db, cat.id)))) inDraw.add(id);
  }
  const waitCounter = new Map<string, number>();
  return regs.map((r) => {
    let waitlistPosition: number | null = null;
    if (r.status === 'waitlist') {
      waitlistPosition = (waitCounter.get(r.categoryId) ?? 0) + 1;
      waitCounter.set(r.categoryId, waitlistPosition);
    }
    return {
      id: r.id,
      categoryId: r.categoryId,
      status: r.status as RegistrationStatus,
      paid: r.paid,
      seed: r.seed,
      notes: r.notes,
      source: r.source as 'public' | 'club',
      createdAt: r.createdAt.toISOString(),
      waitlistPosition,
      inDraw: inDraw.has(r.id),
      players: ps
        .filter((p) => p.registrationId === r.id)
        .map((p) => ({ fullName: p.fullName, email: p.email, phone: p.phone, dni: p.dni })),
    };
  });
}

/** Celda CSV segura: escapa comillas y neutraliza fórmulas (=, +, -, @) para evitar inyección en Excel. */
function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const STATUS_LABEL: Record<string, string> = { confirmed: 'Inscrita', waitlist: 'Lista de espera', cancelled: 'Baja' };

/** CSV con separador ";" y BOM UTF-8: Excel en español lo abre directamente con acentos y columnas. */
export async function registrationsCsv(deps: AppDeps, t: TournamentRow, categoryId?: string): Promise<string> {
  const regs = (await adminRegistrations(deps, t)).filter((r) => !categoryId || r.categoryId === categoryId);
  const cats = await deps.db.select().from(categories).where(eq(categories.tournamentId, t.id));
  const label = new Map(cats.map((c) => [c.id, categoryLabel(c)]));
  const header = [
    'Categoría', 'Estado', 'Pos. espera', 'Pagado', 'Cabeza de serie',
    'Jugador 1', 'DNI/NIE 1', 'Email 1', 'Teléfono 1',
    'Jugador 2', 'DNI/NIE 2', 'Email 2', 'Teléfono 2',
    'Notas', 'Fecha de inscripción',
  ];
  const lines = [header.map(csvCell).join(';')];
  for (const r of regs) {
    const [a, b] = r.players;
    lines.push(
      [
        label.get(r.categoryId), STATUS_LABEL[r.status], r.waitlistPosition ?? '', r.paid ? 'Sí' : 'No', r.seed ?? '',
        a?.fullName, a?.dni, a?.email, a?.phone,
        b?.fullName, b?.dni, b?.email, b?.phone,
        r.notes, new Date(r.createdAt).toLocaleString('es-ES', { timeZone: t.timezone }),
      ]
        .map(csvCell)
        .join(';'),
    );
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Borra DNI, email y teléfono de todos los jugadores de un torneo finalizado (se conservan los nombres para el historial). */
export async function purgePersonalData(deps: AppDeps, t: TournamentRow): Promise<void> {
  if (t.status !== 'finished') throw conflict('Marca primero el torneo como finalizado.');
  await deps.db.transaction(async (tx) => {
    const regIds = tx.select({ id: registrations.id }).from(registrations).where(eq(registrations.tournamentId, t.id));
    await tx.update(players).set({ email: null, phone: null, dni: null }).where(inArray(players.registrationId, regIds));
    await tx.update(registrations).set({ tokenHash: null, notes: '' }).where(eq(registrations.tournamentId, t.id));
    await tx.delete(emails).where(eq(emails.tournamentId, t.id));
    await tx.update(tournaments).set({ personalDataPurgedAt: deps.now() }).where(eq(tournaments.id, t.id));
  });
}

export async function setMatchSchedule(
  deps: AppDeps,
  t: TournamentRow,
  match: MatchRow,
  input: { courtId: string | null; scheduledAt: string | null },
): Promise<void> {
  if (input.courtId) {
    const [court] = await deps.db
      .select({ id: courts.id })
      .from(courts)
      .where(and(eq(courts.id, input.courtId), eq(courts.tournamentId, t.id)));
    if (!court) throw badRequest('Pista no encontrada.');
  }
  const scheduledAt = input.scheduledAt ? zonedLocalToUtc(input.scheduledAt, t.timezone) : null;
  await deps.db
    .update(matches)
    .set({ courtId: input.courtId, scheduledAt, updatedAt: deps.now() })
    .where(eq(matches.id, match.id));
}

const phasePriority = (phase: string, round: number) =>
  phase === 'group' || phase === 'league' ? round : 100 + round * 10 + (phase === 'consolation' ? 5 : 0);

export async function runAutoSchedule(
  deps: AppDeps,
  t: TournamentRow,
  input: {
    days: Array<{ date: string; from: string; to: string }>;
    slotMin: number;
    restMin: number;
    categoryIds?: string[];
    replaceExisting: boolean;
  },
): Promise<{ scheduled: number; unscheduled: number }> {
  const { db } = deps;
  const courtList = await courtsOf(deps, t.id);
  if (!courtList.length) throw badRequest('El torneo no tiene pistas.');
  const windows = input.days.map((d) => {
    const start = zonedLocalToUtc(`${d.date}T${d.from}`, t.timezone).getTime();
    const end = zonedLocalToUtc(`${d.date}T${d.to}`, t.timezone).getTime();
    if (end <= start) throw badRequest(`Franja horaria no válida el ${d.date}.`);
    return { start, end };
  });

  const cats = await db.select().from(categories).where(eq(categories.tournamentId, t.id));
  const allRows = await db.select().from(matches).where(eq(matches.tournamentId, t.id));
  const dnis = await db
    .select({ registrationId: players.registrationId, dni: players.dni })
    .from(players)
    .innerJoin(registrations, eq(players.registrationId, registrations.id))
    .where(and(eq(registrations.tournamentId, t.id), isNotNull(players.dni)));
  const dnisOf = (pairIds: string[]) => dnis.filter((d) => pairIds.includes(d.registrationId)).map((d) => d.dni!);

  const selected = (c: CategoryRow) => !input.categoryIds?.length || input.categoryIds.includes(c.id);
  const candidates: AutoScheduleMatch[] = [];
  const fixed: FixedBooking[] = [];
  const candidateIds = new Set<string>();

  for (const cat of cats) {
    const rows = allRows.filter((r) => r.categoryId === cat.id);
    const def = rowsToDef(cat, rows);
    const idByKey = new Map(rows.map((r) => [r.key, r.id]));
    for (const row of rows) {
      if (row.status === 'bye') continue;
      const pairIds = [row.pairAId, row.pairBId].filter((x): x is string => !!x);
      const isCandidate = selected(cat) && !row.outcome && (input.replaceExisting || !row.scheduledAt);
      if (isCandidate) {
        candidateIds.add(row.id);
        candidates.push({
          id: row.id,
          durationMin: t.matchDurationMin,
          pairIds,
          playerKeys: dnisOf(pairIds),
          after: prerequisitesOf(def, def.matches.find((m) => m.key === row.key)!)
            .map((k) => idByKey.get(k)!)
            .filter(Boolean),
          priority: phasePriority(row.phase, row.round),
        });
      } else if (row.scheduledAt) {
        fixed.push({
          id: row.id,
          start: row.scheduledAt.getTime(),
          durationMin: t.matchDurationMin,
          courtId: row.courtId,
          pairIds,
          playerKeys: dnisOf(pairIds),
        });
      }
    }
  }

  const result = autoSchedule(candidates, fixed, {
    courtIds: courtList.map((c) => c.id),
    windows,
    slotMin: input.slotMin,
    restMin: input.restMin,
  });
  await db.transaction(async (tx) => {
    for (const id of candidateIds) {
      const a = result.assigned.get(id);
      await tx
        .update(matches)
        .set({ courtId: a?.courtId ?? null, scheduledAt: a ? new Date(a.start) : null, updatedAt: deps.now() })
        .where(eq(matches.id, id));
    }
  });
  return { scheduled: result.assigned.size, unscheduled: result.unscheduled.length };
}

/** Quita hora y pista de los partidos sin resultado (de una categoría o de todo el torneo). */
export async function clearSchedule(deps: AppDeps, t: TournamentRow, categoryId?: string): Promise<void> {
  await deps.db
    .update(matches)
    .set({ courtId: null, scheduledAt: null, updatedAt: deps.now() })
    .where(
      and(
        eq(matches.tournamentId, t.id),
        isNull(matches.outcome),
        categoryId ? eq(matches.categoryId, categoryId) : undefined,
      ),
    );
}
