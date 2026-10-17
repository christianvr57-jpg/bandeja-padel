import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClubMe } from '@shared/api';
import { api, sessionToken } from './api';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ club: ClubMe | null }>('/auth/me').then((r) => r.club),
    staleTime: 60_000,
  });
}

type AuthResponse = { club: ClubMe; token: string | null };

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api<AuthResponse>('/auth/login', { method: 'POST', body }),
    onSuccess: (r) => {
      sessionToken.set(r.token);
      qc.clear();
      qc.setQueryData(['me'], r.club);
    },
  });
}

export function useSignup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { clubName: string; city: string; email: string; password: string; acceptTerms: boolean }) =>
      api<AuthResponse>('/auth/signup', { method: 'POST', body }),
    onSuccess: (r) => {
      sessionToken.set(r.token);
      qc.clear();
      qc.setQueryData(['me'], r.club);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST', body: {} }),
    onSettled: () => {
      sessionToken.set(null);
      qc.clear();
      qc.setQueryData(['me'], null);
    },
  });
}
