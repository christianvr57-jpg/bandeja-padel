import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Container, Logo } from '../components/Layout';
import { Alert, Button, Card, Checkbox, Field, Input } from '../components/ui';
import { ApiError, IS_DEMO } from '../lib/api';
import { useLogin, useSignup } from '../lib/auth';

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Container className="py-10 sm:py-16">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <Logo className="justify-center" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>
        <Card className="p-6">{children}</Card>
      </div>
    </Container>
  );
}

export function Login() {
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/panel';
  const [email, setEmail] = useState(IS_DEMO ? 'demo@example.com' : '');
  const [password, setPassword] = useState(IS_DEMO ? 'padeldemo' : '');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate(from, { replace: true }) });
  };

  return (
    <AuthShell title="Entrar como club" subtitle="Gestiona tus torneos, inscritos, cuadros y resultados.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {login.error && <Alert tone="error">{login.error.message}</Alert>}
        {IS_DEMO && (
          <Alert tone="info">
            Credenciales de la demo ya rellenas: <strong>demo@example.com</strong> / <strong>padeldemo</strong>
          </Alert>
        )}
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Contraseña" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={login.isPending}>
          Entrar
        </Button>
        <p className="text-center text-sm text-slate-600">
          ¿Tu club aún no tiene cuenta?{' '}
          <Link to="/registro" className="font-semibold text-court-700 hover:underline">
            Regístralo gratis
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function Signup() {
  const signup = useSignup();
  const navigate = useNavigate();
  const [form, setForm] = useState({ clubName: '', city: '', email: '', password: '', acceptTerms: false });
  const fields = signup.error instanceof ApiError ? signup.error.fields : {};
  const set = (k: keyof typeof form) => (v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    signup.mutate(form, { onSuccess: () => navigate('/panel/torneos/nuevo', { replace: true }) });
  };

  return (
    <AuthShell title="Registra tu club" subtitle="Gratis. En dos minutos tendrás tu primer torneo listo para compartir.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {signup.error && Object.keys(fields).length === 0 && <Alert tone="error">{signup.error.message}</Alert>}
        <Field label="Nombre del club" htmlFor="clubName" error={fields.clubName} required>
          <Input id="clubName" value={form.clubName} onChange={(e) => set('clubName')(e.target.value)} invalid={!!fields.clubName} placeholder="Club de Pádel Ejemplo" />
        </Field>
        <Field label="Ciudad" htmlFor="city" error={fields.city}>
          <Input id="city" value={form.city} onChange={(e) => set('city')(e.target.value)} placeholder="Valencia" />
        </Field>
        <Field label="Email de acceso" htmlFor="email" error={fields.email} required>
          <Input id="email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email')(e.target.value)} invalid={!!fields.email} />
        </Field>
        <Field label="Contraseña" htmlFor="password" error={fields.password} hint="Mínimo 8 caracteres." required>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => set('password')(e.target.value)}
            invalid={!!fields.password}
          />
        </Field>
        <div>
          <Checkbox
            checked={form.acceptTerms}
            onChange={set('acceptTerms')}
            invalid={!!fields.acceptTerms}
            label={
              <>
                Acepto las{' '}
                <Link to="/condiciones" target="_blank" className="font-medium text-court-700 underline">
                  condiciones de uso
                </Link>{' '}
                y la{' '}
                <Link to="/privacidad" target="_blank" className="font-medium text-court-700 underline">
                  política de privacidad
                </Link>
                .
              </>
            }
          />
          {fields.acceptTerms && <p className="mt-1 text-sm text-red-600">{fields.acceptTerms}</p>}
        </div>
        <Button type="submit" className="w-full" size="lg" loading={signup.isPending}>
          Crear cuenta del club
        </Button>
        <p className="text-center text-sm text-slate-600">
          ¿Ya tienes cuenta?{' '}
          <Link to="/entrar" className="font-semibold text-court-700 hover:underline">
            Entra
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
