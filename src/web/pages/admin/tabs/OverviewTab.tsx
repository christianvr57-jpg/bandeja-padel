import { CheckCircle2, Circle, Euro, ListChecks, Trophy, Users } from 'lucide-react';
import { Link } from 'react-router';
import type { AdminTournament } from '@shared/api';
import { formatDayRange } from '@shared/time';
import { ShareButtons } from '../../../components/Share';
import { Alert, Card, cx, SectionTitle, Stat } from '../../../components/ui';
import { euros } from '../../../lib/util';

export default function OverviewTab({ t }: { t: AdminTournament }) {
  const confirmed = t.categories.reduce((s, c) => s + c.confirmedCount, 0);
  const waitlist = t.categories.reduce((s, c) => s + c.waitlistCount, 0);
  const paid = t.categories.reduce((s, c) => s + c.paidCount, 0);
  const total = t.categories.reduce((s, c) => s + c.matchesTotal, 0);
  const played = t.categories.reduce((s, c) => s + c.matchesPlayed, 0);
  const base = `/panel/torneos/${t.id}`;

  const steps = [
    { done: t.categories.length > 0, label: 'Crea las categorías', to: `${base}/categorias` },
    { done: t.status !== 'draft', label: 'Publica el torneo', to: `${base}` },
    { done: confirmed > 0, label: 'Comparte el enlace y recibe inscripciones', to: `${base}/inscritos` },
    { done: t.categories.length > 0 && t.categories.every((c) => c.drawGenerated), label: 'Genera los cuadros', to: `${base}/cuadros` },
    { done: total > 0 && played === total, label: 'Programa partidos y apunta resultados', to: `${base}/partidos` },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        {t.status === 'draft' && (
          <Alert tone="warning" title="El torneo está en borrador">
            Solo tú puedes verlo. Cuando tengas las categorías listas, pulsa «Publicar» para abrir las inscripciones y compartir el enlace.
          </Alert>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Parejas" value={confirmed} sub={waitlist ? `+${waitlist} en espera` : 'inscritas'} icon={<Users className="size-4" />} />
          <Stat label="Pagadas" value={`${paid}/${confirmed}`} sub={t.priceCents ? euros(paid * t.priceCents) : 'gratis'} icon={<Euro className="size-4" />} />
          <Stat label="Partidos" value={`${played}/${total}`} sub="jugados" icon={<Trophy className="size-4" />} />
          <Stat label="Categorías" value={t.categories.length} sub={formatDayRange(t.startDate, t.endDate)} icon={<ListChecks className="size-4" />} />
        </div>

        <section>
          <SectionTitle>Categorías</SectionTitle>
          {t.categories.length === 0 ? (
            <p className="text-sm text-slate-600">
              Aún no hay categorías.{' '}
              <Link to={`${base}/categorias`} className="font-semibold text-court-700 underline">
                Crea la primera
              </Link>
              .
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {t.categories.map((c) => {
                const pct = Math.min(100, Math.round((c.confirmedCount / c.maxPairs) * 100));
                return (
                  <Card key={c.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-900">{c.label}</p>
                      <span className="text-xs text-slate-500">
                        {c.confirmedCount}/{c.maxPairs}
                        {c.waitlistCount ? ` · ${c.waitlistCount} espera` : ''}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-ball-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {c.drawGenerated ? `Cuadro generado · ${c.matchesPlayed}/${c.matchesTotal} partidos jugados` : 'Cuadro pendiente'}
                    </p>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <aside className="space-y-4">
        <Card className="p-5">
          <p className="font-semibold text-slate-900">Enlace para compartir</p>
          <p className="mt-1 text-sm text-slate-600">Envíalo al grupo de WhatsApp del club: los jugadores se inscriben sin registrarse.</p>
          <code className="mt-3 block truncate rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700 ring-1 ring-slate-200">{t.publicUrl}</code>
          <div className="mt-3">
            <ShareButtons
              title={t.name}
              url={t.publicUrl}
              text={`🎾 ¡Inscripciones abiertas! ${t.name} · ${formatDayRange(t.startDate, t.endDate)}${t.priceCents ? ` · ${euros(t.priceCents)}/pareja` : ''}`}
              compact
            />
          </div>
          {t.status === 'draft' && <p className="mt-3 text-xs text-amber-700">Publica el torneo para que el enlace funcione para los jugadores.</p>}
        </Card>
        <Card className="p-5">
          <p className="mb-3 font-semibold text-slate-900">Pasos</p>
          <ol className="space-y-2.5">
            {steps.map((s) => (
              <li key={s.label}>
                <Link to={s.to} className="flex items-center gap-2.5 text-sm">
                  {s.done ? <CheckCircle2 className="size-5 text-ball-600" /> : <Circle className="size-5 text-slate-300" />}
                  <span className={cx(s.done ? 'text-slate-500 line-through' : 'font-medium text-slate-800')}>{s.label}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      </aside>
    </div>
  );
}
