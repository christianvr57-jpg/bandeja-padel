import { shuffle, type Rng } from './random';
import type {
  CompetitionFormat,
  DrawDef,
  DrawEntry,
  DrawGroupDef,
  DrawMatchDef,
  Phase,
  SlotSource,
} from './types';

export class DrawError extends Error {}

export interface DrawOptions {
  /** Parejas por grupo (fase de grupos). */
  groupSize?: number;
  /** Clasificados por grupo para la eliminatoria. */
  qualifiersPerGroup?: number;
}

const GROUP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Orden estándar de cabezas de serie por posición del cuadro.
 * bracketOrder(8) = [1, 8, 4, 5, 2, 7, 3, 6]: el 1 y el 2 en mitades opuestas,
 * el 3 y el 4 en cuartos distintos, y cada cabeza de serie i se cruza en
 * primera ronda con la "peor" posición (size + 1 - i).
 */
export function bracketOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

function isSeeded(e: DrawEntry): boolean {
  return e.seed != null && e.seed > 0;
}

/** Cabezas de serie en orden y, detrás, el resto sorteado al azar. */
function orderEntries(entries: DrawEntry[], rng: Rng): DrawEntry[] {
  const seeded = entries.filter(isSeeded).sort((x, y) => x.seed! - y.seed!);
  const unseeded = shuffle(entries.filter((e) => !isSeeded(e)), rng);
  return [...seeded, ...unseeded];
}

/**
 * Coloca las parejas en un cuadro de tamaño potencia de 2.
 *
 * Cada pareja recibe una "siembra virtual" (cabezas de serie primero, luego el
 * resto sorteado) y las posiciones sobrantes son byes con las siembras más
 * altas. Como el orden estándar enfrenta la siembra i con la (size + 1 - i), los
 * byes caen siempre contra las mejores parejas, repartidos por el cuadro y
 * nunca dos byes en el mismo partido (hay menos byes que medio cuadro).
 */
export function placeInBracket(entries: DrawEntry[], rng: Rng): SlotSource[] {
  const ordered = orderEntries(entries, rng);
  const size = nextPowerOfTwo(Math.max(2, ordered.length));
  return bracketOrder(size).map((vs) =>
    vs <= ordered.length ? { type: 'entry', entryId: ordered[vs - 1]!.id } : { type: 'bye' },
  );
}

/** Construye una eliminatoria a partir de los huecos de primera ronda. */
export function buildKnockout(slots: SlotSource[], phase: Phase, prefix: string): DrawMatchDef[] {
  if (slots.length < 2 || nextPowerOfTwo(slots.length) !== slots.length) {
    throw new DrawError('El cuadro debe tener un número de posiciones potencia de 2.');
  }
  const matches: DrawMatchDef[] = [];
  let current = slots;
  let round = 1;
  while (current.length >= 2) {
    const next: SlotSource[] = [];
    for (let i = 0; i < current.length / 2; i++) {
      const key = `${prefix}-${round}-${i + 1}`;
      matches.push({ key, phase, round, position: i + 1, group: null, a: current[2 * i]!, b: current[2 * i + 1]! });
      next.push({ type: 'winner', match: key });
    }
    current = next;
    round++;
  }
  return matches;
}

/** Reparte en grupos "en serpiente" para que las cabezas de serie queden separadas. */
export function splitIntoGroups(entries: DrawEntry[], groupSize: number, rng: Rng): DrawGroupDef[] {
  const ordered = orderEntries(entries, rng);
  const count = Math.min(GROUP_LETTERS.length, Math.max(1, Math.ceil(ordered.length / groupSize)));
  // Tamaños equilibrados; los grupos con una pareja más van primero.
  const sizes = Array.from({ length: count }, (_, i) =>
    Math.floor(ordered.length / count) + (i < ordered.length % count ? 1 : 0),
  );
  const buckets: string[][] = Array.from({ length: count }, () => []);
  let k = 0;
  for (let row = 0; k < ordered.length; row++) {
    const cols = Array.from({ length: count }, (_, i) => (row % 2 === 0 ? i : count - 1 - i));
    for (const col of cols) {
      if (sizes[col]! > row && k < ordered.length) buckets[col]!.push(ordered[k++]!.id);
    }
  }
  return buckets.map((entryIds, i) => ({ key: GROUP_LETTERS[i]!, name: `Grupo ${GROUP_LETTERS[i]}`, entryIds }));
}

