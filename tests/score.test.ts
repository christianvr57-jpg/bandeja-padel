import { describe, expect, it } from 'vitest';
import { formatScore, isValidSet, isValidSuperTiebreak, validateResult } from '@shared/draw/score';

const s = (...pairs: Array<[number, number]>) => pairs.map(([a, b]) => ({ a, b }));

describe('validación de sets', () => {
  it('sets normales', () => {
    for (const [a, b] of [[6, 0], [6, 4], [4, 6], [7, 5], [7, 6], [6, 7]] as const) {
      expect(isValidSet({ a, b }), `${a}-${b}`).toBe(true);
    }
    for (const [a, b] of [[6, 5], [5, 3], [8, 6], [7, 4], [6, 6], [0, 0]] as const) {
      expect(isValidSet({ a, b }), `${a}-${b}`).toBe(false);
    }
  });

  it('super tie-break a 10 con diferencia de 2', () => {
    for (const [a, b] of [[10, 0], [10, 8], [8, 10], [11, 9], [14, 12]] as const) {
      expect(isValidSuperTiebreak({ a, b }), `${a}-${b}`).toBe(true);
    }
    for (const [a, b] of [[10, 9], [9, 7], [12, 9], [11, 8], [7, 5]] as const) {
      expect(isValidSuperTiebreak({ a, b }), `${a}-${b}`).toBe(false);
    }
  });
});

describe('validateResult', () => {
  it('gana en dos sets', () => {
    const r = validateResult('best_of_3_super_tb', { outcome: 'normal', sets: s([6, 4], [6, 3]) });
    expect(r).toEqual({ ok: true, result: { outcome: 'normal', sets: s([6, 4], [6, 3]), winner: 'a' } });
  });

  it('decide el super tie-break', () => {
    const r = validateResult('best_of_3_super_tb', { outcome: 'normal', sets: s([6, 4], [3, 6], [8, 10]) });
    expect(r.ok && r.result.winner).toBe('b');
  });

  it('exige el tercer set si van 1-1', () => {
    const r = validateResult('best_of_3_super_tb', { outcome: 'normal', sets: s([6, 4], [3, 6]) });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/super tie-break/) });
  });

  it('rechaza un tercer set sobrante', () => {
    const r = validateResult('best_of_3', { outcome: 'normal', sets: s([6, 4], [6, 4], [6, 1]) });
    expect(r.ok).toBe(false);
  });

  it('en mejor de 3 sets el tercero es un set normal', () => {
    expect(validateResult('best_of_3', { outcome: 'normal', sets: s([6, 4], [3, 6], [7, 5]) }).ok).toBe(true);
    expect(validateResult('best_of_3', { outcome: 'normal', sets: s([6, 4], [3, 6], [10, 8]) }).ok).toBe(false);
  });

  it('rechaza un super tie-break mal cerrado', () => {
    const r = validateResult('best_of_3_super_tb', { outcome: 'normal', sets: s([6, 4], [3, 6], [10, 9]) });
    expect(r.ok).toBe(false);
  });

  it('W.O. y retirada requieren ganador', () => {
    expect(validateResult('best_of_3', { outcome: 'walkover', sets: [] }).ok).toBe(false);
    expect(validateResult('best_of_3', { outcome: 'walkover', sets: s([6, 0]), winner: 'b' })).toEqual({
      ok: true,
      result: { outcome: 'walkover', sets: [], winner: 'b' },
    });
    expect(validateResult('best_of_3', { outcome: 'retired', sets: s([6, 4], [2, 1]), winner: 'a' }).ok).toBe(true);
  });

  it('por juegos admite empate', () => {
    const r = validateResult('games', { outcome: 'normal', sets: s([4, 4]) });
    expect(r).toEqual({ ok: true, result: { outcome: 'normal', sets: s([4, 4]), winner: null } });
  });

  it('rechaza valores no enteros o negativos', () => {
    expect(validateResult('best_of_3', { outcome: 'normal', sets: [{ a: -1, b: 6 }, { a: 6, b: 2 }] }).ok).toBe(false);
    expect(validateResult('best_of_3', { outcome: 'normal', sets: [{ a: 6.5, b: 2 }, { a: 6, b: 2 }] }).ok).toBe(false);
  });

  it('formatea el marcador', () => {
    expect(formatScore({ outcome: 'normal', sets: s([6, 4], [3, 6], [10, 8]), winner: 'a' })).toBe('6-4 3-6 10-8');
    expect(formatScore({ outcome: 'normal', sets: s([6, 4]), winner: 'a' }, true)).toBe('4-6');
    expect(formatScore({ outcome: 'walkover', sets: [], winner: 'a' })).toBe('W.O.');
    expect(formatScore({ outcome: 'retired', sets: s([6, 4], [1, 0]), winner: 'a' })).toBe('6-4 1-0 (ret.)');
  });
});
