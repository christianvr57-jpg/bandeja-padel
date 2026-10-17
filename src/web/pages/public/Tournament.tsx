import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  Clock,
  Euro,
  Eye,
  Info,
  Mail,
  MapPin,
  Phone,
  Search,
  Trophy,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router';
import type { CategoryView, CourtView, MatchView, PublicTournamentView } from '@shared/api';
import { COMPETITION_FORMATS, MATCH_FORMATS } from '@shared/labels';
import { formatDateTime, formatDay, formatDayRange, formatTime, zonedDate } from '@shared/time';
import { CategoryDraw } from '../../components/Draw';
import { Container } from '../../components/Layout';
import { MatchCard } from '../../components/MatchCard';
import { ShareButtons } from '../../components/Share';
import { tournamentPhase } from '../../components/TournamentCard';
import { Alert, Badge, Card, cx, EmptyState, ErrorState, Input, LinkButton, PageLoader, Pills } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { euros } from '../../lib/util';
import NotFound from '../NotFound';

type Tab = 'info' | 'inscritos' | 'cuadros' | 'partidos';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'info', label: 'Información' },
  { id: 'inscritos', label: 'Inscritos' },
  { id: 'cuadros', label: 'Cuadros' },
  { id: 'partidos', label: 'Horarios y resultados' },
];

export function usePublicTournament(slug: string) {
  return useQuery({
    queryKey: ['public-tournament', slug],
    queryFn: () => api<PublicTournamentView>(`/public/tournaments/${encodeURIComponent(slug)}`),
    refetchInterval: 60_000,
  });
}

