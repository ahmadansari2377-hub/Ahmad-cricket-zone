import { Vector3 } from 'three';
import type { Delivery } from './ai/aiBowler';

/** Seconds from starting the downswing to bat meeting ball. */
export const SWING_DELAY = 0.13;

export interface Swing {
  /** Delivery clock time (s after release) when the swing started. */
  pressTime: number;
  /** -1 = full off side, 0 = straight, +1 = full leg side. */
  aim: number;
  loft: boolean;
  defend: boolean;
  /** 0–1 swing power (webcam swing speed; keyboard uses 1). */
  power: number;
}

export type TimingLabel = 'Perfect' | 'Good' | 'Early' | 'Late' | 'Very early' | 'Very late' | 'Too early' | 'Too late';

export interface ShotResult {
  kind: 'leave' | 'miss' | 'hit' | 'edge' | 'playedOn';
  timingError: number;
  timing: TimingLabel | '';
  quality: number;
  shotName: string;
  velocity: Vector3;
  lift: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const deg = Math.PI / 180;

function timingLabel(e: number): TimingLabel {
  const a = Math.abs(e);
  if (a <= 0.025) return 'Perfect';
  if (a <= 0.055) return 'Good';
  if (a <= 0.1) return e < 0 ? 'Early' : 'Late';
  if (a <= 0.15) return e < 0 ? 'Very early' : 'Very late';
  return e < 0 ? 'Too early' : 'Too late';
}

function nameShot(yawDeg: number, loft: boolean, short: boolean, defend: boolean) {
  if (defend) return short ? 'Back-foot defence' : 'Forward defence';
  let name: string;
  if (yawDeg < -72) name = short ? 'Cut' : 'Square drive';
  else if (yawDeg < -38) name = short ? 'Back-foot punch' : 'Cover drive';
  else if (yawDeg < -10) name = 'Off drive';
  else if (yawDeg <= 10) name = 'Straight drive';
  else if (yawDeg <= 38) name = 'On drive';
  else if (yawDeg <= 72) name = short ? 'Pull' : 'Flick';
  else name = short ? 'Hook' : 'Leg glance';
  return loft && !/Pull|Hook|Cut/.test(name) ? `Lofted ${name.toLowerCase()}` : name;
}

/**
 * Decides what happens when the ball reaches the batter. Timing is the
 * difference between the bat's arrival (press + SWING_DELAY) and the ball's.
 */
export function resolveShot(swing: Swing | null, d: Delivery): ShotResult {
  const p = d.contactP;
  const vin = d.contactV;
  const base: ShotResult = {
    kind: 'leave',
    timingError: 0,
    timing: '',
    quality: 0,
    shotName: '',
    velocity: new Vector3(),
    lift: 0,
  };
  if (!swing) return base;

  const e = swing.pressTime + SWING_DELAY - d.tContact;
  const label = timingLabel(e);
  const absE = Math.abs(e);
  base.timingError = e;
  base.timing = label;

  // Out of reach: too wide, too high or far too early or late.
  const reachable = p.x > -1.15 && p.x < 0.85 && p.y < 1.95;
  if (!reachable || absE > 0.15) return { ...base, kind: 'miss' };

  const short = d.length === 'Short' || d.length === 'Bouncer' || p.y > 0.95;
  const inSpeed = vin.length();

  // Edges: badly timed contact, or a wild swing at a ball well outside off.
  const edgeRisk = absE > 0.1 || (p.x < -0.75 && absE > 0.05 && Math.random() < 0.5);
  if (edgeRisk && !swing.defend) {
    if (e < 0 && p.x > -0.3 && Math.random() < 0.3) {
      return { ...base, kind: 'playedOn', shotName: 'Inside edge onto the stumps' };
    }
    const outside = e > 0 || p.x < -0.3;
    const topEdge = short && p.y > 1.15;
    let yaw: number;
    let pitch: number;
    let speed: number;
    let name: string;
    if (topEdge) {
      yaw = rand(-40, 60) * deg;
      pitch = rand(55, 75) * deg;
      speed = inSpeed * rand(0.45, 0.65);
      name = 'Top edge';
    } else if (outside) {
      yaw = -rand(150, 172) * deg;
      pitch = rand(2, 14) * deg;
      speed = inSpeed * rand(0.5, 0.75);
      name = 'Outside edge';
    } else {
      yaw = rand(150, 175) * deg;
      pitch = rand(-4, 8) * deg;
      speed = inSpeed * rand(0.4, 0.65);
      name = 'Inside edge';
    }
    const v = new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(speed);
    return { ...base, kind: 'edge', quality: 0.2, shotName: name, velocity: v };
  }

  // Clean contact: timing decides quality and pushes the ball leg side (early) or off side (late).
  const quality = absE <= 0.025 ? 1 : absE <= 0.055 ? 0.88 : 0.62;
  let yawDeg = swing.aim * 80 - e * 380 + p.x * -8 + rand(-6, 6) * (1.2 - quality);
  yawDeg = Math.max(-105, Math.min(105, yawDeg));

  let pitchDeg: number;
  let speed: number;
  let lift = 0;
  if (swing.defend) {
    pitchDeg = rand(-8, -2);
    speed = rand(3, 6);
    yawDeg *= 0.4;
  } else if (swing.loft) {
    pitchDeg = quality === 1 ? rand(27, 34) : quality > 0.8 ? rand(30, 40) : rand(40, 56);
    speed = 18 + 19 * quality ** 3 * swing.power + inSpeed * 0.1 * quality;
    lift = 1.0 * quality;
  } else {
    pitchDeg = short ? rand(4, 12) : rand(-6, 2);
    speed = 16 + 14 * quality ** 2 * swing.power + inSpeed * 0.12 * quality;
  }
  // A mistimed attacking shot on a short ball goes up in the air.
  if (!swing.defend && quality < 0.7 && short) pitchDeg = Math.max(pitchDeg, rand(25, 45));

  const yaw = yawDeg * deg;
  const pitch = pitchDeg * deg;
  const v = new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(speed);
  return {
    ...base,
    kind: 'hit',
    quality,
    shotName: nameShot(yawDeg, swing.loft, short, swing.defend),
    velocity: v,
    lift,
  };
}
