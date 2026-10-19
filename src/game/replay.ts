import * as THREE from 'three';

const MAX_FRAMES = 60 * 14;

interface Frame {
  t: number;
  /** position xyz + quaternion xyzw for every tracked node. */
  data: Float32Array;
  visible: Uint8Array;
}

/**
 * Records the transforms of everything that moves during a delivery (players,
 * limbs, ball, bat, stumps and bails) so it can be played back in slow motion
 * from other camera angles, like a TV replay. Nothing is re-simulated.
 */
export class Recorder {
  private nodes: THREE.Object3D[] = [];
  private frames: Frame[] = [];
  private marks = new Map<string, number>();
  private t = 0;

  /** Starts a new clip of the given objects (and all their children). */
  begin(roots: THREE.Object3D[]) {
    this.nodes = [];
    for (const r of roots) r.traverse((o) => this.nodes.push(o));
    this.frames = [];
    this.marks.clear();
    this.t = 0;
  }

  capture(dt: number) {
    if (!this.nodes.length || this.frames.length >= MAX_FRAMES) return;
    this.t += dt;
    // ~50 frames a second is plenty for slow motion with interpolation.
    const last = this.frames[this.frames.length - 1];
    if (last && this.t - last.t < 0.02) return;
    const n = this.nodes.length;
    const data = new Float32Array(n * 7);
    const visible = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const o = this.nodes[i];
      o.position.toArray(data, i * 7);
      o.quaternion.toArray(data, i * 7 + 3);
      visible[i] = o.visible ? 1 : 0;
    }
    this.frames.push({ t: this.t, data, visible });
  }

  /** Remembers the current clip time under a name (e.g. 'release', 'event'). */
  mark(name: string) {
    if (!this.marks.has(name)) this.marks.set(name, this.t);
  }

  markAt(name: string) {
    return this.marks.get(name);
  }

  get duration() {
    return this.t;
  }

  get hasClip() {
    return this.frames.length > 10;
  }

  /** Poses the scene as it was at clip time `t` (interpolated). */
  apply(t: number, forceVisible: Set<THREE.Object3D>) {
    const f = this.frames;
    if (!f.length) return;
    let i = f.findIndex((fr) => fr.t >= t);
    if (i < 0) i = f.length - 1;
    const b = f[i];
    const a = f[Math.max(0, i - 1)];
    const u = b.t === a.t ? 1 : THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1);
    const qa = new THREE.Quaternion();
    const qb = new THREE.Quaternion();
    for (let k = 0; k < this.nodes.length; k++) {
      const o = this.nodes[k];
      const j = k * 7;
      o.position.set(
        a.data[j] + (b.data[j] - a.data[j]) * u,
        a.data[j + 1] + (b.data[j + 1] - a.data[j + 1]) * u,
        a.data[j + 2] + (b.data[j + 2] - a.data[j + 2]) * u,
      );
      qa.fromArray(a.data, j + 3);
      qb.fromArray(b.data, j + 3);
      o.quaternion.slerpQuaternions(qa, qb, u);
      o.visible = forceVisible.has(o) || (u < 0.5 ? a.visible[k] : b.visible[k]) === 1;
    }
  }

  /** Puts everything back as it was at the end of the clip. */
  restoreEnd() {
    this.apply(this.t + 1, new Set());
  }
}

export type ReplayKind = 'six' | 'four' | 'wicket' | 'review';

export interface Shot {
  /** Clip time to start and end this angle. */
  from: number;
  to: number;
  /** Seconds of clip per real second (0.4 = slow motion). */
  speed: number;
  /** Camera placement for clip time t, given where the ball is. */
  cam: (t: number, ball: THREE.Vector3, camera: THREE.PerspectiveCamera) => void;
  label: string;
}

/**
 * Picks the TV angles for a replay: side-on of the shot or dismissal,
 * the end-on stump view, and a high follow for big hits.
 */
export function replayShots(kind: ReplayKind, rec: Recorder): Shot[] {
  const release = rec.markAt('release') ?? 0;
  const event = rec.markAt('event') ?? rec.duration;
  const contact = rec.markAt('contact') ?? release + 0.6;
  const start = Math.max(0, release - 0.6);
  const look = (camera: THREE.PerspectiveCamera, x: number, y: number, z: number, fov: number) => {
    camera.fov = fov;
    camera.lookAt(x, y, z);
    camera.updateProjectionMatrix();
  };

  const sideOn: Shot = {
    from: start,
    to: Math.min(event + 0.3, contact + 1.3),
    speed: 0.4,
    label: 'Side-on · slow motion',
    cam: (_t, ball, c) => {
      c.position.set(-26, 2.4, 4.5);
      look(c, THREE.MathUtils.clamp(ball.x, -2, 2) * 0.3, 1.0, THREE.MathUtils.clamp(ball.z, 0, 12) * 0.35 + 1.5, 16);
    },
  };
  const stumpCam: Shot = {
    from: Math.max(start, contact - 0.9),
    to: Math.min(event + 0.4, contact + 0.9),
    speed: 0.3,
    label: 'Stump cam',
    cam: (_t, ball, c) => {
      c.position.set(0.05, 0.35, -1.1);
      look(c, ball.x * 0.4, Math.max(0.6, ball.y * 0.5), Math.max(4, ball.z), 48);
    },
  };
  const behind: Shot = {
    from: start,
    to: Math.min(event + 0.5, contact + 1.0),
    speed: 0.45,
    label: "Bowler's end",
    cam: (_t, _ball, c) => {
      c.position.set(0.3, 3.2, 34);
      look(c, 0, 0.9, 1.2, 9);
    },
  };
  const follow: Shot = {
    from: Math.max(start, contact - 0.3),
    to: event + 0.8,
    speed: 0.6,
    label: 'Aerial',
    cam: (_t, ball, c) => {
      c.position.set(ball.x * 0.6 + 18, 26 + ball.y * 0.4, ball.z * 0.6 - 26);
      look(c, ball.x, ball.y * 0.8, ball.z, 34);
    },
  };

  switch (kind) {
    case 'six':
    case 'four':
      return [sideOn, follow];
    case 'wicket':
      return [behind, sideOn, stumpCam];
    case 'review':
      return [sideOn, stumpCam];
  }
}
