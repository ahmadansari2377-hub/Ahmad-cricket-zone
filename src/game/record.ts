/**
 * The saved form of a match, shared by the game (guest saves), the API
 * (account saves) and the tests. Everything here is plain data and pure
 * functions: no DOM, no Three.js, no database.
 *
 * The ball-by-ball list is the source of truth. Totals, the result, career
 * stats, leaderboard entries and achievements are all recomputed from it, so
 * the server never trusts a score the browser claims.
 */

export const MAX_LEGAL_BALLS = 12;
export const MAX_SPEED_KMH = 165;

export type Extra = 'wd' | 'nb';

export interface BallRecord {
  batter: string;
  bowler: string;
  /** Runs off the bat (or extra runs run on a wide). */
  runs: number;
  extra?: Extra;
  /** Dismissal text, e.g. "c Smith b Cummins". */
  wicket?: string;
  shot?: string;
  timing?: string;
  /** 0–1 swing power. */
  power?: number;
  speedKmh?: number;
}

export interface BatterLine {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: string;
}

export interface BowlerLine {
  name: string;
  balls: number;
  maidens: number;
  runs: number;
  wkts: number;
}

export interface InningsRecord {
  /** Team ids. */
  batting: string;
  bowling: string;
  /** Runs needed to win, or null in a first innings. */
  target: number | null;
  balls: BallRecord[];
}

export interface MatchRecord {
  /**
   * Permanent id given when the match ends, so saving it twice (a retry after a
   * dropped connection) stores it once. Older saved records may not have one.
   */
  id?: string;
  /** The player's team id and the computer's team id. */
  home: string;
  away: string;
  ground: string;
  timeOfDay: 'day' | 'night';
  mode: 'full' | 'chase' | 'defend';
  difficulty: 'easy' | 'medium' | 'hard';
  innings: InningsRecord[];
  /** Display names for team ids (so history reads well without the squad file). */
  teamNames: Record<string, string>;
  playedAt: string;
}

export interface InningsSummary {
  batting: string;
  bowling: string;
  runs: number;
  wickets: number;
  legalBalls: number;
  wides: number;
  noBalls: number;
  target: number | null;
  batters: BatterLine[];
  bowlers: BowlerLine[];
}

export type Result = 'won' | 'lost' | 'tied';

export class RecordError extends Error {}

const isLegal = (b: BallRecord) => !b.extra;
const bowlerCredit = (w: string) => !/run out/.test(w);

/** Totals and scorecard for one innings, rebuilt from its balls. */
export function summarise(inn: InningsRecord): InningsSummary {
  let runs = 0;
  let wickets = 0;
  let legal = 0;
  let wides = 0;
  let noBalls = 0;
  const batters = new Map<string, BatterLine>();
  const bowlers = new Map<string, BowlerLine & { overRuns: number }>();
  for (const b of inn.balls) {
    const bat = batters.get(b.batter) ?? { name: b.batter, runs: 0, balls: 0, fours: 0, sixes: 0, out: '' };
    batters.set(b.batter, bat);
    const bowl = bowlers.get(b.bowler) ?? { name: b.bowler, balls: 0, maidens: 0, runs: 0, wkts: 0, overRuns: 0 };
    bowlers.set(b.bowler, bowl);
    if (b.extra === 'wd') {
      const r = 1 + b.runs;
      runs += r;
      wides += r;
      bowl.runs += r;
      bowl.overRuns += r;
      continue;
    }
    const conceded = b.runs + (b.extra === 'nb' ? 1 : 0);
    runs += conceded;
    bowl.runs += conceded;
    bowl.overRuns += conceded;
    bat.runs += b.runs;
    bat.balls++;
    if (b.runs === 4) bat.fours++;
    if (b.runs === 6) bat.sixes++;
    if (b.extra === 'nb') {
      noBalls++;
      continue;
    }
    legal++;
    bowl.balls++;
    if (b.wicket) {
      wickets++;
      bat.out = b.wicket;
      if (bowlerCredit(b.wicket)) bowl.wkts++;
    }
    if (bowl.balls % 6 === 0) {
      if (bowl.overRuns === 0) bowl.maidens++;
      bowl.overRuns = 0;
    }
  }
  return {
    batting: inn.batting,
    bowling: inn.bowling,
    runs,
    wickets,
    legalBalls: legal,
    wides,
    noBalls,
    target: inn.target,
    batters: [...batters.values()],
    bowlers: [...bowlers.values()].map(({ overRuns: _, ...b }) => b),
  };
}

