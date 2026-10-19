import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HttpError } from './http.js';

export interface Caller {
  userId: string;
  name: string;
  email: string;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * Checks the Neon Auth JWT in the Authorization header against Neon Auth's
 * public keys. Every account route calls this, so players only ever reach
 * their own rows.
 */
export async function requireUser(req: Request): Promise<Caller> {
  const base = process.env.NEON_AUTH_BASE_URL;
  if (!base) throw new HttpError(503, 'Accounts are not configured');
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Sign in first');
  jwks ??= createRemoteJWKSet(new URL(`${base.replace(/\/$/, '')}/.well-known/jwks.json`));
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: new URL(base).origin });
    if (!payload.sub) throw new Error('no subject');
    const email = typeof payload.email === 'string' ? payload.email : '';
    const name = typeof payload.name === 'string' && payload.name ? payload.name : email.split('@')[0] || 'Player';
    return { userId: payload.sub, name, email };
  } catch {
    throw new HttpError(401, 'Your session has expired. Sign in again.');
  }
}
