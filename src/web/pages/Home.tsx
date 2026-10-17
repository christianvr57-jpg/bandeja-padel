import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  ClipboardList,
  GitBranch,
  KeyRound,
  ListOrdered,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  Trophy,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import type { TournamentListItem } from '@shared/api';
import { Container } from '../components/Layout';
import { TournamentCard } from '../components/TournamentCard';
import { Button, Card, EmptyState, LinkButton, PageLoader } from '../components/ui';
import { api, IS_DEMO } from '../lib/api';
import { useLogin, useMe } from '../lib/auth';
import { useFeedback, errorMessage } from '../components/feedback';

const FEATURES = [
  { icon: Smartphone, title: 'Inscripción en 1 minuto', text: 'Las parejas se apuntan desde el móvil sin crear cuenta. Validamos DNI/NIE, email y teléfono.' },
  { icon: ListOrdered, title: 'Lista de espera automática', text: 'Al llenarse la categoría, las nuevas parejas pasan a espera y suben solas si alguien se da de baja.' },
  { icon: GitBranch, title: 'Cuadros en un clic', text: 'Eliminatoria, consolación, grupos + eliminatoria o americano. Cabezas de serie y byes automáticos.' },
  { icon: CalendarClock, title: 'Horarios sin solapes', text: 'Asigna pista y hora o deja que se programe solo. Te avisamos si una pareja coincide en dos partidos.' },
  { icon: Trophy, title: 'Resultados en directo', text: 'Marcador por sets con super tie-break. El ganador avanza en el cuadro automáticamente.' },
  { icon: ShieldCheck, title: 'Privacidad de verdad', text: 'DNI, email y teléfono solo los ve el club. En la web pública únicamente aparecen nombres.' },
];

function DemoAccess() {
  const login = useLogin();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  return (
    <Card className="border-ball-400 bg-gradient-to-br from-ball-100 to-white p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-court-900 text-ball-400">
          <KeyRound className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">Prueba el panel del club</p>
          <p className="mt-0.5 text-sm text-slate-600">
            Usuario <code className="rounded bg-white px-1 font-mono text-xs">demo@example.com</code> · contraseña{' '}
            <code className="rounded bg-white px-1 font-mono text-xs">padeldemo</code>
          </p>
          <Button
            className="mt-3"
            size="sm"
            loading={login.isPending}
            onClick={() =>
              login.mutate(
                { email: 'demo@example.com', password: 'padeldemo' },
                { onSuccess: () => navigate('/panel'), onError: (e) => toast(errorMessage(e), 'error') },
              )
            }
          >
            Entrar como club demo
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function Home() {
  const { data: club } = useMe();
  const list = useQuery({
    queryKey: ['public-tournaments'],
    queryFn: () => api<TournamentListItem[]>('/public/tournaments'),
  });
  const example = list.data?.find((t) => t.status === 'published') ?? list.data?.[0];

  return (
    <>
      <section className="court-pattern text-white">
        <Container className="py-14 sm:py-20">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-ball-300 ring-1 ring-white/20">
              <MessageCircle className="size-3.5" /> Comparte el enlace por WhatsApp y listo
            </p>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Torneos de pádel <span className="text-ball-400">sin papeleo</span>
            </h1>
            <p className="mt-4 text-lg text-court-100">
              Crea tu torneo, deja que las parejas se inscriban solas y gestiona cuadros, horarios y resultados desde el móvil.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton to={club ? '/panel' : '/registro'} variant="accent" size="lg">
                {club ? 'Ir a mi panel' : 'Crear mi torneo gratis'}
              </LinkButton>
              {example && (
                <LinkButton to={`/t/${example.slug}`} variant="secondary" size="lg" className="border-white/30 bg-white/10 text-white hover:bg-white/20">
                  Ver un torneo de ejemplo
                </LinkButton>
              )}
            </div>
          </div>
        </Container>
      </section>

      <Container className="-mt-6 space-y-12">
        {IS_DEMO && !club && <DemoAccess />}

        <section>
          <h2 className="mb-4 mt-10 text-xl font-bold text-slate-900">Torneos</h2>
          {list.isLoading ? (
            <PageLoader />
          ) : list.data?.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {list.data.map((t) => (
                <TournamentCard key={t.id} t={t} to={`/t/${t.slug}`} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<ClipboardList className="size-6" />} title="Todavía no hay torneos publicados">
              Los torneos que publiquen los clubes aparecerán aquí.
            </EmptyState>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-xl font-bold text-slate-900">Todo lo que necesita tu club</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <Card key={title} className="p-5">
                <div className="grid size-10 place-items-center rounded-xl bg-court-50 text-court-700">
                  <Icon className="size-5" />
                </div>
                <p className="mt-3 font-semibold text-slate-900">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{text}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-court-950 px-6 py-10 text-center text-white sm:px-12">
          <h2 className="text-2xl font-bold">¿Organizas un torneo?</h2>
          <p className="mx-auto mt-2 max-w-xl text-court-200">
            Crea la cuenta del club, configura categorías y comparte el enlace. Tus jugadores no necesitan registrarse.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <LinkButton to={club ? '/panel/torneos/nuevo' : '/registro'} variant="accent" size="lg">
              Empezar ahora
            </LinkButton>
            {!club && (
              <Link to="/entrar" className="inline-flex h-12 items-center px-4 font-semibold text-court-100 hover:text-white">
                Ya tengo cuenta
              </Link>
            )}
          </div>
        </section>
      </Container>
    </>
  );
}
