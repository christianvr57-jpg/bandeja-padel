import { asc, eq } from 'drizzle-orm';
import { DrawError, entriesInDraw, generateDraw, swapEntries, swapSlots } from '../../shared/draw/generate';
import { numberMatches } from '../../shared/draw/numbering';
import { randomSeed, seededRng } from '../../shared/draw/random';
import { dependentsOf, rankingFor, resolveDraw, type ResolvedDraw } from '../../shared/draw/resolve';
import { validateResult, type ResultInput } from '../../shared/draw/score';
import type {
  CompetitionFormat,
  DrawDef,
  MatchFormat,
  MatchResult,
  Outcome,
  Phase,
  Side,
} from '../../shared/draw/types';
import type { AppDeps } from '../context';
import type { DB } from '../db';
import { categories, matches, registrations } from '../db/schema';
import { badRequest, conflict } from '../lib/http';
import type { CategoryRow, MatchRow } from './access';

export function rowsToDef(category: Pick<CategoryRow, 'drawGroups'>, rows: MatchRow[]): DrawDef {
  return {
    groups: category.drawGroups ?? [],
    matches: rows.map((r) => ({
      key: r.key,
      phase: r.phase as Phase,
      round: r.round,
      position: r.position,
      group: r.groupKey,
      a: r.sourceA,
      b: r.sourceB,
    })),
  };
}

export function rowResult(r: MatchRow): MatchResult | null {
  if (!r.outcome) return null;
  return { outcome: r.outcome as Outcome, sets: r.sets ?? [], winner: (r.winnerSide as Side | null) ?? null };
}

export function resolveRows(category: CategoryRow, rows: MatchRow[]): ResolvedDraw {
  const results = new Map<string, MatchResult>();
  for (const r of rows) {
    const res = rowResult(r);
    if (res) results.set(r.key, res);
  }
  return resolveDraw(rowsToDef(category, rows), results, {
    matchFormat: category.matchFormat as MatchFormat,
    ranking: rankingFor(category.format as CompetitionFormat),
  });
}

export async function loadMatches(db: DB, categoryId: string): Promise<MatchRow[]> {
  return db.select().from(matches).where(eq(matches.categoryId, categoryId)).orderBy(asc(matches.key));
}

/** Recalcula participantes y estado de cada partido y guarda los cambios (caché en la tabla matches). */
export async function syncCategory(db: DB, category: CategoryRow): Promise<void> {
  const rows = await loadMatches(db, category.id);
  if (!rows.length) return;
  const resolved = resolveRows(category, rows);
  for (const row of rows) {
    const r = resolved.matches.get(row.key)!;
    const pairAId = r.a.kind === 'entry' ? r.a.id : null;
    const pairBId = r.b.kind === 'entry' ? r.b.id : null;
    if (row.pairAId !== pairAId || row.pairBId !== pairBId || row.status !== r.status) {
      await db.update(matches).set({ pairAId, pairBId, status: r.status }).where(eq(matches.id, row.id));
    }
  }
}

export async function isInDraw(db: DB, category: CategoryRow, registrationId: string): Promise<boolean> {
  if (!category.drawGeneratedAt) return false;
  const rows = await loadMatches(db, category.id);
  return entriesInDraw(rowsToDef(category, rows)).has(registrationId);
}

export async function generateCategoryDraw(
  deps: AppDeps,
  category: CategoryRow,
  opts: { useSeeds: boolean; rngSeed?: number },
): Promise<void> {
  const { db } = deps;
  if (category.drawGeneratedAt) throw conflict('Esta categoría ya tiene cuadro. Bórralo primero para volver a sortear.');
  const regs = await db
    .select({ id: registrations.id, seed: registrations.seed, status: registrations.status })
    .from(registrations)
    .where(eq(registrations.categoryId, category.id))
    .orderBy(asc(registrations.createdAt), asc(registrations.id));
  const confirmed = regs.filter((r) => r.status === 'confirmed');
  if (confirmed.length < 2) {
    throw badRequest('Se necesitan al menos 2 parejas inscritas (confirmadas) para generar el cuadro.');
  }

  let def: DrawDef;
  try {
    def = generateDraw(
      category.format as CompetitionFormat,
      confirmed.map((r) => ({ id: r.id, seed: opts.useSeeds ? r.seed : null })),
      { groupSize: category.groupSize, qualifiersPerGroup: category.qualifiersPerGroup },
      seededRng(opts.rngSeed ?? randomSeed()),
    );
  } catch (err) {
    if (err instanceof DrawError) throw badRequest(err.message);
    throw err;
  }

  const now = deps.now();
  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(categories).where(eq(categories.id, category.id)).for('update');
    if (!locked || locked.drawGeneratedAt) throw conflict('Esta categoría ya tiene cuadro.');
    await tx.insert(matches).values(
      def.matches.map((m) => ({
        tournamentId: category.tournamentId,
        categoryId: category.id,
        key: m.key,
        phase: m.phase,
        round: m.round,
        position: m.position,
        groupKey: m.group,
        sourceA: m.a,
        sourceB: m.b,
      })),
    );
    await tx.update(categories).set({ drawGeneratedAt: now, drawGroups: def.groups }).where(eq(categories.id, category.id));
  });
  await syncCategory(db, { ...category, drawGeneratedAt: now, drawGroups: def.groups });
}

