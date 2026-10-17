import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import type {
  AdminCategory,
  AdminTournament,
  CategoryView,
  CourtView,
  MatchView,
  PairView,
  SlotView,
  TournamentInfo,
} from '../../shared/api';
import { numberMatches, roundLabelFor, sortMatches } from '../../shared/draw/numbering';
import { podium, prerequisitesOf } from '../../shared/draw/resolve';
import type { CompetitionFormat, MatchFormat, Phase, Side, Slot, SlotSource } from '../../shared/draw/types';
import { categoryLabel } from '../../shared/labels';
import { findScheduleConflicts, type ScheduleConflict, type ScheduleItem } from '../../shared/schedule';
import { utcToZonedLocal } from '../../shared/time';
import type { AppDeps } from '../context';
import { categories, clubs, courts, matches, players, registrations } from '../db/schema';
import { registrationOpen, type CategoryRow, type MatchRow, type TournamentRow } from './access';
import { resolveRows, rowsToDef } from './draws';

export function tournamentOpen(t: TournamentRow, now: Date): boolean {
  return t.status === 'published' && t.registrationOpen && (!t.registrationDeadline || now < t.registrationDeadline);
}

export async function tournamentInfo(deps: AppDeps, t: TournamentRow): Promise<TournamentInfo> {
  const [club] = await deps.db.select({ name: clubs.name, city: clubs.city }).from(clubs).where(eq(clubs.id, t.clubId));
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    startDate: t.startDate,
    endDate: t.endDate,
    venue: t.venue,
    address: t.address,
    timezone: t.timezone,
    priceCents: t.priceCents,
    registrationDeadline: t.registrationDeadline?.toISOString() ?? null,
    rules: t.rules,
    image: t.image,
    status: t.status as TournamentInfo['status'],
    registrationOpen: tournamentOpen(t, deps.now()),
    contactEmail: t.contactEmail,
    contactPhone: t.contactPhone,
    matchDurationMin: t.matchDurationMin,
    clubName: club?.name ?? '',
    clubCity: club?.city ?? '',
    publicUrl: deps.config.linkFor(`/t/${t.slug}`),
  };
}

export async function courtsOf(deps: AppDeps, tournamentId: string): Promise<CourtView[]> {
  return deps.db
    .select({ id: courts.id, name: courts.name })
    .from(courts)
    .where(eq(courts.tournamentId, tournamentId))
    .orderBy(asc(courts.position), asc(courts.name));
}

function tbdLabel(src: SlotSource, numbers: Map<string, number>, groupNames: Map<string, string>): string {
  switch (src.type) {
    case 'winner':
      return `Ganador #${numbers.get(src.match)}`;
    case 'loser':
    case 'first_loss':
      return `Perdedor #${numbers.get(src.match)}`;
    case 'group':
      return `${src.rank}º ${groupNames.get(src.group) ?? `Grupo ${src.group}`}`;
    default:
      return 'Por decidir';
  }
}

function slotView(slot: Slot, src: SlotSource, numbers: Map<string, number>, groupNames: Map<string, string>): SlotView {
  if (slot.kind === 'entry') return { kind: 'pair', pairId: slot.id };
  if (slot.kind === 'bye') return { kind: 'bye' };
  return { kind: 'tbd', label: tbdLabel(src, numbers, groupNames) };
}

interface CompetitionData {
  categories: CategoryView[];
  /** Filas de partidos y DNIs de jugadores por pareja (solo para uso interno: horarios y conflictos). */
  rowsByCategory: Map<string, MatchRow[]>;
  categoryRows: CategoryRow[];
  dnisByPair: Map<string, string[]>;
}

/**
 * Construye la vista de competición (categorías, parejas, grupos, partidos).
 * Las parejas solo llevan nombres: nunca DNI, email ni teléfono.
 */
