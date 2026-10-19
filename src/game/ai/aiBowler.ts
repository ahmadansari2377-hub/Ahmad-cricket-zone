import { Vector3 } from 'three';
import type { BowlType, Player } from '../../data/teams';
import { BALL_R, CONTACT_Z, G, PITCH_LEN, POPPING, STUMP_H, STUMP_HALF_SPREAD, WIDE_LINE } from '../constants';
import { Sample, SIM_DT, simulate } from '../physics';

export type Length = 'Yorker' | 'Full' | 'Good length' | 'Short' | 'Bouncer';

export interface Delivery {
  bowler: Player;
  type: BowlType;
  length: Length;
  variation: string;
  speedKmh: number;
  release: Vector3;
  path: Sample[];
  /** Time (s after release) when the ball reaches the batting contact zone. */
  tContact: number;
  contactP: Vector3;
  contactV: Vector3;
  bounceAt: Vector3;
  /** Ball position as it passes the batter's popping crease. */
  atCrease: Vector3;
  hitsStumps: boolean;
  tStumps: number;
  isWide: boolean;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function pick<T>(items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[0][0];
}

/** Bounce distance (m from the batter's stumps) for each length. */
const PACE_LENGTHS: Record<Length, [number, number]> = {
  Yorker: [0.9, 1.7],
  Full: [2.4, 4],
  'Good length': [4.5, 7],
  Short: [7.5, 9],
  Bouncer: [9.5, 11.5],
};
const SPIN_LENGTHS: Record<Length, [number, number]> = {
  Yorker: [1, 1.8],
  Full: [2, 3.3],
  'Good length': [3.3, 5.2],
  Short: [5.5, 7],
  Bouncer: [5.5, 7],
};

/** Initial velocity that lands on `aim` from `from` at `speed`, ignoring drag. */
function launch(from: Vector3, aim: Vector3, speed: number) {
  const dx = aim.x - from.x;
  const dz = aim.z - from.z;
  const d = Math.hypot(dx, dz);
  const h = from.y - BALL_R;
  let vh = speed;
  let vy = 0;
  for (let i = 0; i < 5; i++) {
    const t = d / vh;
    vy = (-h + 0.5 * G * t * t) / t;
    vh = Math.sqrt(Math.max(1, speed * speed - vy * vy));
  }
  return new Vector3((dx / d) * vh, vy, (dz / d) * vh);
}

export type Variation = 'stock' | 'inswing' | 'outswing' | 'slower' | 'other';

/** A human bowler's choices: where to land the ball and which variation. */
export interface BowlControl {
  /** Bounce point x (m): negative = off side of a right-hander. */
  line: number;
  /** Bounce distance from the batter's stumps (m). */
  length: number;
  variation: Variation;
}

export function lengthName(z: number, spin: boolean): Length {
  const table = spin ? SPIN_LENGTHS : PACE_LENGTHS;
  for (const name of ['Yorker', 'Full', 'Good length', 'Short'] as Length[]) if (z <= table[name][1]) return name;
  return spin ? 'Short' : 'Bouncer';
}

/** `pace` scales the bowler's speed (difficulty). */
export function planDelivery(bowler: Player, control?: BowlControl, pace = 1): Delivery {
  const type = bowler.bowl ?? 'fastMedium';
  const skill = (bowler.bowling ?? 60) / 100;
  const spin = type === 'offspin' || type === 'legspin';
  const scatter = (1 - skill) * 0.8;

  let length: Length;
  let bounceZ: number;
  let lineX: number;
  if (control) {
    // Even a human-aimed ball lands a little off target, less so for skilled bowlers.
    bounceZ = Math.max(0.4, control.length + rand(-scatter, scatter) * 0.7);
    lineX = control.line + rand(-scatter, scatter) * 0.3;
    length = lengthName(bounceZ, spin);
  } else {
    length = pick<Length>(
      spin
        ? [['Yorker', 0.06], ['Full', 0.32], ['Good length', 0.5], ['Short', 0.12]]
        : [['Yorker', 0.14], ['Full', 0.24], ['Good length', 0.36], ['Short', 0.16], ['Bouncer', 0.1]],
    );
    const [l0, l1] = (spin ? SPIN_LENGTHS : PACE_LENGTHS)[length];
    bounceZ = rand(l0, l1) + rand(-scatter, scatter);
    // Line at the bounce point: around off stump, with the odd wide from weaker bowlers.
    const wideBall = Math.random() < 0.05 * (1.4 - skill);
    lineX = rand(-0.5, 0.1) + rand(-scatter, scatter) * 0.4;
    if (wideBall) lineX = Math.random() < 0.7 ? rand(-1.35, -1.05) : rand(1.0, 1.25);
  }

  let speedKmh = 0;
  let swing = 0;
  let turn = 0;
  let bounceBoost = 1;
  let variation = '';
  switch (type) {
    case 'fast':
      speedKmh = rand(136, 151);
      break;
    case 'fastMedium':
      speedKmh = rand(126, 140);
      break;
    case 'offspin':
      speedKmh = rand(82, 94);
      break;
    case 'legspin':
      speedKmh = rand(80, 92);
      break;
  }

  speedKmh *= pace;

  // A human's chosen variation replaces the random roll.
  const roll = (): number => {
    if (!control) return Math.random();
    const v = control.variation;
    if (spin) return v === 'other' ? 0.05 : v === 'slower' ? 0.2 : 0.9;
    return v === 'inswing' ? 0.1 : v === 'outswing' ? 0.4 : v === 'slower' ? 0.6 : 0.95;
  };

  if (!spin) {
    const r = roll();
    if (r < 0.28) {
      swing = rand(0.8, 1.8);
      variation = 'Inswinger';
    } else if (r < 0.56) {
      swing = -rand(0.8, 1.8);
      variation = 'Outswinger';
    } else if (r < 0.68 && (control || length !== 'Bouncer')) {
      speedKmh -= rand(22, 32);
      variation = 'Slower ball';
    }
    turn = rand(-0.35, 0.35); // seam movement off the pitch
  } else {
    const r = roll();
    const stock = type === 'offspin' ? 1 : -1;
    if (r < 0.15) {
      turn = -stock * rand(0.3, 0.8);
      variation = type === 'offspin' ? 'Carrom ball' : 'Googly';
    } else if (r < 0.25) {
      turn = rand(-0.1, 0.1);
      speedKmh += 8;
      variation = type === 'offspin' ? 'Arm ball' : 'Flipper';
    } else {
      turn = stock * rand(0.6, 1.6);
    }
    swing = -Math.sign(turn) * rand(0.1, 0.35); // drift against the turn
    bounceBoost = rand(1, 1.15);
  }

  // Right-arm over the wicket: released from just off the bowler's stumps.
  const release = new Vector3(spin ? -0.35 : -0.42, spin ? 2.0 : 2.22, PITCH_LEN - 0.9);
  const speed = speedKmh / 3.6;
  const target = new Vector3(lineX, BALL_R, bounceZ);

  // Shooting method: correct the aim until drag and swing put the ball on target.
  const aim = target.clone();
  let v0 = launch(release, aim, speed);
  for (let i = 0; i < 6; i++) {
    const first = simulate(release, v0, { swing, untilFirstBounce: true, maxT: 3 });
    const land = first[first.length - 1].p;
    aim.x += target.x - land.x;
    aim.z += target.z - land.z;
    v0 = launch(release, aim, speed);
  }

  const path = simulate(release, v0, { swing, turn, bounceBoost, maxT: 4, stopBehindZ: -18 });

  let bounceAt = target.clone();
  let contactIdx = -1;
  let creaseIdx = -1;
  let tStumps = -1;
  let hitsStumps = false;
  for (let i = 1; i < path.length; i++) {
    const s = path[i];
    if (s.bounces === 1 && path[i - 1].bounces === 0) bounceAt = s.p.clone();
    if (contactIdx < 0 && s.p.z <= CONTACT_Z) contactIdx = i;
    if (creaseIdx < 0 && s.p.z <= POPPING) creaseIdx = i;
    if (tStumps < 0 && s.p.z <= 0) {
      tStumps = s.t;
      hitsStumps = Math.abs(s.p.x) < STUMP_HALF_SPREAD + BALL_R && s.p.y < STUMP_H + BALL_R;
    }
  }
  if (contactIdx < 0) contactIdx = path.length - 1;
  if (creaseIdx < 0) creaseIdx = path.length - 1;
  const atCrease = path[creaseIdx].p.clone();
  const isWide =
    !hitsStumps && (atCrease.x < -WIDE_LINE - 0.12 || atCrease.x > WIDE_LINE + 0.12 || atCrease.y > 2.0);

  return {
    bowler,
    type,
    length,
    variation,
    speedKmh,
    release,
    path,
    tContact: contactIdx * SIM_DT,
    contactP: path[contactIdx].p.clone(),
    contactV: path[contactIdx].v.clone(),
    bounceAt,
    atCrease,
    hitsStumps,
    tStumps,
    isWide,
  };
}
