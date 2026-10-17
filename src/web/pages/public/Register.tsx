import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Copy, Hourglass, Lock, Mail } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import type { CategoryView, RegistrationResult } from '@shared/api';
import { COMPETITION_FORMATS } from '@shared/labels';
import { formatDateTime } from '@shared/time';
import { useFeedback } from '../../components/feedback';
import { Container } from '../../components/Layout';
import { emptyPlayer, PlayerFields, serverPlayerErrors, validatePlayer, type PlayerForm } from '../../components/PlayerFields';
import { Alert, Button, Card, Checkbox, cx, ErrorState, LinkButton, PageLoader } from '../../components/ui';
import { api, ApiError, IS_DEMO } from '../../lib/api';
import { copyText, euros } from '../../lib/util';
import NotFound from '../NotFound';
import { usePublicTournament } from './Tournament';

function CategoryOption({ cat, selected, onSelect }: { cat: CategoryView; selected: boolean; onSelect: () => void }) {
  const full = cat.confirmedCount >= cat.maxPairs;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!cat.registrationOpen}
      className={cx(
        'flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition',
        selected ? 'border-court-600 bg-court-50 ring-2 ring-court-500/30' : 'border-slate-200 bg-white hover:border-slate-300',
        !cat.registrationOpen && 'cursor-not-allowed opacity-50',
      )}
    >
      <span className={cx('grid size-5 shrink-0 place-items-center rounded-full border-2', selected ? 'border-court-700' : 'border-slate-300')}>
        {selected && <span className="size-2.5 rounded-full bg-court-700" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-900">{cat.label}</span>
        <span className="block text-xs text-slate-500">{COMPETITION_FORMATS[cat.format].label}</span>
      </span>
      <span className="shrink-0 text-right text-xs">
        {!cat.registrationOpen ? (
          <span className="text-slate-500">Cerrada</span>
        ) : full ? (
          <span className="font-medium text-amber-700">Lista de espera</span>
        ) : (
          <span className="font-medium text-emerald-700">
            {cat.maxPairs - cat.confirmedCount} {cat.maxPairs - cat.confirmedCount === 1 ? 'plaza' : 'plazas'}
          </span>
        )}
      </span>
    </button>
  );
}

