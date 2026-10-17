import { sql } from 'drizzle-orm';
import { resultRows, type DB } from '../db';
import { sha256Hex } from './crypto';
import { HttpError } from './http';

/**
 * Límite de peticiones por ventana fija, guardado en la base de datos para que
 * funcione igual con una o varias instancias del servidor. La clave incluye un
 * hash de la IP: no se guardan IPs en claro.
 */
export async function rateLimit(
  db: DB,
  bucket: string,
  identity: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const key = `${bucket}:${(await sha256Hex(identity)).slice(0, 32)}`;
  const res = await db.execute(sql`
    insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                   then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                   then now() else rate_limits.window_start end
    returning count`);
  const count = Number(resultRows<{ count: number }>(res)[0]?.count ?? 0);
  if (count > limit) {
    throw new HttpError(429, 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.');
  }
}

/** Limpieza ocasional de ventanas caducadas. */
export async function pruneRateLimits(db: DB): Promise<void> {
  await db.execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`);
}
