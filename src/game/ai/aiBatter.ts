import type { Delivery } from './aiBowler';
import { SWING_DELAY, Swing } from '../batting';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Normally distributed random number (Box–Muller). */
function gauss() {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

export interface Situation {
  runsNeeded: number;
  ballsLeft: number;
}

/**
 * Computer batter: reads line and length, judges timing (harder against fast,
 * swinging or deceptive balls) and attacks more as the required rate climbs.
 * `skill` is 0–1. Returns null to leave the ball.
 */
export function aiSwing(d: Delivery, skill: number, s: Situation): Swing | null {
  const reqRate = (s.runsNeeded / Math.max(1, s.ballsLeft)) * 6;
  const aggression = Math.min(1, Math.max(0.2, (reqRate - 6) / 10 + 0.45));
  const p = d.contactP;
  const short = d.length === 'Short' || d.length === 'Bouncer';

  // Leave balls well outside off unless desperate; never leave one hitting the stumps knowingly.
  const misjudge = Math.random() < 0.08 * (1.2 - skill);
  if (p.x < -0.6 && !d.hitsStumps && Math.random() > aggression * 0.8) return null;
  if (d.isWide && Math.random() < 0.7) return null;
  if (misjudge && !d.hitsStumps) return null;

  // Timing difficulty.
  let sd = 0.03;
  if (d.speedKmh > 140) sd += 0.012;
  if (d.length === 'Yorker') sd += 0.025;
  if (d.length === 'Bouncer') sd += 0.015;
  if (/swinger/.test(d.variation)) sd += 0.01;
  if (/Googly|Carrom|Flipper|Arm ball/.test(d.variation)) sd += 0.02;
  sd *= 1.35 - skill;
  sd *= 1 + aggression * 0.35; // swinging hard costs control
  let bias = 0;
  if (d.variation === 'Slower ball') bias -= 0.04; // through the shot too early
  const e = bias + gauss() * sd;

  // Shot selection from line and length.
  let aim: number;
  if (short) aim = p.x > -0.25 ? rand(0.6, 0.95) : rand(-0.95, -0.6); // pull or cut
  else if (p.x < -0.3) aim = rand(-0.85, -0.35);
  else if (p.x > 0.15) aim = rand(0.35, 0.85);
  else aim = rand(-0.35, 0.35);

  const defend = !short && d.length === 'Good length' && Math.random() < 0.45 * (1 - aggression);
  const loft = !defend && Math.random() < aggression * (d.length === 'Full' || short ? 0.75 : 0.45);

  return {
    pressTime: d.tContact - SWING_DELAY + e,
    aim,
    loft,
    defend,
    power: Math.min(1, 0.75 + aggression * 0.25),
  };
}
