import { defineConfig } from 'drizzle-kit';

// Solo se usa para generar las migraciones SQL (npm run db:generate); no necesita conexión.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
});