export async function deleteCategoryDraw(db: DB, category: CategoryRow): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(matches).where(eq(matches.categoryId, category.id));
    await tx.update(categories).set({ drawGeneratedAt: null, drawGroups: null }).where(eq(categories.id, category.id));
  });
}

export type SwapInput =
  | { kind: 'slots'; x: { match: string; side: Side }; y: { match: string; side: Side } }
  | { kind: 'entries'; x: string; y: string };

/** Ajuste manual del sorteo: solo mientras no haya resultados en la categoría. */
export async function swapInDraw(db: DB, category: CategoryRow, input: SwapInput): Promise<void> {
  if (!category.drawGeneratedAt) throw badRequest('Esta categoría aún no tiene cuadro.');
  const rows = await loadMatches(db, category.id);
  if (rows.some((r) => r.outcome)) {
    throw conflict('Ya hay resultados en esta categoría: no se puede modificar el sorteo.');
  }
  const def = rowsToDef(category, rows);
  let next: DrawDef;
  try {
    if (input.kind === 'slots') {
      next = swapSlots(def, input.x, input.y);
    } else {
      const inDraw = entriesInDraw(def);
      if (!inDraw.has(input.x) || !inDraw.has(input.y)) throw new DrawError('Las dos parejas deben estar en el cuadro.');
      next = swapEntries(def, input.x, input.y);
    }
  } catch (err) {
    if (err instanceof DrawError) throw badRequest(err.message);
    throw err;
  }
  const byKey = new Map(next.matches.map((m) => [m.key, m]));
  await db.transaction(async (tx) => {
    for (const row of rows) {
      const m = byKey.get(row.key)!;
      if (JSON.stringify(m.a) !== JSON.stringify(row.sourceA) || JSON.stringify(m.b) !== JSON.stringify(row.sourceB)) {
        await tx.update(matches).set({ sourceA: m.a, sourceB: m.b, updatedAt: new Date() }).where(eq(matches.id, row.id));
      }
    }
    await tx.update(categories).set({ drawGroups: next.groups }).where(eq(categories.id, category.id));
  });
  await syncCategory(db, { ...category, drawGroups: next.groups });
}

function assertNoDependentResults(category: CategoryRow, rows: MatchRow[], key: string): void {
  const def = rowsToDef(category, rows);
  const deps = dependentsOf(def, key);
  const numbers = numberMatches(def.matches);
  const blocking = rows.filter((r) => deps.has(r.key) && r.outcome).map((r) => numbers.get(r.key));
  if (blocking.length) {
    const list = blocking.sort((a, b) => a! - b!).map((n) => `#${n}`).join(', ');
    throw conflict(
      `No se puede cambiar: ${blocking.length === 1 ? 'el partido' : 'los partidos'} ${list} ya ${blocking.length === 1 ? 'tiene' : 'tienen'} resultado y ${blocking.length === 1 ? 'depende' : 'dependen'} de este. Borra antes ese resultado.`,
    );
  }
}

export async function setMatchResult(
  deps: AppDeps,
  category: CategoryRow,
  match: MatchRow,
  input: ResultInput,
): Promise<void> {
  const { db } = deps;
  const rows = await loadMatches(db, category.id);
  const resolved = resolveRows(category, rows);
  const r = resolved.matches.get(match.key);
  if (!r) throw badRequest('Partido no encontrado en el cuadro.');
  if (r.status === 'waiting') throw conflict('Todavía no se conocen las dos parejas de este partido.');
  if (r.status === 'bye') throw conflict('Este partido es un bye: la pareja pasa directamente.');

  const v = validateResult(category.matchFormat as MatchFormat, input);
  if (!v.ok) throw badRequest(v.error);

  const current = rows.find((x) => x.key === match.key)!;
  const existing = rowResult(current);
  if (existing) {
    const knockout = current.phase === 'main' || current.phase === 'consolation';
    if (!(knockout && existing.winner === v.result.winner)) assertNoDependentResults(category, rows, match.key);
  }
  await db
    .update(matches)
    .set({
      outcome: v.result.outcome,
      sets: v.result.sets,
      winnerSide: v.result.winner,
      resultAt: deps.now(),
      updatedAt: deps.now(),
    })
    .where(eq(matches.id, match.id));
  await syncCategory(db, category);
}

export async function clearMatchResult(deps: AppDeps, category: CategoryRow, match: MatchRow): Promise<void> {
  const rows = await loadMatches(deps.db, category.id);
  assertNoDependentResults(category, rows, match.key);
  await deps.db
    .update(matches)
    .set({ outcome: null, sets: null, winnerSide: null, resultAt: null, updatedAt: deps.now() })
    .where(eq(matches.id, match.id));
  await syncCategory(deps.db, category);
}
