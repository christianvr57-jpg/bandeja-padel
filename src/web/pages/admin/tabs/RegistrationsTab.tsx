import {
  ArrowRightLeft,
  Download,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Search,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AdminRegistration, AdminTournament } from '@shared/api';
import { useFeedback } from '../../../components/feedback';
import { emptyPlayer, PlayerFields, serverPlayerErrors, validatePlayer, type PlayerForm } from '../../../components/PlayerFields';
import { Alert, Badge, Button, Card, Checkbox, cx, EmptyState, ErrorState, Field, Input, Modal, PageLoader, Pills, Select, Textarea } from '../../../components/ui';
import { apiRaw, api, ApiError } from '../../../lib/api';
import { useAdminAction, useAdminRegistrations } from '../../../lib/admin';
import { downloadBlob } from '../../../lib/util';

type StatusFilter = 'confirmed' | 'waitlist' | 'cancelled';

function RegistrationDialog({
  t,
  reg,
  onClose,
}: {
  t: AdminTournament;
  reg: AdminRegistration | null;
  onClose: () => void;
}) {
  const isNew = !reg;
  const [categoryId, setCategoryId] = useState(reg?.categoryId ?? t.categories[0]?.id ?? '');
  const [players, setPlayers] = useState<PlayerForm[]>(
    reg
      ? reg.players.map((p) => ({ fullName: p.fullName, email: p.email ?? '', phone: p.phone ?? '', dni: p.dni ?? '' }))
      : [emptyPlayer(), emptyPlayer()],
  );
  const [paid, setPaid] = useState(reg?.paid ?? false);
  const [notes, setNotes] = useState(reg?.notes ?? '');
  const [seed, setSeed] = useState(reg?.seed ? String(reg.seed) : '');
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const save = useAdminAction(
    t.id,
    () =>
      isNew
        ? api(`/admin/tournaments/${t.id}/registrations`, {
            method: 'POST',
            body: { categoryId, player1: players[0], player2: players[1], paid, notes, consentConfirmed: consent },
          })
        : api(`/admin/registrations/${reg!.id}`, {
            method: 'PATCH',
            body: {
              player1: players[0],
              player2: players[1],
              paid,
              notes,
              ...(reg!.inDraw ? {} : { seed: seed ? Number(seed) : null }),
            },
          }),
    { success: isNew ? 'Pareja añadida' : 'Cambios guardados', onSuccess: onClose },
  );
  const fields = save.error instanceof ApiError ? save.error.fields : {};
  const errs = players.map((p, i) => ({
    ...(submitted ? validatePlayer(p, { dniOptional: !isNew && !reg?.players[i]?.dni }) : {}),
    ...serverPlayerErrors(fields, i === 0 ? 'player1' : 'player2'),
  }));

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isNew ? 'Añadir pareja' : 'Editar pareja'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={save.isPending}
            onClick={() => {
              setSubmitted(true);
              if (players.some((p, i) => Object.keys(validatePlayer(p, { dniOptional: !isNew && !reg?.players[i]?.dni })).length)) return;
              save.mutate();
            }}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {isNew && (
          <Field label="Categoría" htmlFor="r-cat">
            <Select id="r-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {t.categories.map((c) => (
                <option key={c.id} value={c.id} disabled={c.drawGenerated}>
                  {c.label} ({c.confirmedCount}/{c.maxPairs}){c.drawGenerated ? ' · cuadro hecho' : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {players.map((p, i) => (
          <PlayerFields
            key={i}
            title={`Jugador ${i + 1}`}
            value={p}
            onChange={(v) => setPlayers((l) => l.map((x, j) => (j === i ? v : x)))}
            errors={errs[i]!}
            dniHint="Solo lo ve el club."
          />
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          {!isNew && (
            <Field label="Cabeza de serie" htmlFor="r-seed" hint={reg?.inDraw ? 'El cuadro ya está hecho.' : 'Vacío = sin cabeza de serie.'} error={fields.seed}>
              <Input id="r-seed" type="number" min={1} max={64} value={seed} disabled={reg?.inDraw} onChange={(e) => setSeed(e.target.value)} />
            </Field>
          )}
          <div className="flex items-end pb-2">
            <Checkbox checked={paid} onChange={setPaid} label="Inscripción pagada" />
          </div>
        </div>
        <Field label="Notas internas" htmlFor="r-notes" hint="Solo las ve el club.">
          <Textarea id="r-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        {isNew && (
          <Checkbox
            checked={consent}
            onChange={setConsent}
            invalid={!!fields.consentConfirmed}
            label="Confirmo que ambos jugadores han aceptado la política de privacidad (por ejemplo, al apuntarse en recepción)."
          />
        )}
        {save.error && <Alert tone="error">{save.error.message}</Alert>}
      </div>
    </Modal>
  );
}

function MoveDialog({ t, reg, onClose }: { t: AdminTournament; reg: AdminRegistration; onClose: () => void }) {
  const options = t.categories.filter((c) => c.id !== reg.categoryId);
  const [target, setTarget] = useState(options.find((c) => !c.drawGenerated)?.id ?? '');
  const move = useAdminAction(t.id, () => api(`/admin/registrations/${reg.id}`, { method: 'PATCH', body: { categoryId: target } }), {
    success: 'Pareja movida de categoría',
    onSuccess: onClose,
  });
  const targetCat = t.categories.find((c) => c.id === target);
  return (
    <Modal
      open
      onClose={onClose}
      title="Mover de categoría"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!target} loading={move.isPending} onClick={() => move.mutate()}>
            Mover
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-700">{reg.players.map((p) => p.fullName).join(' / ')}</p>
        <Field label="Nueva categoría" htmlFor="m-cat">
          <Select id="m-cat" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Elige…</option>
            {options.map((c) => (
              <option key={c.id} value={c.id} disabled={c.drawGenerated}>
                {c.label} ({c.confirmedCount}/{c.maxPairs}){c.drawGenerated ? ' · cuadro hecho' : ''}
              </option>
            ))}
          </Select>
        </Field>
        {targetCat && targetCat.confirmedCount >= targetCat.maxPairs && (
          <Alert tone="warning">La categoría está completa: la pareja pasará a la lista de espera.</Alert>
        )}
        {move.error && <Alert tone="error">{move.error.message}</Alert>}
      </div>
    </Modal>
  );
}

function RegistrationRow({
  t,
  reg,
  index,
  onEdit,
  onMove,
}: {
  t: AdminTournament;
  reg: AdminRegistration;
  index: number;
  onEdit: () => void;
  onMove: () => void;
}) {
  const { confirm } = useFeedback();
  const [menu, setMenu] = useState(false);
  const cat = t.categories.find((c) => c.id === reg.categoryId);
  const togglePaid = useAdminAction(t.id, () => api(`/admin/registrations/${reg.id}`, { method: 'PATCH', body: { paid: !reg.paid } }), {
    success: reg.paid ? 'Marcada como no pagada' : 'Marcada como pagada',
  });
  const cancel = useAdminAction(t.id, () => api(`/admin/registrations/${reg.id}/cancel`, { method: 'POST', body: {} }), {
    success: 'Pareja dada de baja',
  });

  return (
    <Card className={cx('p-4', reg.status === 'cancelled' && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-6 shrink-0 text-right text-sm font-semibold text-slate-400">{index}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {reg.seed && <Badge tone="blue">CS {reg.seed}</Badge>}
            {reg.status === 'waitlist' && <Badge tone="amber">Espera nº {reg.waitlistPosition}</Badge>}
            {reg.status === 'cancelled' && <Badge tone="red">Baja</Badge>}
            {reg.inDraw && <Badge tone="green">En cuadro</Badge>}
            {reg.source === 'club' && <Badge>Añadida por el club</Badge>}
            <span className="text-xs text-slate-500">
              {cat?.label} · {new Date(reg.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            </span>
          </div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {reg.players.map((p, i) => (
              <div key={i} className="min-w-0 text-sm">
                <p className="font-semibold text-slate-900">{p.fullName}</p>
                <p className="font-mono text-xs text-slate-500">{p.dni ?? 'datos anonimizados'}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                  {p.phone && (
                    <a href={`tel:${p.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-court-700">
                      <Phone className="size-3" />
                      {p.phone}
                    </a>
                  )}
                  {p.email && (
                    <a href={`mailto:${p.email}`} className="inline-flex min-w-0 items-center gap-1 truncate text-court-700">
                      <Mail className="size-3 shrink-0" />
                      <span className="truncate">{p.email}</span>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          {reg.notes && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">{reg.notes}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {reg.status !== 'cancelled' && (
            <button
              onClick={() => togglePaid.mutate()}
              disabled={togglePaid.isPending}
              className={cx(
                'rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition',
                reg.paid ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50',
              )}
            >
              {reg.paid ? '✓ Pagado' : 'Sin pagar'}
            </button>
          )}
          {reg.status !== 'cancelled' && (
            <div className="relative">
              <Button variant="ghost" size="sm" aria-label="Acciones" onClick={() => setMenu((m) => !m)} icon={<MoreHorizontal className="size-4" />} />
              {menu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                    <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => (setMenu(false), onEdit())}>
                      <Pencil className="size-4" /> Editar datos
                    </button>
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-40"
                      disabled={reg.inDraw || t.categories.length < 2}
                      onClick={() => (setMenu(false), onMove())}
                    >
                      <ArrowRightLeft className="size-4" /> Mover de categoría
                    </button>
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-40"
                      disabled={reg.inDraw}
                      onClick={async () => {
                        setMenu(false);
                        if (
                          await confirm({
                            title: 'Dar de baja',
                            message: `Se cancelará la inscripción de ${reg.players.map((p) => p.fullName).join(' y ')} y se les avisará por email. Si hay lista de espera, la siguiente pareja ocupará la plaza.`,
                            confirmLabel: 'Dar de baja',
                            danger: true,
                          })
                        ) {
                          cancel.mutate();
                        }
                      }}
                    >
                      <UserMinus className="size-4" /> Dar de baja
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function RegistrationsTab({ t }: { t: AdminTournament }) {
  const q = useAdminRegistrations(t.id);
  const { toast } = useFeedback();
  const [cat, setCat] = useState<string>('all');
  const [status, setStatus] = useState<StatusFilter>('confirmed');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<AdminRegistration | 'new' | null>(null);
  const [moving, setMoving] = useState<AdminRegistration | null>(null);
  const [exporting, setExporting] = useState(false);

  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? [])
      .filter((r) => cat === 'all' || r.categoryId === cat)
      .filter((r) => r.status === status)
      .filter(
        (r) =>
          !s ||
          r.players.some((p) => [p.fullName, p.dni, p.email, p.phone].some((x) => x?.toLowerCase().includes(s))),
      );
  }, [q.data, cat, status, search]);

  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  const all = q.data ?? [];
  const inCat = all.filter((r) => cat === 'all' || r.categoryId === cat);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await apiRaw(`/admin/tournaments/${t.id}/registrations.csv${cat !== 'all' ? `?categoryId=${cat}` : ''}`);
      downloadBlob(await res.blob(), `inscritos-${t.slug}.csv`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo exportar', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {t.personalDataPurgedAt && (
        <Alert tone="info">Los datos personales de este torneo se anonimizaron: solo se conservan los nombres.</Alert>
      )}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Pills
          value={cat}
          onChange={setCat}
          options={[
            { value: 'all', label: 'Todas', count: all.filter((r) => r.status === 'confirmed').length },
            ...t.categories.map((c) => ({ value: c.id, label: c.label, count: c.confirmedCount })),
          ]}
        />
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Download className="size-4" />} loading={exporting} onClick={exportCsv}>
            Excel (CSV)
          </Button>
          <Button icon={<UserPlus className="size-4" />} onClick={() => setEditing('new')} disabled={!t.categories.length}>
            Añadir pareja
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
          {(
            [
              ['confirmed', 'Inscritas'],
              ['waitlist', 'En espera'],
              ['cancelled', 'Bajas'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setStatus(v)}
              className={cx('rounded-lg px-3 py-1.5', status === v ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600')}
            >
              {label} <span className="text-slate-400">{inCat.filter((r) => r.status === v).length}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nombre, DNI, email…" className="pl-9" />
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<Users className="size-6" />} title={search ? 'Sin resultados' : 'No hay parejas en esta vista'}>
          {status === 'confirmed' && !search && 'Comparte el enlace del torneo para recibir inscripciones, o añade parejas a mano.'}
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {list.map((r, i) => (
            <RegistrationRow key={r.id} t={t} reg={r} index={i + 1} onEdit={() => setEditing(r)} onMove={() => setMoving(r)} />
          ))}
        </div>
      )}

      {editing && <RegistrationDialog t={t} reg={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {moving && <MoveDialog t={t} reg={moving} onClose={() => setMoving(null)} />}
    </div>
  );
}