function Cover({ data }: { data: PublicTournamentView }) {
  const t = data.tournament;
  const phase = tournamentPhase(t);
  return (
    <div className="relative overflow-hidden">
      {t.image ? (
        <>
          <img src={t.image} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-court-950 via-court-950/70 to-court-950/20" />
        </>
      ) : (
        <div className="court-pattern absolute inset-0" />
      )}
      <Container className="relative pb-6 pt-16 text-white sm:pt-24">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={phase.tone}>{phase.label}</Badge>
          {data.preview && (
            <Badge tone="amber">
              <Eye className="size-3" /> Vista previa (no publicado)
            </Badge>
          )}
        </div>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{t.name}</h1>
        <p className="mt-1 text-court-100">Organiza {t.clubName}</p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-court-50">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-4 text-ball-400" />
            {formatDayRange(t.startDate, t.endDate)}
          </span>
          {t.venue && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4 text-ball-400" />
              {t.venue}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Euro className="size-4 text-ball-400" />
            {t.priceCents ? `${euros(t.priceCents)} por pareja` : 'Gratis'}
          </span>
        </div>
      </Container>
    </div>
  );
}

function CategoryCapacity({ cat }: { cat: CategoryView }) {
  const pct = Math.min(100, Math.round((cat.confirmedCount / cat.maxPairs) * 100));
  const full = cat.confirmedCount >= cat.maxPairs;
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {cat.confirmedCount}/{cat.maxPairs} parejas
        </span>
        {full ? (
          <span className="font-medium text-amber-700">Completa{cat.waitlistCount ? ` · ${cat.waitlistCount} en espera` : ''}</span>
        ) : (
          <span className="font-medium text-emerald-700">
            {cat.maxPairs - cat.confirmedCount} {cat.maxPairs - cat.confirmedCount === 1 ? 'plaza libre' : 'plazas libres'}
          </span>
        )}
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={cx('h-full rounded-full', full ? 'bg-amber-400' : 'bg-ball-500')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function InfoTab({ data }: { data: PublicTournamentView }) {
  const t = data.tournament;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        {t.description && (
          <Card className="p-5">
            <p className="whitespace-pre-line leading-relaxed text-slate-700">{t.description}</p>
          </Card>
        )}
        <section>
          <h2 className="mb-3 text-lg font-bold text-slate-900">Categorías</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.categories.map((cat) => (
              <Card key={cat.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{cat.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{COMPETITION_FORMATS[cat.format].label}</p>
                  </div>
                  {cat.drawGenerated ? (
                    <Badge tone="blue">Cuadro publicado</Badge>
                  ) : cat.registrationOpen ? (
                    <Badge tone="green">Abierta</Badge>
                  ) : (
                    <Badge tone="slate">Cerrada</Badge>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500">{MATCH_FORMATS[cat.matchFormat]}</p>
                <div className="mt-3">
                  <CategoryCapacity cat={cat} />
                </div>
                {cat.registrationOpen && (
                  <LinkButton
                    to={`/t/${t.slug}/inscripcion?categoria=${cat.id}`}
                    variant={cat.confirmedCount >= cat.maxPairs ? 'secondary' : 'primary'}
                    size="sm"
                    className="mt-4"
                  >
                    {cat.confirmedCount >= cat.maxPairs ? 'Apuntarse a la lista de espera' : 'Inscribirse'}
                  </LinkButton>
                )}
              </Card>
            ))}
          </div>
        </section>
        {t.rules && (
          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-900">Reglamento</h2>
            <Card className="p-5">
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{t.rules}</p>
            </Card>
          </section>
        )}
      </div>

      <aside className="space-y-4">
        <Card className="space-y-3 p-5 text-sm">
          <p className="font-semibold text-slate-900">Datos del torneo</p>
          <p className="flex gap-2 text-slate-700">
            <CalendarDays className="size-4 shrink-0 text-court-600" />
            {formatDayRange(t.startDate, t.endDate)}
          </p>
          {(t.venue || t.address) && (
            <p className="flex gap-2 text-slate-700">
              <MapPin className="size-4 shrink-0 text-court-600" />
              <span>
                {t.venue}
                {t.address && (
                  <>
                    <br />
                    <a
                      className="text-court-700 underline"
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.address)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t.address}
                    </a>
                  </>
                )}
              </span>
            </p>
          )}
          <p className="flex gap-2 text-slate-700">
            <Euro className="size-4 shrink-0 text-court-600" />
            {t.priceCents ? `${euros(t.priceCents)} por pareja · se paga en el club` : 'Inscripción gratuita'}
          </p>
          {t.registrationDeadline && (
            <p className="flex gap-2 text-slate-700">
              <Clock className="size-4 shrink-0 text-court-600" />
              Inscripciones hasta el {formatDateTime(t.registrationDeadline, t.timezone)}
            </p>
          )}
          {t.contactPhone && (
            <a href={`tel:${t.contactPhone.replace(/\s/g, '')}`} className="flex gap-2 text-court-700">
              <Phone className="size-4 shrink-0" />
              {t.contactPhone}
            </a>
          )}
          {t.contactEmail && (
            <a href={`mailto:${t.contactEmail}`} className="flex gap-2 break-all text-court-700">
              <Mail className="size-4 shrink-0" />
              {t.contactEmail}
            </a>
          )}
        </Card>
        <Card className="p-5">
          <p className="mb-3 text-sm font-semibold text-slate-900">Comparte el torneo</p>
          <ShareButtons title={t.name} url={t.publicUrl} text={`🎾 ${t.name} · ${formatDayRange(t.startDate, t.endDate)}`} compact />
        </Card>
        <p className="flex gap-2 px-1 text-xs text-slate-500">
          <Info className="size-4 shrink-0" />
          En esta página solo se muestran los nombres de los jugadores. DNI, email y teléfono solo los ve el club organizador.
        </p>
      </aside>
    </div>
  );
}

function PairsTab({ data }: { data: PublicTournamentView }) {
  if (!data.categories.length) return <EmptyState title="Todavía no hay categorías" />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {data.categories.map((cat) => (
        <Card key={cat.id} className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">{cat.label}</p>
              <span className="text-xs text-slate-500">
                {cat.confirmedCount}/{cat.maxPairs}
              </span>
            </div>
          </div>
          {cat.pairs.length ? (
            <ol className="divide-y divide-slate-100">
              {cat.pairs.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-5 text-right text-xs font-semibold text-slate-400">{i + 1}</span>
                  <span className="min-w-0 flex-1 text-slate-800">{p.players.join(' / ')}</span>
                  {p.seed && <Badge tone="blue">Cabeza de serie {p.seed}</Badge>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Aún no hay parejas inscritas.</p>
          )}
          {cat.waitlistCount > 0 && (
            <p className="border-t border-slate-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              {cat.waitlistCount} {cat.waitlistCount === 1 ? 'pareja' : 'parejas'} en lista de espera
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Buscar jugador…" className="pl-9" aria-label="Buscar jugador" />
    </div>
  );
}

function DrawsTab({ data }: { data: PublicTournamentView }) {
  const withDraw = data.categories.filter((c) => c.drawGenerated);
  const [catId, setCatId] = useState(withDraw[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const cat = withDraw.find((c) => c.id === catId) ?? withDraw[0];
  if (!cat) {
    return (
      <EmptyState icon={<Trophy className="size-6" />} title="Los cuadros aún no están publicados">
        El club los generará cuando se cierren las inscripciones.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Pills value={cat.id} onChange={setCatId} options={withDraw.map((c) => ({ value: c.id, label: c.label }))} />
        <div className="sm:w-64">
          <SearchBox value={search} onChange={setSearch} />
        </div>
      </div>
      <CategoryDraw cat={cat} courts={data.courts} timezone={data.tournament.timezone} highlight={search.trim() || undefined} />
    </div>
  );
}

export function MatchList({
  matches,
  categories,
  courts,
  timezone,
  highlight,
}: {
  matches: Array<MatchView & { categoryId: string }>;
  categories: CategoryView[];
  courts: CourtView[];
  timezone: string;
  highlight?: string;
}) {
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const pairsByCat = useMemo(() => new Map(categories.map((c) => [c.id, new Map(c.pairs.map((p) => [p.id, p]))])), [categories]);
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {matches.map((m) => (
        <MatchCard
          key={m.id}
          match={m}
          pairs={pairsByCat.get(m.categoryId)!}
          courts={courts}
          timezone={timezone}
          categoryLabel={catById.get(m.categoryId)?.label}
          highlight={highlight}
        />
      ))}
    </div>
  );
}

function MatchesTab({ data }: { data: PublicTournamentView }) {
  const tz = data.tournament.timezone;
  const [search, setSearch] = useState('');
  const all = useMemo(
    () =>
      data.categories
        .flatMap((c) => c.matches.map((m) => ({ ...m, categoryId: c.id })))
        .filter((m) => m.status !== 'bye'),
    [data],
  );
  const scheduled = all.filter((m) => m.scheduledAt).sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
  const days = [...new Set(scheduled.map((m) => zonedDate(m.scheduledAt!, tz)))];
  const today = zonedDate(new Date(), tz);
  const [day, setDay] = useState(days.includes(today) ? today : (days[0] ?? 'sin-hora'));
  const [catFilter, setCatFilter] = useState('all');

  const q = search.trim().toLowerCase();
  const matchesSearch = (m: (typeof all)[number]) => {
    if (!q) return true;
    const cat = data.categories.find((c) => c.id === m.categoryId)!;
    return [m.a, m.b].some((s) => s.kind === 'pair' && cat.pairs.find((p) => p.id === s.pairId)?.players.some((n) => n.toLowerCase().includes(q)));
  };
  const unscheduled = all.filter((m) => !m.scheduledAt && m.status !== 'waiting');
  const list = (day === 'sin-hora' ? unscheduled : scheduled.filter((m) => zonedDate(m.scheduledAt!, tz) === day))
    .filter((m) => catFilter === 'all' || m.categoryId === catFilter)
    .filter(matchesSearch);

  if (!all.length) {
    return (
      <EmptyState icon={<Clock className="size-6" />} title="Todavía no hay partidos">
        Los horarios aparecerán cuando el club genere los cuadros y programe los partidos.
      </EmptyState>
    );
  }

  const groups = new Map<string, typeof list>();
  for (const m of list) {
    const key = m.scheduledAt ? formatTime(m.scheduledAt, tz) : 'Sin hora asignada';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Pills
          value={day}
          onChange={setDay}
          options={[
            ...days.map((d) => ({ value: d, label: d === today ? `Hoy · ${formatDay(d, false)}` : formatDay(d, false) })),
            ...(unscheduled.length ? [{ value: 'sin-hora', label: 'Sin hora' }] : []),
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm sm:w-56"
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            aria-label="Categoría"
          >
            <option value="all">Todas las categorías</option>
            {data.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <div className="flex-1 sm:max-w-xs">
            <SearchBox value={search} onChange={setSearch} />
          </div>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">No hay partidos con estos filtros.</p>
      ) : (
        [...groups.entries()].map(([time, ms]) => (
          <section key={time}>
            <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
              <Clock className="size-4 text-court-600" /> {time}
            </p>
            <MatchList matches={ms} categories={data.categories} courts={data.courts} timezone={tz} highlight={q || undefined} />
          </section>
        ))
      )}
    </div>
  );
}

export default function PublicTournament() {
  const { slug = '', tab: rawTab } = useParams();
  const tab: Tab = TABS.some((t) => t.id === rawTab) ? (rawTab as Tab) : 'info';
  const { data, error, isLoading, refetch } = usePublicTournament(slug);

  if (isLoading) return <PageLoader />;
  if (error instanceof ApiError && error.status === 404) return <NotFound message="Este torneo no existe o todavía no se ha publicado." />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  const anyOpen = data.categories.some((c) => c.registrationOpen);

  return (
    <div className="pb-24 sm:pb-0">
      <Cover data={data} />
      <nav className="sticky top-14 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <Container>
          <div className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4">
            {TABS.map((t) => (
              <NavLink
                key={t.id}
                to={t.id === 'info' ? `/t/${slug}` : `/t/${slug}/${t.id}`}
                end
                className={cx(
                  'shrink-0 border-b-2 px-3 py-3 text-sm font-semibold transition-colors',
                  tab === t.id ? 'border-court-900 text-court-900' : 'border-transparent text-slate-500 hover:text-slate-800',
                )}
              >
                {t.label}
              </NavLink>
            ))}
            {anyOpen && (
              <Link
                to={`/t/${slug}/inscripcion`}
                className="my-1.5 ml-auto hidden shrink-0 items-center rounded-lg bg-ball-400 px-4 text-sm font-semibold text-court-950 hover:bg-ball-300 sm:inline-flex"
              >
                Inscribirse
              </Link>
            )}
          </div>
        </Container>
      </nav>

      <Container className="py-6">
        {data.preview && (
          <Alert tone="warning" className="mb-5" title="Vista previa">
            Solo tú (el club) puedes ver esta página. Publica el torneo desde tu panel para que sea visible y se pueda compartir.
          </Alert>
        )}
        {tab === 'info' && <InfoTab data={data} />}
        {tab === 'inscritos' && <PairsTab data={data} />}
        {tab === 'cuadros' && <DrawsTab data={data} />}
        {tab === 'partidos' && <MatchesTab data={data} />}
      </Container>

      {anyOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
          <LinkButton to={`/t/${slug}/inscripcion`} variant="accent" size="lg" className="w-full" icon={<Users className="size-5" />}>
            Inscribir a mi pareja
          </LinkButton>
        </div>
      )}
    </div>
  );
}
