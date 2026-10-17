import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Clock, MapPin, Pencil, Trash2, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { ManagedRegistration } from '@shared/api';
import { formatDateTime, formatDayRange } from '@shared/time';
import { errorMessage, useFeedback } from '../../components/feedback';
import { Container } from '../../components/Layout';
import { PlayerFields, serverPlayerErrors, validatePlayer, type PlayerForm } from '../../components/PlayerFields';
import { Alert, Badge, Button, Card, ErrorState, LinkButton, PageLoader } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { euros } from '../../lib/util';
import NotFound from '../NotFound';

const STATUS = {
  confirmed: { label: 'Inscripción confirmada', tone: 'green' as const },
  waitlist: { label: 'En lista de espera', tone: 'amber' as const },
  cancelled: { label: 'Cancelada', tone: 'red' as const },
};

function EditForm({ data, token, onDone }: { data: ManagedRegistration; token: string; onDone: () => void }) {
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const [players, setPlayers] = useState<PlayerForm[]>(
    data.players.map((p) => ({ fullName: p.fullName, email: p.email, phone: p.phone, dni: '' })),
  );
  const [submitted, setSubmitted] = useState(false);
  const save = useMutation({
    mutationFn: () => api(`/public/registrations/${token}`, { method: 'PUT', body: { player1: players[0], player2: players[1] } }),
    onSuccess: () => {
      toast('Datos actualizados');
      void qc.invalidateQueries({ queryKey: ['managed', token] });
      onDone();
    },
  });
  const fields = save.error instanceof ApiError ? save.error.fields : {};
  const errs = players.map((p, i) => ({
    ...(submitted ? validatePlayer(p, { dniOptional: true }) : {}),
    ...serverPlayerErrors(fields, i === 0 ? 'player1' : 'player2'),
  }));

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
        if (players.some((p) => Object.keys(validatePlayer(p, { dniOptional: true })).length)) return;
        save.mutate();
      }}
    >
      {players.map((p, i) => (
        <PlayerFields
          key={i}
          title={`Jugador ${i + 1}`}
          value={p}
          onChange={(v) => setPlayers((list) => list.map((x, j) => (j === i ? v : x)))}
          errors={errs[i]!}
          dniPlaceholder={data.players[i]?.dniMasked || 'Sin cambios'}
          dniHint="Déjalo vacío para mantener el actual."
        />
      ))}
      {save.error && <Alert tone="error">{save.error.message}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending}>
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}

export default function ManageRegistration() {
  const { token = '' } = useParams();
  const qc = useQueryClient();
  const { confirm, toast } = useFeedback();
  const [editing, setEditing] = useState(false);
  const q = useQuery({
    queryKey: ['managed', token],
    queryFn: () => api<ManagedRegistration>(`/public/registrations/${encodeURIComponent(token)}`),
  });
  const cancel = useMutation({
    mutationFn: () => api(`/public/registrations/${token}/cancel`, { method: 'POST', body: {} }),
    onSuccess: () => {
      toast('Inscripción cancelada');
      void qc.invalidateQueries({ queryKey: ['managed', token] });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (q.isLoading) return <PageLoader />;
  if (q.error instanceof ApiError && q.error.status === 404) {
    return <NotFound message="Este enlace de inscripción no es válido. Si te has inscrito, busca el email de confirmación más reciente." />;
  }
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  const d = q.data;
  const status = STATUS[d.status];

  return (
    <Container className="py-6 sm:py-10">
      <div className="mx-auto max-w-2xl space-y-5">
        <div>
          <p className="text-sm font-medium text-court-700">Mi inscripción</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{d.tournament.name}</h1>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-4" />
              {formatDayRange(d.tournament.startDate, d.tournament.endDate)}
            </span>
            {d.tournament.venue && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-4" />
                {d.tournament.venue}
              </span>
            )}
          </p>
        </div>

        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Categoría</p>
              <p className="font-semibold text-slate-900">{d.category.label}</p>
            </div>
            <Badge tone={status.tone} className="text-sm">
              {status.label}
              {d.status === 'waitlist' && d.waitlistPosition ? ` · nº ${d.waitlistPosition}` : ''}
            </Badge>
          </div>
          {d.status !== 'cancelled' && d.tournament.priceCents > 0 && (
            <p className="mt-3 text-sm text-slate-600">
              Inscripción: {euros(d.tournament.priceCents)} por pareja ·{' '}
              {d.paid ? <span className="font-medium text-emerald-700">pagada</span> : <span className="font-medium text-amber-700">pendiente de pago en el club</span>}
            </p>
          )}
          {d.status === 'waitlist' && (
            <Alert tone="warning" className="mt-4">
              La categoría está completa. Si se libera una plaza, vuestra pareja pasará automáticamente a inscrita y os avisaremos por email.
            </Alert>
          )}
        </Card>

        <Card className="p-5">
          {editing ? (
            <EditForm data={d} token={token} onDone={() => setEditing(false)} />
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="font-semibold text-slate-900">Pareja</p>
                {d.canEdit && (
                  <Button variant="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                    Modificar datos
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {d.players.map((p, i) => (
                  <div key={i} className="rounded-xl bg-slate-50 p-3.5 text-sm">
                    <p className="font-semibold text-slate-900">{p.fullName}</p>
                    <dl className="mt-2 space-y-0.5 text-slate-600">
                      <div>DNI/NIE: {p.dniMasked || '—'}</div>
                      <div className="break-all">{p.email || '—'}</div>
                      <div>{p.phone || '—'}</div>
                    </dl>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        {d.matches.length > 0 && (
          <Card className="p-5">
            <p className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
              <Trophy className="size-4 text-court-700" /> Vuestros partidos
            </p>
            <ul className="divide-y divide-slate-100">
              {d.matches.map((m) => (
                <li key={m.number} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-8 text-xs font-semibold text-slate-400">#{m.number}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{m.roundLabel}</p>
                    <p className="truncate text-slate-600">vs {m.opponent ? m.opponent.join(' / ') : 'por decidir'}</p>
                    {m.scheduledAt && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="size-3" />
                        {formatDateTime(m.scheduledAt, d.tournament.timezone)}
                        {m.courtName && ` · ${m.courtName}`}
                      </p>
                    )}
                  </div>
                  {m.score && <span className="shrink-0 font-semibold tabular-nums text-slate-900">{m.score}</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <LinkButton to={`/t/${d.tournament.slug}`} variant="secondary">
            Ver página del torneo
          </LinkButton>
          {d.canCancel && (
            <Button
              variant="danger-ghost"
              icon={<Trash2 className="size-4" />}
              loading={cancel.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: 'Cancelar inscripción',
                  message: 'Se liberará vuestra plaza (pasará a la siguiente pareja en espera). Esta acción no se puede deshacer.',
                  confirmLabel: 'Sí, cancelar',
                  danger: true,
                });
                if (ok) cancel.mutate();
              }}
            >
              Cancelar inscripción
            </Button>
          )}
        </div>
        {d.cancelBlockedReason && <Alert tone="info">{d.cancelBlockedReason}</Alert>}
        <p className="text-center text-xs text-slate-500">
          Este enlace es personal: no lo compartas. ¿Dudas sobre tus datos? Consulta la{' '}
          <Link to="/privacidad" className="underline">
            política de privacidad
          </Link>
          .
        </p>
      </div>
    </Container>
  );
}
