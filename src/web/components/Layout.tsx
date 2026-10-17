import { FlaskConical, LayoutDashboard, LogOut, Mail, RotateCcw } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { IS_DEMO } from '../lib/api';
import { useLogout, useMe } from '../lib/auth';
import { useFeedback } from './feedback';
import { Button, cx, LinkButton, Spinner } from './ui';

export const REPO_URL = 'https://github.com/christianvr57-jpg/bandeja-padel';

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-2 font-extrabold tracking-tight', className)}>
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden>
        <rect width="64" height="64" rx="16" fill={light ? '#ffffff' : '#0b3b5c'} />
        <ellipse cx="28" cy="27" rx="15" ry="17" fill="none" stroke={light ? '#0b3b5c' : '#e2f0ff'} strokeWidth="5" />
        <path d="M37 40 L48 53" stroke={light ? '#0b3b5c' : '#e2f0ff'} strokeWidth="7" strokeLinecap="round" />
        <circle cx="47" cy="18" r="7" fill="#c6f432" />
      </svg>
      <span className={cx('text-lg', light ? 'text-white' : 'text-court-950')}>Bandeja</span>
    </span>
  );
}

function DemoBanner() {
  const { confirm } = useFeedback();
  const reset = async () => {
    const ok = await confirm({
      title: 'Reiniciar la demo',
      message: 'Se borrarán los cambios que hayas hecho en este navegador y se volverán a crear los datos de ejemplo.',
      confirmLabel: 'Reiniciar',
      danger: true,
    });
    if (!ok) return;
    const { resetDemo } = await import('../demo/backend');
    await resetDemo();
  };
  return (
    <div className="no-print bg-ball-300 text-court-950">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-xs font-medium">
        <span className="inline-flex items-center gap-1.5">
          <FlaskConical className="size-3.5" />
          Demo: los datos se guardan solo en este navegador.
        </span>
        <span className="ml-auto flex items-center gap-3">
          <Link to="/demo/correos" className="inline-flex items-center gap-1 underline underline-offset-2">
            <Mail className="size-3.5" /> Emails enviados
          </Link>
          <button onClick={reset} className="inline-flex items-center gap-1 underline underline-offset-2">
            <RotateCcw className="size-3.5" /> Reiniciar
          </button>
        </span>
      </div>
    </div>
  );
}

/** Pantalla de arranque de la demo mientras se crea la base de datos en el navegador. */
function DemoBoot({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<string>('ready');
  useEffect(() => {
    if (!IS_DEMO) return;
    let unsub = () => {};
    void import('../demo/backend').then(({ onDemoStatus }) => {
      unsub = onDemoStatus(setStatus);
    });
    return () => unsub();
  }, []);
  if (IS_DEMO && status === 'seeding') {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-slate-50/95">
        <div className="max-w-sm px-6 text-center">
          <Spinner className="mx-auto size-8" />
          <p className="mt-4 font-semibold text-slate-900">Preparando la demo…</p>
          <p className="mt-1 text-sm text-slate-600">
            Estamos creando en tu navegador un club de ejemplo con torneos, parejas inscritas, cuadros y resultados. Solo la primera vez.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function Header() {
  const { data: club } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const inPanel = location.pathname.startsWith('/panel');

  return (
    <header className="no-print sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link to="/" aria-label="Inicio">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1.5">
          {club ? (
            <>
              {!inPanel && (
                <LinkButton to="/panel" variant="secondary" size="sm" icon={<LayoutDashboard className="size-4" />}>
                  Mi panel
                </LinkButton>
              )}
              <span className="hidden max-w-48 truncate px-2 text-sm text-slate-600 md:block">{club.name}</span>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
                onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/') })}
                icon={<LogOut className="size-4" />}
              >
                <span className="hidden sm:inline">Salir</span>
              </Button>
            </>
          ) : (
            <>
              <LinkButton to="/entrar" variant="ghost" size="sm">
                Entrar
              </LinkButton>
              <LinkButton to="/registro" variant="primary" size="sm">
                <span className="sm:hidden">Crear torneo</span>
                <span className="hidden sm:inline">Crear mi torneo</span>
              </LinkButton>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="no-print mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Logo className="scale-90" />
          <span>Torneos de pádel para clubes</span>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link to="/privacidad" className="hover:text-slate-800">
            Política de privacidad
          </Link>
          <Link to="/condiciones" className="hover:text-slate-800">
            Condiciones de uso
          </Link>
          <a href={REPO_URL} className="hover:text-slate-800" target="_blank" rel="noreferrer">
            Código fuente
          </a>
        </div>
      </div>
    </footer>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function RootLayout() {
  return (
    <DemoBoot>
      <ScrollToTop />
      <div className="flex min-h-dvh flex-col">
        {IS_DEMO && <DemoBanner />}
        <Header />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
    </DemoBoot>
  );
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-6xl px-4', className)}>{children}</div>;
}
