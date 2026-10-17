/** Tipos de las respuestas de la API, compartidos por servidor y cliente. */
import type {
  CompetitionFormat,
  MatchFormat,
  MatchStatus,
  Outcome,
  Phase,
  SetScore,
  Side,
  StandingRow,
} from './draw/types';
import type { ScheduleConflict } from './schedule';

/** Versión de la política de privacidad que se acepta al inscribirse (se guarda con el consentimiento). */
export const PRIVACY_VERSION = '2026-10';

export interface ApiErrorBody {
  error: { message: string; fields?: Record<string, string> };
}

export interface ClubMe {
  id: string;
  name: string;
  email: string;
  city: string;
}

export interface PairView {
  id: string;
  players: string[];
  seed: number | null;
}

export type SlotView = { kind: 'pair'; pairId: string } | { kind: 'bye' } | { kind: 'tbd'; label: string };

export interface MatchView {
  id: string;
  key: string;
  number: number;
  phase: Phase;
  round: number;
  position: number;
  group: string | null;
  roundLabel: string;
  a: SlotView;
  b: SlotView;
  status: MatchStatus;
  winnerSide: Side | null;
  outcome: Outcome | null;
  sets: SetScore[];
  courtId: string | null;
  scheduledAt: string | null;
}

export interface GroupView {
  key: string;
  name: string;
  complete: boolean;
  standings: StandingRow[];
}

export interface CategoryView {
  id: string;
  label: string;
  gender: string;
  level: string;
  name: string;
  format: CompetitionFormat;
  matchFormat: MatchFormat;
  maxPairs: number;
  groupSize: number;
  qualifiersPerGroup: number;
  confirmedCount: number;
  waitlistCount: number;
  registrationOpen: boolean;
  drawGenerated: boolean;
  pairs: PairView[];
  groups: GroupView[];
  matches: MatchView[];
  podium: { champion: string | null; runnerUp: string | null; consolationChampion: string | null };
}

export interface CourtView {
  id: string;
  name: string;
}

export type TournamentStatus = 'draft' | 'published' | 'finished';

export interface TournamentInfo {
  id: string;
  slug: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  venue: string;
  address: string;
  timezone: string;
  priceCents: number;
  registrationDeadline: string | null;
  rules: string;
  image: string | null;
  status: TournamentStatus;
  registrationOpen: boolean;
  contactEmail: string;
  contactPhone: string;
  matchDurationMin: number;
  clubName: string;
  clubCity: string;
  publicUrl: string;
}

export interface PublicTournamentView {
  tournament: TournamentInfo;
  /** true si lo está viendo el club organizador antes de publicarlo. */
  preview: boolean;
  courts: CourtView[];
  categories: CategoryView[];
}

export interface TournamentListItem {
  id: string;
  slug: string;
  name: string;
  startDate: string;
  endDate: string;
  venue: string;
  status: TournamentStatus;
  clubName: string;
  clubCity: string;
  categoriesCount: number;
  pairsCount: number;
  registrationOpen: boolean;
}

export interface AdminCategory {
  id: string;
  gender: string;
  level: string;
  name: string;
  label: string;
  maxPairs: number;
  format: CompetitionFormat;
  matchFormat: MatchFormat;
  groupSize: number;
  qualifiersPerGroup: number;
  drawGenerated: boolean;
  confirmedCount: number;
  waitlistCount: number;
  paidCount: number;
  matchesTotal: number;
  matchesPlayed: number;
}

export interface AdminTournament extends Omit<TournamentInfo, 'registrationDeadline'> {
  registrationDeadline: string | null;
  /** Fecha límite en hora local del torneo ("YYYY-MM-DDTHH:mm") para el formulario. */
  registrationDeadlineLocal: string | null;
  /** Estado configurado por el club (inscripciones abiertas/cerradas a mano). */
  registrationOpenSetting: boolean;
  personalDataPurgedAt: string | null;
  courts: CourtView[];
  categories: AdminCategory[];
}

export interface AdminPlayer {
  fullName: string;
  email: string | null;
  phone: string | null;
  dni: string | null;
}

export type RegistrationStatus = 'confirmed' | 'waitlist' | 'cancelled';

export interface AdminRegistration {
  id: string;
  categoryId: string;
  status: RegistrationStatus;
  paid: boolean;
  seed: number | null;
  notes: string;
  source: 'public' | 'club';
  createdAt: string;
  waitlistPosition: number | null;
  inDraw: boolean;
  players: AdminPlayer[];
}

export interface AdminCompetitionView {
  timezone: string;
  matchDurationMin: number;
  courts: CourtView[];
  categories: CategoryView[];
  conflicts: ScheduleConflict[];
}

export interface RegistrationResult {
  id: string;
  status: 'confirmed' | 'waitlist';
  waitlistPosition: number | null;
  /** Enlace privado de gestión (también se envía por email). */
  manageUrl: string;
  managePath: string;
}

export interface ManagedRegistration {
  id: string;
  status: RegistrationStatus;
  paid: boolean;
  createdAt: string;
  waitlistPosition: number | null;
  canEdit: boolean;
  canCancel: boolean;
  cancelBlockedReason: string | null;
  category: { id: string; label: string };
  tournament: { slug: string; name: string; startDate: string; endDate: string; venue: string; clubName: string; priceCents: number; timezone: string };
  players: Array<{ fullName: string; email: string; phone: string; dniMasked: string }>;
  matches: Array<{ number: number; roundLabel: string; scheduledAt: string | null; courtName: string | null; opponent: string[] | null; score: string; status: MatchStatus }>;
}

export interface OutboxEmail {
  id: string;
  toEmail: string;
  subject: string;
  kind: string;
  body: string | null;
  status: string;
  createdAt: string;
}
