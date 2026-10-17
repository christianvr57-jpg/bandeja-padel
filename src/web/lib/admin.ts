import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminCompetitionView, AdminRegistration, AdminTournament } from '@shared/api';
import { errorMessage, useFeedback } from '../components/feedback';
import { api } from './api';

export const adminKeys = {
  tournament: (id: string) => ['admin', id, 'tournament'] as const,
  registrations: (id: string) => ['admin', id, 'registrations'] as const,
  competition: (id: string) => ['admin', id, 'competition'] as const,
};

export function useAdminTournament(id: string) {
  return useQuery({ queryKey: adminKeys.tournament(id), queryFn: () => api<AdminTournament>(`/admin/tournaments/${id}`) });
}

export function useAdminRegistrations(id: string) {
  return useQuery({ queryKey: adminKeys.registrations(id), queryFn: () => api<AdminRegistration[]>(`/admin/tournaments/${id}/registrations`) });
}

export function useAdminCompetition(id: string) {
  return useQuery({ queryKey: adminKeys.competition(id), queryFn: () => api<AdminCompetitionView>(`/admin/tournaments/${id}/competition`) });
}

/**
 * Mutación del panel: al terminar refresca todos los datos del torneo y muestra
 * un aviso (o el error de la API).
 */
export function useAdminAction<V = void, R = unknown>(
  tournamentId: string,
  fn: (vars: V) => Promise<R>,
  opts: { success?: string | ((vars: V) => string); onSuccess?: (vars: V) => void } = {},
) {
  const qc = useQueryClient();
  const { toast } = useFeedback();
  return useMutation<R, Error, V>({
    mutationFn: fn,
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['admin', tournamentId] });
      void qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
      void qc.invalidateQueries({ queryKey: ['public-tournament'] });
      const msg = typeof opts.success === 'function' ? opts.success(vars) : opts.success;
      if (msg) toast(msg);
      opts.onSuccess?.(vars);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
}
