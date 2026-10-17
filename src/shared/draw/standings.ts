import { isSuperTiebreakSet, walkoverSets } from './score';
import type { MatchFormat, MatchResult, StandingRow } from './types';

export type RankingMode = 'standard' | 'games';

export interface StandingMatchInput {
  a: string;
  b: string;
  result: MatchResult | null | undefined;
}

type Row = StandingRow & { order: number };

/**
 * Clasificación de un grupo o liguilla.
 *
 * - standard (grupos): partidos ganados; si empatan exactamente dos parejas,
 *   decide el enfrentamiento directo; después diferencia de sets, diferencia
 *   de juegos, juegos ganados y, por último, el orden del sorteo.
 * - games (americano): juegos ganados, diferencia de juegos y partidos ganados.
 *
 * Un W.O. cuenta como 6-0 6-0. Un super tie-break cuenta como un set y un juego.
 */
export function computeStandings(
  entryIds: string[],
  matches: StandingMatchInput[],
  mode: RankingMode,
  format: MatchFormat,
): StandingRow[] {
  const rows = new Map<string, Row>(
    entryIds.map((entryId, order) => [
      entryId,
      { entryId, rank: 0, played: 0, won: 0, drawn: 0, lost: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, order },
    ]),
  );
  const headToHead = new Map<string, string>(); // "x|y" -> ganador

  for (const m of matches) {
    const r = m.result;
    const ra = rows.get(m.a);
    const rb = rows.get(m.b);
    if (!r || !ra || !rb) continue;
    ra.played++;
    rb.played++;
    if (r.winner === 'a') {
      ra.won++;
      rb.lost++;
    } else if (r.winner === 'b') {
      rb.won++;
      ra.lost++;
    } else {
      ra.drawn++;
      rb.drawn++;
    }
    if (r.winner) {
      const w = r.winner === 'a' ? m.a : m.b;
      headToHead.set(`${m.a}|${m.b}`, w);
      headToHead.set(`${m.b}|${m.a}`, w);
    }
    const sets = r.outcome === 'walkover' && r.winner ? walkoverSets(format, r.winner) : r.sets;
    sets.forEach((s, i) => {
      if (s.a > s.b) {
        ra.setsWon++;
        rb.setsLost++;
      } else if (s.b > s.a) {
        rb.setsWon++;
        ra.setsLost++;
      }
      const stb = isSuperTiebreakSet(format, i);
      const ga = stb ? Number(s.a > s.b) : s.a;
      const gb = stb ? Number(s.b > s.a) : s.b;
      ra.gamesWon += ga;
      ra.gamesLost += gb;
      rb.gamesWon += gb;
      rb.gamesLost += ga;
    });
  }

  const list = [...rows.values()];
  const setDiff = (x: Row) => x.setsWon - x.setsLost;
  const gameDiff = (x: Row) => x.gamesWon - x.gamesLost;

  if (mode === 'games') {
    list.sort(
      (x, y) => y.gamesWon - x.gamesWon || gameDiff(y) - gameDiff(x) || y.won - x.won || x.order - y.order,
    );
  } else {
    list.sort(
      (x, y) =>
        y.won - x.won ||
        setDiff(y) - setDiff(x) ||
        gameDiff(y) - gameDiff(x) ||
        y.gamesWon - x.gamesWon ||
        x.order - y.order,
    );
    // Enfrentamiento directo cuando empatan exactamente dos parejas a victorias.
    for (let i = 0; i < list.length; i++) {
      let j = i;
      while (j + 1 < list.length && list[j + 1]!.won === list[i]!.won) j++;
      if (j === i + 1) {
        const winner = headToHead.get(`${list[i]!.entryId}|${list[j]!.entryId}`);
        if (winner === list[j]!.entryId) [list[i], list[j]] = [list[j]!, list[i]!];
      }
      i = j;
    }
  }

  return list.map(({ order: _order, ...row }, idx) => ({ ...row, rank: idx + 1 }));
}