/**
 * Checks that a match could really have happened under the game's rules.
 * Throws RecordError with a reason if not.
 */
/**
 * A random version-4 UUID. crypto.randomUUID only exists on https and
 * localhost, so plain-http LAN play builds one from getRandomValues.
 */
export function newMatchId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function validate(m: MatchRecord): InningsSummary[] {
  const fail = (msg: string): never => {
    throw new RecordError(msg);
  };
  if (!m || typeof m !== 'object') fail('No match data');
  for (const k of ['home', 'away', 'ground'] as const) if (typeof m[k] !== 'string' || !m[k] || m[k].length > 40) fail(`Bad ${k}`);
  if (m.home === m.away) fail('A team cannot play itself');
  if (!['day', 'night'].includes(m.timeOfDay)) fail('Bad time of day');
  if (!['full', 'chase', 'defend'].includes(m.mode)) fail('Bad mode');
  if (!['easy', 'medium', 'hard'].includes(m.difficulty)) fail('Bad difficulty');
  if (!Array.isArray(m.innings)) fail('No innings');
  const expected = m.mode === 'full' ? 2 : 1;
  if (m.innings.length !== expected) fail(`Expected ${expected} innings`);

  const sums: InningsSummary[] = [];
  m.innings.forEach((inn, i) => {
    const sides = [inn.batting, inn.bowling].sort().join();
    if (sides !== [m.home, m.away].sort().join()) fail('Innings teams do not match the fixture');
    if (!Array.isArray(inn.balls) || inn.balls.length > 60) fail('Bad ball list');
    if (m.mode === 'full' && i === 0 && inn.target !== null) fail('First innings has no target');
    if (m.mode === 'full' && i === 1 && inn.batting !== m.innings[0].bowling) fail('Teams must swap innings');
    if (m.mode !== 'full' || i === 1) {
      if (!Number.isInteger(inn.target) || inn.target! < 1 || inn.target! > 300) fail('Bad target');
    }
    if (m.mode === 'chase' && inn.batting !== m.home) fail('In a chase you bat');
    if (m.mode === 'defend' && inn.bowling !== m.home) fail('In a defence you bowl');

    let runs = 0;
    let legal = 0;
    let wkts = 0;
    let ended = false;
    for (const b of inn.balls) {
      if (ended) fail('Balls recorded after the innings ended');
      if (typeof b.batter !== 'string' || typeof b.bowler !== 'string' || b.batter.length > 60 || b.bowler.length > 60) fail('Bad player name');
      if (!Number.isInteger(b.runs) || b.runs < 0) fail('Bad runs');
      if (b.extra === 'wd') {
        if (b.runs > 4 || b.wicket) fail('Bad wide');
      } else if (![0, 1, 2, 3, 4, 6].includes(b.runs)) fail('Impossible runs off one ball');
      if (b.extra !== undefined && b.extra !== 'wd' && b.extra !== 'nb') fail('Bad extra');
      if (b.extra === 'nb' && b.wicket) fail('No wicket off a no-ball');
      if (b.wicket !== undefined && (typeof b.wicket !== 'string' || b.wicket.length > 80)) fail('Bad wicket');
      if (b.speedKmh !== undefined && !(b.speedKmh > 40 && b.speedKmh <= MAX_SPEED_KMH)) fail('Impossible ball speed');
      if (b.power !== undefined && !(b.power >= 0 && b.power <= 1)) fail('Bad power');
      if (b.shot !== undefined && (typeof b.shot !== 'string' || b.shot.length > 60)) fail('Bad shot');
      if (b.timing !== undefined && (typeof b.timing !== 'string' || b.timing.length > 20)) fail('Bad timing');
      runs += b.runs + (b.extra ? 1 : 0);
      if (!b.extra) legal++;
      if (b.wicket) wkts++;
      if (legal >= MAX_LEGAL_BALLS || wkts >= 10 || (inn.target !== null && runs >= inn.target)) ended = true;
    }
    if (inn.balls.length > 0 && inn.balls.filter((b) => b.extra).length > 30) fail('Too many extras');
    const s = summarise(inn);
    if (!ended && i < m.innings.length - 1) fail('First innings did not finish');
    sums.push(s);
  });
  if (m.mode === 'full' && m.innings[1].target !== sums[0].runs + 1) fail('Target does not match the first innings');
  const last = sums[sums.length - 1];
  const lastEnded = last.legalBalls >= MAX_LEGAL_BALLS || last.wickets >= 10 || (last.target !== null && last.runs >= last.target);
  if (!lastEnded) fail('Match did not finish');
  return sums;
}

