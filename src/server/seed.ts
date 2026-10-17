/**
 * Datos de demostración: un club con torneos en distintos estados (en juego,
 * con inscripciones abiertas, finalizado y en borrador). Se crean a través de
 * los mismos servicios que usa la API, así que son coherentes con la lógica real.
 * Todos los datos personales son ficticios (DNIs válidos generados, emails @example.com).
 */
import { count, eq } from 'drizzle-orm';
import { seededRng, shuffle, type Rng } from '../shared/draw/random';
import type { CompetitionFormat, MatchFormat, SetScore, Side } from '../shared/draw/types';
import { addDays, zonedDate, zonedLocalToUtc } from '../shared/time';
import { validateSpanishPhone } from '../shared/validation/contact';
import { controlLetter } from '../shared/validation/dni';
import type { AppDeps } from './context';
import { categories, clubs, registrations, tournaments } from './db/schema';
import { hashPassword } from './lib/crypto';
import type { CategoryRow, TournamentRow } from './services/access';
import { generateCategoryDraw, loadMatches, resolveRows, setMatchResult } from './services/draws';
import { createRegistration, type PlayerInput } from './services/registrations';
import { runAutoSchedule, saveCourts, uniqueSlug } from './services/tournaments';

export const DEMO_CLUB = {
  email: 'demo@example.com',
  password: 'padeldemo',
  name: 'Club de Pádel Bandeja (demo)',
  city: 'Valencia',
};

const MALE = ['Alejandro', 'Daniel', 'Pablo', 'Javier', 'Sergio', 'Carlos', 'Adrián', 'Álvaro', 'David', 'Hugo', 'Marcos', 'Diego', 'Raúl', 'Iván', 'Jorge', 'Rubén', 'Víctor', 'Mario', 'Óscar', 'Andrés', 'Fernando', 'Luis', 'Miguel', 'Gonzalo', 'Nacho', 'Rafael', 'Samuel', 'Tomás', 'Enrique', 'Jaime'];
const FEMALE = ['Lucía', 'María', 'Paula', 'Laura', 'Marta', 'Sara', 'Carmen', 'Ana', 'Elena', 'Irene', 'Claudia', 'Alba', 'Nuria', 'Cristina', 'Raquel', 'Silvia', 'Andrea', 'Patricia', 'Beatriz', 'Noelia', 'Rocío', 'Sofía', 'Julia', 'Inés', 'Carla', 'Lorena', 'Marina', 'Eva', 'Teresa', 'Pilar'];
const SURNAMES = ['García', 'Martínez', 'López', 'Sánchez', 'Pérez', 'Gómez', 'Martín', 'Jiménez', 'Ruiz', 'Hernández', 'Díaz', 'Moreno', 'Muñoz', 'Álvarez', 'Romero', 'Alonso', 'Gutiérrez', 'Navarro', 'Torres', 'Domínguez', 'Vázquez', 'Ramos', 'Gil', 'Ramírez', 'Serrano', 'Blanco', 'Molina', 'Morales', 'Suárez', 'Ortega', 'Delgado', 'Castro', 'Ortiz', 'Rubio', 'Marín', 'Sanz', 'Núñez', 'Iglesias', 'Medina', 'Garrido'];

const RULES = `1. Partidos al mejor de 3 sets con punto de oro. En caso de empate a sets, super tie-break a 10 puntos.
2. Se ruega puntualidad: 15 minutos de cortesía, después se dará el partido por perdido (W.O.).
3. Las bolas las proporciona la organización. Cada partido se juega con bolas nuevas a partir de cuartos de final.
4. Los horarios pueden variar; consulta la página del torneo antes de venir.
5. Es obligatorio el uso de calzado específico de pádel.
6. La organización se reserva el derecho de modificar el cuadro por causas de fuerza mayor.`;

class PeopleFactory {
  private used = new Set<string>();
  private dnis = new Set<string>();
  constructor(private rng: Rng) {}

  private pick<T>(list: T[]): T {
    return list[Math.floor(this.rng() * list.length)]!;
  }

  person(gender: 'M' | 'F'): PlayerInput {
    let name = '';
    do {
      name = `${this.pick(gender === 'M' ? MALE : FEMALE)} ${this.pick(SURNAMES)} ${this.pick(SURNAMES)}`;
    } while (this.used.has(name));
    this.used.add(name);
    let dni = '';
    do {
      const n = 10_000_000 + Math.floor(this.rng() * 89_999_999);
      dni = `${n}${controlLetter(n)}`;
    } while (this.dnis.has(dni));
    this.dnis.add(dni);
    const [first, surname] = name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(' ');
    const phone = validateSpanishPhone(`6${String(Math.floor(this.rng() * 1e8)).padStart(8, '0')}`);
    return {
      fullName: name,
      email: `${first}.${surname}${this.dnis.size}@example.com`,
      phone: phone.valid ? phone.value : '+34 600 000 000',
      dni,
    };
  }

