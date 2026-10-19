import type { Delivery } from './ai/aiBowler';
import { BALL_R, STUMP_H, STUMP_HALF_SPREAD } from './constants';
import type { LbwCheck } from './lbw';

/**
 * Decision Review System: the on-field umpire's (fallible) call, and the
 * ball-tracking and snickometer evidence that a review uses to confirm or
 * overturn it. One unsuccessful review per side per innings, as in T20s.
 */

export type Zone = 'In line' | 'Outside off' | 'Outside leg' | "Umpire's call";
export type WicketsZone = 'Hitting' | 'Missing' | "Umpire's call";

export interface TrackingVerdict {
  pitching: Zone;
  impact: Zone;
  wickets: WicketsZone;
  /** Where the projected ball crosses the stumps' plane. */
  atStumps: { x: number; y: number };
  out: boolean;
  /** True when the on-field call stands because of an umpire's call band. */
  umpiresCall: boolean;
}

const LINE = STUMP_HALF_SPREAD + BALL_R;

/**
 * Ball tracking for an LBW review. `onFieldOut` matters for umpire's call:
 * marginal impact or wickets keep the original decision.
 */
export function trackLbw(d: Delivery, l: LbwCheck, playedShot: boolean, onFieldOut: boolean): TrackingVerdict {
  const bx = d.bounceAt.x;
  const pitching: Zone = bx > LINE ? 'Outside leg' : bx < -LINE ? 'Outside off' : 'In line';

  const ix = l.impact.p.x;
  let impact: Zone;
  if (Math.abs(ix) <= STUMP_HALF_SPREAD) impact = 'In line';
  else if (Math.abs(ix) <= LINE) impact = "Umpire's call";
  else impact = ix > 0 ? 'Outside leg' : 'Outside off';

  const at = d.path.find((s) => s.p.z <= 0) ?? d.path[d.path.length - 1];
  const x = Math.abs(at.p.x);
  const y = at.p.y;
  let wickets: WicketsZone;
  if (x <= STUMP_HALF_SPREAD && y <= STUMP_H) wickets = 'Hitting';
  else if (x <= LINE && y <= STUMP_H + BALL_R) wickets = "Umpire's call";
  else wickets = 'Missing';

  // Hard "not out" reasons first.
  if (pitching === 'Outside leg' || impact === 'Outside leg' || (impact === 'Outside off' && playedShot) || wickets === 'Missing') {
    return { pitching, impact, wickets, atStumps: { x: at.p.x, y }, out: false, umpiresCall: false };
  }
  // Offered no shot: impact outside off can still be out.
  const marginal = impact === "Umpire's call" || wickets === "Umpire's call";
  if (marginal) return { pitching, impact, wickets, atStumps: { x: at.p.x, y }, out: onFieldOut, umpiresCall: true };
  return { pitching, impact, wickets, atStumps: { x: at.p.x, y }, out: true, umpiresCall: false };
}

/**
 * The on-field umpire's LBW call. Usually right, but marginal ones go
 * either way, which is what makes reviews worth having.
 */
export function umpireLbw(d: Delivery, l: LbwCheck, playedShot: boolean): boolean {
  const truth = trackLbw(d, l, playedShot, l.out);
  const r = Math.random();
  if (truth.umpiresCall) return r < 0.5;
  if (truth.out) return r > 0.1; // 10% of plumb ones missed
  // Not out: a close miss or pitching just outside leg can fool the umpire.
  const close = Math.abs(truth.atStumps.x) < LINE + 0.06 || Math.abs(d.bounceAt.x - LINE) < 0.06;
  return r < (close ? 0.25 : 0.05);
}

/**
 * When the ball beats the bat close to it, the fielders appeal for a catch
 * behind; occasionally the umpire wrongly hears a nick. Returns true if the
 * umpire gives it out.
 */
export function falseNick(d: Delivery, timingError: number): boolean {
  const near = d.contactP.x > -0.5 && d.contactP.x < 0.05 && d.contactP.y < 1.3;
  return near && !d.hitsStumps && Math.abs(timingError) < 0.13 && Math.random() < 0.07;
}

/**
 * Snickometer trace: a quiet baseline with a sharp spike where the ball
 * passes the bat if there was an edge (and a dull thud for pad).
 */
export function snickTrace(edge: boolean, pad: boolean, n = 160): number[] {
  const out: number[] = [];
  const centre = Math.floor(n * 0.55);
  for (let i = 0; i < n; i++) {
    let v = (Math.random() - 0.5) * 0.06;
    const k = i - centre;
    if (edge && k >= 0 && k < 10) v += Math.sin(k * 2.1) * Math.exp(-k * 0.35) * 0.95;
    if (pad && k >= 6 && k < 26) v += Math.sin(k * 0.9) * Math.exp(-(k - 6) * 0.18) * 0.35;
    out.push(v);
  }
  return out;
}

/** Where the bat passes the ball, as a fraction of the trace. */
export const SNICK_AT = 0.55;
