import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// Secrets live in env/.env (DATABASE_URL=postgresql://...).
if (existsSync('env/.env')) process.loadEnvFile('env/.env');

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema.ts',
  out: './db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
