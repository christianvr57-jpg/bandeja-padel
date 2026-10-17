import { Check, Clock, MapPin } from 'lucide-react';
import type { CourtView, MatchView, PairView, SlotView } from '@shared/api';
import { formatWeekdayTime } from '@shared/time';
import { cx } from './ui';

export function SlotLine({
  slot,
  pairs,
  won,
  lost,
  scores,
  highlight,
  compact,
  selectable,
  selected,
  onSelect,
}: {
  slot: SlotView;
  pairs: Map<string, PairView>;
  won: boolean;
  lost: boolean;
  scores: Array<{ value: number; won: boolean }>;
  highlight?: string;
  compact?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const pair = slot.kind === 'pair' ? pairs.get(slot.pairId) : null;
  const matchesHighlight =
    !!highlight && !!pair && pair.players.some((p) => p.toLowerCase().includes(highlight.toLowerCase()));
  const content = (
    <div
      className={cx(
        'flex items-center gap-2 px-3',
        compact ? 'py-1.5' : 'py-2',
        matchesHighlight && 'bg-ball-100',
        selectable && 'cursor-pointer hover:bg-court-50',
        selected && 'bg-court-100 ring-2 ring-inset ring-court-500',
      )}
    >
      <div className="min-w-0 flex-1">
        {slot.kind === 'pair' ? (
          <div className={cx('leading-tight', won ? 'font-semibold text-slate-900' : lost ? 'text-slate-400' : 'text-slate-800')}>
            {(pair?.players ?? ['—']).map((name, i) => (
              <div key={i} className="flex items-center gap-1.5 truncate text-[13px]">
                {i === 0 && pair?.seed ? (
                  <span className="rounded bg-court-900 px-1 text-[10px] font-bold text-white">{pair.seed}</span>
                ) : null}
                <span className="truncate">{name}</span>
              </div>
            ))}
          </div>
        ) : slot.kind === 'bye' ? (
          <span className="text-[13px] italic text-slate-400">Exento (bye)</span>
        ) : (
          <span className="text-[13px] italic text-slate-400">{slot.label}</span>
        )}
      </div>
      {won && <Check className="size-4 shrink-0 text-ball-600" aria-label="Ganador" />}
      <div className="flex shrink-0 gap-1 tabular-nums">
        {scores.map((s, i) => (
          <span
            key={i}
            className={cx(
              'grid h-6 w-6 place-items-center rounded text-[13px]',
              s.won ? 'bg-court-900 font-bold text-white' : 'bg-slate-100 text-slate-600',
            )}
          >
            {s.value}
          </span>
        ))}
      </div>
    </div>
  );
  if (selectable) {
    return (
      <button type="button" className="block w-full text-left" onClick={onSelect}>
        {content}
      </button>
    );
  }
  return content;
}

export function MatchCard({
  match,
  pairs,
  courts,
  timezone,
  categoryLabel,
  highlight,
  onClick,
  compact,
  className,
  showSchedule = true,
  conflict,
  swapMode,
  selectedSide,
  onSlotClick,
}: {
  match: MatchView;
  pairs: Map<string, PairView>;
  courts?: CourtView[];
  timezone: string;
  categoryLabel?: string;
  highlight?: string;
  onClick?: () => void;
  compact?: boolean;
  className?: string;
  showSchedule?: boolean;
  conflict?: string;
  swapMode?: boolean;
  selectedSide?: 'a' | 'b' | null;
  onSlotClick?: (side: 'a' | 'b') => void;
}) {
  const court = courts?.find((c) => c.id === match.courtId);
  const walkover = match.outcome === 'walkover';
  const sets = match.sets;
  const other = (side: 'a' | 'b') => (side === 'a' ? 'b' : 'a');
  const scoresFor = (side: 'a' | 'b') => (walkover ? [] : sets.map((s) => ({ value: s[side], won: s[side] > s[other(side)] })));
  const slotsSwappable = (s: SlotView) => swapMode && match.phase === 'main' && match.round === 1 && s.kind !== 'tbd';

  const body = (
    <div
      className={cx(
        'w-full overflow-hidden rounded-xl border bg-white text-left shadow-xs transition',
        conflict ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200',
        onClick && !swapMode && 'hover:border-court-400 hover:shadow-md',
        match.status === 'bye' && 'opacity-70',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-slate-100 bg-slate-50/80 px-3 py-1 text-[11px] text-slate-500">
        <span className="font-semibold text-slate-600">#{match.number}</span>
        {!(compact && match.phase !== 'group' && match.phase !== 'league') && (
          <span className="min-w-0 truncate">{categoryLabel ? `${categoryLabel} · ${match.roundLabel}` : match.roundLabel}</span>
        )}
        {walkover && <span className="rounded bg-amber-100 px-1 font-semibold text-amber-800">W.O.</span>}
        {match.outcome === 'retired' && <span className="rounded bg-amber-100 px-1 font-semibold text-amber-800">Ret.</span>}
        {showSchedule && match.scheduledAt && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1">
            <Clock className="size-3" />
            {formatWeekdayTime(match.scheduledAt, timezone)}
            {court && (
              <>
                <MapPin className="ml-1 size-3" />
                {court.name}
              </>
            )}
          </span>
        )}
      </div>
      <div className="divide-y divide-slate-100">
        {(['a', 'b'] as const).map((side) => (
          <SlotLine
            key={side}
            slot={match[side]}
            pairs={pairs}
            won={match.winnerSide === side && match.status !== 'waiting'}
            lost={match.status === 'finished' && match.winnerSide != null && match.winnerSide !== side}
            scores={scoresFor(side)}
            highlight={highlight}
            compact={compact}
            selectable={slotsSwappable(match[side])}
            selected={selectedSide === side}
            onSelect={() => onSlotClick?.(side)}
          />
        ))}
      </div>
      {conflict && <p className="border-t border-red-100 bg-red-50 px-3 py-1 text-[11px] font-medium text-red-700">{conflict}</p>}
    </div>
  );

  if (onClick && !swapMode) {
    return (
      <button type="button" onClick={onClick} className="block w-full">
        {body}
      </button>
    );
  }
  return body;
}
