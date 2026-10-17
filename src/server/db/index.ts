import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { migrations } from './migrations.generated';
import * as schema from './schema';

export { schema };

/**
 * Base de datos agnóstica del driver: node-postgres en producción y PGlite
 * (Postgres compilado a WebAssembly) en local, en los tests y en la demo del
 * navegador. Las transacciones de Drizzle son subclases, así que comparten tipo.
 */
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const LOCK_ID = 7_420_031;

/** Filas de un `db.execute()` (node-postgres y PGlite devuelven ambos `{ rows }`). */
export function resultRows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] } | null)?.rows ?? []) as T[];
}

/** Aplica las migraciones pendientes. Seguro con varias instancias arrancando a la vez (advisory lock). */
export async function migrate(db: DB): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_ID})`);
    await tx.execute(
      sql`create table if not exists __migrations (id text primary key, applied_at timestamptz not null default now())`,
    );
    const applied = resultRows<{ id: string }>(await tx.execute(sql`select id from __migrations`));
    const done = new Set(applied.map((r) => r.id));
    for (const m of migrations) {
      if (done.has(m.id)) continue;
      for (const statement of m.statements) await tx.execute(sql.raw(statement));
      await tx.execute(sql`insert into __migrations (id) values (${m.id})`);
    }
  });
}
