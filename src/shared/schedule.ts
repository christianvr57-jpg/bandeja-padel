/**
 * Programación de partidos: detección de solapes y programación automática.
 * Funciones puras; los instantes son milisegundos desde epoch (UTC).
 */

export interface ScheduleItem {
  id: string;
  start: number | null;
  durationMin: number;
  courtId: string | null;
  /** Parejas conocidas que juegan el partido. */
  pairIds: string[];
  /** Identificadores de jugadores (p. ej. DNI) para detectar cruces entre categorías. Solo en el panel del club. */
  playerKeys: string[];
  /** Partidos que deben terminar antes (de los que salen los participantes). */
  after: string[];
}

export type ConflictType = 'court' | 'pair' | 'player' | 'order';

export interface ScheduleConflict {
  type: ConflictType;
  matchId: string;
  otherId: string;
  message: string;
}

const MESSAGES: Record<ConflictType, string> = {
  court: 'Pista ocupada por otro partido a esa hora.',
  pair: 'La pareja tiene otro partido a la misma hora.',
  player: 'Un jugador tiene otro partido (de otra categoría) a la misma hora.',
  order: 'Empieza antes de que termine un partido previo del cuadro.',
};

const overlaps = (s1: number, e1: number, s2: number, e2: number) => s1 < e2 && s2 < e1;

/** Devuelve los conflictos encontrados (cada uno, en ambos sentidos para pintar los dos partidos). */
export function findScheduleConflicts(items: ScheduleItem[]): ScheduleConflict[] {
  const out: ScheduleConflict[] = [];
  const push = (type: ConflictType, x: ScheduleItem, y: ScheduleItem) => {
    out.push({ type, matchId: x.id, otherId: y.id, message: MESSAGES[type] });
    if (type !== 'order') out.push({ type, matchId: y.id, otherId: x.id, message: MESSAGES[type] });
  };
  const scheduled = items.filter((i) => i.start != null);
  const byId = new Map(items.map((i) => [i.id, i]));

  for (let i = 0; i < scheduled.length; i++) {
    const x = scheduled[i]!;
    const xs = x.start!;
    const xe = xs + x.durationMin * 60_000;
    for (let j = i + 1; j < scheduled.length; j++) {
      const y = scheduled[j]!;
      const ys = y.start!;
      const ye = ys + y.durationMin * 60_000;
      if (!overlaps(xs, xe, ys, ye)) continue;
      if (x.courtId && x.courtId === y.courtId) push('court', x, y);
      if (x.pairIds.some((p) => y.pairIds.includes(p))) push('pair', x, y);
      else if (x.playerKeys.some((p) => y.playerKeys.includes(p))) push('player', x, y);
    }
  }
  for (const x of scheduled) {
    for (const prevId of x.after) {
      const prev = byId.get(prevId);
      if (prev?.start != null && prev.start + prev.durationMin * 60_000 > x.start!) push('order', x, prev);
    }
  }
  return out;
}

export interface AutoScheduleMatch {
  id: string;
  durationMin: number;
  pairIds: string[];
  playerKeys: string[];
  after: string[];
  /** Menor = antes (p. ej. grupos antes que eliminatoria; ronda 1 antes que ronda 2). */
  priority: number;
}

export interface FixedBooking {
  id: string;
  start: number;
  durationMin: number;
  courtId: string | null;
  pairIds: string[];
  playerKeys: string[];
}

export interface TimeWindow {
  start: number;
  end: number;
}

export interface AutoScheduleOptions {
  courtIds: string[];
  windows: TimeWindow[];
  slotMin: number;
  /** Descanso mínimo entre partidos de la misma pareja/jugador. */
  restMin: number;
}

export interface AutoScheduleResult {
  assigned: Map<string, { start: number; courtId: string }>;
  unscheduled: string[];
}

/**
 * Programación voraz: recorre los partidos por prioridad y asigna a cada uno
 * el primer hueco (dentro de las franjas horarias) con pista libre, sin solapar
 * a sus parejas/jugadores y después de que acaben los partidos previos.
 */
export function autoSchedule(
  matches: AutoScheduleMatch[],
  fixed: FixedBooking[],
  options: AutoScheduleOptions,
): AutoScheduleResult {
  const { courtIds, windows, slotMin, restMin } = options;
  const assigned = new Map<string, { start: number; courtId: string }>();
  const unscheduled: string[] = [];
  const courtBusy = new Map<string, Array<[number, number]>>(courtIds.map((c) => [c, []]));
  const personBusy = new Map<string, Array<[number, number]>>();
  const end = new Map<string, number>();
  const rest = restMin * 60_000;

  const book = (keys: string[], s: number, e: number) => {
    for (const k of keys) {
      if (!personBusy.has(k)) personBusy.set(k, []);
      personBusy.get(k)!.push([s, e]);
    }
  };
  const personFree = (keys: string[], s: number, e: number) =>
    keys.every((k) => (personBusy.get(k) ?? []).every(([bs, be]) => !overlaps(s, e + rest, bs, be + rest)));

  for (const f of fixed) {
    const e = f.start + f.durationMin * 60_000;
    if (f.courtId && courtBusy.has(f.courtId)) courtBusy.get(f.courtId)!.push([f.start, e]);
    book([...f.pairIds, ...f.playerKeys.map((p) => `p:${p}`)], f.start, e);
    end.set(f.id, e);
  }

  const sorted = [...matches].sort((x, y) => x.priority - y.priority);
  const sortedWindows = [...windows].sort((x, y) => x.start - y.start);

  for (const m of sorted) {
    const dur = m.durationMin * 60_000;
    const keys = [...m.pairIds, ...m.playerKeys.map((p) => `p:${p}`)];
    let earliest = 0;
    for (const prev of m.after) {
      const e = end.get(prev);
      if (e != null) earliest = Math.max(earliest, e + rest);
    }
    let done = false;
    for (const w of sortedWindows) {
      for (let t = w.start; t + dur <= w.end && !done; t += slotMin * 60_000) {
        if (t < earliest || !personFree(keys, t, t + dur)) continue;
        const court = courtIds.find((c) => courtBusy.get(c)!.every(([bs, be]) => !overlaps(t, t + dur, bs, be)));
        if (!court) continue;
        courtBusy.get(court)!.push([t, t + dur]);
        book(keys, t, t + dur);
        end.set(m.id, t + dur);
        assigned.set(m.id, { start: t, courtId: court });
        done = true;
      }
      if (done) break;
    }
    if (!done) unscheduled.push(m.id);
  }
  return { assigned, unscheduled };
}
