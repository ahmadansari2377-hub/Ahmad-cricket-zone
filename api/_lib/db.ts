import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../../db/schema.js';
import { HttpError } from './http.js';

let instance: ReturnType<typeof create> | null = null;

function create(url: string) {
  return drizzle(neon(url), { schema });
}

/** The Neon database over HTTP. DATABASE_URL is a server-only environment variable. */
export function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new HttpError(503, 'The database is not configured');
  return (instance ??= create(url));
}

export { schema };
