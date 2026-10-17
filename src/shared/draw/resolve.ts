import { computeStandings, type RankingMode } from './standings';
import type {
  CompetitionFormat,
  DrawDef,
  DrawMatchDef,
  MatchFormat,
  MatchResult,
  ResolvedMatch,
  Side,
  Slot,
  SlotSource,
  StandingRow,
} from './types';

const TBD: Slot = { kind: 'tbd' };
const BYE: Slot = { kind: 'bye' };

export interface ResolveOptions {
  matchFormat: MatchFormat;
  ranking: RankingMode;
}

export interface ResolvedDraw {
  matches: Map<string, ResolvedMatch>;
  standings: Map<string, StandingRow[]>;
  groupComplete: Map<string, boolean>;
}

export function rankingFor(format: CompetitionFormat): RankingMode {
  return format === 'americano' ? 'games' : 'standard';
}

/** Para cada partido, el partido que recibe a su ganador. */
function winnerFeeds(def: DrawDef): Map<string, string> {
  const feeds = new Map<string, string>();
  for (const m of def.matches) {
    for (const s of [m.a, m.b]) if (s.type === 'winner') feeds.set(s.match, m.key);
  }
  return feeds;
}

/**
 * Calcula los participantes, el estado y el ganador de cada partido a partir de
 * la definición del cuadro y los resultados introducidos. Es una función pura:
 * el estado del cuadro se deriva siempre de los resultados.
 */
export function resolveDraw(
  def: DrawDef,
  results: ReadonlyMap<string, MatchResult>,
  options: ResolveOptions,
): ResolvedDraw {
  const byKey = new Map(def.matches.map((m) => [m.key, m]));
  const feeds = winnerFeeds(def);
  const cache = new Map<string, ResolvedMatch>();
  const visiting = new Set<string>();

  const standings = new Map<string, StandingRow[]>();
  const groupComplete = new Map<string, boolean>();
  for (const g of def.groups) {
    const gm = def.matches.filter((m) => m.group === g.key);
    const inputs = gm.map((m) => ({
      a: m.a.type === 'entry' ? m.a.entryId : '',
      b: m.b.type === 'entry' ? m.b.entryId : '',
      result: results.get(m.key),
    }));
    groupComplete.set(g.key, gm.length > 0 && gm.every((m) => results.has(m.key)));
    standings.set(g.key, computeStandings(g.entryIds, inputs, options.ranking, options.matchFormat));
  }

  function slotFor(src: SlotSource): Slot {
    switch (src.type) {
      case 'entry':
        return { kind: 'entry', id: src.entryId };
      case 'bye':
        return BYE;
      case 'winner':
        return evalMatch(src.match).winner;
      case 'loser':
        return evalMatch(src.match).loser;
      case 'group': {
        if (!groupComplete.get(src.group)) return TBD;
        const row = standings.get(src.group)?.[src.rank - 1];
        return row ? { kind: 'entry', id: row.entryId } : BYE;
      }
      case 'first_loss': {
        const first = evalMatch(src.match);
        if (first.a.kind === 'tbd' || first.b.kind === 'tbd') return TBD;
        if (first.a.kind === 'entry' && first.b.kind === 'entry') return first.loser;
        if (first.a.kind === 'bye' && first.b.kind === 'bye') return BYE;
        // Pareja exenta en primera ronda: entra en consolación solo si pierde su primer partido jugado.
        const holder = first.a.kind === 'entry' ? first.a : first.b;
        const nextKey = feeds.get(src.match);
        if (!nextKey || holder.kind !== 'entry') return BYE;
        const next = evalMatch(nextKey);
        if (next.status === 'waiting' || next.status === 'ready') return TBD;
        return next.loser.kind === 'entry' && next.loser.id === holder.id ? holder : BYE;
      }
    }
  }

  function evalMatch(key: string): ResolvedMatch {
    const cached = cache.get(key);
    if (cached) return cached;
    const m = byKey.get(key);
    if (!m) throw new Error(`Partido desconocido: ${key}`);
    if (visiting.has(key)) throw new Error(`Dependencia circular en el cuadro: ${key}`);
    visiting.add(key);

    const a = slotFor(m.a);
    const b = slotFor(m.b);
    let resolved: ResolvedMatch;
    if (a.kind === 'tbd' || b.kind === 'tbd') {
      resolved = { key, a, b, status: 'waiting', winnerSide: null, winner: TBD, loser: TBD };
    } else if (a.kind === 'bye' || b.kind === 'bye') {
      const side: Side | null = a.kind === 'bye' && b.kind === 'bye' ? null : a.kind === 'bye' ? 'b' : 'a';
      resolved = {
        key,
        a,
        b,
        status: 'bye',
        winnerSide: side,
        winner: side === 'a' ? a : side === 'b' ? b : BYE,
        loser: BYE,
      };
    } else {
      const r = results.get(key);
      if (!r) {
        resolved = { key, a, b, status: 'ready', winnerSide: null, winner: TBD, loser: TBD };
      } else {
        resolved = {
          key,
          a,
          b,
          status: 'finished',
          winnerSide: r.winner,
          winner: r.winner === 'a' ? a : r.winner === 'b' ? b : TBD,
          loser: r.winner === 'a' ? b : r.winner === 'b' ? a : TBD,
        };
      }
    }
    visiting.delete(key);
    cache.set(key, resolved);
    return resolved;
  }

  for (const m of def.matches) evalMatch(m.key);
  return { matches: cache, standings, groupComplete };
}

