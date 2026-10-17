import type { MatchFormat, MatchResult, Outcome, SetScore, Side } from './types';

/** Set normal: 6-0 … 6-4, 7-5 o 7-6 (con tie-break). */
export function isValidSet(s: SetScore): boolean {
  const w = Math.max(s.a, s.b);
  const l = Math.min(s.a, s.b);
  return (w === 6 && l <= 4) || (w === 7 && (l === 5 || l === 6));
}

/** Super tie-break a 10 puntos con 2 de diferencia: 10-8, 11-9, 12-10… */
export function isValidSuperTiebreak(s: SetScore): boolean {
  const w = Math.max(s.a, s.b);
  const l = Math.min(s.a, s.b);
  return w >= 10 && w - l >= 2 && (w === 10 || w - l === 2);
}

/** ¿Es el set `index` (0-based) un super tie-break en este formato? */
export function isSuperTiebreakSet(format: MatchFormat, index: number): boolean {
  return format === 'best_of_3_super_tb' && index === 2;
}

export interface ResultInput {
  outcome: Outcome;
  sets: SetScore[];
  winner?: Side | null;
}

export type ResultValidation = { ok: true; result: MatchResult } | { ok: false; error: string };

const fail = (error: string): ResultValidation => ({ ok: false, error });

function setWinner(s: SetScore): Side | null {
  return s.a > s.b ? 'a' : s.b > s.a ? 'b' : null;
}

function cleanSets(sets: SetScore[]): SetScore[] | null {
  const out: SetScore[] = [];
  for (const s of sets ?? []) {
    if (!Number.isInteger(s.a) || !Number.isInteger(s.b) || s.a < 0 || s.b < 0 || s.a > 99 || s.b > 99) return null;
    out.push({ a: s.a, b: s.b });
  }
  return out;
}

/** Valida un resultado según el formato del partido y calcula el ganador. */
export function validateResult(format: MatchFormat, input: ResultInput): ResultValidation {
  const sets = cleanSets(input.sets);
  if (!sets) return fail('Los marcadores deben ser números enteros entre 0 y 99.');

  if (input.outcome === 'walkover') {
    if (input.winner !== 'a' && input.winner !== 'b') return fail('Indica qué pareja gana por W.O.');
    return { ok: true, result: { outcome: 'walkover', sets: [], winner: input.winner } };
  }

  if (input.outcome === 'retired') {
    if (input.winner !== 'a' && input.winner !== 'b') return fail('Indica qué pareja gana por retirada.');
    if (sets.length > 3) return fail('Como máximo 3 sets.');
    return { ok: true, result: { outcome: 'retired', sets, winner: input.winner } };
  }

  if (input.outcome !== 'normal') return fail('Tipo de resultado no válido.');

  if (format === 'games') {
    if (sets.length !== 1) return fail('Introduce los juegos de cada pareja.');
    return { ok: true, result: { outcome: 'normal', sets, winner: setWinner(sets[0]!) } };
  }

  if (format === 'single_set') {
    if (sets.length !== 1) return fail('Este partido se juega a un set.');
    if (!isValidSet(sets[0]!)) return fail(`Set no válido (${sets[0]!.a}-${sets[0]!.b}).`);
    return { ok: true, result: { outcome: 'normal', sets, winner: setWinner(sets[0]!) } };
  }

  // Mejor de 3 sets (el tercero puede ser super tie-break).
  if (sets.length < 2) return fail('Introduce al menos 2 sets.');
  if (sets.length > 3) return fail('Como máximo 3 sets.');
  for (let i = 0; i < 2; i++) {
    if (!isValidSet(sets[i]!)) return fail(`Set ${i + 1} no válido (${sets[i]!.a}-${sets[i]!.b}).`);
  }
  const first = setWinner(sets[0]!);
  const second = setWinner(sets[1]!);
  if (first === second) {
    if (sets.length === 3) return fail('El partido ya estaba decidido en dos sets: sobra el tercero.');
    return { ok: true, result: { outcome: 'normal', sets, winner: first } };
  }
  if (sets.length < 3) {
    return fail(format === 'best_of_3_super_tb' ? 'Falta el super tie-break (1-1 en sets).' : 'Falta el tercer set (1-1 en sets).');
  }
  const third = sets[2]!;
  if (format === 'best_of_3_super_tb') {
    if (!isValidSuperTiebreak(third)) {
      return fail(`Super tie-break no válido (${third.a}-${third.b}): a 10 puntos con 2 de diferencia.`);
    }
  } else if (!isValidSet(third)) {
    return fail(`Set 3 no válido (${third.a}-${third.b}).`);
  }
  return { ok: true, result: { outcome: 'normal', sets, winner: setWinner(third) } };
}

/** Sets "virtuales" con los que cuenta un W.O. en las clasificaciones (6-0 6-0). */
export function walkoverSets(format: MatchFormat, winner: Side): SetScore[] {
  const won = (): SetScore => (winner === 'a' ? { a: 6, b: 0 } : { a: 0, b: 6 });
  if (format === 'games') return [];
  if (format === 'single_set') return [won()];
  return [won(), won()];
}

/** "6-4 3-6 10-8", "W.O." o "6-4 2-1 (ret.)". Opcionalmente desde el punto de vista de b. */
export function formatScore(result: MatchResult | null | undefined, flip = false): string {
  if (!result) return '';
  if (result.outcome === 'walkover') return 'W.O.';
  const sets = result.sets.map((s) => (flip ? `${s.b}-${s.a}` : `${s.a}-${s.b}`)).join(' ');
  return result.outcome === 'retired' ? `${sets} (ret.)`.trim() : sets;
}
