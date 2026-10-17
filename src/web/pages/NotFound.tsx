import { Container } from '../components/Layout';
import { LinkButton } from '../components/ui';

export default function NotFound({ message }: { message?: string }) {
  return (
    <Container className="py-24 text-center">
      <p className="text-6xl font-black text-court-200">404</p>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Página no encontrada</h1>
      <p className="mt-2 text-slate-600">{message ?? 'El enlace no existe o ya no está disponible.'}</p>
      <LinkButton to="/" className="mt-6">
        Volver al inicio
      </LinkButton>
    </Container>
  );
}
