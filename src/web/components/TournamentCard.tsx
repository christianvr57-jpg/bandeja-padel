import { CalendarDays, ChevronRight, MapPin, Users } from 'lucide-react';
import { Link } from 'react-router';
import type { TournamentListItem } from '@shared/api';
import { formatDayRange } from '@shared/time';
import { Badge } from './ui';

export function tournamentPhase(t: { status: string; startDate: string; endDate: string; registrationOpen: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  if (t.status === 'draft') return { label: 'Borrador', tone: 'slate' as const };
  if (t.status === 'finished' || t.endDate < today) return { label: 'Finalizado', tone: 'slate' as const };
  if (t.startDate <= today) return { label: 'En juego', tone: 'lime' as const };
  if (t.registrationOpen) return { label: 'Inscripciones abiertas', tone: 'green' as const };
  return { label: 'Inscripciones cerradas', tone: 'amber' as const };
}

export function TournamentCard({ t, to }: { t: TournamentListItem; to: string }) {
  const phase = tournamentPhase(t);
  return (
    <Link
      to={to}
      className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-court-300 hover:shadow-md"
    >
      <div className="court-pattern grid size-14 shrink-0 place-items-center rounded-xl text-center text-white">
        <div className="leading-none">
          <div className="text-lg font-bold">{Number(t.startDate.slice(8, 10))}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
            {new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' }).format(new Date(`${t.startDate}T00:00:00Z`))}
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={phase.tone}>{phase.label}</Badge>
        </div>
        <p className="mt-1 truncate font-semibold text-slate-900 group-hover:text-court-800">{t.name}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" />
            {formatDayRange(t.startDate, t.endDate)}
          </span>
          {(t.venue || t.clubName) && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" />
              {t.venue || t.clubName}
              {t.clubCity ? ` · ${t.clubCity}` : ''}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" />
            {t.pairsCount} parejas · {t.categoriesCount} {t.categoriesCount === 1 ? 'categoría' : 'categorías'}
          </span>
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-slate-400 group-hover:text-court-700" />
    </Link>
  );
}
