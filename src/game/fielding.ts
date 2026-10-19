import * as THREE from 'three';
import type { Team } from '../data/teams';
import { Humanoid } from '../scene/players';
import { FIELD_CENTER_Z, PITCH_LEN } from './constants';
import { beyondRope, boundaryRatio, groundY } from './groundState';
import type { Sample } from './physics';

export type FieldRole = 'keeper' | 'slip' | 'thirdMan' | 'point' | 'cover' | 'midOff' | 'midOn' | 'midwicket' | 'squareLeg' | 'fineLeg' | 'bowler';

export interface Fielder {
  role: FieldRole;
  name: string;
  body: Humanoid;
  home: THREE.Vector3;
  pos: THREE.Vector3;
  runPhase: number;
}

export interface FieldEvent {
  kind: 'caught' | 'dropped' | 'fielded' | 'four' | 'six';
  t: number;
  point: THREE.Vector3;
  fielder?: Fielder;
  runs: number;
}

const PACE_FIELD: Record<Exclude<FieldRole, 'bowler'>, [number, number]> = {
  keeper: [0.3, -13],
  slip: [-1.5, -13.6],
  thirdMan: [-30, -48],
  point: [-28, 2],
  cover: [-26, 17],
  midOff: [-11, 38],
  midOn: [11, 38],
  midwicket: [27, 16],
  squareLeg: [29, 0],
  fineLeg: [28, -46],
};
const SPIN_FIELD: Record<Exclude<FieldRole, 'bowler'>, [number, number]> = {
  keeper: [0.25, -1.2],
  slip: [-1.0, -1.9],
  thirdMan: [-36, -40],
  point: [-24, 3],
  cover: [-24, 18],
  midOff: [-14, 33],
  midOn: [14, 33],
  midwicket: [44, 34],
  squareLeg: [24, -2],
  fineLeg: [30, -44],
};

const RUN_SPEED = 7.2;
/** Metres ring fielders walk in during the run-up. */
const WALK_IN = 2.6;

export class Fielding {
  fielders: Fielder[] = [];

  constructor(scene: THREE.Scene, team: Team, bowlerName: string) {
    const roles = Object.keys(PACE_FIELD) as Exclude<FieldRole, 'bowler'>[];
    const names = team.players.map((p) => p.name).filter((n) => n !== bowlerName);
    const keeperName = team.players.find((p) => p.keeper)?.name ?? names[0];
    let k = 0;
    for (const role of roles) {
      const isKeeper = role === 'keeper';
      const name = isKeeper ? keeperName : names.filter((n) => n !== keeperName)[k++] ?? 'Sub fielder';
      const body = new Humanoid({
        shirt: team.shirt,
        trousers: team.trousers,
        trim: team.trim,
        head: isKeeper ? 'helmet' : 'cap',
        headColor: team.helmet,
        pads: isKeeper,
        gloves: isKeeper,
        name,
      });
      body.smooth = true;
      scene.add(body.group);
      this.fielders.push({ role, name, body, home: new THREE.Vector3(), pos: new THREE.Vector3(), runPhase: 0 });
    }
  }

  setField(spin: boolean, bowler: Fielder | null) {
    const layout = spin ? SPIN_FIELD : PACE_FIELD;
    for (const f of this.fielders) {
      if (f.role === 'bowler') continue;
      const [x, z] = layout[f.role as Exclude<FieldRole, 'bowler'>];
      f.home.set(x, 0, z);
      // Deep fielders stand just inside this ground's rope.
      const r = boundaryRatio(f.home);
      if (r > 0.92) {
        const k = 0.92 / r;
        f.home.set(x * k, 0, FIELD_CENTER_Z + (z - FIELD_CENTER_Z) * k);
      }
      f.pos.copy(f.home);
    }
    if (bowler && !this.fielders.includes(bowler)) this.fielders.push(bowler);
    this.resetPoses();
  }

  /** Ring fielders start a few paces back and walk in as the bowler runs up. */
  private walkStart(f: Fielder) {
    if (f.role === 'keeper' || f.role === 'slip') return f.home.clone();
    const out = new THREE.Vector3(f.home.x, 0, f.home.z - 0.5).normalize();
    return f.home.clone().addScaledVector(out, WALK_IN);
  }

  resetPoses() {
    for (const f of this.fielders) {
      if (f.role === 'bowler') continue;
      f.pos.copy(this.walkStart(f));
      f.body.group.position.set(f.pos.x, groundY(f.pos.x), f.pos.z);
      f.body.group.lookAt(0, f.body.group.position.y, 1);
      f.body.reset();
    }
  }

  /** Walking in with the bowler: `u` runs 0 to 1 and they arrive just before the release. */
  walkIn(u: number) {
    const k = Math.min(1, Math.max(0, u));
    for (const f of this.fielders) {
      if (f.role === 'bowler' || f.role === 'keeper' || f.role === 'slip') continue;
      const start = this.walkStart(f);
      const next = start.lerp(f.home, k * k * (3 - 2 * k));
      const step = next.distanceTo(f.pos);
      f.pos.copy(next);
      f.body.group.position.set(f.pos.x, groundY(f.pos.x), f.pos.z);
      if (k < 1) {
        f.runPhase += step * 4.2;
        f.body.run(f.runPhase, 0.3);
      }
    }
  }

