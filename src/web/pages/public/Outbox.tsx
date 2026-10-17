import { useQuery } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { Fragment } from 'react';
import { Link } from 'react-router';
import type { OutboxEmail } from '@shared/api';
import { Container } from '../../components/Layout';
import { Alert, Card, EmptyState, ErrorState, PageLoader } from '../../components/ui';
import { api } from '../../lib/api';

/** Convierte las URLs del cuerpo del email en enlaces (dentro de la demo, rutas internas). */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (!/^https?:\/\//.test(p)) return <Fragment key={i}>{p}</Fragment>;
        const hash = p.indexOf('#/');
        if (hash >= 0 && p.startsWith(location.origin)) {
          return (
            <Link key={i} to={p.slice(hash + 1)} className="break-all text-court-700 underline">
              {p}
            </Link>
          );
        }
        return (
          <a key={i} href={p} className="break-all text-court-700 underline">
            {p}
          </a>
        );
      })}
    </>
  );
}

export default function Outbox() {
  const q = useQuery({ queryKey: ['outbox'], queryFn: () => api<OutboxEmail[]>('/public/outbox'), refetchInterval: 5000 });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <Container className="py-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Emails enviados (demo)</h1>
        <Alert tone="info">
          En la demo no se envían emails reales: aquí puedes ver los que recibirían los jugadores, con su enlace privado para gestionar la inscripción.
        </Alert>
        {!q.data?.length ? (
          <EmptyState icon={<Mail className="size-6" />} title="Todavía no hay emails">
            Inscribe una pareja en un torneo con inscripciones abiertas y aparecerá aquí la confirmación.
          </EmptyState>
        ) : (
          q.data.map((e) => (
            <Card key={e.id} className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-slate-900">{e.subject}</p>
                <p className="text-xs text-slate-500">{new Date(e.createdAt).toLocaleString('es-ES')}</p>
              </div>
              <p className="mt-0.5 text-sm text-slate-600">Para: {e.toEmail}</p>
              {e.body && (
                <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-sans text-sm leading-relaxed text-slate-700">
                  <Linkified text={e.body} />
                </pre>
              )}
            </Card>
          ))
        )}
      </div>
    </Container>
  );
}