/** The result from the player's (home side's) point of view. */
export function resultFor(m: MatchRecord, sums: InningsSummary[]): { result: Result; margin: string } {
  const last = sums[sums.length - 1];
  const target = last.target!;
  if (last.runs >= target) {
    const left = 10 - last.wickets;
    const balls = MAX_LEGAL_BALLS - last.legalBalls;
    const won = last.batting === m.home;
    return { result: won ? 'won' : 'lost', margin: `by ${left} wicket${left === 1 ? '' : 's'} (${balls} ball${balls === 1 ? '' : 's'} left)` };
  }
  if (last.runs === target - 1) return { result: 'tied', margin: 'Scores level' };
  const by = target - 1 - last.runs;
  return { result: last.bowling === m.home ? 'won' : 'lost', margin: `by ${by} run${by === 1 ? '' : 's'}` };
}

// ---------------------------------------------------------------- career

export interface CareerStats {
  matches: number;
  wins: number;
  losses: number;
  ties: number;
  runs: number;
  ballsFaced: number;
  highest: number;
  fours: number;
  sixes: number;
  outs: number;
  wickets: number;
  runsConceded: number;
  ballsBowled: number;
  bestWkts: number;
  bestRuns: number;
  fastestKmh: number;
  perfectShots: number;
  lordsRuns: number;
}

export const EMPTY_STATS: CareerStats = {
  matches: 0, wins: 0, losses: 0, ties: 0, runs: 0, ballsFaced: 0, highest: 0, fours: 0, sixes: 0, outs: 0,
  wickets: 0, runsConceded: 0, ballsBowled: 0, bestWkts: 0, bestRuns: 0, fastestKmh: 0, perfectShots: 0, lordsRuns: 0,
};

export const ACHIEVEMENTS: Record<string, { title: string; text: string }> = {
  first_win: { title: 'First Win', text: 'Win a match' },
  first_six: { title: 'First Six', text: 'Hit a six' },
  six_sixes: { title: 'Six Sixes', text: 'Hit six sixes in one innings' },
  hat_trick: { title: 'Hat-trick', text: 'Take wickets with three balls in a row' },
  maiden: { title: 'Maiden Over', text: 'Bowl an over without conceding a run' },
  perfect_10: { title: 'Perfect Timing ×10', text: 'Time ten shots perfectly' },
  chase_master: { title: 'Chase Master', text: 'Win while chasing' },
  fifty: { title: 'Half-century', text: 'Score 50 in an innings' },
  lords_century: { title: "Lord's Century", text: "Score 100 career runs at Lord's" },
  speed_150: { title: '150 Club', text: 'Bowl a ball at 150 km/h or faster' },
};