  /** Everyone in the field follows the ball with their eyes. */
  watch(ball: THREE.Vector3, time: number) {
    for (const f of this.fielders) {
      if (f.role === 'bowler') continue;
      f.body.look(ball, time);
    }
  }

  /** Pre-delivery stance: fielders crouch as the bowler releases. */
  ready(amt: number) {
    if (amt <= 0) return;
    for (const f of this.fielders) {
      if (f.role === 'bowler') continue;
      f.body.crouch(f.role === 'keeper' ? amt : f.role === 'slip' ? amt * 0.75 : amt * 0.35);
    }
  }

  /**
   * Walks the ball's pre-simulated path and finds the first thing that happens:
   * a catch, a stop, or the ball reaching the rope.
   */
  computeEvent(path: Sample[]): FieldEvent {
    for (const s of path) {
      if (beyondRope(s.p)) {
        return { kind: s.bounces === 0 ? 'six' : 'four', t: s.t, point: s.p.clone(), runs: s.bounces === 0 ? 6 : 4 };
      }
      for (const f of this.fielders) {
        const close = f.role === 'keeper' || f.role === 'slip';
        const react = close ? 0.05 : f.role === 'bowler' ? 0.2 : 0.32;
        const speed = close ? 3.5 : RUN_SPEED;
        const air = s.bounces === 0;
        const h = s.p.y - groundY(s.p.x);
        const reachBase = air ? (close ? 1.5 : 1.6) : 1.1;
        const reach = reachBase + Math.max(0, s.t - react) * speed;
        const d = Math.hypot(f.home.x - s.p.x, f.home.z - s.p.z);
        if (d > reach) continue;
        if (air && h > 0.12 && h < 2.9) {
          const stretch = Math.min(1, Math.max(0, (d - reachBase * 0.5) / reach));
          const pace = s.v.length() > 28 ? 0.18 : s.v.length() > 20 ? 0.08 : 0;
          const chance = 0.96 - stretch * 0.35 - pace;
          if (Math.random() < chance) return { kind: 'caught', t: s.t, point: s.p.clone(), fielder: f, runs: 0 };
          return this.withRuns({ kind: 'dropped', t: s.t + 1.1, point: s.p.clone().setY(0), fielder: f, runs: 0 });
        }
        if (!air && h < 1.3) {
          return this.withRuns({ kind: 'fielded', t: s.t, point: s.p.clone().setY(0), fielder: f, runs: 0 });
        }
      }
    }
    // Ball stopped in the field: the nearest fielder walks over to it.
    const last = path[path.length - 1];
    let best = this.fielders[0];
    let bestT = Infinity;
    for (const f of this.fielders) {
      const t = 0.32 + Math.hypot(f.home.x - last.p.x, f.home.z - last.p.z) / RUN_SPEED;
      if (t < bestT) {
        bestT = t;
        best = f;
      }
    }
    return this.withRuns({ kind: 'fielded', t: Math.max(last.t, bestT), point: last.p.clone().setY(0), fielder: best, runs: 0 });
  }

  private withRuns(e: FieldEvent): FieldEvent {
    // Batters complete a first run in ~3.4 s and each extra run in ~3 s.
    const throwDist = Math.min(e.point.distanceTo(new THREE.Vector3(0, 0, 0)), e.point.distanceTo(new THREE.Vector3(0, 0, PITCH_LEN)));
    const T = e.t + 0.55 + throwDist / 30;
    e.runs = T < 3.4 ? 0 : Math.min(3, 1 + Math.floor((T - 3.4) / 3));
    return e;
  }

  /** Animates the involved fielder chasing the ball; others react a few steps. */
  animate(event: FieldEvent | null, t: number, ballPos: THREE.Vector3, dt: number) {
    for (const f of this.fielders) {
      if (f.role === 'bowler') continue;
      let target: THREE.Vector3 | null = null;
      if (event && event.fielder === f) target = t < event.t ? event.point : null;
      else if (event && t > 0.3 && t < event.t) target = f.home.clone().lerp(ballPos, 0.06);
      if (target) {
        const to = new THREE.Vector3(target.x - f.pos.x, 0, target.z - f.pos.z);
        const dist = to.length();
        const close = f.role === 'keeper' || f.role === 'slip';
        const want = event && event.fielder === f && t < event.t ? Math.min(RUN_SPEED, dist / Math.max(0.05, event.t - t)) : 2;
        const step = Math.min(dist, (close ? Math.min(want, 3.5) : want) * dt);
        if (dist > 0.05) {
          f.pos.addScaledVector(to.normalize(), step);
          f.runPhase += step * 2.2;
          f.body.run(f.runPhase, Math.min(1, want / RUN_SPEED + 0.2));
          f.body.group.lookAt(f.pos.x + to.x, f.body.group.position.y, f.pos.z + to.z);
        }
        f.body.group.position.set(f.pos.x, groundY(f.pos.x), f.pos.z);
      }
    }
  }

  dispose(scene: THREE.Scene) {
    for (const f of this.fielders) scene.remove(f.body.group);
  }
}
