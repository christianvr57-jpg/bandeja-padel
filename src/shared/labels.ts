import type { CompetitionFormat, MatchFormat, Phase } from './draw/types';

export const GENDERS = { M: 'Masculina', F: 'Femenina', X: 'Mixta' } as const;
export type Gender = keyof typeof GENDERS;

export const LEVELS = ['1ª', '2ª', '3ª', '4ª', '5ª', 'Iniciación', 'Medio', 'Avanzado', 'Open'] as const;

export const COMPETITION_FORMATS: Record<CompetitionFormat, { label: string; help: string }> = {
  single_elimination: {
    label: 'Eliminatoria directa',
    help: 'Quien pierde queda eliminado. Byes automáticos si no cuadra la potencia de 2.',
  },
  consolation: {
    label: 'Eliminatoria con consolación',
    help: 'Quien pierde su primer partido pasa a un cuadro de consolación.',
  },
  groups_knockout: {
    label: 'Fase de grupos + eliminatoria',
    help: 'Liguilla en grupos y los mejores de cada grupo pasan a la eliminatoria.',
  },
  americano: {
    label: 'Americano por parejas',
    help: 'Todos contra todos a un set por juegos; gana quien más juegos suma.',
  },
};

export const MATCH_FORMATS: Record<MatchFormat, string> = {
  best_of_3_super_tb: 'Mejor de 3 sets (3º = super tie-break)',
  best_of_3: 'Mejor de 3 sets',
  single_set: 'Un set',
  games: 'Por juegos (un set, se puede empatar)',
};

export function categoryLabel(c: { gender: string; level: string; name?: string | null }): string {
  if (c.name && c.name.trim()) return c.name.trim();
  const g = GENDERS[c.gender as Gender] ?? '';
  return `${g} ${c.level}`.trim();
}

export function roundName(round: number, totalRounds: number): string {
  const remaining = totalRounds - round;
  const names = ['Final', 'Semifinales', 'Cuartos de final', 'Octavos de final', 'Dieciseisavos', 'Treintaidosavos'];
  return names[remaining] ?? `Ronda ${round}`;
}

export function phaseLabel(phase: Phase): string {
  return { main: 'Cuadro principal', consolation: 'Consolación', group: 'Fase de grupos', league: 'Liguilla' }[phase];
}

export function formatPrice(cents: number): string {
  if (!cents) return 'Gratis';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
