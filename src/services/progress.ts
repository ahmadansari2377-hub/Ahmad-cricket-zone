import { applyMatch, CareerStats, EMPTY_STATS, MatchRecord, newMatchId, Result } from '../game/record';
import type { Calibration } from '../input/batGesture';
import { api, ApiError, ProfileData, SavedMatch } from './api';
import { currentUser } from './auth';

/**
 * Where progress lives: on this device for guests, in Neon for signed-in
 * players. Guest matches can be moved to an account after signing in.
 */

const GUEST_KEY = 'aca.guest.v1';
const MAX_GUEST_MATCHES = 30;

interface GuestStore {
  stats: CareerStats;
  achievements: { code: string; earnedAt: string }[];
  /** Newest first. */
  matches: (SavedMatch & { record: MatchRecord })[];
}

function readGuest(): GuestStore {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (raw) return JSON.parse(raw) as GuestStore;
  } catch {
    // Storage blocked or corrupt: start fresh.
  }
  return { stats: { ...EMPTY_STATS }, achievements: [], matches: [] };
}

function writeGuest(s: GuestStore) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(s));
  } catch {
    // Not saved (private window); the game still works.
  }
}

export interface SaveOutcome {
  where: 'account' | 'device';
  result: Result;
  newAchievements: string[];
}

/** Saves a finished match to the account if signed in, otherwise to this device. */
export async function saveMatch(record: MatchRecord): Promise<SaveOutcome> {
  if (currentUser()) {
    const r = await api.saveMatch(record);
    return { where: 'account', result: r.result, newAchievements: r.newAchievements };
  }
  const g = readGuest();
  const out = applyMatch(record, g.stats, new Set(g.achievements.map((a) => a.code)));
  const home = out.sums.find((s) => s.batting === record.home);
  const away = out.sums.find((s) => s.batting === record.away);
  g.stats = out.stats;
  const now = new Date().toISOString();
  g.achievements.push(...out.newAchievements.map((code) => ({ code, earnedAt: now })));
  g.matches.unshift({
    // The same id goes to the server when this match is moved to an account, so it is never counted twice.
    id: record.id ?? newMatchId(),
    home: record.home,
    away: record.away,
    ground: record.ground,
    timeOfDay: record.timeOfDay,
    mode: record.mode,
    difficulty: record.difficulty,
    result: out.result,
    margin: out.margin,
    homeRuns: home?.runs ?? 0,
    homeWickets: home?.wickets ?? 0,
    awayRuns: away?.runs ?? 0,
    awayWickets: away?.wickets ?? 0,
    scorecard: { innings: out.sums, teamNames: record.teamNames },
    playedAt: record.playedAt,
    record,
  });
  g.matches.length = Math.min(g.matches.length, MAX_GUEST_MATCHES);
  writeGuest(g);
  return { where: 'device', result: out.result, newAchievements: out.newAchievements };
}

/** Stats, badges and settings for the profile page. */
export async function loadProfile(): Promise<{ data: ProfileData; matches: SavedMatch[] }> {
  if (currentUser()) {
    const [data, list] = await Promise.all([api.profile(), api.matches()]);
    return { data, matches: list.matches };
  }
  const g = readGuest();
  return {
    data: {
      profile: { displayName: 'Guest', favouriteTeam: null, battingHand: 'R', difficulty: 'medium', graphicsQuality: 'high' },
      calibration: null,
      stats: g.stats,
      achievements: g.achievements,
    },
    matches: g.matches,
  };
}

export function guestMatchCount() {
  return readGuest().matches.length;
}

/**
 * Uploads guest matches (oldest first) to the newly signed-in account, then
 * clears them from this device. Returns how many were moved.
 */
export async function moveGuestProgress(): Promise<number> {
  const g = readGuest();
  let moved = 0;
  const left: GuestStore['matches'] = [];
  for (const m of [...g.matches].reverse()) {
    try {
      await api.saveMatch(m.record);
      moved++;
    } catch (err) {
      // A record the server refuses will never upload; drop it. Keep the rest to retry.
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 0 || status === 401 || status >= 500) left.unshift(m);
    }
  }
  writeGuest(left.length ? { ...g, matches: left } : { stats: { ...EMPTY_STATS }, achievements: [], matches: [] });
  return moved;
}

/** Calibration as flat numbers for the server (never images). */
export function flattenCalibration(c: Calibration): Record<string, number | string> {
  return {
    hand: c.hand,
    shoulderW: c.shoulderW,
    restNoseX: c.restNose.x,
    restNoseY: c.restNose.y,
    restHandsX: c.restHands.x,
    restHandsY: c.restHands.y,
    neutralAngle: c.neutralAngle,
    fullSpeed: c.fullSpeed,
  };
}

export function unflattenCalibration(f: Record<string, number | string>): Calibration | null {
  const n = (k: string) => (typeof f[k] === 'number' ? (f[k] as number) : NaN);
  const c: Calibration = {
    hand: f.hand === 'L' ? 'L' : 'R',
    shoulderW: n('shoulderW'),
    restNose: { x: n('restNoseX'), y: n('restNoseY') },
    restHands: { x: n('restHandsX'), y: n('restHandsY') },
    neutralAngle: n('neutralAngle'),
    fullSpeed: n('fullSpeed'),
  };
  const ok = [c.shoulderW, c.restNose.x, c.restNose.y, c.restHands.x, c.restHands.y, c.neutralAngle, c.fullSpeed].every(Number.isFinite);
  return ok ? c : null;
}
