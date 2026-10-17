import type { Context } from 'hono';
import type { DB } from './db';
import type { Mailer } from './lib/mailer';

export interface AppConfig {
  /** server: despliegue real. demo: la API corre dentro del navegador (GitHub Pages). */
  mode: 'server' | 'demo';
  /** cookie httpOnly (servidor) o cabecera Authorization (demo en el navegador, donde no hay cookies reales). */
  authMode: 'cookie' | 'bearer';
  secureCookies: boolean;
  /** URL absoluta de una ruta de la web, p. ej. linkFor('/t/open-2026') para emails y enlaces de compartir. */
  linkFor: (path: string) => string;
  passwordIterations: number;
  /** Permite ver los emails "enviados" desde la web (solo demo). */
  exposeOutbox: boolean;
}

export interface AppDeps {
  db: DB;
  config: AppConfig;
  mailer: Mailer;
  clientIp: (c: Context) => string;
  now: () => Date;
}

export interface SessionClub {
  id: string;
  name: string;
  email: string;
  city: string;
}

export type AppEnv = {
  Variables: {
    deps: AppDeps;
    club: SessionClub | null;
    sessionToken: string | null;
  };
};