/** Liguilla todos contra todos (método del círculo). Devuelve las jornadas. */
export function roundRobin(ids: string[]): Array<Array<[string, string]>> {
  const list: Array<string | null> = ids.length % 2 ? [...ids, null] : [...ids];
  const m = list.length;
  const rounds: Array<Array<[string, string]>> = [];
  for (let r = 0; r < m - 1; r++) {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < m / 2; i++) {
      const x = list[i];
      const y = list[m - 1 - i];
      if (x && y) pairs.push(r % 2 === 0 ? [x, y] : [y, x]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

/** Ronda en la que se cruzarían dos posiciones de un cuadro (1 = primera ronda). */
function meetingRound(x: number, y: number): number {
  return Math.floor(Math.log2(x ^ y)) + 1;
}

/**
 * Coloca a los clasificados de los grupos en la eliminatoria: primeros de grupo
 * como cabezas de serie (con los byes, si los hay, contra ellos) y el resto de
 * clasificados lo más lejos posible de los de su mismo grupo.
 */
export function placeGroupQualifiers(groupKeys: string[], qualifiers: number, rng: Rng): SlotSource[] {
  const g = groupKeys.length;
  const total = g * qualifiers;
  const size = nextPowerOfTwo(Math.max(2, total));
  const order = bracketOrder(size);
  const slotOfSeed = new Map(order.map((vs, slot) => [vs, slot]));
  const slots: Array<SlotSource | null> = new Array(size).fill(null);
  const placed = new Map<string, number[]>();

  groupKeys.forEach((key, i) => {
    const slot = slotOfSeed.get(i + 1)!;
    slots[slot] = { type: 'group', group: key, rank: 1 };
    placed.set(key, [slot]);
  });
  for (let vs = total + 1; vs <= size; vs++) slots[slotOfSeed.get(vs)!] = { type: 'bye' };

  for (let rank = 2; rank <= qualifiers; rank++) {
    const free = shuffle(
      Array.from({ length: g }, (_, i) => slotOfSeed.get((rank - 1) * g + i + 1)!),
      rng,
    );
    for (const key of shuffle(groupKeys, rng)) {
      const mine = placed.get(key)!;
      let best = 0;
      let bestScore = -1;
      free.forEach((slot, idx) => {
        const score = Math.min(...mine.map((s) => meetingRound(s, slot)));
        if (score > bestScore) {
          bestScore = score;
          best = idx;
        }
      });
      const [slot] = free.splice(best, 1);
      slots[slot!] = { type: 'group', group: key, rank };
      mine.push(slot!);
    }
  }
  return slots.map((s) => s ?? { type: 'bye' });
}

function groupStage(groups: DrawGroupDef[], phase: Phase, keyPrefix: (group: string) => string): DrawMatchDef[] {
  const matches: DrawMatchDef[] = [];
  for (const group of groups) {
    let n = 0;
    roundRobin(group.entryIds).forEach((pairs, r) => {
      for (const [x, y] of pairs) {
        n++;
        matches.push({
          key: `${keyPrefix(group.key)}-${n}`,
          phase,
          round: r + 1,
          position: n,
          group: group.key,
          a: { type: 'entry', entryId: x },
          b: { type: 'entry', entryId: y },
        });
      }
    });
  }
  return matches;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function generateDraw(
  format: CompetitionFormat,
  entries: DrawEntry[],
  options: DrawOptions,
  rng: Rng,
): DrawDef {
  if (entries.length < 2) throw new DrawError('Se necesitan al menos 2 parejas para generar el cuadro.');
  if (new Set(entries.map((e) => e.id)).size !== entries.length) throw new DrawError('Hay parejas repetidas.');
  const seeds = entries.filter(isSeeded).map((e) => e.seed);
  if (new Set(seeds).size !== seeds.length) throw new DrawError('Hay cabezas de serie repetidas.');

  switch (format) {
    case 'single_elimination':
      return { groups: [], matches: buildKnockout(placeInBracket(entries, rng), 'main', 'P') };

    case 'consolation': {
      if (entries.length < 4) throw new DrawError('El cuadro de consolación necesita al menos 4 parejas.');
      const main = buildKnockout(placeInBracket(entries, rng), 'main', 'P');
      const feeds: SlotSource[] = main
        .filter((m) => m.round === 1)
        .map((m) => ({ type: 'first_loss', match: m.key }));
      return { groups: [], matches: [...main, ...buildKnockout(feeds, 'consolation', 'C')] };
    }

    case 'groups_knockout': {
      const groupSize = clamp(options.groupSize ?? 4, 3, 6);
      const qualifiers = clamp(options.qualifiersPerGroup ?? 2, 1, groupSize - 1);
      const groups = splitIntoGroups(entries, groupSize, rng);
      const matches = groupStage(groups, 'group', (g) => `G-${g}`);
      if (groups.length * qualifiers >= 2) {
        const slots = placeGroupQualifiers(groups.map((x) => x.key), qualifiers, rng);
        matches.push(...buildKnockout(slots, 'main', 'P'));
      }
      return { groups, matches };
    }

    case 'americano': {
      const ids = orderEntries(entries, rng).map((e) => e.id);
      const groups: DrawGroupDef[] = [{ key: 'L', name: 'Liguilla', entryIds: ids }];
      return { groups, matches: groupStage(groups, 'league', () => 'L') };
    }
  }
}

/** Intercambia dos huecos de primera ronda (pareja o bye) del cuadro principal. */
export function swapSlots(
  def: DrawDef,
  x: { match: string; side: 'a' | 'b' },
  y: { match: string; side: 'a' | 'b' },
): DrawDef {
  const mx = def.matches.find((m) => m.key === x.match);
  const my = def.matches.find((m) => m.key === y.match);
  if (!mx || !my) throw new DrawError('Partido no encontrado.');
  const sx = mx[x.side];
  const sy = my[y.side];
  const movable = (s: SlotSource) => s.type === 'entry' || s.type === 'bye';
  if (!movable(sx) || !movable(sy) || mx.group || my.group) {
    throw new DrawError('Solo se pueden intercambiar posiciones de la primera ronda del cuadro.');
  }
  const matches = def.matches.map((m) => {
    let next = m;
    if (m.key === x.match) next = { ...next, [x.side]: sy };
    if (m.key === y.match) next = { ...next, [y.side]: sx };
    return next;
  });
  if (matches.some((m) => m.phase === 'main' && m.round === 1 && m.a.type === 'bye' && m.b.type === 'bye')) {
    throw new DrawError('No puede haber un partido con dos byes.');
  }
  return { groups: def.groups, matches };
}

/** Intercambia dos parejas en todo el cuadro (útil para mover parejas entre grupos). */
export function swapEntries(def: DrawDef, idX: string, idY: string): DrawDef {
  const swap = (id: string) => (id === idX ? idY : id === idY ? idX : id);
  const swapSource = (s: SlotSource): SlotSource => (s.type === 'entry' ? { type: 'entry', entryId: swap(s.entryId) } : s);
  return {
    groups: def.groups.map((g) => ({ ...g, entryIds: g.entryIds.map(swap) })),
    matches: def.matches.map((m) => ({ ...m, a: swapSource(m.a), b: swapSource(m.b) })),
  };
}

/** Sustituye una pareja por otra (p. ej. una baja cubierta desde la lista de espera). */
export function replaceEntry(def: DrawDef, oldId: string, newId: string): DrawDef {
  const rep = (s: SlotSource): SlotSource =>
    s.type === 'entry' && s.entryId === oldId ? { type: 'entry', entryId: newId } : s;
  return {
    groups: def.groups.map((g) => ({ ...g, entryIds: g.entryIds.map((id) => (id === oldId ? newId : id)) })),
    matches: def.matches.map((m) => ({ ...m, a: rep(m.a), b: rep(m.b) })),
  };
}

/** Parejas que aparecen directamente en el cuadro (primera ronda o grupos). */
export function entriesInDraw(def: DrawDef): Set<string> {
  const ids = new Set<string>();
  for (const g of def.groups) g.entryIds.forEach((id) => ids.add(id));
  for (const m of def.matches) {
    if (m.a.type === 'entry') ids.add(m.a.entryId);
    if (m.b.type === 'entry') ids.add(m.b.entryId);
  }
  return ids;
}
