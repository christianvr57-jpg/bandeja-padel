import { Columns3, List, Medal, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CategoryView, CourtView, MatchView, PairView } from '@shared/api';
import type { Phase } from '@shared/draw/types';
import { MatchCard } from './MatchCard';
import { Badge, cx } from './ui';

export interface DrawInteraction {
  onMatchClick?: (m: MatchView) => void;
  swapMode?: boolean;
  selectedSlot?: { match: string; side: 'a' | 'b' } | null;
  onSlotClick?: (match: MatchView, side: 'a' | 'b') => void;
  selectedPair?: string | null;
  onPairClick?: (pairId: string) => void;
  conflicts?: Map<string, string>;
}

function useDefaultView(): ['bracket' | 'rounds', (v: 'bracket' | 'rounds') => void] {
  const [view, setView] = useState<'bracket' | 'rounds'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'rounds' : 'bracket',
  );
  return [view, setView];
}

export function Bracket({
  matches,
  pairs,
  courts,
  timezone,
  title,
  highlight,
  interaction = {},
}: {
  matches: MatchView[];
  pairs: Map<string, PairView>;
  courts: CourtView[];
  timezone: string;
  title: string;
  highlight?: string;
  interaction?: DrawInteraction;
}) {
  const [view, setView] = useDefaultView();
  const rounds = useMemo(() => {
    const byRound = new Map<number, MatchView[]>();
    for (const m of matches) {
      if (!byRound.has(m.round)) byRound.set(m.round, []);
      byRound.get(m.round)!.push(m);
    }
    return [...byRound.entries()].sort((a, b) => a[0] - b[0]).map(([round, ms]) => ({
      round,
      label: ms[0]!.roundLabel,
      matches: ms.sort((x, y) => x.position - y.position),
    }));
  }, [matches]);

  const card = (m: MatchView, compact: boolean) => (
    <MatchCard
      match={m}
      pairs={pairs}
      courts={courts}
      timezone={timezone}
      highlight={highlight}
      compact={compact}
      onClick={interaction.onMatchClick && m.status !== 'bye' ? () => interaction.onMatchClick!(m) : undefined}
      swapMode={interaction.swapMode}
      selectedSide={interaction.selectedSlot?.match === m.key ? interaction.selectedSlot.side : null}
      onSlotClick={(side) => interaction.onSlotClick?.(m, side)}
      conflict={interaction.conflicts?.get(m.id)}
    />
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          <button
            className={cx('inline-flex items-center gap-1 rounded-md px-2.5 py-1', view === 'bracket' ? 'bg-white shadow-xs' : 'text-slate-600')}
            onClick={() => setView('bracket')}
          >
            <Columns3 className="size-3.5" /> Cuadro
          </button>
          <button
            className={cx('inline-flex items-center gap-1 rounded-md px-2.5 py-1', view === 'rounds' ? 'bg-white shadow-xs' : 'text-slate-600')}
            onClick={() => setView('rounds')}
          >
            <List className="size-3.5" /> Por rondas
          </button>
        </div>
      </div>

      {view === 'bracket' ? (
        <div className="scrollbar-none -mx-4 overflow-x-auto px-4 pb-2">
          <div className="flex min-w-max">
            {rounds.map((r) => (
              <div key={r.round} className="bracket-col w-64">
                <p className="mb-1 px-3.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{r.label}</p>
                <div className="bracket-round flex-1">
                  {r.matches.map((m, i) => (
                    <div key={m.id} className={cx('bracket-cell', i % 2 === 0 ? 'is-top' : 'is-bottom')}>
                      <div className="bracket-in">{card(m, true)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {rounds.map((r) => {
            const visible = r.matches.filter((m) => m.status !== 'bye' || interaction.swapMode);
            if (!visible.length) return null;
            return (
              <div key={r.round}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{r.label}</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{visible.map((m) => <div key={m.id}>{card(m, false)}</div>)}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function GroupTable({
  group,
  pairs,
  qualifiers,
  americano,
  highlight,
  interaction = {},
}: {
  group: CategoryView['groups'][number];
  pairs: Map<string, PairView>;
  qualifiers: number;
  americano: boolean;
  highlight?: string;
  interaction?: DrawInteraction;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
        <p className="text-sm font-bold text-slate-900">{group.name}</p>
        {group.complete ? <Badge tone="green">Terminado</Badge> : <Badge tone="slate">En juego</Badge>}
      </div>
      <table className="w-full text-[13px]">
        <thead className="text-[11px] uppercase text-slate-500">
          <tr className="border-b border-slate-100">
            <th className="w-7 py-1.5 pl-3 text-left font-semibold">#</th>
            <th className="py-1.5 text-left font-semibold">Pareja</th>
            <th className="w-8 py-1.5 text-center font-semibold" title="Partidos jugados">PJ</th>
            <th className="w-8 py-1.5 text-center font-semibold" title="Partidos ganados">PG</th>
            {americano ? (
              <th className="w-12 py-1.5 pr-3 text-center font-semibold" title="Juegos ganados">Juegos</th>
            ) : (
              <>
                <th className="w-10 py-1.5 text-center font-semibold" title="Diferencia de sets">±S</th>
                <th className="w-10 py-1.5 pr-3 text-center font-semibold" title="Diferencia de juegos">±J</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {group.standings.map((row) => {
            const pair = pairs.get(row.entryId);
            const qualified = !americano && row.rank <= qualifiers;
            const hit = !!highlight && pair?.players.some((p) => p.toLowerCase().includes(highlight.toLowerCase()));
            const selectable = !!interaction.onPairClick;
            return (
              <tr
                key={row.entryId}
                onClick={selectable ? () => interaction.onPairClick!(row.entryId) : undefined}
                className={cx(
                  'border-b border-slate-50 last:border-0',
                  hit && 'bg-ball-100',
                  selectable && 'cursor-pointer hover:bg-court-50',
                  interaction.selectedPair === row.entryId && 'bg-court-100 ring-2 ring-inset ring-court-500',
                )}
              >
                <td className={cx('py-2 pl-3 font-semibold', qualified ? 'text-ball-600' : 'text-slate-400')}>
                  <span className={cx('inline-block w-1 rounded-full', qualified ? 'bg-ball-400' : '')} />
                  {row.rank}
                </td>
                <td className="py-2 pr-2">
                  {(pair?.players ?? ['—']).map((n, i) => (
                    <div key={i} className="truncate leading-tight text-slate-800">
                      {n}
                    </div>
                  ))}
                </td>
                <td className="text-center tabular-nums text-slate-600">{row.played}</td>
                <td className="text-center font-semibold tabular-nums">{row.won}</td>
                {americano ? (
                  <td className="pr-3 text-center font-bold tabular-nums">{row.gamesWon}</td>
                ) : (
                  <>
                    <td className="text-center tabular-nums text-slate-600">{fmtDiff(row.setsWon - row.setsLost)}</td>
                    <td className="pr-3 text-center tabular-nums text-slate-600">{fmtDiff(row.gamesWon - row.gamesLost)}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const fmtDiff = (n: number) => (n > 0 ? `+${n}` : String(n));

function Podium({ cat, pairs }: { cat: CategoryView; pairs: Map<string, PairView> }) {
  const { champion, runnerUp, consolationChampion } = cat.podium;
  if (!champion) return null;
  const names = (id: string | null) => (id ? pairs.get(id)?.players.join(' y ') : null);
  return (
    <div className="court-pattern overflow-hidden rounded-2xl p-5 text-white">
      <div className="flex items-start gap-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ball-400 text-court-950">
          <Trophy className="size-6" />
        </div>
        <div className="min-w-0 space-y-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ball-300">Campeones</p>
            <p className="text-lg font-bold">{names(champion)}</p>
          </div>
          {runnerUp && (
            <p className="text-sm text-court-100">
              <Medal className="mr-1 inline size-4" />
              Finalistas: {names(runnerUp)}
            </p>
          )}
          {consolationChampion && <p className="text-sm text-court-100">Campeones de consolación: {names(consolationChampion)}</p>}
        </div>
      </div>
    </div>
  );
}

/** Todo el cuadro de una categoría: campeones, grupos, eliminatoria y consolación. */
export function CategoryDraw({
  cat,
  courts,
  timezone,
  highlight,
  interaction,
}: {
  cat: CategoryView;
  courts: CourtView[];
  timezone: string;
  highlight?: string;
  interaction?: DrawInteraction;
}) {
  const pairs = useMemo(() => new Map(cat.pairs.map((p) => [p.id, p])), [cat.pairs]);
  const byPhase = (phase: Phase) => cat.matches.filter((m) => m.phase === phase);
  const americano = cat.format === 'americano';
  const groupMatches = cat.matches.filter((m) => m.phase === 'group' || m.phase === 'league');

  return (
    <div className="space-y-8">
      <Podium cat={cat} pairs={pairs} />

      {cat.groups.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-base font-bold text-slate-900">{americano ? 'Clasificación' : 'Fase de grupos'}</h3>
          {!americano && (
            <p className="text-xs text-slate-500">
              Pasan a la eliminatoria los {cat.qualifiersPerGroup} primeros de cada grupo (marcados en verde).
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {cat.groups.map((g) => (
              <div key={g.key} className="space-y-2">
                <GroupTable
                  group={g}
                  pairs={pairs}
                  qualifiers={cat.qualifiersPerGroup}
                  americano={americano}
                  highlight={highlight}
                  interaction={interaction}
                />
                <details className="group rounded-xl">
                  <summary className="cursor-pointer select-none px-1 py-1 text-sm font-medium text-court-700">
                    Partidos del {g.name} ({groupMatches.filter((m) => m.group === g.key && m.status === 'finished').length}/
                    {groupMatches.filter((m) => m.group === g.key).length})
                  </summary>
                  <div className="mt-2 grid gap-2">
                    {groupMatches
                      .filter((m) => m.group === g.key)
                      .map((m) => (
                        <MatchCard
                          key={m.id}
                          match={m}
                          pairs={pairs}
                          courts={courts}
                          timezone={timezone}
                          highlight={highlight}
                          compact
                          onClick={interaction?.onMatchClick ? () => interaction.onMatchClick!(m) : undefined}
                          conflict={interaction?.conflicts?.get(m.id)}
                        />
                      ))}
                  </div>
                </details>
              </div>
            ))}
          </div>
        </section>
      )}

      {byPhase('main').length > 0 && (
        <Bracket
          title={cat.groups.length ? 'Eliminatoria final' : 'Cuadro principal'}
          matches={byPhase('main')}
          pairs={pairs}
          courts={courts}
          timezone={timezone}
          highlight={highlight}
          interaction={interaction}
        />
      )}
      {byPhase('consolation').length > 0 && (
        <Bracket
          title="Cuadro de consolación"
          matches={byPhase('consolation')}
          pairs={pairs}
          courts={courts}
          timezone={timezone}
          highlight={highlight}
          interaction={{ ...interaction, swapMode: false }}
        />
      )}
    </div>
  );
}
