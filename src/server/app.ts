import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import type { AppDeps, AppEnv } from './context';
import { HttpError } from './lib/http';
import { adminRoutes } from './routes/admin';
import { authRoutes, sessionMiddleware } from './routes/auth';
import { publicRoutes } from './routes/public';

/**
 * API HTTP (bajo /api). No depende del entorno: la usan el servidor Node, los
 * tests y la demo que se ejecuta dentro del navegador.
 */
export function createApi(deps: AppDeps) {
  const app = new Hono<AppEnv>().basePath('/api');

  app.use(async (c, next) => {
    c.set('deps', deps);
    await next();
    if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
  });
  app.use(secureHeaders({ crossOriginResourcePolicy: 'same-origin' }));
  app.use(
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: (c) => c.json({ error: { message: 'La petición es demasiado grande.' } }, 413),
    }),
  );
  // Protección CSRF: toda petición que modifica datos debe llevar una cabecera
  // propia, que un formulario o script de otra web no puede añadir sin CORS.
  app.use(async (c, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && c.req.header('x-requested-with') !== 'bandeja') {
      throw new HttpError(403, 'Petición no permitida.');
    }
    await next();
  });
  app.use(sessionMiddleware);

  app.get('/health', (c) => c.json({ ok: true, mode: deps.config.mode }));
  app.route('/auth', authRoutes);
  app.route('/public', publicRoutes);
  app.route('/admin', adminRoutes);

  app.notFound((c) => c.json({ error: { message: 'Ruta no encontrada.' } }, 404));
  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { message: err.message, ...(err.fields ? { fields: err.fields } : {}) } }, err.status);
    }
    console.error('[api] Error no controlado:', err);
    return c.json({ error: { message: 'Ha ocurrido un error inesperado. Inténtalo de nuevo.' } }, 500);
  });

  return app;
}