/** Partidos de los que depende directamente un hueco. */
function sourceDependencies(def: DrawDef, src: SlotSource, feeds: Map<string, string>): string[] {
  switch (src.type) {
    case 'winner':
    case 'loser':
      return [src.match];
    case 'first_loss': {
      const next = feeds.get(src.match);
      return next ? [src.match, next] : [src.match];
    }
    case 'group':
      return def.matches.filter((m) => m.group === src.group).map((m) => m.key);
    default:
      return [];
  }
}

/** Todos los partidos cuyo contenido depende (directa o indirectamente) del resultado de `key`. */
export function dependentsOf(def: DrawDef, key: string): Set<string> {
  const feeds = winnerFeeds(def);
  const reverse = new Map<string, string[]>();
  for (const m of def.matches) {
    for (const src of [m.a, m.b]) {
      for (const dep of sourceDependencies(def, src, feeds)) {
        if (!reverse.has(dep)) reverse.set(dep, []);
        reverse.get(dep)!.push(m.key);
      }
    }
  }
  const seen = new Set<string>();
  const queue = [key];
  while (queue.length) {
    const k = queue.shift()!;
    for (const next of reverse.get(k) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  seen.delete(key);
  return seen;
}

/** Partidos que deben jugarse antes que `match` (para programar horarios). */
export function prerequisitesOf(def: DrawDef, match: DrawMatchDef): string[] {
  const feeds = winnerFeeds(def);
  return [...new Set([...sourceDependencies(def, match.a, feeds), ...sourceDependencies(def, match.b, feeds)])];
}

export interface Podium {
  champion: string | null;
  runnerUp: string | null;
  consolationChampion: string | null;
}

/** Campeón, finalista y campeón de consolación (si ya se conocen). */
export function podium(def: DrawDef, resolved: ResolvedDraw): Podium {
  const out: Podium = { champion: null, runnerUp: null, consolationChampion: null };
  const finalOf = (phase: 'main' | 'consolation') => {
    const ms = def.matches.filter((m) => m.phase === phase);
    if (!ms.length) return null;
    const maxRound = Math.max(...ms.map((m) => m.round));
    return ms.find((m) => m.round === maxRound) ?? null;
  };
  const entryId = (s: Slot | undefined) => (s && s.kind === 'entry' ? s.id : null);

  const final = finalOf('main');
  if (final) {
    const r = resolved.matches.get(final.key);
    if (r && (r.status === 'finished' || r.status === 'bye')) {
      out.champion = entryId(r.winner);
      out.runnerUp = entryId(r.loser);
    }
  } else if (def.groups.length === 1) {
    const g = def.groups[0]!;
    if (resolved.groupComplete.get(g.key)) {
      const rows = resolved.standings.get(g.key) ?? [];
      out.champion = rows[0]?.entryId ?? null;
      out.runnerUp = rows[1]?.entryId ?? null;
    }
  }
  const consFinal = finalOf('consolation');
  if (consFinal) {
    const r = resolved.matches.get(consFinal.key);
    if (r && (r.status === 'finished' || r.status === 'bye')) out.consolationChampion = entryId(r.winner);
  }
  return out;
}
