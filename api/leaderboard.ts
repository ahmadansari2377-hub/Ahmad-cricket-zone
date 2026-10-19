import { and, desc, eq, gte, SQL, sql } from 'drizzle-orm';
import { db, schema } from './_lib/db.js';
import { HttpError, json, route } from './_lib/http.js';

const { leaderboards, profiles } = schema;
const BOARDS = ['top_score', 'most_sixes', 'fastest_ball'];

/**
 * GET /api/leaderboard?board=top_score&period=all|week&ground=lords&team=pak
 * Public: the top 20 players, each with their single best entry, shown under
 * their current display name. Display names and numbers only, never emails.
 */
export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams;
  const board = q.get('board') ?? 'top_score';
  if (!BOARDS.includes(board)) throw new HttpError(400, 'Unknown leaderboard');
  const where: SQL[] = [eq(leaderboards.board, board)];
  if (q.get('period') === 'week') where.push(gte(leaderboards.createdAt, new Date(Date.now() - 7 * 864e5)));
  const ground = q.get('ground');
  if (ground) where.push(eq(leaderboards.ground, ground.slice(0, 20)));
  const team = q.get('team');
  if (team) where.push(eq(leaderboards.team, team.slice(0, 10)));

  const d = db();
  // Each player's best entry (the earliest one if they matched it later).
  const best = d
    .selectDistinctOn([leaderboards.userId], {
      name: sql<string>`coalesce(${profiles.displayName}, ${leaderboards.displayName})`.as('name'),
      value: leaderboards.value,
      ground: leaderboards.ground,
      team: leaderboards.team,
      at: leaderboards.createdAt,
    })
    .from(leaderboards)
    .leftJoin(profiles, eq(profiles.userId, leaderboards.userId))
    .where(and(...where))
    .orderBy(leaderboards.userId, desc(leaderboards.value), leaderboards.createdAt)
    .as('best');
  const rows = await d
    .select({ name: best.name, value: best.value, ground: best.ground, team: best.team, at: best.at })
    .from(best)
    .orderBy(desc(best.value), best.at)
    .limit(20);
  return json({ board, entries: rows }, 200, { 'cache-control': 'public, max-age=30' });
});
