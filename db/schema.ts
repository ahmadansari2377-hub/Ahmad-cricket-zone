import { sql } from 'drizzle-orm';
import { bigserial, boolean, check, index, integer, jsonb, pgTable, primaryKey, real, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// The database enforces the same rules as the API, so a bug can never store
// impossible values (negative runs, unknown settings, duplicate balls).

// Accounts themselves (the `users` of plan.md §9.2) live in Neon Auth's own
// `neon_auth` schema. Every table here is keyed by that user's id (the JWT `sub`).

export const profiles = pgTable(
  'profiles',
  {
    userId: text('user_id').primaryKey(),
    displayName: text('display_name').notNull(),
    favouriteTeam: text('favourite_team'),
    battingHand: text('batting_hand').notNull().default('R'),
    difficulty: text('difficulty').notNull().default('medium'),
    graphicsQuality: text('graphics_quality').notNull().default('high'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('profiles_name_len', sql`char_length(${t.displayName}) between 1 and 30`),
    check('profiles_team_len', sql`${t.favouriteTeam} is null or char_length(${t.favouriteTeam}) <= 10`),
    check('profiles_hand', sql`${t.battingHand} in ('R', 'L')`),
    check('profiles_difficulty', sql`${t.difficulty} in ('easy', 'medium', 'hard')`),
    check('profiles_quality', sql`${t.graphicsQuality} in ('low', 'medium', 'high')`),
  ],
);

/** Body measurements from webcam calibration. Numbers only, never images. */
export const calibrations = pgTable(
  'calibrations',
  {
    userId: text('user_id').primaryKey(),
    data: jsonb('data').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('calibrations_is_object', sql`jsonb_typeof(${t.data}) = 'object'`)],
);

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id').notNull(),
    home: text('home').notNull(),
    away: text('away').notNull(),
    ground: text('ground').notNull(),
    timeOfDay: text('time_of_day').notNull(),
    mode: text('mode').notNull(),
    difficulty: text('difficulty').notNull(),
    result: text('result').notNull(),
    margin: text('margin').notNull(),
    homeRuns: smallint('home_runs').notNull(),
    homeWickets: smallint('home_wickets').notNull(),
    awayRuns: smallint('away_runs').notNull(),
    awayWickets: smallint('away_wickets').notNull(),
    /** Scorecards (InningsSummary[]) plus team names, for the history page. */
    scorecard: jsonb('scorecard').notNull(),
    playedAt: timestamp('played_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('matches_user_idx').on(t.userId, t.playedAt),
    check('matches_time', sql`${t.timeOfDay} in ('day', 'night')`),
    check('matches_mode', sql`${t.mode} in ('full', 'chase', 'defend')`),
    check('matches_difficulty', sql`${t.difficulty} in ('easy', 'medium', 'hard')`),
    check('matches_result', sql`${t.result} in ('won', 'lost', 'tied')`),
    check('matches_teams', sql`${t.home} <> ${t.away}`),
    check('matches_score', sql`${t.homeRuns} >= 0 and ${t.awayRuns} >= 0 and ${t.homeWickets} between 0 and 10 and ${t.awayWickets} between 0 and 10`),
  ],
);

export const inningsBalls = pgTable(
  'innings_balls',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    innings: smallint('innings').notNull(),
    seq: smallint('seq').notNull(),
    byPlayer: boolean('by_player').notNull(),
    batter: text('batter').notNull(),
    bowler: text('bowler').notNull(),
    runs: smallint('runs').notNull(),
    extra: text('extra'),
    wicket: text('wicket'),
    shot: text('shot'),
    timing: text('timing'),
    power: real('power'),
    speedKmh: real('speed_kmh'),
  },
  (t) => [
    uniqueIndex('balls_match_seq_idx').on(t.matchId, t.innings, t.seq),
    check('balls_innings', sql`${t.innings} in (1, 2)`),
    check('balls_seq', sql`${t.seq} >= 0`),
    check('balls_runs', sql`${t.runs} between 0 and 6`),
    check('balls_power', sql`${t.power} is null or ${t.power} between 0 and 1`),
    check('balls_speed', sql`${t.speedKmh} is null or ${t.speedKmh} between 0 and 200`),
  ],
);

export const careerStats = pgTable(
  'career_stats',
  {
  userId: text('user_id').primaryKey(),
  /** Bumped on every save; a save only applies if nobody else saved in between. */
  version: integer('version').notNull().default(0),
  matches: integer('matches').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  ties: integer('ties').notNull().default(0),
  runs: integer('runs').notNull().default(0),
  ballsFaced: integer('balls_faced').notNull().default(0),
  highest: integer('highest').notNull().default(0),
  fours: integer('fours').notNull().default(0),
  sixes: integer('sixes').notNull().default(0),
  outs: integer('outs').notNull().default(0),
  wickets: integer('wickets').notNull().default(0),
  runsConceded: integer('runs_conceded').notNull().default(0),
  ballsBowled: integer('balls_bowled').notNull().default(0),
  bestWkts: integer('best_wkts').notNull().default(0),
  bestRuns: integer('best_runs').notNull().default(0),
  fastestKmh: real('fastest_kmh').notNull().default(0),
  perfectShots: integer('perfect_shots').notNull().default(0),
  lordsRuns: integer('lords_runs').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'career_non_negative',
      sql`least(${t.matches}, ${t.wins}, ${t.losses}, ${t.ties}, ${t.runs}, ${t.ballsFaced}, ${t.highest}, ${t.fours}, ${t.sixes}, ${t.outs}, ${t.wickets}, ${t.runsConceded}, ${t.ballsBowled}, ${t.bestWkts}, ${t.bestRuns}, ${t.perfectShots}, ${t.lordsRuns}) >= 0 and ${t.fastestKmh} >= 0`,
    ),
    check('career_results', sql`${t.wins} + ${t.losses} + ${t.ties} = ${t.matches}`),
  ],
);

export const leaderboards = pgTable(
  'leaderboards',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: text('user_id').notNull(),
    displayName: text('display_name').notNull(),
    board: text('board').notNull(),
    value: real('value').notNull(),
    ground: text('ground').notNull(),
    team: text('team').notNull(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('leaderboards_board_idx').on(t.board, sql`${t.value} desc`),
    index('leaderboards_player_idx').on(t.board, t.userId, sql`${t.value} desc`),
    index('leaderboards_created_idx').on(t.createdAt),
    check('leaderboards_board', sql`${t.board} in ('top_score', 'most_sixes', 'fastest_ball')`),
    check('leaderboards_value', sql`${t.value} >= 0`),
  ],
);

export const achievements = pgTable(
  'achievements',
  {
    userId: text('user_id').notNull(),
    code: text('code').notNull(),
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.code] })],
);
