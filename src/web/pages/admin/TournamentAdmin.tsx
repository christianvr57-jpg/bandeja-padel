import { ArrowLeft, ExternalLink, Rocket } from 'lucide-react';
import { Link, NavLink, useParams } from 'react-router';
import { Container } from '../../components/Layout';
import { tournamentPhase } from '../../components/TournamentCard';
import { Badge, Button, cx, ErrorState, LinkButton, PageLoader } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useAdminAction, useAdminTournament } from '../../lib/admin';
import { formatDayRange } from '@shared/time';
import NotFound from '../NotFound';
import CategoriesTab from './tabs/CategoriesTab';
import DrawsTab from './tabs/DrawsTab';
import MatchesTab from './tabs/MatchesTab';
import OverviewTab from './tabs/OverviewTab';
import RegistrationsTab from './tabs/RegistrationsTab';
import SettingsTab from './tabs/SettingsTab';

const TABS = [
  { id: '', label: 'Resumen' },
  { id: 'categorias', label: 'Categorías' },
  { id: 'inscritos', label: 'Inscritos' },
  { id: 'cuadros', label: 'Cuadros' },
  { id: 'partidos', label: 'Horarios y resultados' },
  { id: 'ajustes', label: 'Ajustes' },
] as const;

export default function TournamentAdmin() {
  const { id = '', tab = '' } = useParams();
  const q = useAdminTournament(id);
  const publish = useAdminAction(id, () => api(`/admin/tournaments/${id}/status`, { method: 'PATCH', body: { status: 'published' } }), {
    success: 'Torneo publicado: ya puedes compartir el enlace',
  });

  if (q.isLoading) return <PageLoader />;
  if (q.error instanceof ApiError && q.error.status === 404) return <NotFound message="Este torneo no existe o no pertenece a tu club." />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  const t = q.data;
  const phase = tournamentPhase(t);
  const base = `/panel/torneos/${id}`;

  return (
    <div>
      <div className="border-b border-slate-200 bg-white">
        <Container className="pt-5">
          <Link to="/panel" className="inline-flex items-center gap-1 text-sm font-medium text-court-700 hover:underline">
            <ArrowLeft className="size-4" /> Mis torneos
          </Link>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-bold text-slate-900">{t.name}</h1>
                <Badge tone={phase.tone}>{phase.label}</Badge>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                {formatDayRange(t.startDate, t.endDate)}
                {t.venue && ` · ${t.venue}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <LinkButton to={`/t/${t.slug}`} variant="secondary" size="sm" icon={<ExternalLink className="size-4" />}>
                {t.status === 'draft' ? 'Vista previa' : 'Página pública'}
              </LinkButton>
              {t.status === 'draft' && (
                <Button size="sm" variant="accent" icon={<Rocket className="size-4" />} loading={publish.isPending} onClick={() => publish.mutate()}>
                  Publicar
                </Button>
              )}
            </div>
          </div>
          <nav className="scrollbar-none -mx-4 mt-3 flex gap-1 overflow-x-auto px-4">
            {TABS.map((x) => (
              <NavLink
                key={x.id}
                to={x.id ? `${base}/${x.id}` : base}
                end
                className={cx(
                  'shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors',
                  tab === x.id ? 'border-court-900 text-court-900' : 'border-transparent text-slate-500 hover:text-slate-800',
                )}
              >
                {x.label}
              </NavLink>
            ))}
          </nav>
        </Container>
      </div>
      <Container className="py-6">
        {tab === '' && <OverviewTab t={t} />}
        {tab === 'categorias' && <CategoriesTab t={t} />}
        {tab === 'inscritos' && <RegistrationsTab t={t} />}
        {tab === 'cuadros' && <DrawsTab t={t} />}
        {tab === 'partidos' && <MatchesTab t={t} />}
        {tab === 'ajustes' && <SettingsTab t={t} />}
        {!TABS.some((x) => x.id === tab) && <NotFound />}
      </Container>
    </div>
  );
}
