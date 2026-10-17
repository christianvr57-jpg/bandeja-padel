import '@fontsource-variable/inter';
import './styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, Suspense, lazy, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, createHashRouter, Navigate, RouterProvider, useLocation } from 'react-router';
import { FeedbackProvider } from './components/feedback';
import { RootLayout } from './components/Layout';
import { PageLoader } from './components/ui';
import { ApiError, IS_DEMO } from './lib/api';
import { useMe } from './lib/auth';
import Home from './pages/Home';
import { Login, Signup } from './pages/Auth';
import NotFound from './pages/NotFound';
import { Privacy, Terms } from './pages/Legal';
import PublicTournament from './pages/public/Tournament';
import Register from './pages/public/Register';
import ManageRegistration from './pages/public/ManageRegistration';

// El panel del club se carga bajo demanda: los jugadores que llegan por WhatsApp no lo descargan.
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const NewTournament = lazy(() => import('./pages/admin/NewTournament'));
const TournamentAdmin = lazy(() => import('./pages/admin/TournamentAdmin'));
const Outbox = lazy(() => import('./pages/public/Outbox'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: true,
      staleTime: 15_000,
    },
  },
});

function RequireClub({ children }: { children: ReactNode }) {
  const { data: club, isLoading } = useMe();
  const location = useLocation();
  if (isLoading) return <PageLoader />;
  if (!club) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

const routes = [
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'entrar', element: <Login /> },
      { path: 'registro', element: <Signup /> },
      { path: 'privacidad', element: <Privacy /> },
      { path: 'condiciones', element: <Terms /> },
      { path: 't/:slug', element: <PublicTournament /> },
      { path: 't/:slug/:tab', element: <PublicTournament /> },
      { path: 't/:slug/inscripcion', element: <Register /> },
      { path: 'inscripcion/:token', element: <ManageRegistration /> },
      {
        path: 'demo/correos',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Outbox />
          </Suspense>
        ),
      },
      { path: 'panel', element: <RequireClub><Dashboard /></RequireClub> },
      { path: 'panel/torneos/nuevo', element: <RequireClub><NewTournament /></RequireClub> },
      { path: 'panel/torneos/:id', element: <RequireClub><TournamentAdmin /></RequireClub> },
      { path: 'panel/torneos/:id/:tab', element: <RequireClub><TournamentAdmin /></RequireClub> },
      { path: '*', element: <NotFound /> },
    ],
  },
];

// En GitHub Pages (demo) no hay servidor que reescriba rutas: se usa enrutado con #.
const router = IS_DEMO ? createHashRouter(routes) : createBrowserRouter(routes);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <FeedbackProvider>
        <RouterProvider router={router} />
      </FeedbackProvider>
    </QueryClientProvider>
  </StrictMode>,
);
