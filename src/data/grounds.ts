export type GroundId = 'lords' | 'mcg';
export type TimeOfDay = 'day' | 'night';

export interface GroundInfo {
  id: GroundId;
  name: string;
  city: string;
  /** Boundary half-widths (m) from the middle of the pitch: across (x) and along the pitch (z). */
  boundary: { rx: number; rz: number };
  /** Ground height change per metre across the field (dy/dx). Lord's falls ~2.5 m side to side. */
  slope: number;
  /** End names: behind the bowler (+z) and behind the batter (-z). */
  ends: { bowler: string; batter: string };
  sky: {
    day: { elevation: number; azimuth: number; turbidity: number; rayleigh: number; exposure: number; sun: number; fog: number };
  };
}

export const GROUNDS: Record<GroundId, GroundInfo> = {
  lords: {
    id: 'lords',
    name: "Lord's",
    city: 'London',
    boundary: { rx: 60, rz: 64 },
    slope: -0.019,
    ends: { bowler: 'Nursery End', batter: 'Pavilion End' },
    sky: {
      // English summer: softer, hazier light and a lower sun.
      day: { elevation: 34, azimuth: 215, turbidity: 4.5, rayleigh: 1.6, exposure: 0.74, sun: 2.6, fog: 0xc6d2dc },
    },
  },
  mcg: {
    id: 'mcg',
    name: 'Melbourne Cricket Ground',
    city: 'Melbourne',
    boundary: { rx: 71, rz: 75 },
    slope: 0,
    ends: { bowler: 'Great Southern Stand End', batter: 'Members End' },
    sky: {
      // Bright, clear Australian sun.
      day: { elevation: 52, azimuth: 30, turbidity: 2.2, rayleigh: 0.9, exposure: 0.8, sun: 3.4, fog: 0xcfe0ee },
    },
  },
};
