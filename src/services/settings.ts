import type { Difficulty } from '../game/difficulty';

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  displayName: string;
  favouriteTeam: string | null;
  battingHand: 'R' | 'L';
  difficulty: Difficulty;
  graphicsQuality: Quality;
  /** Spoken commentary lines (browser speech). */
  commentary: boolean;
}

const KEY = 'aca.settings.v1';

function defaults(): Settings {
  // Phones and small laptops start on medium graphics.
  const weak = (navigator.hardwareConcurrency ?? 8) <= 4 || Math.min(screen.width, screen.height) < 700;
  return { displayName: 'Guest', favouriteTeam: null, battingHand: 'R', difficulty: 'medium', graphicsQuality: weak ? 'medium' : 'high', commentary: true };
}

function read(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    // Storage unavailable: defaults.
  }
  return defaults();
}

let current = read();
const listeners: ((s: Settings) => void)[] = [];

export const settings = () => current;

export function onSettings(fn: (s: Settings) => void) {
  listeners.push(fn);
}

/** Changes settings on this device and tells listeners (the account layer syncs them). */
export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Not remembered; still applied for this visit.
  }
  for (const l of listeners) l(current);
}