  pair(gender: 'M' | 'F' | 'X'): [PlayerInput, PlayerInput] {
    if (gender === 'X') return [this.person('M'), this.person('F')];
    return [this.person(gender), this.person(gender)];
  }
}

function randomSet(rng: Rng, winner: Side, tight = false): SetScore {
  const options: Array<[number, number]> = tight ? [[7, 5], [7, 6], [6, 4]] : [[6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 5], [7, 6]];
  const [w, l] = options[Math.floor(rng() * options.length)]!;
  return winner === 'a' ? { a: w, b: l } : { a: l, b: w };
}

function randomResult(rng: Rng, format: MatchFormat, winner: Side): { outcome: 'normal'; sets: SetScore[] } {
  const loser: Side = winner === 'a' ? 'b' : 'a';
  if (format === 'games') {
    const w = 4 + Math.floor(rng() * 4);
    const l = Math.floor(rng() * w);
    return { outcome: 'normal', sets: [winner === 'a' ? { a: w, b: l } : { a: l, b: w }] };
  }
  if (format === 'single_set') return { outcome: 'normal', sets: [randomSet(rng, winner)] };
  if (rng() < 0.65) return { outcome: 'normal', sets: [randomSet(rng, winner), randomSet(rng, winner)] };
  const first = rng() < 0.5;
  const third =
    format === 'best_of_3_super_tb'
      ? (() => {
          const l = Math.floor(rng() * 9);
          return winner === 'a' ? { a: 10, b: l } : { a: l, b: 10 };
        })()
      : randomSet(rng, winner, true);
  return {
    outcome: 'normal',
    sets: first
      ? [randomSet(rng, winner), randomSet(rng, loser, true), third]
      : [randomSet(rng, loser, true), randomSet(rng, winner), third],
  };
}

/** Introduce resultados de los partidos jugables. `until`: solo los que ya deberían haber terminado. */
async function playMatches(deps: AppDeps, category: CategoryRow, rng: Rng, opts: { until?: Date; durationMin: number; limit?: number }) {
  let played = 0;
  for (;;) {
    const rows = await loadMatches(deps.db, category.id);
    const resolved = resolveRows(category, rows);
    const seeds = new Map<string, number>();
    const regs = await deps.db
      .select({ id: registrations.id, seed: registrations.seed })
      .from(registrations)
      .where(eq(registrations.categoryId, category.id));
    for (const r of regs) if (r.seed) seeds.set(r.id, r.seed);

    const ready = rows
      .filter((r) => resolved.matches.get(r.key)!.status === 'ready')
      .filter((r) => !opts.until || (r.scheduledAt && r.scheduledAt.getTime() + opts.durationMin * 60_000 <= opts.until.getTime()))
      .sort((x, y) => (x.scheduledAt?.getTime() ?? 0) - (y.scheduledAt?.getTime() ?? 0));
    if (!ready.length || (opts.limit != null && played >= opts.limit)) return;
    for (const row of ready) {
      if (opts.limit != null && played >= opts.limit) return;
      const res = resolved.matches.get(row.key)!;
      const sa = res.a.kind === 'entry' ? (seeds.get(res.a.id) ?? 9) : 9;
      const sb = res.b.kind === 'entry' ? (seeds.get(res.b.id) ?? 9) : 9;
      // La mejor cabeza de serie suele ganar, pero no siempre.
      const pA = sa === sb ? 0.5 : sa < sb ? 0.72 : 0.28;
      const winner: Side = rng() < pA ? 'a' : 'b';
      await setMatchResult(deps, category, row, randomResult(rng, category.matchFormat as MatchFormat, winner));
      played++;
    }
  }
}

interface CategorySeed {
  gender: 'M' | 'F' | 'X';
  level: string;
  name?: string;
  maxPairs: number;
  format: CompetitionFormat;
  matchFormat: MatchFormat;
  pairs: number;
  seeds?: number;
  groupSize?: number;
  qualifiersPerGroup?: number;
}

