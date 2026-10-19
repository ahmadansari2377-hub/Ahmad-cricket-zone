export type Difficulty = 'easy' | 'medium' | 'hard';

export interface DifficultySettings {
  /** Multiplies the player's timing error: below 1 is more forgiving. */
  timing: number;
  /** Multiplies computer bowlers' pace. */
  pace: number;
  /** Added to computer bowlers' 0–100 rating. */
  aiBowling: number;
  /** Added to computer batters' 0–1 skill. */
  aiBatting: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultySettings> = {
  easy: { timing: 0.7, pace: 0.92, aiBowling: -12, aiBatting: -0.1 },
  medium: { timing: 1, pace: 1, aiBowling: 0, aiBatting: 0 },
  hard: { timing: 1.2, pace: 1.04, aiBowling: 6, aiBatting: 0.06 },
};
