import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { DrawGroupDef, SetScore, SlotSource } from '../../shared/draw/types';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const clubs = pgTable(
  'clubs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    city: text('city').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('clubs_email_key').on(t.email)],
);

/** Sesiones del club. El id es el SHA-256 del token de la cookie: un volcado de la BD no permite suplantar sesiones. */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_club_idx').on(t.clubId)],
);

export const tournaments = pgTable(
  'tournaments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    venue: text('venue').notNull().default(''),
    address: text('address').notNull().default(''),
    timezone: text('timezone').notNull().default('Europe/Madrid'),
    priceCents: integer('price_cents').notNull().default(0),
    registrationDeadline: timestamp('registration_deadline', { withTimezone: true }),
    rules: text('rules').notNull().default(''),
    image: text('image'),
    matchDurationMin: integer('match_duration_min').notNull().default(90),
    /** draft | published | finished */
    status: text('status').notNull().default('draft'),
    registrationOpen: boolean('registration_open').notNull().default(true),
    contactEmail: text('contact_email').notNull().default(''),
    contactPhone: text('contact_phone').notNull().default(''),
    personalDataPurgedAt: timestamp('personal_data_purged_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tournaments_slug_key').on(t.slug), index('tournaments_club_idx').on(t.clubId)],
);

export const courts = pgTable(
  'courts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('courts_tournament_idx').on(t.tournamentId)],
);

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    /** M | F | X */
    gender: text('gender').notNull(),
    level: text('level').notNull(),
    name: text('name').notNull().default(''),
    maxPairs: integer('max_pairs').notNull(),
    format: text('format').notNull(),
    matchFormat: text('match_format').notNull(),
    groupSize: integer('group_size').notNull().default(4),
    qualifiersPerGroup: integer('qualifiers_per_group').notNull().default(2),
    position: integer('position').notNull().default(0),
    drawGeneratedAt: timestamp('draw_generated_at', { withTimezone: true }),
    drawGroups: jsonb('draw_groups').$type<DrawGroupDef[]>(),
    createdAt: createdAt(),
  },
  (t) => [index('categories_tournament_idx').on(t.tournamentId)],
);

/** Una inscripción = una pareja. Los datos personales están en `players`. */
export const registrations = pgTable(
  'registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    /** confirmed | waitlist | cancelled */
    status: text('status').notNull(),
    paid: boolean('paid').notNull().default(false),
    seed: integer('seed'),
    /** SHA-256 del enlace de gestión que recibe la pareja por email (null tras anonimizar). */
    tokenHash: text('token_hash'),
    consentAt: timestamp('consent_at', { withTimezone: true }),
    consentVersion: text('consent_version'),
    notes: text('notes').notNull().default(''),
    /** public (formulario) | club (añadida por el club) */
    source: text('source').notNull().default('public'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('registrations_token_key').on(t.tokenHash),
    index('registrations_category_idx').on(t.categoryId, t.status, t.createdAt),
    index('registrations_tournament_idx').on(t.tournamentId),
  ],
);

export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => registrations.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').notNull(),
    /** 1 o 2 */
    position: integer('position').notNull(),
    fullName: text('full_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    dni: text('dni'),
    /** false si la inscripción está cancelada: libera el DNI para volver a inscribirse. */
    active: boolean('active').notNull().default(true),
  },
  (t) => [
    index('players_registration_idx').on(t.registrationId),
    // Un mismo DNI no puede estar dos veces (activo) en la misma categoría, ni siquiera con carreras concurrentes.
    uniqueIndex('players_category_dni_active_key').on(t.categoryId, t.dni).where(sql`${t.active} = true`),
  ],
);

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    phase: text('phase').notNull(),
    round: integer('round').notNull(),
    position: integer('position').notNull(),
    groupKey: text('group_key'),
    sourceA: jsonb('source_a').$type<SlotSource>().notNull(),
    sourceB: jsonb('source_b').$type<SlotSource>().notNull(),
    /** Participantes resueltos (caché de resolveDraw, para consultas y horarios). */
    pairAId: uuid('pair_a_id'),
    pairBId: uuid('pair_b_id'),
    /** waiting | ready | bye | finished */
    status: text('status').notNull().default('waiting'),
    outcome: text('outcome'),
    sets: jsonb('sets').$type<SetScore[]>(),
    winnerSide: text('winner_side'),
    resultAt: timestamp('result_at', { withTimezone: true }),
    courtId: uuid('court_id').references(() => courts.id, { onDelete: 'set null' }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('matches_category_key').on(t.categoryId, t.key),
    index('matches_tournament_idx').on(t.tournamentId),
  ],
);

/** Registro de emails enviados. El cuerpo solo se guarda en modo demo (contiene enlaces privados). */
export const emails = pgTable(
  'emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id'),
    toEmail: text('to_email').notNull(),
    subject: text('subject').notNull(),
    kind: text('kind').notNull(),
    body: text('body'),
    /** sent | logged | failed */
    status: text('status').notNull(),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [index('emails_created_idx').on(t.createdAt)],
);

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  count: integer('count').notNull(),
});