function Success({ result, tournamentName, slug }: { result: RegistrationResult; tournamentName: string; slug: string }) {
  const { toast } = useFeedback();
  const confirmed = result.status === 'confirmed';
  return (
    <Container className="py-10">
      <Card className="mx-auto max-w-xl p-6 text-center sm:p-8">
        <div className={cx('mx-auto grid size-14 place-items-center rounded-full', confirmed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
          {confirmed ? <CheckCircle2 className="size-8" /> : <Hourglass className="size-7" />}
        </div>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">{confirmed ? '¡Inscripción confirmada!' : 'Estáis en la lista de espera'}</h1>
        <p className="mt-2 text-slate-600">
          {confirmed
            ? `Ya estáis inscritos en ${tournamentName}.`
            : `La categoría está completa. Sois la pareja nº ${result.waitlistPosition} en espera: si se libera una plaza, pasaréis automáticamente y os avisaremos por email.`}
        </p>
        <div className="mt-6 rounded-xl bg-slate-50 p-4 text-left">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Lock className="size-4 text-court-700" /> Tu enlace privado
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Con él podéis consultar, modificar o cancelar la inscripción sin contraseña. También os lo hemos enviado por email. No lo compartas.
          </p>
          <div className="mt-3 flex gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 text-xs text-slate-700 ring-1 ring-slate-200">{result.manageUrl}</code>
            <Button variant="secondary" size="sm" className="h-auto" icon={<Copy className="size-4" />} onClick={async () => toast((await copyText(result.manageUrl)) ? 'Enlace copiado' : 'No se pudo copiar')}>
              Copiar
            </Button>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <LinkButton to={result.managePath} variant="primary">
            Ver mi inscripción
          </LinkButton>
          <LinkButton to={`/t/${slug}`} variant="secondary">
            Volver al torneo
          </LinkButton>
        </div>
        {IS_DEMO && (
          <Link to="/demo/correos" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-court-700 underline">
            <Mail className="size-4" /> Ver el email de confirmación (demo)
          </Link>
        )}
      </Card>
    </Container>
  );
}

type Errors = Partial<Record<keyof PlayerForm, string>>;

export default function Register() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const { data, error, isLoading, refetch } = usePublicTournament(slug);
  const [categoryId, setCategoryId] = useState(params.get('categoria') ?? '');
  const [p1, setP1] = useState<PlayerForm>(emptyPlayer);
  const [p2, setP2] = useState<PlayerForm>(emptyPlayer);
  const [accept, setAccept] = useState(false);
  const [website, setWebsite] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const openedAt = useRef(Date.now());

  const mutation = useMutation({
    mutationFn: () =>
      api<RegistrationResult>(`/public/tournaments/${encodeURIComponent(slug)}/registrations`, {
        method: 'POST',
        body: { categoryId, player1: p1, player2: p2, acceptPrivacy: accept, website, elapsedMs: Date.now() - openedAt.current },
      }),
    onSuccess: () => void refetch(),
  });

  useEffect(() => {
    if (!categoryId && data) {
      const open = data.categories.filter((c) => c.registrationOpen);
      if (open.length === 1) setCategoryId(open[0]!.id);
    }
  }, [data, categoryId]);

  if (isLoading) return <PageLoader />;
  if (error instanceof ApiError && error.status === 404) return <NotFound message="Este torneo no existe o no está publicado." />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;
  if (mutation.data) return <Success result={mutation.data} tournamentName={data.tournament.name} slug={slug} />;

  const t = data.tournament;
  const anyOpen = data.categories.some((c) => c.registrationOpen);
  const serverFields = mutation.error instanceof ApiError ? mutation.error.fields : {};
  const show = (prefix: string, errs: Errors): Errors => {
    const out: Errors = {};
    for (const [k, v] of Object.entries(errs)) if (submitted || touched[`${prefix}.${k}`]) out[k as keyof PlayerForm] = v;
    return out;
  };
  const e1: Errors = { ...show('p1', validatePlayer(p1)), ...serverPlayerErrors(serverFields, 'player1') };
  const e2: Errors = { ...show('p2', validatePlayer(p2)), ...serverPlayerErrors(serverFields, 'player2') };
  if (!e2.dni && p1.dni && p2.dni && p1.dni.toUpperCase().replace(/[\s.-]/g, '') === p2.dni.toUpperCase().replace(/[\s.-]/g, '')) {
    e2.dni = 'Es el mismo DNI/NIE que el del jugador 1.';
  }
  const selected = data.categories.find((c) => c.id === categoryId);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const hasErrors =
      !categoryId ||
      !accept ||
      Object.keys(validatePlayer(p1)).length > 0 ||
      Object.keys(validatePlayer(p2)).length > 0 ||
      !!e2.dni;
    if (hasErrors) {
      document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    mutation.mutate();
  };

  return (
    <Container className="py-6 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <Link to={`/t/${slug}`} className="inline-flex items-center gap-1 text-sm font-medium text-court-700 hover:underline">
          <ArrowLeft className="size-4" /> {t.name}
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">Inscripción de pareja</h1>
        <p className="mt-1 text-slate-600">
          Sin crear cuenta. {t.priceCents ? `Precio: ${euros(t.priceCents)} por pareja (se paga en el club).` : 'Inscripción gratuita.'}
          {t.registrationDeadline && ` Plazo hasta el ${formatDateTime(t.registrationDeadline, t.timezone)}.`}
        </p>

        {!anyOpen ? (
          <Alert tone="warning" className="mt-6" title="Inscripciones cerradas">
            Este torneo no admite inscripciones ahora mismo. Contacta con el club si tienes dudas.
          </Alert>
        ) : (
          <form onSubmit={submit} noValidate className="mt-6 space-y-6">
            <Card className="space-y-3 p-5">
              <p className="text-sm font-bold uppercase tracking-wide text-court-800">Categoría</p>
              <div className="space-y-2">
                {data.categories.map((c) => (
                  <CategoryOption key={c.id} cat={c} selected={c.id === categoryId} onSelect={() => setCategoryId(c.id)} />
                ))}
              </div>
              {submitted && !categoryId && <p className="text-sm text-red-600">Elige una categoría.</p>}
              {selected && selected.confirmedCount >= selected.maxPairs && (
                <Alert tone="warning">Esta categoría está completa: os apuntaréis a la lista de espera y subiréis automáticamente si queda una plaza libre.</Alert>
              )}
            </Card>

            <Card className="p-5">
              <PlayerFields
                title="Jugador 1 (contacto principal)"
                value={p1}
                onChange={setP1}
                errors={e1}
                onBlurField={(f) => setTouched((t) => ({ ...t, [`p1.${f}`]: true }))}
              />
            </Card>
            <Card className="p-5">
              <PlayerFields
                title="Jugador 2"
                value={p2}
                onChange={setP2}
                errors={e2}
                onBlurField={(f) => setTouched((t) => ({ ...t, [`p2.${f}`]: true }))}
              />
            </Card>

            {/* Campo trampa para bots: invisible para personas y lectores de pantalla. */}
            <div aria-hidden className="absolute -left-[10000px] h-0 w-0 overflow-hidden">
              <label>
                Web
                <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
            </div>

            <Card className="space-y-4 p-5">
              <Alert tone="info" title="Protección de datos">
                Los datos los trata <strong>{t.clubName}</strong> solo para organizar el torneo. En la web pública únicamente aparecerán vuestros
                nombres; el DNI/NIE, el email y el teléfono solo los verá el club.
              </Alert>
              <Checkbox
                checked={accept}
                onChange={setAccept}
                invalid={submitted && !accept}
                label={
                  <>
                    Ambos jugadores hemos leído y aceptamos la{' '}
                    <Link to="/privacidad" target="_blank" className="font-medium text-court-700 underline">
                      política de privacidad
                    </Link>{' '}
                    y consentimos el tratamiento de nuestros datos para la gestión del torneo.
                  </>
                }
              />
              {submitted && !accept && <p className="text-sm text-red-600">Debes aceptar la política de privacidad para inscribiros.</p>}
              {mutation.error && <Alert tone="error">{mutation.error.message}</Alert>}
              <Button type="submit" variant="accent" size="lg" className="w-full" loading={mutation.isPending}>
                {selected && selected.confirmedCount >= selected.maxPairs ? 'Apuntarnos a la lista de espera' : 'Confirmar inscripción'}
              </Button>
            </Card>
          </form>
        )}
      </div>
    </Container>
  );
}