export async function competitionData(deps: AppDeps, t: TournamentRow): Promise<CompetitionData> {
  const { db } = deps;
  const now = deps.now();
  const cats = await db
    .select()
    .from(categories)
    .where(eq(categories.tournamentId, t.id))
    .orderBy(asc(categories.position), asc(categories.createdAt));
  const regs = await db
    .select({
      id: registrations.id,
      categoryId: registrations.categoryId,
      status: registrations.status,
      seed: registrations.seed,
      createdAt: registrations.createdAt,
    })
    .from(registrations)
    .where(and(eq(registrations.tournamentId, t.id), ne(registrations.status, 'cancelled')))
    .orderBy(asc(registrations.createdAt), asc(registrations.id));
  const ps = regs.length
    ? await db
        .select({ registrationId: players.registrationId, fullName: players.fullName, dni: players.dni, position: players.position })
        .from(players)
        .where(inArray(players.registrationId, regs.map((r) => r.id)))
        .orderBy(asc(players.position))
    : [];
  const ms = await db.select().from(matches).where(eq(matches.tournamentId, t.id));

  const namesByPair = new Map<string, string[]>();
  const dnisByPair = new Map<string, string[]>();
  for (const p of ps) {
    if (!namesByPair.has(p.registrationId)) namesByPair.set(p.registrationId, []);
    namesByPair.get(p.registrationId)!.push(p.fullName);
    if (p.dni) {
      if (!dnisByPair.has(p.registrationId)) dnisByPair.set(p.registrationId, []);
      dnisByPair.get(p.registrationId)!.push(p.dni);
    }
  }

  const rowsByCategory = new Map<string, MatchRow[]>();
  for (const m of ms) {
    if (!rowsByCategory.has(m.categoryId)) rowsByCategory.set(m.categoryId, []);
    rowsByCategory.get(m.categoryId)!.push(m);
  }

  const views: CategoryView[] = cats.map((cat) => {
    const catRegs = regs.filter((r) => r.categoryId === cat.id);
    const confirmed = catRegs.filter((r) => r.status === 'confirmed');
    const rows = rowsByCategory.get(cat.id) ?? [];
    const def = rowsToDef(cat, rows);
    const resolved = resolveRows(cat, rows);
    const numbers = numberMatches(def.matches);
    const groupNames = new Map(def.groups.map((g) => [g.key, g.name]));

    const pairIds = new Set(confirmed.map((r) => r.id));
    for (const m of rows) {
      if (m.sourceA.type === 'entry') pairIds.add(m.sourceA.entryId);
      if (m.sourceB.type === 'entry') pairIds.add(m.sourceB.entryId);
    }
    const regById = new Map(catRegs.map((r) => [r.id, r]));
    const pairs: PairView[] = [...pairIds].map((id) => ({
      id,
      players: namesByPair.get(id) ?? ['Pareja retirada'],
      seed: regById.get(id)?.seed ?? null,
    }));

    const matchViews: MatchView[] = sortMatches(
      rows.map((r) => ({ ...r, phase: r.phase as Phase, group: r.groupKey })),
    ).map((row) => {
      const res = resolved.matches.get(row.key)!;
      return {
        id: row.id,
        key: row.key,
        number: numbers.get(row.key)!,
        phase: row.phase,
        round: row.round,
        position: row.position,
        group: row.groupKey,
        roundLabel: roundLabelFor(row, def.matches),
        a: slotView(res.a, row.sourceA, numbers, groupNames),
        b: slotView(res.b, row.sourceB, numbers, groupNames),
        status: res.status,
        winnerSide: res.winnerSide as Side | null,
        outcome: (row.outcome as MatchView['outcome']) ?? null,
        sets: row.sets ?? [],
        courtId: row.courtId,
        scheduledAt: row.scheduledAt?.toISOString() ?? null,
      };
    });

    return {
      id: cat.id,
      label: categoryLabel(cat),
      gender: cat.gender,
      level: cat.level,
      name: cat.name,
      format: cat.format as CompetitionFormat,
      matchFormat: cat.matchFormat as MatchFormat,
      maxPairs: cat.maxPairs,
      groupSize: cat.groupSize,
      qualifiersPerGroup: cat.qualifiersPerGroup,
      confirmedCount: confirmed.length,
      waitlistCount: catRegs.filter((r) => r.status === 'waitlist').length,
      registrationOpen: registrationOpen(t, cat, now),
      drawGenerated: !!cat.drawGeneratedAt,
      pairs,
      groups: def.groups.map((g) => ({
        key: g.key,
        name: g.name,
        complete: resolved.groupComplete.get(g.key) ?? false,
        standings: resolved.standings.get(g.key) ?? [],
      })),
      matches: matchViews,
      podium: podium(def, resolved),
    };
  });

  return { categories: views, rowsByCategory, categoryRows: cats, dnisByPair };
}

/** Conflictos de horario: pista, pareja, jugador (por DNI, entre categorías) y orden del cuadro. */
export function scheduleConflicts(data: CompetitionData, matchDurationMin: number): ScheduleConflict[] {
  const items: ScheduleItem[] = [];
  for (const cat of data.categoryRows) {
    const rows = data.rowsByCategory.get(cat.id) ?? [];
    const def = rowsToDef(cat, rows);
    const idByKey = new Map(rows.map((r) => [r.key, r.id]));
    for (const row of rows) {
      if (row.status === 'bye') continue;
      const pairIds = [row.pairAId, row.pairBId].filter((x): x is string => !!x);
      const defMatch = def.matches.find((m) => m.key === row.key)!;
      items.push({
        id: row.id,
        start: row.scheduledAt ? row.scheduledAt.getTime() : null,
        durationMin: matchDurationMin,
        courtId: row.courtId,
        pairIds,
        playerKeys: pairIds.flatMap((p) => data.dnisByPair.get(p) ?? []),
        after: prerequisitesOf(def, defMatch).map((k) => idByKey.get(k)!).filter(Boolean),
      });
    }
  }
  return findScheduleConflicts(items);
}

export async function adminTournament(deps: AppDeps, t: TournamentRow): Promise<AdminTournament> {
  const info = await tournamentInfo(deps, t);
  const data = await competitionData(deps, t);
  const paidRows = await deps.db
    .select({ categoryId: registrations.categoryId, paid: registrations.paid, status: registrations.status })
    .from(registrations)
    .where(eq(registrations.tournamentId, t.id));
  const cats: AdminCategory[] = data.categoryRows.map((cat) => {
    const view = data.categories.find((v) => v.id === cat.id)!;
    const playable = view.matches.filter((m) => m.status !== 'bye');
    return {
      id: cat.id,
      gender: cat.gender,
      level: cat.level,
      name: cat.name,
      label: view.label,
      maxPairs: cat.maxPairs,
      format: view.format,
      matchFormat: view.matchFormat,
      groupSize: cat.groupSize,
      qualifiersPerGroup: cat.qualifiersPerGroup,
      drawGenerated: view.drawGenerated,
      confirmedCount: view.confirmedCount,
      waitlistCount: view.waitlistCount,
      paidCount: paidRows.filter((r) => r.categoryId === cat.id && r.paid && r.status === 'confirmed').length,
      matchesTotal: playable.length,
      matchesPlayed: playable.filter((m) => m.status === 'finished').length,
    };
  });
  return {
    ...info,
    registrationOpenSetting: t.registrationOpen,
    registrationDeadlineLocal: t.registrationDeadline ? utcToZonedLocal(t.registrationDeadline, t.timezone) : null,
    personalDataPurgedAt: t.personalDataPurgedAt?.toISOString() ?? null,
    courts: await courtsOf(deps, t.id),
    categories: cats,
  };
}
