/**
 * Convierte las migraciones SQL generadas por drizzle-kit (carpeta drizzle/) en
 * un módulo TypeScript. Así las migraciones viajan dentro del bundle y se
 * pueden aplicar igual en Node, en tests y en el navegador (modo demo).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'drizzle';
const journal = JSON.parse(readFileSync(join(dir, 'meta', '_journal.json'), 'utf8')) as {
  entries: Array<{ tag: string }>;
};

const migrations = journal.entries.map(({ tag }) => {
  const sql = readFileSync(join(dir, `${tag}.sql`), 'utf8');
  const statements = sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);
  return { id: tag, statements };
});

const out = `// Generado por scripts/embed-migrations.ts a partir de drizzle/*.sql. No editar a mano.
export const migrations: Array<{ id: string; statements: string[] }> = ${JSON.stringify(migrations, null, 2)};
`;
writeFileSync(join('src', 'server', 'db', 'migrations.generated.ts'), out);
console.log(`Embebidas ${migrations.length} migraciones.`);