async function createTournament(
  deps: AppDeps,
  clubId: string,
  data: Partial<typeof tournaments.$inferInsert> & { name: string; startDate: string; endDate: string },
  courtNames: string[],
): Promise<TournamentRow> {
  const [t] = await deps.db
    .insert(tournaments)
    .values({ clubId, slug: await uniqueSlug(deps.db, data.name), ...data })
    .returning();
  await saveCourts(deps.db, t!.id, courtNames.map((name) => ({ name })));
  return t!;
}

async function createCategoryWithPairs(
  deps: AppDeps,
  t: TournamentRow,
  people: PeopleFactory,
  rng: Rng,
  c: CategorySeed,
  position: number,
): Promise<CategoryRow> {
  const [cat] = await deps.db
    .insert(categories)
    .values({
      tournamentId: t.id,
      gender: c.gender,
      level: c.level,
      name: c.name ?? '',
      maxPairs: c.maxPairs,
      format: c.format,
      matchFormat: c.matchFormat,
      groupSize: c.groupSize ?? 4,
      qualifiersPerGroup: c.qualifiersPerGroup ?? 2,
      position,
    })
    .returning();
  const ids: string[] = [];
  for (let i = 0; i < c.pairs; i++) {
    const res = await createRegistration(deps, {
      tournament: t,
      category: cat!,
      players: people.pair(c.gender),
      source: rng() < 0.15 ? 'club' : 'public',
      paid: rng() < 0.8,
      sendEmail: false,
    });
    ids.push(res.id);
  }
  // Cabezas de serie: las primeras parejas inscritas, en orden aleatorio.
  for (const [i, id] of shuffle(ids, rng).slice(0, c.seeds ?? 0).entries()) {
    await deps.db.update(registrations).set({ seed: i + 1 }).where(eq(registrations.id, id));
  }
  return cat!;
}

