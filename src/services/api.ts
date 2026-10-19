import type { BoardId, CareerStats, InningsSummary, MatchRecord, Result } from '../game/record';
import { getToken } from './auth';

export interface Profile {
  displayName: string;
  favouriteTeam: string | null;
  battingHand: 'R' | 'L';
  difficulty: 'easy' | 'medium' | 'hard';
  graphicsQuality: 'low' | 'medium' | 'high';
}

export interface ProfileData {
  profile: Profile;
  calibration: Record<string, number | string> | null;
  stats: CareerStats;
  achievements: { code: string; earnedAt: string }[];
}

export interface SavedMatch {
  id: string;
  home: string;
  away: string;
  ground: string;
  timeOfDay: string;
  mode: string;
  difficulty: string;
  result: Result;
  margin: string;
  homeRuns: number;
  homeWickets: number;
  awayRuns: number;
  awayWickets: number;
  scorecard: { innings: InningsSummary[]; teamNames: Record<string, string> };
  playedAt: string;
}

export interface SaveResult {
  id: string;
  result: Result;
  margin: string;
  stats: CareerStats;
  newAchievements: string[];
}

export interface BoardRow {
  name: string;
  value: number;
  ground: string;
  team: string;
  at: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (auth) {
    const token = await getToken();
    if (!token) throw new ApiError(401, 'Sign in first');
    headers.set('authorization', `Bearer ${token}`);
  }
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'You appear to be offline');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  profile: () => call<ProfileData>('profile'),
  saveProfile: (p: Partial<Profile> & { calibration?: Record<string, number | string> }) =>
    call<{ ok: true }>('profile', { method: 'PUT', body: JSON.stringify(p) }),
  deleteAccountData: () => call<{ ok: true }>('profile', { method: 'DELETE' }),
  matches: () => call<{ matches: SavedMatch[] }>('matches'),
  saveMatch: (m: MatchRecord) => call<SaveResult>('matches', { method: 'POST', body: JSON.stringify(m) }),
  leaderboard: (board: BoardId, period: 'all' | 'week', ground = '') =>
    call<{ entries: BoardRow[] }>(`leaderboard?board=${board}&period=${period}${ground ? `&ground=${ground}` : ''}`, {}, false),
};
