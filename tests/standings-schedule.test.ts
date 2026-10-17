import { describe, expect, it } from 'vitest';
import { computeStandings } from '@shared/draw/standings';
import type { MatchResult } from '@shared/draw/types';
import { autoSchedule, findScheduleConflicts, type ScheduleItem } from '@shared/schedule';
import { utcToZonedLocal, zonedLocalToUtc } from '@shared/time';

const r = (winner: 'a' | 'b', ...sets: Array<[number, number]>): MatchResult => ({
  outcome: 'normal',
  sets: sets.map(([a, b]) => ({ a, b })),
  winner,
});

describe('clasificación de grupo', () => {
  it('con triple empate a victorias desempata por sets y juegos', () => {
    // x gana a y y a w; y gana a z y a w; z gana a w y a x -> x, y, z con 2 victorias.
    // Sets: todas +2. Juegos: x +12, z +4, y -4.
    const rows = computeStandings(
      ['x', 'y', 'z', 'w'],
      [
        { a: 'x', b: 'y', result: r('a', [6, 0], [6, 0]) },
        { a: 'y', b: 'z', result: r('a', [6, 4], [6, 4]) },
        { a: 'z', b: 'w', result: r('a', [6, 4], [6, 4]) },
        { a: 'x', b: 'w', result: r('a', [6, 4], [6, 4]) },
        { a: 'y', b: 'w', result: r('a', [6, 4], [6, 4]) },
        { a: 'z', b: 'x', result: r('a', [6, 4], [6, 4]) },
      ],
      'standard',
      'best_of_3',
    );
    expect(rows.map((x) => x.entryId)).toEqual(['x', 'z', 'y', 'w']);
    expect(rows[0]).toMatchObject({ won: 2, lost: 1, setsWon: 4, setsLost: 2, gamesWon: 32, gamesLost: 20 });
  });

  it('con dos empatadas manda el enfrentamiento directo sobre la diferencia de juegos', () => {
    // a y b con 2 victorias; a tiene mucha mejor diferencia de juegos, pero b le ganó.
    // c y d con 1 victoria; c le ganó a d.
    const rows = computeStandings(
      ['a', 'b', 'c', 'd'],
      [
        { a: 'a', b: 'c', result: r('a', [6, 0], [6, 0]) },
        { a: 'a', b: 'd', result: r('a', [6, 0], [6, 0]) },
        { a: 'b', b: 'a', result: r('a', [7, 6], [7, 6]) },
        { a: 'b', b: 'c', result: r('a', [7, 6], [7, 6]) },
        { a: 'b', b: 'd', result: r('b', [6, 7], [6, 7]) },
        { a: 'c', b: 'd', result: r('a', [6, 4], [6, 4]) },
      ],
      'standard',
      'best_of_3',
    );
    expect(rows.map((x) => x.entryId)).toEqual(['b', 'a', 'c', 'd']);
    expect(rows.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
  });

  it('un W.O. cuenta como 6-0 6-0 y el super tie-break como un juego', () => {
    const rows = computeStandings(
      ['a', 'b'],
      [
        { a: 'a', b: 'b', result: { outcome: 'walkover', sets: [], winner: 'a' } },
        { a: 'b', b: 'a', result: r('a', [6, 4], [3, 6], [10, 8]) },
      ],
      'standard',
      'best_of_3_super_tb',
    );
    const a = rows.find((x) => x.entryId === 'a')!;
    expect(a).toMatchObject({ won: 1, lost: 1, setsWon: 3, setsLost: 2, gamesWon: 12 + 4 + 6, gamesLost: 0 + 6 + 3 + 1 });
  });
});

describe('solapes de horario', () => {
  const t = (h: number) => Date.UTC(2026, 9, 24, h);
  const item = (id: string, h: number | null, court: string | null, pairs: string[], extra: Partial<ScheduleItem> = {}): ScheduleItem => ({
    id,
    start: h == null ? null : t(h),
    durationMin: 90,
    courtId: court,
    pairIds: pairs,
    playerKeys: [],
    after: [],
    ...extra,
  });

  it('detecta pista ocupada y pareja duplicada', () => {
    const c = findScheduleConflicts([
      item('m1', 10, 'p1', ['A', 'B']),
      item('m2', 11, 'p1', ['C', 'D']),
      item('m3', 11, 'p2', ['A', 'E']),
      item('m4', 12, 'p1', ['F', 'G']),
    ]);
    const key = (x: { type: string; matchId: string; otherId: string }) => `${x.type}:${x.matchId}>${x.otherId}`;
    expect(c.map(key).sort()).toEqual(
      ['court:m1>m2', 'court:m2>m1', 'pair:m1>m3', 'pair:m3>m1', 'court:m2>m4', 'court:m4>m2'].sort(),
    );
  });

  it('detecta jugadores que coinciden en otra categoría', () => {
    const c = findScheduleConflicts([
      item('m1', 10, 'p1', ['A'], { playerKeys: ['12345678Z'] }),
      item('m2', 10, 'p2', ['X'], { playerKeys: ['12345678Z'] }),
    ]);
    expect(c.map((x) => x.type)).toEqual(['player', 'player']);
  });

  it('detecta partidos programados antes que sus previos', () => {
    const c = findScheduleConflicts([item('final', 10, 'p1', []), item('semi', 9, 'p2', [], {}), { ...item('final2', 9, 'p3', []), after: ['semi'] }]);
    expect(c).toEqual([expect.objectContaining({ type: 'order', matchId: 'final2', otherId: 'semi' })]);
  });

  it('la programación automática respeta pistas, parejas y orden', () => {
    const res = autoSchedule(
      [
        { id: 's1', durationMin: 60, pairIds: ['A', 'B'], playerKeys: [], after: [], priority: 1 },
        { id: 's2', durationMin: 60, pairIds: ['C', 'D'], playerKeys: [], after: [], priority: 1 },
        { id: 's3', durationMin: 60, pairIds: ['A', 'E'], playerKeys: [], after: [], priority: 1 },
        { id: 'f', durationMin: 60, pairIds: [], playerKeys: [], after: ['s1', 's2'], priority: 2 },
      ],
      [],
      { courtIds: ['c1', 'c2'], windows: [{ start: t(9), end: t(13) }], slotMin: 30, restMin: 0 },
    );
    expect(res.unscheduled).toEqual([]);
    expect(res.assigned.get('s1')).toEqual({ start: t(9), courtId: 'c1' });
    expect(res.assigned.get('s2')).toEqual({ start: t(9), courtId: 'c2' });
    expect(res.assigned.get('s3')!.start).toBe(t(10)); // A ya juega a las 9
    expect(res.assigned.get('f')!.start).toBeGreaterThanOrEqual(t(10));
    const items: ScheduleItem[] = [...res.assigned].map(([id, a]) => ({
      id,
      start: a.start,
      durationMin: 60,
      courtId: a.courtId,
      pairIds: id === 's1' ? ['A', 'B'] : id === 's2' ? ['C', 'D'] : id === 's3' ? ['A', 'E'] : [],
      playerKeys: [],
      after: id === 'f' ? ['s1', 's2'] : [],
    }));
    expect(findScheduleConflicts(items)).toEqual([]);
  });

  it('deja sin programar lo que no cabe en las franjas', () => {
    const res = autoSchedule(
      [
        { id: 'm1', durationMin: 90, pairIds: ['A'], playerKeys: [], after: [], priority: 1 },
        { id: 'm2', durationMin: 90, pairIds: ['B'], playerKeys: [], after: [], priority: 1 },
      ],
      [],
      { courtIds: ['c1'], windows: [{ start: t(9), end: t(11) }], slotMin: 30, restMin: 0 },
    );
    expect(res.unscheduled).toEqual(['m2']);
  });
});

describe('zonas horarias', () => {
  it('convierte hora local de Madrid y Canarias a UTC (con cambio de hora)', () => {
    expect(zonedLocalToUtc('2026-10-24T09:30', 'Europe/Madrid').toISOString()).toBe('2026-10-24T07:30:00.000Z');
    expect(zonedLocalToUtc('2026-12-01T10:00', 'Europe/Madrid').toISOString()).toBe('2026-12-01T09:00:00.000Z');
    expect(zonedLocalToUtc('2026-12-01T10:00', 'Atlantic/Canary').toISOString()).toBe('2026-12-01T10:00:00.000Z');
  });

  it('ida y vuelta', () => {
    for (const local of ['2026-03-29T03:30', '2026-10-25T02:30', '2026-07-01T23:45', '2026-01-01T00:00']) {
      const back = utcToZonedLocal(zonedLocalToUtc(local, 'Europe/Madrid'), 'Europe/Madrid');
      // En el salto de primavera (02:00-03:00 no existe) se acepta una hora de desplazamiento.
      expect(Math.abs(Date.parse(back) - Date.parse(local))).toBeLessThanOrEqual(3600_000);
    }
  });
});