export type BoardId = 'top_score' | 'most_sixes' | 'fastest_ball';

export interface BoardEntry {
  board: BoardId;
  value: number;
}

export interface MatchOutcome {
  sums: InningsSummary[];
  result: Result;
  margin: string;
  stats: CareerStats;
  boards: BoardEntry[];
  /** Achievement codes earned for the first time by this match. */
  newAchievements: string[];
}

/**
 * Applies a validated match to the player's career: new totals, leaderboard
 * entries for this match, and any newly earned achievements.
 */
export function applyMatch(m: MatchRecord, before: CareerStats, earned: Set<string>): MatchOutcome {
  const sums = validate(m);
  const { result, margin } = resultFor(m, sums);
  const s: CareerStats = { ...before };
  s.matches++;
  if (result === 'won') s.wins++;
  else if (result === 'lost') s.losses++;
  else s.ties++;

  const boards: BoardEntry[] = [];
  const gained = new Set<string>();
  let fastest = 0;
  let matchSixes = 0;

  m.innings.forEach((inn, i) => {
    const sum = sums[i];
    if (inn.batting === m.home) {
      s.runs += sum.batters.reduce((a, b) => a + b.runs, 0);
      s.ballsFaced += sum.batters.reduce((a, b) => a + b.balls, 0);
      s.highest = Math.max(s.highest, sum.runs);
      const fours = sum.batters.reduce((a, b) => a + b.fours, 0);
      const sixes = sum.batters.reduce((a, b) => a + b.sixes, 0);
      s.fours += fours;
      s.sixes += sixes;
      s.outs += sum.wickets;
      s.perfectShots += inn.balls.filter((b) => b.timing === 'Perfect').length;
      if (m.ground === 'lords') s.lordsRuns += sum.runs;
      matchSixes += sixes;
      boards.push({ board: 'top_score', value: sum.runs });
      if (sixes > 0) gained.add('first_six');
      if (sixes >= 6) gained.add('six_sixes');
      if (sum.runs >= 50) gained.add('fifty');
      if (inn.target !== null && sum.runs >= inn.target) gained.add('chase_master');
    } else {
      const wk = sum.bowlers.reduce((a, b) => a + b.wkts, 0);
      const conceded = sum.runs;
      s.wickets += wk;
      s.runsConceded += conceded;
      s.ballsBowled += sum.legalBalls;
      if (wk > s.bestWkts || (wk === s.bestWkts && wk > 0 && conceded < s.bestRuns)) {
        s.bestWkts = wk;
        s.bestRuns = conceded;
      }
      if (sum.bowlers.some((b) => b.maidens > 0)) gained.add('maiden');
      // Hat-trick: three legal deliveries in a row that take a wicket (wides don't break it).
      let streak = 0;
      for (const b of inn.balls) {
        if (b.extra === 'wd') continue;
        streak = b.wicket && bowlerCredit(b.wicket) ? streak + 1 : 0;
        if (streak >= 3) gained.add('hat_trick');
      }
      for (const b of inn.balls) if (b.speedKmh) fastest = Math.max(fastest, b.speedKmh);
    }
  });

  if (fastest > 0) {
    s.fastestKmh = Math.max(s.fastestKmh, Math.round(fastest * 10) / 10);
    boards.push({ board: 'fastest_ball', value: Math.round(fastest * 10) / 10 });
    if (fastest >= 150) gained.add('speed_150');
  }
  if (matchSixes > 0) boards.push({ board: 'most_sixes', value: matchSixes });
  if (result === 'won') gained.add('first_win');
  if (s.perfectShots >= 10) gained.add('perfect_10');
  if (s.lordsRuns >= 100) gained.add('lords_century');
  if (result !== 'won') gained.delete('chase_master');

  return { sums, result, margin, stats: s, boards, newAchievements: [...gained].filter((c) => !earned.has(c)) };
}
