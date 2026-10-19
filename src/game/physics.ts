import { Vector3 } from 'three';
import { BALL_R, FIELD_CENTER_Z, G, PITCH_HALF_W, PITCH_LEN } from './constants';
import { boundaryRatio, ground, groundY } from './groundState';

export const SIM_DT = 1 / 240;

/** Air drag constant: 0.5 * rho * Cd * A / m for a 156 g cricket ball. */
const DRAG_K = 0.0058;

export interface Sample {
  t: number;
  p: Vector3;
  v: Vector3;
  bounces: number;
  rolling: boolean;
}

export interface FlightOpts {
  /** Sideways air acceleration (m/s²) before the first bounce: swing or drift. */
  swing?: number;
  /** Sideways velocity added at the first bounce on the pitch: spin turn plus seam. */
  turn?: number;
  /** Extra bounce multiplier at the first bounce (cracked pitch, top-spin). */
  bounceBoost?: number;
  /** Magnus lift from backspin on lofted shots (m/s² at 30 m/s). */
  lift?: number;
  maxT?: number;
  untilFirstBounce?: boolean;
  /** Stop once the ball has gone behind this z (past the wicketkeeper). */
  stopBehindZ?: number;
}

export function onPitch(p: Vector3) {
  return Math.abs(p.x) < PITCH_HALF_W && p.z > -1.5 && p.z < PITCH_LEN + 1.5;
}

export function distFromCentre(p: Vector3) {
  return Math.hypot(p.x, p.z - FIELD_CENTER_Z);
}

/** Integrates a ball flight with gravity, drag, swing, Magnus lift, bounce and roll. */
export function simulate(p0: Vector3, v0: Vector3, opts: FlightOpts = {}): Sample[] {
  const p = p0.clone();
  const v = v0.clone();
  const out: Sample[] = [{ t: 0, p: p.clone(), v: v.clone(), bounces: 0, rolling: false }];
  const maxT = opts.maxT ?? 8;
  const a = new Vector3();
  let t = 0;
  let bounces = 0;
  let rolling = false;

  while (t < maxT) {
    if (!rolling) {
      const sp = v.length();
      a.set(0, -G, 0).addScaledVector(v, -DRAG_K * sp);
      if (bounces === 0 && opts.swing) a.x += opts.swing;
      if (opts.lift && bounces === 0) a.y += opts.lift * (sp / 30) ** 2;
      v.addScaledVector(a, SIM_DT);
    } else {
      // Rolling: the slope pulls the ball downhill (Lord's), friction slows it.
      v.x += -G * ground.info.slope * SIM_DT;
      const sp = Math.hypot(v.x, v.z);
      const decel = (onPitch(p) ? 1.2 : 1.55) * SIM_DT;
      if (sp <= decel + 0.05) {
        v.set(0, 0, 0);
      } else {
        const k = (sp - decel) / sp;
        v.x *= k;
        v.z *= k;
      }
    }
    p.addScaledVector(v, SIM_DT);
    t += SIM_DT;
    const floor = groundY(p.x) + BALL_R;
    if (rolling) p.y = floor;

    if (!rolling && p.y < floor && v.y < 0) {
      p.y = floor;
      const pitch = onPitch(p);
      let e = pitch ? 0.52 : 0.36;
      if (bounces === 0 && opts.bounceBoost) e *= opts.bounceBoost;
      const f = pitch ? 0.86 : 0.7;
      v.y = -v.y * e;
      v.x *= f;
      v.z *= f;
      if (bounces === 0 && opts.turn && pitch) v.x += opts.turn;
      bounces++;
      if (v.y < 0.7) {
        rolling = true;
        v.y = 0;
      }
      if (opts.untilFirstBounce) {
        out.push({ t, p: p.clone(), v: v.clone(), bounces, rolling });
        break;
      }
    }

    out.push({ t, p: p.clone(), v: v.clone(), bounces, rolling });
    if (rolling && v.lengthSq() === 0) break;
    if (opts.stopBehindZ !== undefined && p.z < opts.stopBehindZ) break;
    if (boundaryRatio(p) > 1.15) break;
  }
  return out;
}

/** Interpolated position on a pre-simulated path at time t. */
export function sampleAt(path: Sample[], t: number, target: Vector3): Vector3 {
  const f = t / SIM_DT;
  const i = Math.max(0, Math.min(path.length - 1, Math.floor(f)));
  const j = Math.min(path.length - 1, i + 1);
  return target.copy(path[i].p).lerp(path[j].p, Math.min(1, Math.max(0, f - i)));
}

export function indexAt(path: Sample[], t: number) {
  return Math.max(0, Math.min(path.length - 1, Math.floor(t / SIM_DT)));
}
