import { useQuery } from '@tanstack/react-query';
import { Plus, Trophy } from 'lucide-react';
import type { TournamentListItem } from '@shared/api';
import { Container } from '../../components/Layout';
import { TournamentCard } from '../../components/TournamentCard';
import { EmptyState, ErrorState, LinkButton, PageLoader } from '../../components/ui';
import { api } from '../../lib/api';
import { useMe } from '../../lib/auth';

export default function Dashboard() {
  const { data: club } = useMe();
  const q = useQuery({ queryKey: ['admin-tournaments'], queryFn: () => api<TournamentListItem[]>('/admin/tournaments') });

  return (
    <Container className="py-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-court-700">{club?.name}</p>
          <h1 className="text-2xl font-bold text-slate-900">Mis torneos</h1>
        </div>
        <LinkButton to="/panel/torneos/nuevo" icon={<Plus className="size-4" />}>
          Nuevo torneo
        </LinkButton>
      </div>
      {q.isLoading ? (
        <PageLoader />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState
          icon={<Trophy className="size-6" />}
          title="Crea tu primer torneo"
          action={
            <LinkButton to="/panel/torneos/nuevo" icon={<Plus className="size-4" />}>
              Nuevo torneo
            </LinkButton>
          }
        >
          Configura fechas, pistas y categorías, publícalo y comparte el enlace por WhatsApp para que las parejas se inscriban.
        </EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {q.data.map((t) => (
            <TournamentCard key={t.id} t={t} to={`/panel/torneos/${t.id}`} />
          ))}
        </div>
      )}
    </Container>
  );
}
