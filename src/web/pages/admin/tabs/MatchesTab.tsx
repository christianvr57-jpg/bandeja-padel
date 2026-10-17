import { AlertTriangle, CalendarClock, Grid3x3, List, Plus, Trash2, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AdminCompetitionView, AdminTournament, CategoryView, MatchView } from '@shared/api';
import { addDays, formatDay, formatTime, zonedDate } from '@shared/time';
import { useFeedback } from '../../../components/feedback';
import { MatchCard } from '../../../components/MatchCard';
import { Alert, Button, Card, Checkbox, cx, EmptyState, ErrorState, Field, Input, Modal, PageLoader, Pills, Select } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useAdminAction, useAdminCompetition } from '../../../lib/admin';
import { defaultDayFor, MatchDialog } from '../MatchDialog';

type Row = MatchView & { categoryId: string };

function AutoScheduleDialog({ t, comp, onClose }: { t: AdminTournament; comp: AdminCompetitionView; onClose: () => void }) {
  const dayCount = Math.min(14, Math.round((Date.parse(t.endDate) - Date.parse(t.startDate)) / 86_400_000) + 1);
  const [days, setDays] = useState(() =>
    Array.from({ length: Math.max(1, dayCount) }, (_, i) => ({ date: addDays(t.startDate, i), from: '09:00', to: '22:00' })),
  );
  const [slotMin, setSlotMin] = useState('30');
  const [restMin, setRestMin] = useState('30');
  const [replace, setReplace] = useState(false);
  const [cats, setCats] = useState<string[]>(comp.categories.filter((c) => c.drawGenerated).map((c) => c.id));
  const run = useAdminAction(
    t.id,
    () =>
      api<{ scheduled: number; unscheduled: number }>(`/admin/tournaments/${t.id}/schedule/auto`, {
        method: 'POST',
        body: { days, slotMin: Number(slotMin), restMin: Number(restMin), replaceExisting: replace, categoryIds: cats },
      }),
    { onSuccess: onClose },
  );
  const { toast } = useFeedback();

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Programar automáticamente"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            icon={<Wand2 className="size-4" />}
            loading={run.isPending}
            disabled={!cats.length || !days.length}
            onClick={() =>
              run.mutate(undefined, {
                onSuccess: (r) =>
                  toast(
                    r.unscheduled
                      ? `${r.scheduled} partidos programados; ${r.unscheduled} no caben en las franjas indicadas`
                      : `${r.scheduled} partidos programados sin solapes`,
                    r.unscheduled ? 'error' : 'success',
                  ),
              })
            }
          >
            Programar
          </Button>
        </>
      }
    >
      <div className="space-y-5 text-sm">
        <p className="text-slate-600">
          Reparte los partidos pendientes entre las {comp.courts.length} pistas respetando el orden del cuadro, sin que una pareja (o un jugador
          inscrito en dos categorías) juegue dos partidos a la vez y con descanso entre partidos. Duración por partido: {comp.matchDurationMin} min.
        </p>
        <div>
          <p className="mb-2 font-medium text-slate-700">Días y franjas horarias</p>
          <div className="space-y-2">
            {days.map((d, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input type="date" className="w-40" value={d.date} onChange={(e) => setDays((l) => l.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
                <Input type="time" className="w-28" value={d.from} onChange={(e) => setDays((l) => l.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} />
                <span className="text-slate-400">a</span>
                <Input type="time" className="w-28" value={d.to} onChange={(e) => setDays((l) => l.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} />
                <Button variant="ghost" size="sm" aria-label="Quitar día" icon={<Trash2 className="size-4" />} onClick={() => setDays((l) => l.filter((_, j) => j !== i))} />
              </div>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            icon={<Plus className="size-4" />}
            onClick={() => setDays((l) => [...l, { date: addDays(l.at(-1)?.date ?? t.startDate, 1), from: '09:00', to: '22:00' }])}
          >
            Añadir franja
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Intervalo entre inicios (min)" htmlFor="as-slot">
            <Select id="as-slot" value={slotMin} onChange={(e) => setSlotMin(e.target.value)}>
              {[15, 30, 45, 60, 75, 90].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </Select>
          </Field>
          <Field label="Descanso mínimo entre partidos (min)" htmlFor="as-rest">
            <Select id="as-rest" value={restMin} onChange={(e) => setRestMin(e.target.value)}>
              {[0, 15, 30, 45, 60, 90, 120].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div>
          <p className="mb-2 font-medium text-slate-700">Categorías</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {comp.categories
              .filter((c) => c.drawGenerated)
              .map((c) => (
                <Checkbox
                  key={c.id}
                  checked={cats.includes(c.id)}
                  onChange={(v) => setCats((l) => (v ? [...l, c.id] : l.filter((x) => x !== c.id)))}
                  label={c.label}
                />
              ))}
          </div>
        </div>
        <Checkbox checked={replace} onChange={setReplace} label="Reprogramar también los partidos que ya tienen hora (los jugados no se tocan)" />
        {run.error && <Alert tone="error">{run.error.message}</Alert>}
      </div>
    </Modal>
  );
}

function CourtGrid({
  rows,
  comp,
  day,
  onOpen,
  conflicts,
}: {
  rows: Row[];
  comp: AdminCompetitionView;
  day: string;
  onOpen: (m: Row) => void;
  conflicts: Map<string, string>;
}) {
  const tz = comp.timezone;
  const dayRows = rows.filter((m) => m.scheduledAt && zonedDate(m.scheduledAt, tz) === day);
  const times = [...new Set(dayRows.map((m) => m.scheduledAt!))].sort();
  const catById = new Map(comp.categories.map((c) => [c.id, c]));
  if (!dayRows.length) return <p className="py-10 text-center text-sm text-slate-500">No hay partidos programados este día.</p>;
  return (
    <div className="scrollbar-none -mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-max border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="w-14" />
            {comp.courts.map((c) => (
              <th key={c.id} className="min-w-44 rounded-lg bg-court-900 px-2 py-1.5 font-semibold text-white">
                {c.name}
              </th>
            ))}
            <th className="min-w-44 rounded-lg bg-slate-200 px-2 py-1.5 font-semibold text-slate-700">Sin pista</th>
          </tr>
        </thead>
        <tbody>
          {times.map((time) => (
            <tr key={time}>
              <td className="pr-1 text-right align-top font-semibold text-slate-600">{formatTime(time, tz)}</td>
              {[...comp.courts.map((c) => c.id), null].map((courtId) => {
                const cell = dayRows.filter((m) => m.scheduledAt === time && (m.courtId ?? null) === courtId);
                return (
                  <td key={courtId ?? 'none'} className="align-top">
                    {cell.map((m) => {
                      const cat = catById.get(m.categoryId)!;
                      const pairs = new Map(cat.pairs.map((p) => [p.id, p]));
                      const label = (s: MatchView['a']) => (s.kind === 'pair' ? pairs.get(s.pairId)?.players.map((n) => n.split(' ')[0]).join('/') : s.kind === 'tbd' ? s.label : 'Exento');
                      return (
                        <button
                          key={m.id}
                          onClick={() => onOpen(m)}
                          className={cx(
                            'mb-1 block w-full rounded-lg border p-2 text-left',
                            conflicts.has(m.id) ? 'border-red-300 bg-red-50' : m.status === 'finished' ? 'border-slate-200 bg-slate-50' : 'border-court-200 bg-court-50 hover:border-court-400',
                          )}
                        >
                          <p className="truncate font-semibold text-slate-700">
                            #{m.number} {cat.label}
                          </p>
                          <p className="truncate text-slate-600">{m.roundLabel}</p>
                          <p className="truncate text-slate-800">{label(m.a)}</p>
                          <p className="truncate text-slate-800">{label(m.b)}</p>
                          {m.status === 'finished' && <p className="mt-0.5 font-semibold text-emerald-700">{m.sets.map((s) => `${s.a}-${s.b}`).join(' ') || m.outcome?.toUpperCase()}</p>}
                        </button>
                      );
                    })}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MatchesTab({ t }: { t: AdminTournament }) {
  const q = useAdminCompetition(t.id);
  const { confirm } = useFeedback();
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [status, setStatus] = useState<'pending' | 'finished' | 'all'>('pending');
  const [cat, setCat] = useState('all');
  const [day, setDay] = useState<string | null>(null);
  const [open, setOpen] = useState<Row | null>(null);
  const [auto, setAuto] = useState(false);
  const clear = useAdminAction(t.id, () => api(`/admin/tournaments/${t.id}/schedule/clear`, { method: 'POST', body: {} }), {
    success: 'Horarios de partidos pendientes eliminados',
  });

  const rows: Row[] = useMemo(
    () => (q.data?.categories ?? []).flatMap((c) => c.matches.filter((m) => m.status !== 'bye').map((m) => ({ ...m, categoryId: c.id }))),
    [q.data],
  );
  const conflicts = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of q.data?.conflicts ?? []) if (!map.has(c.matchId)) map.set(c.matchId, c.message);
    return map;
  }, [q.data?.conflicts]);

  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  const comp = q.data;
  const tz = comp.timezone;
  if (!rows.length) {
    return (
      <EmptyState icon={<CalendarClock className="size-6" />} title="Todavía no hay partidos">
        Genera los cuadros en la pestaña «Cuadros» y aquí podrás asignar pistas, horas y resultados.
      </EmptyState>
    );
  }

  const days = [...new Set(rows.filter((m) => m.scheduledAt).map((m) => zonedDate(m.scheduledAt!, tz)))].sort();
  const today = zonedDate(new Date(), tz);
  const currentDay = day ?? (days.includes(today) ? today : days[0] ?? null);
  const catById = new Map(comp.categories.map((c) => [c.id, c]));

  const filtered = rows
    .filter((m) => cat === 'all' || m.categoryId === cat)
    .filter((m) => (status === 'all' ? true : status === 'finished' ? m.status === 'finished' : m.status !== 'finished'));
  const unscheduled = filtered.filter((m) => !m.scheduledAt);
  const scheduled = filtered
    .filter((m) => m.scheduledAt && (!currentDay || zonedDate(m.scheduledAt, tz) === currentDay))
    .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
  const conflictCount = new Set(comp.conflicts.map((c) => c.matchId)).size;
  const pending = rows.filter((m) => m.status !== 'finished');
  const playable = rows.filter((m) => m.status === 'ready');

  const card = (m: Row) => (
    <MatchCard
      key={m.id}
      match={m}
      pairs={new Map((catById.get(m.categoryId) as CategoryView).pairs.map((p) => [p.id, p]))}
      courts={comp.courts}
      timezone={tz}
      categoryLabel={catById.get(m.categoryId)?.label}
      onClick={() => setOpen(m)}
      conflict={conflicts.get(m.id)}
    />
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <p className="text-xl font-bold tabular-nums">{rows.length - pending.length}/{rows.length}</p>
          <p className="text-xs text-slate-500">jugados</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xl font-bold tabular-nums">{playable.length}</p>
          <p className="text-xs text-slate-500">listos para jugar</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xl font-bold tabular-nums">{rows.filter((m) => !m.scheduledAt && m.status !== 'finished').length}</p>
          <p className="text-xs text-slate-500">sin programar</p>
        </Card>
      </div>

      {conflictCount > 0 && (
        <Alert tone="error" title={`${conflictCount} partidos con conflictos de horario`}>
          Están marcados en rojo: misma pista a la vez, una pareja (o jugador) con dos partidos simultáneos, o un partido antes que su previo.
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<Wand2 className="size-4" />} onClick={() => setAuto(true)}>
          Programar automáticamente
        </Button>
        <Button
          variant="danger-ghost"
          icon={<Trash2 className="size-4" />}
          onClick={async () => {
            if (await confirm({ title: 'Quitar horarios', message: 'Se quitará la pista y la hora de todos los partidos sin resultado.', confirmLabel: 'Quitar', danger: true })) {
              clear.mutate();
            }
          }}
        >
          Quitar horarios
        </Button>
        <div className="ml-auto flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          <button className={cx('inline-flex items-center gap-1 rounded-md px-2.5 py-1.5', view === 'list' ? 'bg-white shadow-xs' : 'text-slate-600')} onClick={() => setView('list')}>
            <List className="size-3.5" /> Lista
          </button>
          <button className={cx('inline-flex items-center gap-1 rounded-md px-2.5 py-1.5', view === 'grid' ? 'bg-white shadow-xs' : 'text-slate-600')} onClick={() => setView('grid')}>
            <Grid3x3 className="size-3.5" /> Por pistas
          </button>
        </div>
      </div>

      {days.length > 0 && (
        <Pills
          value={currentDay ?? ''}
          onChange={setDay}
          options={days.map((d) => ({ value: d, label: d === today ? `Hoy · ${formatDay(d, false)}` : formatDay(d, false) }))}
        />
      )}

      {view === 'grid' ? (
        currentDay ? (
          <CourtGrid rows={rows} comp={comp} day={currentDay} onOpen={setOpen} conflicts={conflicts} />
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">Aún no hay partidos programados.</p>
        )
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={cat} onChange={(e) => setCat(e.target.value)} className="sm:w-56" aria-label="Categoría">
              <option value="all">Todas las categorías</option>
              {comp.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
            <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
              {(
                [
                  ['pending', 'Pendientes'],
                  ['finished', 'Jugados'],
                  ['all', 'Todos'],
                ] as const
              ).map(([v, label]) => (
                <button key={v} onClick={() => setStatus(v)} className={cx('rounded-lg px-3 py-1.5', status === v ? 'bg-white shadow-xs' : 'text-slate-600')}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {unscheduled.length > 0 && (
            <section>
              <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
                <AlertTriangle className="size-4 text-amber-600" /> Sin programar ({unscheduled.length})
              </p>
              <div className="grid gap-2 md:grid-cols-2">{unscheduled.map(card)}</div>
            </section>
          )}
          <section>
            {currentDay && (
              <p className="mb-2 text-sm font-bold text-slate-900">
                {formatDay(currentDay)} ({scheduled.length})
              </p>
            )}
            {scheduled.length ? (
              <div className="grid gap-2 md:grid-cols-2">{scheduled.map(card)}</div>
            ) : (
              <p className="py-6 text-center text-sm text-slate-500">No hay partidos con estos filtros este día.</p>
            )}
          </section>
        </>
      )}

      {open && (
        <MatchDialog
          tournamentId={t.id}
          cat={catById.get(open.categoryId)!}
          match={open}
          courts={comp.courts}
          timezone={tz}
          defaultDay={currentDay ?? defaultDayFor(t.startDate, tz)}
          onClose={() => setOpen(null)}
        />
      )}
      {auto && <AutoScheduleDialog t={t} comp={comp} onClose={() => setAuto(false)} />}
    </div>
  );
}
