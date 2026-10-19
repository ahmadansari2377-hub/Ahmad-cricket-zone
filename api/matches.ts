import { and, desc, eq, sql } from 'drizzle-orm';
import { applyMatch, CareerStats, EMPTY_STATS, MatchRecord, RecordError } from '../src/game/record.js';
import { requireUser } from './_lib/auth.js';
import { db, schema } from './_lib/db.js';
import { body, HttpError, json, route } from './_lib/http.js';

const { matches, inningsBalls, careerStats, leaderboards, achievements, profiles } = schema;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Attempts when another save for the same player lands at the same moment. */
const MAX_ATTEMPTS = 4;

/** GET /api/matches: the player's last 30 matches with full scorecards. */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  const rows = await db().select().from(matches).where(eq(matches.userId, me.userId)).orderBy(desc(matches.playedAt)).limit(30);
  return json({ matches: rows.map(({ userId: _u, ...m }) => m) });
});

/**
 * POST /api/matches: saves a finished match. The server rebuilds every total
 * from the ball-by-ball record and rejects anything impossible, then updates
 * career stats, leaderboards and achievements in one transaction.
 *
 * Safe to retry: the game gives every match a permanent id, so sending the
 * same match again returns the saved copy instead of counting it twice. Two
 * saves at once cannot overwrite each other's career stats either: each save
 * only applies if the stats are still the version it read, and otherwise
 * starts again from the fresh numbers.
 */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  const m = await body<MatchRecord>(req, 200_000);
  const id = typeof m.id === 'string' && UUID.test(m.id) ? m.id.toLowerCase() : crypto.randomUUID();

  for (let attempt = 1; ; attempt++) {
    const saved = await trySave(me, m, id);
    if (saved) return saved;
    if (attempt >= MAX_ATTEMPTS) throw new HttpError(503, 'Too many saves at once, please try again');
  }
});

type Me = Awaited<ReturnType<typeof requireUser>>;

/** One attempt. Returns null when another save got in first and the caller should retry. */
async function trySave(me: Me, m: MatchRecord, id: string): Promise<Response | null> {
  const d = db();
  const [[statsRow], badgeRows, [profile], [existing]] = await d.batch([
    d.select().from(careerStats).where(eq(careerStats.userId, me.userId)),
    d.select().from(achievements).where(eq(achievements.userId, me.userId)),
    d.select().from(profiles).where(eq(profiles.userId, me.userId)),
    d.select({ userId: matches.userId, result: matches.result, margin: matches.margin }).from(matches).where(eq(matches.id, id)),
  ]);
  if (existing) return alreadySaved(me, id, existing, statsRow);

  const { userId: _u, updatedAt: _t, version: readVersion, ...before } = statsRow ?? { userId: '', updatedAt: null, version: 0, ...EMPTY_STATS };

  let out;
  try {
    out = applyMatch(m, before as CareerStats, new Set(badgeRows.map((b) => b.code)));
  } catch (err) {
    if (err instanceof RecordError) throw new HttpError(422, `Match rejected: ${err.message}`);
    throw err;
  }

  const playedAt = new Date(m.playedAt);
  const when = Number.isNaN(playedAt.getTime()) || playedAt.getTime() > Date.now() + 60_000 ? new Date() : playedAt;
  const homeInn = out.sums.find((s) => s.batting === m.home);
  const awayInn = out.sums.find((s) => s.batting === m.away);
  const names: Record<string, string> = {};
  for (const team of [m.home, m.away]) names[team] = String(m.teamNames?.[team] ?? team).slice(0, 40);
  const displayName = profile?.displayName ?? me.name;

  const balls = m.innings.flatMap((inn, i) =>
    inn.balls.map((b, seq) => ({
      matchId: id,
      innings: i + 1,
      seq,
      byPlayer: inn.batting === m.home,
      batter: b.batter,
      bowler: b.bowler,
      runs: b.runs,
      extra: b.extra ?? null,
      wicket: b.wicket ?? null,
      shot: b.shot ?? null,
      timing: b.timing ?? null,
      power: b.power ?? null,
      speedKmh: b.speedKmh ?? null,
    })),
  );

  // Stats write guarded by the version read above: if another save changed the
  // stats meanwhile, it touches no row and the division by zero aborts the whole batch.
  const statsWrite = statsRow
    ? d
        .update(careerStats)
        .set({ ...out.stats, version: sql`${careerStats.version} + 1`, updatedAt: new Date() })
        .where(and(eq(careerStats.userId, me.userId), eq(careerStats.version, readVersion)))
        .returning({ one: sql`1` })
    : d
        .insert(careerStats)
        .values({ userId: me.userId, ...out.stats, version: 1 })
        .onConflictDoNothing({ target: careerStats.userId })
        .returning({ one: sql`1` });
  // getSQL(): embedding the builder itself would wrap it in a second pair of brackets, which Postgres rejects.
  const guardedStats = d.execute(sql`with written as (${statsWrite.getSQL()}) select 1 / (select count(*)::int from written) as ok`);

  const writes = [
    guardedStats,
    d.insert(matches).values({
      id,
      userId: me.userId,
      home: m.home,
      away: m.away,
      ground: m.ground,
      timeOfDay: m.timeOfDay,
      mode: m.mode,
      difficulty: m.difficulty,
      result: out.result,
      margin: out.margin,
      homeRuns: homeInn?.runs ?? 0,
      homeWickets: homeInn?.wickets ?? 0,
      awayRuns: awayInn?.runs ?? 0,
      awayWickets: awayInn?.wickets ?? 0,
      scorecard: { innings: out.sums, teamNames: names },
      playedAt: when,
    }),
  ] as const;
  const extra = [
    ...(balls.length ? [d.insert(inningsBalls).values(balls)] : []),
    ...(out.boards.length
      ? [d.insert(leaderboards).values(out.boards.map((b) => ({ ...b, userId: me.userId, displayName, ground: m.ground, team: m.home, matchId: id })))]
      : []),
    ...(out.newAchievements.length
      ? [d.insert(achievements).values(out.newAchievements.map((code) => ({ userId: me.userId, code }))).onConflictDoNothing()]
      : []),
  ];

  try {
    // One batch = one transaction: the match, its balls, stats, boards and badges all save or none do.
    await d.batch([...writes, ...extra]);
  } catch (err) {
    const code = pgCode(err);
    // 22012: the stats changed under us. 23505 on the match id: the same match arrived twice at once.
    if (code === '22012' || code === '23505') return null;
    throw err;
  }

  return json({ id, result: out.result, margin: out.margin, stats: out.stats, newAchievements: out.newAchievements }, 201);
}

/** The match is already stored: answer as if it had just been saved, without counting it again. */
function alreadySaved(
  me: Me,
  id: string,
  existing: { userId: string; result: string; margin: string },
  statsRow: (typeof careerStats.$inferSelect) | undefined,
) {
  if (existing.userId !== me.userId) throw new HttpError(409, 'Match id already used');
  const { userId: _u, updatedAt: _t, version: _v, ...stats } = statsRow ?? { userId: '', updatedAt: null, version: 0, ...EMPTY_STATS };
  return json({ id, result: existing.result, margin: existing.margin, stats, newAchievements: [], duplicate: true }, 200);
}

/** Postgres error code from a Neon or Drizzle error (Drizzle wraps the driver error as `cause`). */
function pgCode(err: unknown): string | undefined {
  for (let e = err as { code?: unknown; cause?: unknown } | undefined, i = 0; e && i < 4; e = e.cause as typeof e, i++) {
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) return e.code;
  }
  return undefined;
}
