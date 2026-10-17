import { useQueryClient } from '@tanstack/react-query';
import { Archive, EyeOff, Flag, Rocket, ShieldCheck, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { AdminTournament } from '@shared/api';
import { useFeedback } from '../../../components/feedback';
import { Alert, Button, Card, SectionTitle } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useAdminAction } from '../../../lib/admin';
import { TournamentForm, type TournamentBody } from '../TournamentForm';

export default function SettingsTab({ t }: { t: AdminTournament }) {
  const { confirm } = useFeedback();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const save = useAdminAction(t.id, (body: TournamentBody) => api(`/admin/tournaments/${t.id}`, { method: 'PUT', body }), { success: 'Torneo guardado' });
  const status = useAdminAction(t.id, (s: string) => api(`/admin/tournaments/${t.id}/status`, { method: 'PATCH', body: { status: s } }), {
    success: (s) => ({ published: 'Torneo publicado', draft: 'Torneo pasado a borrador', finished: 'Torneo finalizado' })[s] ?? 'Hecho',
  });
  const purge = useAdminAction(t.id, () => api(`/admin/tournaments/${t.id}/purge`, { method: 'POST', body: {} }), {
    success: 'Datos personales anonimizados',
  });
  const remove = useAdminAction(t.id, () => api(`/admin/tournaments/${t.id}`, { method: 'DELETE' }), {
    success: 'Torneo eliminado',
    onSuccess: () => {
      qc.removeQueries({ queryKey: ['admin', t.id] });
      navigate('/panel', { replace: true });
    },
  });

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div>
        <SectionTitle>Datos del torneo</SectionTitle>
        <TournamentForm key={t.id} tournament={t} onSubmit={(b) => save.mutate(b)} pending={save.isPending} error={save.error} submitLabel="Guardar cambios" />
      </div>
      <aside className="space-y-4">
        <Card className="space-y-3 p-5">
          <p className="font-semibold text-slate-900">Estado</p>
          <p className="text-sm text-slate-600">
            {t.status === 'draft' && 'Borrador: solo lo ves tú.'}
            {t.status === 'published' && 'Publicado: visible para todo el que tenga el enlace.'}
            {t.status === 'finished' && 'Finalizado: se mantiene visible con los resultados.'}
          </p>
          <div className="flex flex-col gap-2">
            {t.status !== 'published' && (
              <Button variant="accent" icon={<Rocket className="size-4" />} onClick={() => status.mutate('published')} loading={status.isPending}>
                {t.status === 'finished' ? 'Reabrir (publicado)' : 'Publicar'}
              </Button>
            )}
            {t.status === 'published' && (
              <>
                <Button
                  variant="secondary"
                  icon={<Flag className="size-4" />}
                  onClick={async () => {
                    if (await confirm({ title: 'Finalizar torneo', message: 'Se cierran las inscripciones y la página queda como histórico de resultados.', confirmLabel: 'Finalizar' })) {
                      status.mutate('finished');
                    }
                  }}
                >
                  Marcar como finalizado
                </Button>
                <Button variant="ghost" icon={<EyeOff className="size-4" />} onClick={() => status.mutate('draft')}>
                  Despublicar (borrador)
                </Button>
              </>
            )}
          </div>
        </Card>

        <Card className="space-y-3 p-5">
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            <ShieldCheck className="size-4 text-court-700" /> Privacidad (RGPD)
          </p>
          {t.personalDataPurgedAt ? (
            <Alert tone="success">Datos anonimizados el {new Date(t.personalDataPurgedAt).toLocaleDateString('es-ES')}.</Alert>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Cuando el torneo termine, borra los DNI, emails y teléfonos de los jugadores. Se conservan solo los nombres en los cuadros y
                resultados.
              </p>
              <Button
                variant="secondary"
                icon={<Archive className="size-4" />}
                disabled={t.status !== 'finished'}
                loading={purge.isPending}
                onClick={async () => {
                  if (
                    await confirm({
                      title: 'Anonimizar datos personales',
                      message: 'Se borrarán de forma permanente los DNI/NIE, emails y teléfonos de todas las parejas de este torneo, y los enlaces privados dejarán de funcionar.',
                      confirmLabel: 'Anonimizar',
                      danger: true,
                    })
                  ) {
                    purge.mutate();
                  }
                }}
              >
                Anonimizar datos
              </Button>
              {t.status !== 'finished' && <p className="text-xs text-slate-500">Disponible cuando marques el torneo como finalizado.</p>}
            </>
          )}
        </Card>

        <Card className="space-y-3 border-red-200 p-5">
          <p className="font-semibold text-red-700">Zona peligrosa</p>
          <p className="text-sm text-slate-600">Elimina el torneo con todas sus categorías, inscripciones, cuadros y resultados.</p>
          <Button
            variant="danger"
            icon={<Trash2 className="size-4" />}
            loading={remove.isPending}
            onClick={async () => {
              if (
                await confirm({
                  title: `Eliminar «${t.name}»`,
                  message: 'Esta acción no se puede deshacer. Se borrarán también todos los datos de los jugadores inscritos.',
                  confirmLabel: 'Eliminar definitivamente',
                  danger: true,
                })
              ) {
                remove.mutate();
              }
            }}
          >
            Eliminar torneo
          </Button>
        </Card>
      </aside>
    </div>
  );
}
