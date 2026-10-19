import type { Delivery } from './ai/aiBowler';
import { BALL_R, STUMP_HALF_SPREAD } from './constants';
import type { Sample } from './physics';

/** Where a right-handed batter's pads are, standing at the crease. */
const PAD = { x0: 0.02, x1: 0.5, z0: 0.6, z1: 1.5, top: 0.62 };
const STUMP_LINE = STUMP_HALF_SPREAD + BALL_R;

export interface LbwCheck {
  impact: Sample;
  out: boolean;
  /** Why it is (not) out, for the umpire's call and later the DRS screen. */
  reason: string;
}

/**
 * Ball-tracking LBW decision after the ball beats the bat:
 * not out if it pitched outside leg, or hit the pad outside the line of the
 * stumps (outside off only counts when no shot was offered), or would have
 * missed the stumps. Returns null if the ball never touched the pads.
 */
export function checkLbw(d: Delivery, playedShot: boolean): LbwCheck | null {
  const impact = d.path.find(
    (s) => s.p.z <= PAD.z1 && s.p.z >= PAD.z0 && s.p.x >= PAD.x0 && s.p.x <= PAD.x1 && s.p.y <= PAD.top && s.p.y > 0,
  );
  if (!impact) return null;

  if (d.bounceAt.x > STUMP_LINE) return { impact, out: false, reason: 'Pitched outside leg' };
  const x = impact.p.x;
  if (x > STUMP_LINE) return { impact, out: false, reason: 'Impact outside leg' };
  if (x < -STUMP_LINE && playedShot) return { impact, out: false, reason: 'Impact outside off' };
  if (!d.hitsStumps) {
    // Hawk-Eye style: over the top or past the stumps.
    const at = d.path.find((s) => s.p.z <= 0);
    const high = at && at.p.y > 0.711;
    return { impact, out: false, reason: high ? 'Going over the stumps' : 'Missing the stumps' };
  }
  return { impact, out: true, reason: 'Hitting the stumps' };
}