export async function seedDemo(deps: AppDeps): Promise<void> {
  const { db, config } = deps;
  const rng = seededRng(2026);
  const people = new PeopleFactory(rng);
  const now = deps.now();
  const tz = 'Europe/Madrid';
  const today = zonedDate(now, tz);
  const at = (day: string, time: string) => zonedLocalToUtc(`${day}T${time}`, tz);

  // El club demo actúa también como "candado": si otra instancia ya lo creó, no se repite el seed.
  let clubId: string;
  try {
    const [club] = await db
      .insert(clubs)
      .values({
        name: DEMO_CLUB.name,
        city: DEMO_CLUB.city,
        email: DEMO_CLUB.email,
        passwordHash: await hashPassword(DEMO_CLUB.password, config.passwordIterations),
      })
      .returning({ id: clubs.id });
    clubId = club!.id;
  } catch {
    return;
  }

  const common = {
    venue: 'Club de Pádel Bandeja',
    address: 'Av. de los Naranjos 12, 46022 Valencia',
    contactEmail: 'torneos@example.com',
    contactPhone: '+34 960 000 000',
    rules: RULES,
    timezone: tz,
  };

  // 1) Torneo en juego: cuadros generados, horarios y resultados hasta "ahora".
  const open = await createTournament(
    deps,
    clubId,
    {
      ...common,
      name: 'Open Bandeja',
      description:
        'Nuestro torneo de referencia: tres categorías, consolación para que todo el mundo juegue al menos dos partidos, y fiesta de entrega de premios el domingo.',
      startDate: addDays(today, -1),
      endDate: addDays(today, 1),
      priceCents: 3000,
      registrationDeadline: at(addDays(today, -3), '23:59'),
      registrationOpen: false,
      status: 'published',
      matchDurationMin: 90,
    },
    ['Pista Central', 'Pista 2', 'Pista 3', 'Pista 4'],
  );
  const openCats = [
    await createCategoryWithPairs(deps, open, people, rng, { gender: 'M', level: '3ª', maxPairs: 16, format: 'consolation', matchFormat: 'best_of_3_super_tb', pairs: 12, seeds: 4 }, 0),
    await createCategoryWithPairs(deps, open, people, rng, { gender: 'F', level: '4ª', maxPairs: 8, format: 'groups_knockout', matchFormat: 'best_of_3_super_tb', pairs: 8, seeds: 2, groupSize: 4, qualifiersPerGroup: 2 }, 1),
    await createCategoryWithPairs(deps, open, people, rng, { gender: 'X', level: 'Iniciación', maxPairs: 8, format: 'single_elimination', matchFormat: 'best_of_3_super_tb', pairs: 7, seeds: 1 }, 2),
  ];
  for (const [i, cat] of openCats.entries()) await generateCategoryDraw(deps, cat, { useSeeds: true, rngSeed: 100 + i });
  await runAutoSchedule(deps, open, {
    days: [
      { date: addDays(today, -1), from: '16:00', to: '22:30' },
      { date: today, from: '09:00', to: '22:30' },
      { date: addDays(today, 1), from: '09:00', to: '14:00' },
    ],
    slotMin: 30,
    restMin: 30,
    replaceExisting: true,
  });
  for (const cat of openCats) {
    const [fresh] = await db.select().from(categories).where(eq(categories.id, cat.id));
    await playMatches(deps, fresh!, rng, { until: now, durationMin: open.matchDurationMin });
  }

  // 2) Torneo con inscripciones abiertas (una categoría llena con lista de espera).
  const social = await createTournament(
    deps,
    clubId,
    {
      ...common,
      name: 'Torneo Social de Pádel',
      description:
        'Torneo abierto a socios y no socios. Incluye camiseta técnica, bebida y sorteo de material. ¡Inscríbete con tu pareja!',
      startDate: addDays(today, 20),
      endDate: addDays(today, 21),
      priceCents: 2000,
      registrationDeadline: at(addDays(today, 18), '23:59'),
      status: 'published',
      matchDurationMin: 75,
    },
    ['Pista Central', 'Pista 2', 'Pista 3'],
  );
  await createCategoryWithPairs(deps, social, people, rng, { gender: 'M', level: '2ª', maxPairs: 8, format: 'single_elimination', matchFormat: 'best_of_3_super_tb', pairs: 10 }, 0);
  await createCategoryWithPairs(deps, social, people, rng, { gender: 'F', level: '3ª', maxPairs: 12, format: 'consolation', matchFormat: 'best_of_3_super_tb', pairs: 5 }, 1);
  await createCategoryWithPairs(deps, social, people, rng, { gender: 'X', level: 'Medio', maxPairs: 6, format: 'americano', matchFormat: 'games', pairs: 3 }, 2);

  // 3) Torneo finalizado (con campeones).
  const express = await createTournament(
    deps,
    clubId,
    {
      ...common,
      name: 'Torneo Express',
      description: 'Torneo de un día con formato americano y eliminatoria rápida.',
      startDate: addDays(today, -40),
      endDate: addDays(today, -40),
      priceCents: 1500,
      registrationDeadline: at(addDays(today, -42), '20:00'),
      registrationOpen: false,
      status: 'finished',
      matchDurationMin: 45,
    },
    ['Pista 1', 'Pista 2'],
  );
  const expressCats = [
    await createCategoryWithPairs(deps, express, people, rng, { gender: 'X', level: 'Open', name: 'Americano Mixto', maxPairs: 6, format: 'americano', matchFormat: 'games', pairs: 5 }, 0),
    await createCategoryWithPairs(deps, express, people, rng, { gender: 'M', level: '4ª', maxPairs: 8, format: 'single_elimination', matchFormat: 'single_set', pairs: 6, seeds: 2 }, 1),
  ];
  for (const [i, cat] of expressCats.entries()) await generateCategoryDraw(deps, cat, { useSeeds: true, rngSeed: 200 + i });
  await runAutoSchedule(deps, express, {
    days: [{ date: addDays(today, -40), from: '09:00', to: '21:00' }],
    slotMin: 15,
    restMin: 15,
    replaceExisting: true,
  });
  for (const cat of expressCats) {
    const [fresh] = await db.select().from(categories).where(eq(categories.id, cat.id));
    await playMatches(deps, fresh!, rng, { durationMin: express.matchDurationMin });
  }

  // 4) Borrador (solo lo ve el club).
  const draft = await createTournament(
    deps,
    clubId,
    {
      ...common,
      name: 'Liga de Invierno',
      description: 'Borrador: aún sin publicar.',
      startDate: addDays(today, 60),
      endDate: addDays(today, 62),
      priceCents: 2500,
      status: 'draft',
    },
    ['Pista Central', 'Pista 2'],
  );
  await db.insert(categories).values({
    tournamentId: draft.id,
    gender: 'M',
    level: '3ª',
    maxPairs: 16,
    format: 'groups_knockout',
    matchFormat: 'best_of_3_super_tb',
  });
}

/** Crea los datos demo si la base de datos está vacía. */
export async function seedIfEmpty(deps: AppDeps): Promise<boolean> {
  const [row] = await deps.db.select({ n: count() }).from(clubs);
  if (Number(row?.n ?? 0) > 0) return false;
  await seedDemo(deps);
  return true;
}
