/**
 * Modelo de un cuadro de competición, independiente de la base de datos.
 *
 * Un cuadro es una lista de partidos. Cada lado (a/b) de un partido declara de
 * dónde sale su participante (`SlotSource`): una pareja concreta, un "bye", el
 * ganador o perdedor de otro partido, o una posición final de un grupo. Así los
 * participantes de cualquier ronda se *derivan* de los resultados (ver
 * `resolve.ts`) y editar un resultado propaga los cambios sin estado duplicado.
 */

export type Side = 'a' | 'b';

/** Formato de competición de una categoría. */
export type CompetitionFormat = 'single_elimination' | 'consolation' | 'groups_knockout' | 'americano';

/** Formato de cada partido. */
export type MatchFormat = 'best_of_3_super_tb' | 'best_of_3' | 'single_set' | 'games';

export type Phase = 'main' | 'consolation' | 'group' | 'league';

export type SlotSource =
  | { type: 'entry'; entryId: string }
  | { type: 'bye' }
  | { type: 'winner'; match: string }
  | { type: 'loser'; match: string }
  /**
   * Alimenta la consolación: "el que pierda su primer partido viniendo del
   * partido `match` de primera ronda del cuadro principal". Si ese partido fue
   * real, es su perdedor; si fue un bye, es la pareja exenta solo si pierde su
   * siguiente partido (su primer partido jugado); si lo gana, queda un bye.
   */
  | { type: 'first_loss'; match: string }
  | { type: 'group'; group: string; rank: number };

export interface DrawMatchDef {
  /** Clave estable dentro de la categoría: "P-1-3" (principal), "C-2-1" (consolación), "G-A-4", "L-2-1". */
  key: string;
  phase: Phase;
  round: number;
  position: number;
  group: string | null;
  a: SlotSource;
  b: SlotSource;
}

export interface DrawGroupDef {
  key: string;
  name: string;
  entryIds: string[];
}

export interface DrawDef {
  groups: DrawGroupDef[];
  matches: DrawMatchDef[];
}

export interface DrawEntry {
  id: string;
  /** Cabeza de serie (1 = mejor). Opcional. */
  seed?: number | null;
}

export interface SetScore {
  a: number;
  b: number;
}

export type Outcome = 'normal' | 'walkover' | 'retired';

export interface MatchResult {
  outcome: Outcome;
  sets: SetScore[];
  /** null solo en partidos por juegos (americano) que acaban empatados. */
  winner: Side | null;
}

export type Slot = { kind: 'entry'; id: string } | { kind: 'bye' } | { kind: 'tbd' };

export type MatchStatus = 'waiting' | 'ready' | 'bye' | 'finished';

export interface ResolvedMatch {
  key: string;
  a: Slot;
  b: Slot;
  status: MatchStatus;
  winnerSide: Side | null;
  winner: Slot;
  loser: Slot;
}

export interface StandingRow {
  entryId: string;
  rank: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
}
