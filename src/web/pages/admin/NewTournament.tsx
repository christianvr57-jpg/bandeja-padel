import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Container } from '../../components/Layout';
import { api } from '../../lib/api';
import { TournamentForm, type TournamentBody } from './TournamentForm';

export default function NewTournament() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (body: TournamentBody) => api<{ id: string }>('/admin/tournaments', { method: 'POST', body }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
      navigate(`/panel/torneos/${r.id}/categorias`, { replace: true });
    },
  });
  return (
    <Container className="py-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <Link to="/panel" className="inline-flex items-center gap-1 text-sm font-medium text-court-700 hover:underline">
          <ArrowLeft className="size-4" /> Mis torneos
        </Link>
        <h1 className="mb-1 mt-3 text-2xl font-bold text-slate-900">Nuevo torneo</h1>
        <p className="mb-6 text-sm text-slate-600">Después añadirás las categorías y lo publicarás para compartir el enlace.</p>
        <TournamentForm onSubmit={(b) => create.mutate(b)} pending={create.isPending} error={create.error} submitLabel="Crear torneo y añadir categorías" />
      </div>
    </Container>
  );
}
