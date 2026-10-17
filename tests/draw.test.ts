import { describe, expect, it } from 'vitest';
import {
  bracketOrder,
  DrawError,
  generateDraw,
  nextPowerOfTwo,
  placeInBracket,
  splitIntoGroups,
  roundRobin,
  swapSlots,
  swapEntries,
} from '@shared/draw/generate';
import { seededRng } from '@shared/draw/random';
import { dependentsOf, podium, resolveDraw } from '@shared/draw/resolve';
import type { DrawDef, DrawEntry, MatchResult, ResolvedMatch, Side } from '@shared/draw/types';

const entries = (n: number, seeds = 0): DrawEntry[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, seed: i < seeds ? i + 1 : null }));

const win = (winner: Side): MatchResult => ({
  outcome: 'normal',
  sets: winner === 'a' ? [{ a: 6, b: 2 }, { a: 6, b: 3 }] : [{ a: 2, b: 6 }, { a: 3, b: 6 }],
  winner,
});

const opts = { matchFormat: 'best_of_3_super_tb', ranking: 'standard' } as const;

/** Juega todos los partidos jugables (ganando siempre el lado indicado) hasta que no quede ninguno. */
function playAll(def: DrawDef, pick: (m: ResolvedMatch) => Side = () => 'a') {
  const results = new Map<string, MatchResult>();
  for (;;) {
    const resolved = resolveDraw(def, results, opts);
    const ready = [...resolved.matches.values()].filter((m) => m.status === 'ready');
    if (!ready.length) return { results, resolved };
    for (const m of ready) results.set(m.key, win(pick(m)));
  }
}

const idOf = (m: ResolvedMatch | undefined, side: Side) => {
  const slot = m?.[side];
  return slot?.kind === 'entry' ? slot.id : slot?.kind;
};

describe('orden de cabezas de serie', () => {
  it('sigue el orden estándar', () => {
    expect(bracketOrder(2)).toEqual([1, 2]);
    expect(bracketOrder(4)).toEqual([1, 4, 2, 3]);
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('cada primera ronda suma size + 1 y contiene todas las siembras', () => {
    for (const size of [2, 4, 8, 16, 32, 64]) {
      const order = bracketOrder(size);
      expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: size }, (_, i) => i + 1));
      for (let i = 0; i < size; i += 2) expect(order[i]! + order[i + 1]!).toBe(size + 1);
    }
  });

  it('las cabezas 1 y 2 van en mitades opuestas', () => {
    const order = bracketOrder(16);
    expect(order.indexOf(1)).toBeLessThan(8);
    expect(order.indexOf(2)).toBeGreaterThanOrEqual(8);
  });
});

