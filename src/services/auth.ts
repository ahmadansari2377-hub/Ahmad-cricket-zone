/**
 * Neon Auth (Better Auth) in the browser: Google and email/password accounts.
 * The SDK is loaded only when accounts are configured, so guests never pay for it.
 * Passwords go straight to Neon Auth; the game never sees or stores them.
 */

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified: boolean;
}

const AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL as string | undefined;

/** True when Neon Auth is set up (VITE_NEON_AUTH_URL in env/.env). */
export const authEnabled = Boolean(AUTH_URL);

type Client = Awaited<ReturnType<typeof load>>;
let clientPromise: Promise<Client> | null = null;

async function load() {
  const { createAuthClient } = await import('@neondatabase/neon-js/auth');
  return createAuthClient(AUTH_URL!);
}

function client() {
  if (!authEnabled) throw new Error('Accounts are not set up for this copy of the game.');
  return (clientPromise ??= load());
}

/** Better Auth returns { data, error }; turn an error into a readable exception. */
function unwrap<T>(res: { data: T | null; error: { message?: string; status?: number } | null }): T {
  if (res.error) throw new Error(res.error.message || `Sign-in service error (${res.error.status ?? '?'})`);
  return res.data as T;
}

let listeners: ((u: AuthUser | null) => void)[] = [];
let current: AuthUser | null = null;

export function onAuthChange(fn: (u: AuthUser | null) => void) {
  listeners.push(fn);
  return () => (listeners = listeners.filter((l) => l !== fn));
}

function set(u: AuthUser | null) {
  current = u;
  for (const l of listeners) l(u);
}

export const currentUser = () => current;

function toUser(u: { id: string; name?: string | null; email: string; image?: string | null; emailVerified?: boolean }): AuthUser {
  return { id: u.id, name: u.name || u.email.split('@')[0], email: u.email, image: u.image ?? null, emailVerified: Boolean(u.emailVerified) };
}

/** Reads the current session (also completes a Google sign-in after the redirect back). */
export async function refreshSession(): Promise<AuthUser | null> {
  if (!authEnabled) return null;
  try {
    const c = await client();
    const res = await c.getSession();
    const user = res.data?.user ? toUser(res.data.user) : null;
    set(user);
    return user;
  } catch (err) {
    console.warn('Session check failed', err);
    set(null);
    return null;
  }
}

export async function signInEmail(email: string, password: string) {
  const c = await client();
  unwrap(await c.signIn.email({ email, password }));
  return refreshSession();
}

export async function signUpEmail(name: string, email: string, password: string) {
  const c = await client();
  unwrap(await c.signUp.email({ name, email, password }));
  return refreshSession();
}

export async function signInGoogle() {
  const c = await client();
  // Leaves the page for Google, then returns here; refreshSession() picks up the session.
  unwrap(await c.signIn.social({ provider: 'google', callbackURL: window.location.origin + window.location.pathname }));
}

export async function signOut() {
  const c = await client();
  await c.signOut();
  set(null);
}

/** Emails a password-reset link that brings the player back to the game. */
export async function requestPasswordReset(email: string) {
  const c = await client();
  unwrap(await c.requestPasswordReset({ email, redirectTo: window.location.origin + window.location.pathname }));
}

/** Completes a reset from the emailed link (?token=...). */
export async function resetPassword(token: string, newPassword: string) {
  const c = await client();
  unwrap(await c.resetPassword({ token, newPassword }));
}

export async function sendVerificationEmail(email: string) {
  const c = await client();
  unwrap(await c.sendVerificationEmail({ email, callbackURL: window.location.origin + window.location.pathname }));
}

/** Deletes the Neon Auth account itself (call after the game data is deleted). */
export async function deleteAccount() {
  const c = await client();
  unwrap(await c.deleteUser({ callbackURL: window.location.origin + window.location.pathname }));
  set(null);
}

/** Short-lived JWT for our own API; the server checks it against Neon Auth's public keys. */
export async function getToken(): Promise<string | null> {
  if (!authEnabled || !current) return null;
  const c = await client();
  const res = await c.token();
  return res.data?.token ?? null;
}
