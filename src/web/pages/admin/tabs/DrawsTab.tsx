import { Dices, GitBranch, Shuffle, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { AdminTournament, MatchView } from '@shared/api';
import { COMPETITION_FORMATS } from '@shared/labels';
import { CategoryDraw } from '../../../components/Draw';
import { useFeedback } from '../../../components/feedback';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, ErrorState, PageLoader, Pills } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useAdminAction, useAdminCompetition } from '../../../lib/admin';
import { defaultDayFor, MatchDialog } from '../MatchDialog';

export default function DrawsTab({ t }: { t: AdminTournament }) {
  const q = useAdminCompetition(t.id);
  const { confirm } = useFeedback();
  const [catId, setCatId] = useState(t.categories[0]?.id ?? '');
  const [useSeeds, setUseSeeds] = useState(true);
  const [swapMode, setSwapMode] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ match: string; side: 'a' | 'b' } | null>(null);
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const [open, setOpen] = useState<MatchView | null>(null);

  const generate = useAdminAction(t.id, (id: string) => api(`/admin/categories/${id}/draw`, { method: 'POST', body: { useSeeds } }), {
    success: 'Cuadro generado',
  });
  const remove = useAdminAction(t.id, (id: string) => api(`/admin/categories/${id}/draw`, { method: 'DELETE' }), { success: 'Cuadro borrado' });
  const swap = useAdminAction(t.id, (body: { id: string; payload: unknown }) => api(`/admin/categories/${body.id}/draw/swap`, { method: 'POST', body: body.payload }), {
    success: 'Posiciones intercambiadas',
  });

  const cat = q.data?.categories.find((c) => c.id === catId) ?? q.data?.categories[0];
  const conflicts = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of q.data?.conflicts ?? []) if (!map.has(c.matchId)) map.set(c.matchId, c.message);
    return map;
  }, [q.data?.conflicts]);

  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  if (!cat) {
    return (
      <EmptyState icon={<GitBranch className="size-6" />} title="Primero crea una categoría" action={<Link to={`/panel/torneos/${t.id}/categorias`} className="font-semibold text-court-700 underline">Ir a categorías</Link>} />
    );
  }

  const hasResults = cat.matches.some((m) => m.status === 'finished');
  const seeded = cat.pairs.filter((p) => p.seed).sort((a, b) => a.seed! - b.seed!);

  const onSlotClick = (m: MatchView, side: 'a' | 'b') => {
    if (!selectedSlot) return setSelectedSlot({ match: m.key, side });
    if (selectedSlot.match === m.key && selectedSlot.side === side) return setSelectedSlot(null);
    swap.mutate({ id: cat.id, payload: { kind: 'slots', x: selectedSlot, y: { match: m.key, side } } });
    setSelectedSlot(null);
  };
  const onPairClick = (pairId: string) => {
    if (!selectedPair) return setSelectedPair(pairId);
    if (selectedPair === pairId) return setSelectedPair(null);
    swap.mutate({ id: cat.id, payload: { kind: 'entries', x: selectedPair, y: pairId } });
    setSelectedPair(null);
  };

  return (
    <div className="space-y-5">
      <Pills
        value={cat.id}
        onChange={(v) => {
          setCatId(v);
          setSwapMode(false);
        }}
        options={q.data.categories.map((c) => ({ value: c.id, label: c.label, count: c.confirmedCount }))}
      />

      {!cat.drawGenerated ? (
        <Card className="p-6">
          <div className="flex flex-col gap-6 md:flex-row">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <Dices className="size-5 text-court-700" />
                <p className="text-lg font-bold text-slate-900">Sorteo de {cat.label}</p>
              </div>
              <p className="text-sm text-slate-600">
                {COMPETITION_FORMATS[cat.format].label}. {COMPETITION_FORMATS[cat.format].help}
              </p>
              <p className="text-sm text-slate-700">
                <strong>{cat.confirmedCount}</strong> parejas confirmadas (máx. {cat.maxPairs})
                {cat.waitlistCount > 0 && `, ${cat.waitlistCount} en lista de espera (no entran en el cuadro)`}.
              </p>
              {cat.format !== 'americano' && cat.format !== 'groups_knockout' && cat.confirmedCount >= 2 && (
                <p className="text-sm text-slate-600">
                  Cuadro de {2 ** Math.ceil(Math.log2(Math.max(2, cat.confirmedCount)))} posiciones
                  {2 ** Math.ceil(Math.log2(Math.max(2, cat.confirmedCount))) - cat.confirmedCount > 0 &&
                    ` con ${2 ** Math.ceil(Math.log2(Math.max(2, cat.confirmedCount))) - cat.confirmedCount} byes (pasan directamente las mejores cabezas de serie)`}
                  .
                </p>
              )}
              <Alert tone="warning">Al generar el cuadro se cierran las inscripciones de esta categoría.</Alert>
            </div>
            <div className="space-y-3 md:w-72">
              <p className="text-sm font-semibold text-slate-900">Cabezas de serie</p>
              {seeded.length ? (
                <ol className="space-y-1 text-sm">
                  {seeded.map((p) => (
                    <li key={p.id} className="flex gap-2">
                      <Badge tone="blue">{p.seed}</Badge>
                      <span className="truncate text-slate-700">{p.players.join(' / ')}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-slate-500">
                  Ninguna. Puedes asignarlas en{' '}
                  <Link to={`/panel/torneos/${t.id}/inscritos`} className="font-medium text-court-700 underline">
                    Inscritos → Editar
                  </Link>
                  .
                </p>
              )}
              {seeded.length > 0 && <Checkbox checked={useSeeds} onChange={setUseSeeds} label="Respetar cabezas de serie" />}
              <Button
                className="w-full"
                size="lg"
                variant="accent"
                icon={<Shuffle className="size-5" />}
                disabled={cat.confirmedCount < 2}
                loading={generate.isPending}
                onClick={() => generate.mutate(cat.id)}
              >
                Generar cuadro
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {!hasResults && (
              <Button
                variant={swapMode ? 'primary' : 'secondary'}
                size="sm"
                icon={<Shuffle className="size-4" />}
                onClick={() => {
                  setSwapMode((s) => !s);
                  setSelectedSlot(null);
                  setSelectedPair(null);
                }}
              >
                {swapMode ? 'Terminar ajuste' : 'Ajustar sorteo a mano'}
              </Button>
            )}
            <Button
              variant="danger-ghost"
              size="sm"
              icon={<Trash2 className="size-4" />}
              loading={remove.isPending}
              onClick={async () => {
                if (
                  await confirm({
                    title: `Borrar el cuadro de ${cat.label}`,
                    message: 'Se borrarán todos los partidos, horarios y resultados de esta categoría y se reabrirán sus inscripciones. Podrás volver a sortear.',
                    confirmLabel: 'Borrar cuadro',
                    danger: true,
                  })
                ) {
                  remove.mutate(cat.id);
                  setSwapMode(false);
                }
              }}
            >
              Borrar cuadro
            </Button>
            <p className="ml-auto text-xs text-slate-500">Toca un partido para apuntar el resultado o programarlo.</p>
          </div>
          {swapMode && (
            <Alert tone="info" title="Ajuste manual">
              {cat.groups.length
                ? 'Toca una pareja de un grupo y después otra de otro grupo para intercambiarlas.'
                : 'Toca una posición de la primera ronda (pareja o bye) y después otra para intercambiarlas.'}
            </Alert>
          )}
          <CategoryDraw
            cat={cat}
            courts={q.data.courts}
            timezone={q.data.timezone}
            interaction={{
              onMatchClick: swapMode ? undefined : (m) => setOpen(m),
              swapMode: swapMode && !cat.groups.length,
              selectedSlot,
              onSlotClick,
              selectedPair,
              onPairClick: swapMode && cat.groups.length ? onPairClick : undefined,
              conflicts,
            }}
          />
        </>
      )}

      {open && (
        <MatchDialog
          tournamentId={t.id}
          cat={cat}
          match={open}
          courts={q.data.courts}
          timezone={q.data.timezone}
          defaultDay={defaultDayFor(t.startDate, t.timezone)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
