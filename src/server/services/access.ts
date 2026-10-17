import { and, eq } from 'drizzle-orm';
import type { DB } from '../db';
import { categories, matches, registrations, tournaments } from '../db/schema';
import { notFound } from '../lib/http';

export type TournamentRow = typeof tournaments.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type RegistrationRow = typeof registrations.$inferSelect;
export type MatchRow = typeof matches.$inferSelect;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID_RE.test(v);

/**
 * Control de acceso: un club solo puede acceder a sus propios torneos. Si el
 * recurso no existe o es de otro club se responde 404 (no se revela que exista).
 */
export async function ownedTournament(db: DB, clubId: string, tournamentId: string): Promise<TournamentRow> {
  if (!isUuid(tournamentId)) throw notFound('Torneo no encontrado.');
  const [t] = await db
    .select()
    .from(tournaments)
    .where(and(eq(tournaments.id, tournamentId), eq(tournaments.clubId, clubId)));
  if (!t) throw notFound('Torneo no encontrado.');
  return t;
}

export async function ownedCategory(db: DB, clubId: string, categoryId: string) {
  if (!isUuid(categoryId)) throw notFound('Categoría no encontrada.');
  const [row] = await db
    .select({ category: categories, tournament: tournaments })
    .from(categories)
    .innerJoin(tournaments, eq(categories.tournamentId, tournaments.id))
    .where(and(eq(categories.id, categoryId), eq(tournaments.clubId, clubId)));
  if (!row) throw notFound('Categoría no encontrada.');
  return row;
}

export async function ownedRegistration(db: DB, clubId: string, registrationId: string) {
  if (!isUuid(registrationId)) throw notFound('Inscripción no encontrada.');
  const [row] = await db
    .select({ registration: registrations, tournament: tournaments, category: categories })
    .from(registrations)
    .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
    .innerJoin(categories, eq(registrations.categoryId, categories.id))
    .where(and(eq(registrations.id, registrationId), eq(tournaments.clubId, clubId)));
  if (!row) throw notFound('Inscripción no encontrada.');
  return row;
}

export async function ownedMatch(db: DB, clubId: string, matchId: string) {
  if (!isUuid(matchId)) throw notFound('Partido no encontrado.');
  const [row] = await db
    .select({ match: matches, category: categories, tournament: tournaments })
    .from(matches)
    .innerJoin(categories, eq(matches.categoryId, categories.id))
    .innerJoin(tournaments, eq(matches.tournamentId, tournaments.id))
    .where(and(eq(matches.id, matchId), eq(tournaments.clubId, clubId)));
  if (!row) throw notFound('Partido no encontrado.');
  return row;
}

/** ¿Admite inscripciones públicas esta categoría ahora mismo? */
export function registrationOpen(t: TournamentRow, c: CategoryRow, now: Date): boolean {
  return (
    t.status === 'published' &&
    t.registrationOpen &&
    (!t.registrationDeadline || now < t.registrationDeadline) &&
    !c.drawGeneratedAt
  );
}