describe('byes', () => {
  it('rellena hasta la potencia de 2 sin partidos bye contra bye', () => {
    for (let n = 2; n <= 40; n++) {
      const slots = placeInBracket(entries(n), seededRng(n));
      const size = nextPowerOfTwo(n);
      expect(slots).toHaveLength(size);
      expect(slots.filter((s) => s.type === 'bye')).toHaveLength(size - n);
      const ids = slots.flatMap((s) => (s.type === 'entry' ? [s.entryId] : []));
      expect(new Set(ids).size).toBe(n);
      for (let i = 0; i < size; i += 2) {
        expect(slots[i]!.type === 'bye' && slots[i + 1]!.type === 'bye', `n=${n} partido ${i / 2}`).toBe(false);
      }
    }
  });

  it('los byes van para las cabezas de serie', () => {
    // 12 parejas en cuadro de 16 -> 4 byes para las 4 cabezas de serie.
    const def = generateDraw('single_elimination', entries(12, 4), {}, seededRng(7));
    const byeMatches = def.matches.filter((m) => m.round === 1 && (m.a.type === 'bye' || m.b.type === 'bye'));
    const withBye = byeMatches.map((m) => (m.a.type === 'entry' ? m.a.entryId : m.b.type === 'entry' ? m.b.entryId : ''));
    expect(withBye.sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('el sorteo es reproducible con la misma semilla y cambia con otra', () => {
    const a = generateDraw('single_elimination', entries(10), {}, seededRng(1));
    const b = generateDraw('single_elimination', entries(10), {}, seededRng(1));
    const c = generateDraw('single_elimination', entries(10), {}, seededRng(2));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe('eliminatoria directa: avance de rondas', () => {
  it('tiene log2(size) rondas y size - 1 partidos', () => {
    const def = generateDraw('single_elimination', entries(11), {}, seededRng(3));
    expect(def.matches).toHaveLength(15);
    expect(Math.max(...def.matches.map((m) => m.round))).toBe(4);
  });

  it('los exentos pasan solos y los ganadores avanzan hasta la final', () => {
    const def = generateDraw('single_elimination', entries(5), {}, seededRng(11));
    const before = resolveDraw(def, new Map(), opts);
    const round1 = def.matches.filter((m) => m.round === 1).map((m) => before.matches.get(m.key)!);
    expect(round1.filter((m) => m.status === 'bye')).toHaveLength(3);
    expect(round1.filter((m) => m.status === 'ready')).toHaveLength(1);

    // Un partido de segunda ronda formado por dos exentos ya está listo para jugarse.
    const round2 = def.matches.filter((m) => m.round === 2).map((m) => before.matches.get(m.key)!);
    expect(round2.some((m) => m.status === 'ready')).toBe(true);

    const { resolved } = playAll(def);
    const final = resolved.matches.get('P-3-1')!;
    expect(final.status).toBe('finished');
    const p = podium(def, resolved);
    expect(p.champion).toBe(idOf(final, 'a'));
    expect(p.runnerUp).toBe(idOf(final, 'b'));
  });

  it('el ganador de cada partido aparece en el siguiente', () => {
    const def = generateDraw('single_elimination', entries(8), {}, seededRng(5));
    const results = new Map<string, MatchResult>([['P-1-1', win('b')], ['P-1-2', win('a')]]);
    const r = resolveDraw(def, results, opts);
    const m11 = r.matches.get('P-1-1')!;
    const m12 = r.matches.get('P-1-2')!;
    const m21 = r.matches.get('P-2-1')!;
    expect(idOf(m21, 'a')).toBe(idOf(m11, 'b'));
    expect(idOf(m21, 'b')).toBe(idOf(m12, 'a'));
    expect(m21.status).toBe('ready');
  });

  it('cambiar un resultado se propaga mientras el siguiente no se haya jugado', () => {
    const def = generateDraw('single_elimination', entries(4), {}, seededRng(5));
    const results = new Map<string, MatchResult>([['P-1-1', win('a')]]);
    const first = resolveDraw(def, results, opts).matches.get('P-2-1')!;
    results.set('P-1-1', win('b'));
    const second = resolveDraw(def, results, opts).matches.get('P-2-1')!;
    expect(idOf(first, 'a')).not.toBe(idOf(second, 'a'));
  });

  it('calcula los partidos dependientes para bloquear ediciones', () => {
    const def = generateDraw('single_elimination', entries(8), {}, seededRng(5));
    expect([...dependentsOf(def, 'P-1-1')].sort()).toEqual(['P-2-1', 'P-3-1']);
    expect(dependentsOf(def, 'P-3-1').size).toBe(0);
  });

  it('exige al menos dos parejas y cabezas de serie únicas', () => {
    expect(() => generateDraw('single_elimination', entries(1), {}, seededRng(1))).toThrow(DrawError);
    expect(() =>
      generateDraw('single_elimination', [{ id: 'a', seed: 1 }, { id: 'b', seed: 1 }], {}, seededRng(1)),
    ).toThrow(DrawError);
  });
});

describe('consolación', () => {
  it('los perdedores de primera ronda van a consolación', () => {
    const def = generateDraw('consolation', entries(8), {}, seededRng(9));
    const cons = def.matches.filter((m) => m.phase === 'consolation');
    expect(cons).toHaveLength(3);
    const results = new Map<string, MatchResult>();
    for (let i = 1; i <= 4; i++) results.set(`P-1-${i}`, win('a'));
    const r = resolveDraw(def, results, opts);
    const losers = [1, 2, 3, 4].map((i) => idOf(r.matches.get(`P-1-${i}`), 'b'));
    const c11 = r.matches.get('C-1-1')!;
    const c12 = r.matches.get('C-1-2')!;
    expect([idOf(c11, 'a'), idOf(c11, 'b'), idOf(c12, 'a'), idOf(c12, 'b')]).toEqual(losers);
    expect(c11.status).toBe('ready');
  });

  it('una pareja exenta entra en consolación solo si pierde su primer partido', () => {
    // 6 parejas -> cuadro de 8 con 2 byes (P-1-1 y P-1-3 tienen bye para las cabezas 1 y 2).
    const def = generateDraw('consolation', entries(6, 2), {}, seededRng(4));
    const results = new Map<string, MatchResult>([['P-1-2', win('a')], ['P-1-4', win('a')]]);
    let r = resolveDraw(def, results, opts);
    expect(r.matches.get('P-1-1')!.status).toBe('bye');
    // Aún no se sabe si la cabeza de serie 1 caerá en su primer partido.
    expect(r.matches.get('C-1-1')!.a.kind).toBe('tbd');

    // La cabeza 1 (lado a de P-2-1) pierde su primer partido -> entra en consolación.
    results.set('P-2-1', win('b'));
    // La cabeza 2 gana su primer partido -> su hueco en consolación es un bye.
    results.set('P-2-2', win('a'));
    r = resolveDraw(def, results, opts);
    const seed1 = idOf(r.matches.get('P-2-1'), 'a');
    expect(seed1).toBe('p1');
    expect(idOf(r.matches.get('C-1-1'), 'a')).toBe('p1');
    expect(r.matches.get('C-1-2')!.a.kind).toBe('bye');
    // Y el perdedor de P-1-4 pasa directamente a la final de consolación.
    expect(r.matches.get('C-1-2')!.status).toBe('bye');
    expect(idOf(r.matches.get('C-2-1'), 'b')).toBe(idOf(r.matches.get('P-1-4'), 'b'));
  });

  it('se completa jugando todos los partidos', () => {
    for (let n = 4; n <= 20; n++) {
      const def = generateDraw('consolation', entries(n), {}, seededRng(n));
      const { resolved } = playAll(def, (m) => (m.key.length % 2 ? 'a' : 'b'));
      const p = podium(def, resolved);
      expect(p.champion, `n=${n}`).toBeTruthy();
      expect(p.consolationChampion, `n=${n}`).toBeTruthy();
      expect(p.consolationChampion).not.toBe(p.champion);
      expect([...resolved.matches.values()].every((m) => m.status === 'finished' || m.status === 'bye')).toBe(true);
    }
  });

  it('requiere al menos 4 parejas', () => {
    expect(() => generateDraw('consolation', entries(3), {}, seededRng(1))).toThrow(DrawError);
  });
});

describe('fase de grupos + eliminatoria', () => {
  it('reparte en grupos equilibrados', () => {
    const sizes = (n: number, g: number) =>
      splitIntoGroups(entries(n), g, seededRng(1)).map((x) => x.entryIds.length);
    expect(sizes(8, 4)).toEqual([4, 4]);
    expect(sizes(10, 4)).toEqual([4, 3, 3]);
    expect(sizes(9, 3)).toEqual([3, 3, 3]);
    expect(sizes(12, 4)).toEqual([4, 4, 4]);
  });

  it('separa las cabezas de serie en grupos distintos', () => {
    const groups = splitIntoGroups(entries(12, 3), 4, seededRng(1));
    expect(groups.map((g) => g.entryIds[0]).sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('liguilla: todos contra todos una vez', () => {
    const rounds = roundRobin(['a', 'b', 'c', 'd', 'e']);
    const pairs = rounds.flat().map((p) => [...p].sort().join('-'));
    expect(pairs).toHaveLength(10);
    expect(new Set(pairs).size).toBe(10);
    // Nadie juega dos veces en la misma jornada.
    for (const r of rounds) expect(new Set(r.flat()).size).toBe(r.length * 2);
  });

  it('cruza primeros contra segundos de otros grupos', () => {
    const def = generateDraw('groups_knockout', entries(8), { groupSize: 4, qualifiersPerGroup: 2 }, seededRng(2));
    expect(def.groups).toHaveLength(2);
    expect(def.matches.filter((m) => m.phase === 'group')).toHaveLength(12);
    const semis = def.matches.filter((m) => m.phase === 'main' && m.round === 1);
    expect(semis).toHaveLength(2);
    for (const m of semis) {
      expect(m.a.type).toBe('group');
      expect(m.b.type).toBe('group');
      if (m.a.type === 'group' && m.b.type === 'group') expect(m.a.group).not.toBe(m.b.group);
    }
  });

  it('con grupos que no cuadran, los byes son para los primeros de grupo', () => {
    // 3 grupos x 2 clasificados = 6 -> cuadro de 8 con 2 byes.
    const def = generateDraw('groups_knockout', entries(10), { groupSize: 4, qualifiersPerGroup: 2 }, seededRng(5));
    const r1 = def.matches.filter((m) => m.phase === 'main' && m.round === 1);
    const byeOpponents = r1.flatMap((m) =>
      m.a.type === 'bye' ? [m.b] : m.b.type === 'bye' ? [m.a] : [],
    );
    expect(byeOpponents).toHaveLength(2);
    for (const s of byeOpponents) expect(s).toMatchObject({ type: 'group', rank: 1 });
  });

  it('la eliminatoria se rellena al completar los grupos según la clasificación', () => {
    const def = generateDraw('groups_knockout', entries(8), { groupSize: 4, qualifiersPerGroup: 2 }, seededRng(2));
    const groupKeys = def.matches.filter((m) => m.phase === 'group').map((m) => m.key);
    const results = new Map<string, MatchResult>();
    // Gana siempre la pareja con menor número -> clasificación p_menor primero.
    const num = (id: string) => Number(id.slice(1));
    for (const key of groupKeys.slice(0, -1)) {
      const m = def.matches.find((x) => x.key === key)!;
      if (m.a.type === 'entry' && m.b.type === 'entry') results.set(key, win(num(m.a.entryId) < num(m.b.entryId) ? 'a' : 'b'));
    }
    let r = resolveDraw(def, results, opts);
    const semis = def.matches.filter((m) => m.phase === 'main' && m.round === 1);
    // Con un grupo aún incompleto, al menos una semifinal sigue pendiente.
    expect(semis.some((m) => r.matches.get(m.key)!.status === 'waiting')).toBe(true);

    const lastKey = groupKeys.at(-1)!;
    const last = def.matches.find((x) => x.key === lastKey)!;
    if (last.a.type === 'entry' && last.b.type === 'entry') {
      results.set(lastKey, win(num(last.a.entryId) < num(last.b.entryId) ? 'a' : 'b'));
    }
    r = resolveDraw(def, results, opts);
    for (const g of def.groups) {
      const sorted = [...g.entryIds].sort((x, y) => num(x) - num(y));
      expect(r.standings.get(g.key)!.map((row) => row.entryId)).toEqual(sorted);
    }
    for (const m of semis) expect(r.matches.get(m.key)!.status).toBe('ready');
    expect(dependentsOf(def, lastKey).has(semis[0]!.key)).toBe(true);
  });

  it('se puede jugar entero', () => {
    for (const n of [5, 6, 7, 9, 12, 16]) {
      const def = generateDraw('groups_knockout', entries(n), { groupSize: 4, qualifiersPerGroup: 2 }, seededRng(n));
      const { resolved } = playAll(def);
      expect(podium(def, resolved).champion, `n=${n}`).toBeTruthy();
    }
  });
});

describe('americano', () => {
  it('genera una liguilla y clasifica por juegos', () => {
    const def = generateDraw('americano', entries(5), {}, seededRng(1));
    expect(def.matches).toHaveLength(10);
    const results = new Map<string, MatchResult>();
    for (const m of def.matches) {
      if (m.a.type !== 'entry' || m.b.type !== 'entry') continue;
      // p1 siempre gana 6-x; el resto empatan 3-3.
      const aIsP1 = m.a.entryId === 'p1';
      const bIsP1 = m.b.entryId === 'p1';
      const sets = aIsP1 ? [{ a: 6, b: 1 }] : bIsP1 ? [{ a: 1, b: 6 }] : [{ a: 3, b: 3 }];
      results.set(m.key, { outcome: 'normal', sets, winner: aIsP1 ? 'a' : bIsP1 ? 'b' : null });
    }
    const r = resolveDraw(def, results, { matchFormat: 'games', ranking: 'games' });
    const rows = r.standings.get('L')!;
    expect(rows[0]).toMatchObject({ entryId: 'p1', gamesWon: 24, won: 4 });
    expect(rows.every((row) => row.played === 4)).toBe(true);
    expect(podium(def, r).champion).toBe('p1');
  });
});

describe('ajuste manual del cuadro', () => {
  it('intercambia posiciones de primera ronda', () => {
    const def = generateDraw('single_elimination', entries(6, 2), {}, seededRng(1));
    const before = def.matches.find((m) => m.key === 'P-1-2')!;
    const swapped = swapSlots(def, { match: 'P-1-2', side: 'a' }, { match: 'P-1-4', side: 'b' });
    const after = swapped.matches.find((m) => m.key === 'P-1-4')!;
    expect(after.b).toEqual(before.a);
  });

  it('impide crear un partido de dos byes', () => {
    const def = generateDraw('single_elimination', entries(6, 2), {}, seededRng(1));
    const byeMatch = def.matches.find((m) => m.round === 1 && m.b.type === 'bye')!;
    const other = def.matches.find((m) => m.round === 1 && m.key !== byeMatch.key && m.a.type === 'entry' && m.b.type === 'entry')!;
    // Mover el bye de un partido a otro que ya tiene... primero ponemos un bye junto a otro bye.
    const byeMatch2 = def.matches.find((m) => m.round === 1 && m.b.type === 'bye' && m.key !== byeMatch.key)!;
    expect(() => swapSlots(def, { match: byeMatch.key, side: 'a' }, { match: byeMatch2.key, side: 'b' })).toThrow(DrawError);
    expect(() => swapSlots(def, { match: 'P-2-1', side: 'a' }, { match: other.key, side: 'a' })).toThrow(DrawError);
  });

  it('mueve parejas entre grupos', () => {
    const def = generateDraw('groups_knockout', entries(8), { groupSize: 4 }, seededRng(1));
    const x = def.groups[0]!.entryIds[0]!;
    const y = def.groups[1]!.entryIds[0]!;
    const swapped = swapEntries(def, x, y);
    expect(swapped.groups[0]!.entryIds[0]).toBe(y);
    expect(swapped.groups[1]!.entryIds[0]).toBe(x);
    const groupA = swapped.matches.filter((m) => m.group === swapped.groups[0]!.key);
    expect(groupA.some((m) => (m.a.type === 'entry' && m.a.entryId === y) || (m.b.type === 'entry' && m.b.entryId === y))).toBe(true);
  });
});
