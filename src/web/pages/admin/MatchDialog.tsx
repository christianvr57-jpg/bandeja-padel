import { CalendarClock, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CategoryView, CourtView, MatchView } from '@shared/api';
import { isSuperTiebreakSet, validateResult } from '@shared/draw/score';
import type { Outcome, Side } from '@shared/draw/types';
import { utcToZonedLocal, zonedDate } from '@shared/time';
import { useFeedback } from '../../components/feedback';
import { Alert, Button, cx, Field, Input, Modal, Select } from '../../components/ui';
import { api } from '../../lib/api';
import { useAdminAction } from '../../lib/admin';

type SetRow = { a: string; b: string };

function setCount(format: CategoryView['matchFormat']) {
  return format === 'games' || format === 'single_set' ? 1 : 3;
}

export function MatchDialog({
  tournamentId,
  cat,
  match,
  courts,
  timezone,
  defaultDay,
  onClose,
}: {
  tournamentId: string;
  cat: CategoryView;
  match: MatchView;
  courts: CourtView[];
  timezone: string;
  defaultDay: string;
  onClose: () => void;
}) {
  const { confirm } = useFeedback();
  const pairs = useMemo(() => new Map(cat.pairs.map((p) => [p.id, p])), [cat.pairs]);
  const name = (side: Side) => {
    const s = match[side];
    return s.kind === 'pair' ? (pairs.get(s.pairId)?.players.join(' / ') ?? '—') : s.kind === 'bye' ? 'Exento' : s.label;
  };
  const canScore = match.status === 'ready' || match.status === 'finished';
  const [tab, setTab] = useState<'result' | 'schedule'>(canScore ? 'result' : 'schedule');

  const n = setCount(cat.matchFormat);
  const [outcome, setOutcome] = useState<Outcome>(match.outcome ?? 'normal');
  const [sets, setSets] = useState<SetRow[]>(() =>
    Array.from({ length: n }, (_, i) => ({ a: match.sets[i]?.a?.toString() ?? '', b: match.sets[i]?.b?.toString() ?? '' })),
  );
  const [winner, setWinner] = useState<Side | null>(match.outcome && match.outcome !== 'normal' ? match.winnerSide : null);
  const [courtId, setCourtId] = useState(match.courtId ?? '');
  const [when, setWhen] = useState(match.scheduledAt ? utcToZonedLocal(match.scheduledAt, timezone) : `${defaultDay}T10:00`);

  const parsedSets = sets
    .filter((s) => s.a !== '' || s.b !== '')
    .map((s) => ({ a: Number(s.a), b: Number(s.b) }));
  const validation = validateResult(cat.matchFormat, { outcome, sets: outcome === 'walkover' ? [] : parsedSets, winner });

  const saveResult = useAdminAction(
    tournamentId,
    () => api(`/admin/matches/${match.id}/result`, { method: 'PUT', body: { outcome, sets: outcome === 'walkover' ? [] : parsedSets, winner } }),
    { success: 'Resultado guardado', onSuccess: onClose },
  );
  const clearResult = useAdminAction(tournamentId, () => api(`/admin/matches/${match.id}/result`, { method: 'DELETE' }), {
    success: 'Resultado borrado',
    onSuccess: onClose,
  });
  const saveSchedule = useAdminAction(
    tournamentId,
    (clear: boolean) =>
      api(`/admin/matches/${match.id}/schedule`, {
        method: 'PUT',
        body: clear ? { courtId: null, scheduledAt: null } : { courtId: courtId || null, scheduledAt: when || null },
      }),
    { success: (clear) => (clear ? 'Horario quitado' : 'Horario guardado'), onSuccess: onClose },
  );

  const setLabel = (i: number) => (n === 1 ? (cat.matchFormat === 'games' ? 'Juegos' : 'Set') : isSuperTiebreakSet(cat.matchFormat, i) ? 'STB' : `Set ${i + 1}`);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Partido #${match.number} · ${match.roundLabel}`}
      footer={
        tab === 'result' ? (
          <>
            {match.status === 'finished' && (
              <Button
                variant="danger-ghost"
                className="mr-auto"
                loading={clearResult.isPending}
                onClick={async () => {
                  if (await confirm({ title: 'Borrar resultado', message: 'El partido volverá a quedar pendiente.', confirmLabel: 'Borrar', danger: true })) {
                    clearResult.mutate();
                  }
                }}
              >
                Borrar
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={!canScore || !validation.ok} loading={saveResult.isPending} onClick={() => saveResult.mutate()}>
              Guardar resultado
            </Button>
          </>
        ) : (
          <>
            {match.scheduledAt && (
              <Button variant="danger-ghost" className="mr-auto" onClick={() => saveSchedule.mutate(true)}>
                Quitar horario
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button loading={saveSchedule.isPending} onClick={() => saveSchedule.mutate(false)}>
              Guardar horario
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">{cat.label}</p>
        <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
          <button
            className={cx('flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5', tab === 'result' ? 'bg-white shadow-xs' : 'text-slate-600')}
            onClick={() => setTab('result')}
          >
            <Trophy className="size-4" /> Resultado
          </button>
          <button
            className={cx('flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5', tab === 'schedule' ? 'bg-white shadow-xs' : 'text-slate-600')}
            onClick={() => setTab('schedule')}
          >
            <CalendarClock className="size-4" /> Pista y hora
          </button>
        </div>

        {tab === 'result' ? (
          !canScore ? (
            <Alert tone="info">Todavía no se conocen las dos parejas de este partido. Podrás apuntar el resultado cuando terminen los partidos previos.</Alert>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-medium">
                {(
                  [
                    ['normal', 'Normal'],
                    ['walkover', 'W.O.'],
                    ['retired', 'Retirada'],
                  ] as const
                ).map(([v, label]) => (
                  <button key={v} onClick={() => setOutcome(v)} className={cx('rounded-lg py-1.5', outcome === v ? 'bg-white shadow-xs' : 'text-slate-600')}>
                    {label}
                  </button>
                ))}
              </div>

              {outcome !== 'walkover' && (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Pareja</th>
                        {sets.map((_, i) => (
                          <th key={i} className="w-16 px-1 py-2 text-center font-semibold">
                            {setLabel(i)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(['a', 'b'] as const).map((side) => (
                        <tr key={side} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-[13px] leading-tight text-slate-800">{name(side)}</td>
                          {sets.map((s, i) => (
                            <td key={i} className="px-1 py-2">
                              <Input
                                inputMode="numeric"
                                aria-label={`${setLabel(i)} ${name(side)}`}
                                className="h-11 px-1 text-center text-lg font-semibold tabular-nums"
                                value={s[side]}
                                onChange={(e) => {
                                  const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                                  setSets((l) => l.map((x, j) => (j === i ? { ...x, [side]: v } : x)));
                                }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {outcome !== 'normal' && (
                <Field label={outcome === 'walkover' ? '¿Quién gana por W.O.?' : '¿Quién gana? (la otra pareja se retira)'}>
                  <div className="grid gap-2">
                    {(['a', 'b'] as const).map((side) => (
                      <button
                        key={side}
                        onClick={() => setWinner(side)}
                        className={cx(
                          'rounded-xl border px-3 py-2.5 text-left text-sm',
                          winner === side ? 'border-court-700 bg-court-50 font-semibold' : 'border-slate-200',
                        )}
                      >
                        {name(side)}
                      </button>
                    ))}
                  </div>
                </Field>
              )}

              {validation.ok ? (
                validation.result.winner ? (
                  <Alert tone="success">Gana: {name(validation.result.winner)}</Alert>
                ) : (
                  <Alert tone="info">Empate</Alert>
                )
              ) : (
                (parsedSets.length > 0 || outcome !== 'normal') && <Alert tone="warning">{validation.error}</Alert>
              )}
              {cat.matchFormat === 'best_of_3_super_tb' && outcome === 'normal' && (
                <p className="text-xs text-slate-500">Si van 1-1 en sets, el tercero es un super tie-break a 10 puntos (p. ej. 10-7).</p>
              )}
              {saveResult.error && <Alert tone="error">{saveResult.error.message}</Alert>}
            </>
          )
        ) : (
          <div className="space-y-4">
            <Field label="Pista" htmlFor="md-court">
              <Select id="md-court" value={courtId} onChange={(e) => setCourtId(e.target.value)}>
                <option value="">Sin pista</option>
                {courts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Día y hora" htmlFor="md-when" hint="Hora local del torneo.">
              <Input id="md-when" type="datetime-local" value={when} step={300} onChange={(e) => setWhen(e.target.value)} />
            </Field>
            {saveSchedule.error && <Alert tone="error">{saveSchedule.error.message}</Alert>}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function defaultDayFor(startDate: string, timezone: string) {
  const today = zonedDate(new Date(), timezone);
  return today > startDate ? today : startDate;
}
