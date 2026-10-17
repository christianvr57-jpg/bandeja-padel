import { roundName } from '../labels';
import type { DrawMatchDef, Phase } from './types';

const PHASE_ORDER: Record<Phase, number> = { group: 0, league: 0, main: 1, consolation: 2 };

/** Ordena los partidos para mostrarlos: grupos, cuadro principal y consolación; por ronda y posición. */
export function sortMatches<T extends Pick<DrawMatchDef, 'phase' | 'round' | 'position' | 'group'>>(list: T[]): T[] {
  return [...list].sort(
    (x, y) =>
      PHASE_ORDER[x.phase] - PHASE_ORDER[y.phase] ||
      x.round - y.round ||
      (x.group ?? '').localeCompare(y.group ?? '') ||
      x.position - y.position,
  );
}

/** Número de partido (1, 2, 3…) dentro de la categoría, estable para un mismo cuadro. */
export function numberMatches(list: DrawMatchDef[]): Map<string, number> {
  return new Map(sortMatches(list).map((m, i) => [m.key, i + 1]));
}

/** Nombre de la ronda: "Cuartos de final", "Jornada 2"… */
export function roundLabelFor(match: Pick<DrawMatchDef, 'phase' | 'round'>, all: Array<Pick<DrawMatchDef, 'phase' | 'round'>>): string {
  if (match.phase === 'group' || match.phase === 'league') return `Jornada ${match.round}`;
  const total = Math.max(...all.filter((m) => m.phase === match.phase).map((m) => m.round));
  return roundName(match.round, total);
}
