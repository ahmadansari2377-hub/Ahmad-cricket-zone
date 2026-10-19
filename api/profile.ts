import { eq } from 'drizzle-orm';
import { EMPTY_STATS } from '../src/game/record.js';
import { requireUser } from './_lib/auth.js';
import { db, schema } from './_lib/db.js';
import { body, HttpError, json, route } from './_lib/http.js';

const { profiles, calibrations, careerStats, achievements, matches } = schema;

/** GET /api/profile: the signed-in player's profile, settings, calibration, career stats and badges. */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  const d = db();
  const [[profile], [calibration], [stats], badges] = await d.batch([
    d.select().from(profiles).where(eq(profiles.userId, me.userId)),
    d.select().from(calibrations).where(eq(calibrations.userId, me.userId)),
    d.select().from(careerStats).where(eq(careerStats.userId, me.userId)),
    d.select().from(achievements).where(eq(achievements.userId, me.userId)),
  ]);
  const { userId: _u, updatedAt: _t, ...career } = stats ?? { userId: '', updatedAt: null, ...EMPTY_STATS };
  return json({
    profile: profile ?? { displayName: me.name, favouriteTeam: null, battingHand: 'R', difficulty: 'medium', graphicsQuality: 'high' },
    calibration: calibration?.data ?? null,
    stats: career,
    achievements: badges.map((b) => ({ code: b.code, earnedAt: b.earnedAt })),
  });
});

interface ProfileInput {
  displayName?: string;
  favouriteTeam?: string | null;
  battingHand?: 'R' | 'L';
  difficulty?: 'easy' | 'medium' | 'hard';
  graphicsQuality?: 'low' | 'medium' | 'high';
  calibration?: Record<string, number | string> | null;
}

function cleanCalibration(c: unknown) {
  if (c === null || c === undefined) return null;
  if (typeof c !== 'object' || Array.isArray(c)) throw new HttpError(400, 'Bad calibration');
  const out: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(c as Record<string, unknown>)) {
    if (Object.keys(out).length >= 30 || k.length > 40) throw new HttpError(400, 'Bad calibration');
    // Numbers only (plus the batting hand), never images.
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (k === 'hand' && (v === 'R' || v === 'L')) out[k] = v;
    else throw new HttpError(400, 'Calibration may only contain numbers');
  }
  return out;
}

/** PUT /api/profile: update settings (and optionally the saved calibration). */
export const PUT = route(async (req) => {
  const me = await requireUser(req);
  const p = await body<ProfileInput>(req);
  const name = String(p.displayName ?? me.name).trim().slice(0, 30);
  if (!name) throw new HttpError(400, 'Display name is required');
  if (p.battingHand && !['R', 'L'].includes(p.battingHand)) throw new HttpError(400, 'Bad batting hand');
  if (p.difficulty && !['easy', 'medium', 'hard'].includes(p.difficulty)) throw new HttpError(400, 'Bad difficulty');
  if (p.graphicsQuality && !['low', 'medium', 'high'].includes(p.graphicsQuality)) throw new HttpError(400, 'Bad graphics quality');
  if (p.favouriteTeam && (typeof p.favouriteTeam !== 'string' || p.favouriteTeam.length > 10)) throw new HttpError(400, 'Bad team');
  const values = {
    displayName: name,
    favouriteTeam: p.favouriteTeam ?? null,
    battingHand: p.battingHand ?? 'R',
    difficulty: p.difficulty ?? 'medium',
    graphicsQuality: p.graphicsQuality ?? 'high',
    updatedAt: new Date(),
  };
  const d = db();
  await d.insert(profiles).values({ userId: me.userId, ...values }).onConflictDoUpdate({ target: profiles.userId, set: values });
  const cal = cleanCalibration(p.calibration);
  if (cal) {
    await d
      .insert(calibrations)
      .values({ userId: me.userId, data: cal })
      .onConflictDoUpdate({ target: calibrations.userId, set: { data: cal, updatedAt: new Date() } });
  }
  return json({ ok: true });
});

/** DELETE /api/profile: removes every row this player owns. The browser then deletes the Neon Auth account. */
export const DELETE = route(async (req) => {
  const me = await requireUser(req);
  const d = db();
  await d.batch([
    d.delete(matches).where(eq(matches.userId, me.userId)), // cascades to balls and leaderboard rows
    d.delete(careerStats).where(eq(careerStats.userId, me.userId)),
    d.delete(achievements).where(eq(achievements.userId, me.userId)),
    d.delete(calibrations).where(eq(calibrations.userId, me.userId)),
    d.delete(profiles).where(eq(profiles.userId, me.userId)),
  ]);
  return json({ ok: true });
});
