import * as THREE from 'three';
import { SWING_DELAY } from '../game/batting';

type Pose = { pos: THREE.Vector3; rot: THREE.Quaternion };

/** The kind of stroke, which decides the bat's path, footwork and follow-through. */
export type StrokeStyle = 'drive' | 'loft' | 'cut' | 'pull' | 'defend';

const P = (x: number, y: number, z: number, rx: number, ry: number, rz: number): Pose => ({
  pos: new THREE.Vector3(x, y, z),
  rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
});

// Hand positions and bat angles (bat hangs along local -y from the hands).
const STANCE = P(0.05, 0.92, 1.05, 0.35, 0.2, 0.1);
const BACKLIFT = P(0.26, 1.32, 0.66, 2.55, 0.45, 0.45);

/** A keyframe: hand position and the direction from the hands to the toe of the bat. */
type Key = [x: number, y: number, z: number, dx: number, dy: number, dz: number];

/**
 * Stroke paths. `down` runs from the backlift to contact (over SWING_DELAY);
 * `through` runs from contact to the finish (over FOLLOW_TIME).
 */
const STROKES: Record<StrokeStyle, { down: Key[]; through: Key[]; step: [number, number, number] }> = {
  drive: {
    down: [
      [0.16, 1.14, 0.92, 0.06, -0.15, -1],
      [0.02, 0.92, 1.3, 0.02, -0.9, -0.45],
      [-0.03, 0.86, 1.48, 0, -0.98, -0.1],
    ],
    through: [
      [-0.06, 1.0, 1.62, 0, -0.35, 0.95],
      [-0.02, 1.38, 1.52, 0.1, 0.55, 0.85],
      [0.18, 1.6, 1.2, 0.35, 0.8, -0.45],
    ],
    step: [0.04, -0.09, 0.32],
  },
  loft: {
    down: [
      [0.17, 1.18, 0.9, 0.06, -0.1, -1],
      [0.03, 0.9, 1.28, 0.02, -0.92, -0.38],
      [-0.03, 0.82, 1.46, 0, -0.97, 0.15],
    ],
    through: [
      [-0.04, 1.08, 1.62, 0, 0.0, 1],
      [0.0, 1.55, 1.45, 0.1, 0.75, 0.65],
      [0.2, 1.78, 1.05, 0.35, 0.85, -0.4],
    ],
    step: [0.05, -0.1, 0.38],
  },
  cut: {
    down: [
      [0.04, 1.4, 0.92, -0.45, 0.7, -0.55],
      [-0.2, 1.2, 1.1, -0.85, 0.15, -0.5],
      [-0.34, 1.05, 1.18, -0.96, -0.2, 0.15],
    ],
    through: [
      [-0.45, 1.0, 1.02, -0.6, -0.1, -0.8],
      [-0.42, 1.12, 0.86, -0.1, 0.25, -0.96],
      [-0.28, 1.3, 0.8, 0.1, 0.75, -0.65],
    ],
    step: [-0.16, -0.02, -0.12],
  },
  pull: {
    down: [
      [0.02, 1.48, 0.9, -0.5, 0.55, -0.68],
      [0.14, 1.3, 1.12, -0.85, 0.05, 0.25],
      [0.24, 1.24, 1.2, -0.75, -0.1, 0.65],
    ],
    through: [
      [0.34, 1.26, 1.1, 0.4, -0.05, 0.92],
      [0.4, 1.32, 0.92, 0.92, 0.1, 0.1],
      [0.3, 1.48, 0.72, 0.45, 0.55, -0.7],
    ],
    step: [0.12, 0.02, -0.16],
  },
  defend: {
    down: [
      [0.08, 1.04, 1.12, 0.03, -0.55, -0.83],
      [0.0, 0.9, 1.34, 0.01, -0.92, -0.38],
      [-0.02, 0.88, 1.4, 0, -0.97, -0.25],
    ],
    // Soft hands: the bat gives a little on impact and is held.
    through: [
      [-0.01, 0.87, 1.36, 0, -0.96, -0.28],
      [0.0, 0.88, 1.34, 0, -0.96, -0.3],
      [0.0, 0.9, 1.32, 0, -0.95, -0.32],
    ],
    step: [0.02, -0.07, 0.24],
  },
};

const FOLLOW_TIME = 0.42;
/** Seconds after contact before the bat returns to following the player's hands. */
const RECOVER = 0.75;
/** Pivot the aim rotates strokes around: roughly the batter's front hip. */
const AIM_PIVOT = new THREE.Vector3(0.05, 0, 0.75);

/** Picks the stroke for an aim, loft and the length of the ball being faced. */
export function strokeStyle(aim: number, loft: boolean, defend: boolean, short: boolean): StrokeStyle {
  if (defend) return 'defend';
  if (short && aim > 0.3) return 'pull';
  if (short && aim < -0.3) return 'cut';
  return loft ? 'loft' : 'drive';
}

/**
 * The batter's bat and gloves in world space. In webcam mode the bat follows
 * the player's tracked wrists; a detected swing plays a real stroke shape so
 * the bat meets the ball exactly when the game says it does.
 */
export class Bat {
  pivot = new THREE.Group();
  /** Live hand pose from webcam tracking (null when not tracking). */
  tracked: Pose | null = null;
  /** Footwork: how far the batter's body (and the POV camera) has moved for this stroke. */
  stride = new THREE.Vector3();
  private swingStart = -1;
  private aimYaw = 0;
  private style: StrokeStyle = 'drive';
  private readyAmt = 0;
  private shown: Pose = { pos: STANCE.pos.clone(), rot: STANCE.rot.clone() };
  private strokeCache = new Map<string, { down: Pose[]; through: Pose[] }>();

  constructor(scene: THREE.Scene, gloveColor = 0x0f7a3d) {
    const willow = new THREE.MeshPhysicalMaterial({ map: willowTexture(), roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.5 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xe2c78e, roughness: 0.55 });
    const grip = new THREE.MeshStandardMaterial({ map: gripTexture(), roughness: 0.85 });
    const gloveWhite = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f0, roughness: 0.65, sheen: 0.4, sheenColor: new THREE.Color(0xffffff) });
    const glovePad = new THREE.MeshStandardMaterial({ color: gloveColor, roughness: 0.5 });

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.3, 16), grip);
    handle.position.y = -0.1;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), grip);
    knob.position.y = 0.05;

    // Blade: sloping shoulders, a rounded toe, and a raised spine on the back.
    const outline = new THREE.Shape();
    const hw = 0.054;
    outline.moveTo(-0.018, 0);
    outline.lineTo(0.018, 0);
    outline.quadraticCurveTo(hw, -0.015, hw, -0.06);
    outline.lineTo(hw, -0.53);
    outline.quadraticCurveTo(hw, -0.56, hw - 0.012, -0.565);
    outline.lineTo(-hw + 0.012, -0.565);
    outline.quadraticCurveTo(-hw, -0.56, -hw, -0.53);
    outline.lineTo(-hw, -0.06);
    outline.quadraticCurveTo(-hw, -0.015, -0.018, 0);
    const bladeGeo = new THREE.ExtrudeGeometry(outline, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 3, curveSegments: 8 });
    // Map the face UVs onto the willow texture (x across, y along the blade).
    const uv = bladeGeo.attributes.uv as THREE.BufferAttribute;
    const pos = bladeGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + hw) / (hw * 2), 1 + pos.getY(i) / 0.565);
    const blade = new THREE.Mesh(bladeGeo, [willow, edgeMat]);
    blade.position.set(0, -0.25, 0.002);
    const spine = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI), edgeMat);
    spine.scale.set(0.038, 0.26, 0.03);
    spine.rotation.y = Math.PI;
    spine.position.set(0, -0.56, 0.0);
    for (const m of [handle, knob, blade, spine]) {
      m.castShadow = true;
      this.pivot.add(m);
    }

    // Two batting gloves on the handle: padded backs and finger rolls.
    for (const [y, flip] of [[0.02, 1], [-0.12, -1]] as const) {
      const g = new THREE.Group();
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.085), gloveWhite);
      const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.05, 4, 10), glovePad);
      back.rotation.z = Math.PI / 2;
      back.scale.set(1, 1, 0.7);
      back.position.z = -0.05 * flip;
      g.add(palm, back);
      for (let i = 0; i < 4; i++) {
        const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.055, 4, 8), gloveWhite);
        finger.rotation.z = Math.PI / 2;
        finger.position.set(0, 0.036 - i * 0.024, 0.048 * flip);
        g.add(finger);
      }
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.045, 4, 8), gloveWhite);
      thumb.position.set(0.045 * flip, -0.01, 0.035 * flip);
      thumb.rotation.x = 0.5 * flip;
      g.add(thumb);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.05, 14), glovePad);
      cuff.position.y = y > 0 ? 0.07 : -0.07;
      g.add(cuff);
      g.position.y = y;
      g.traverse((o) => (o.castShadow = true));
      this.pivot.add(g);
    }

    scene.add(this.pivot);
    this.apply(STANCE);
  }

  get swinging() {
    return this.swingStart >= 0;
  }

  /** The stroke being played (for the batter's body in the TV view). */
  get stroke() {
    return this.swinging ? this.style : null;
  }

  /** `t` is the delivery clock. Starts the downswing; contact happens SWING_DELAY later. */
  swing(t: number, aim: number, loft: boolean, defend: boolean, style?: StrokeStyle) {
    this.swingStart = t;
    this.style = style ?? strokeStyle(aim, loft, defend, false);
    // Pulls and cuts already go square; drives are steered by the aim.
    const steer = this.style === 'pull' || this.style === 'cut' ? 0.25 : this.style === 'defend' ? 0.3 : 0.6;
    this.aimYaw = aim * steer;
  }

  /** 0 = relaxed stance, 1 = backlift as the bowler releases. */
  setReady(amt: number) {
    this.readyAmt = amt;
  }

  reset() {
    this.swingStart = -1;
    this.readyAmt = 0;
    this.stride.set(0, 0, 0);
    this.apply(this.tracked ?? STANCE);
  }

  update(t: number) {
    const rest = this.tracked ?? lerpPose(STANCE, BACKLIFT, ease(this.readyAmt));
    if (this.swingStart < 0) {
      // A small forward press as the bowler lets go.
      this.stride.set(0, -0.015, 0.04).multiplyScalar(ease(this.readyAmt));
      this.follow(rest);
      return;
    }
    const u = t - this.swingStart;
    const s = this.path();
    const step = STROKES[this.style].step;
    let pose: Pose;
    let stepK: number;
    if (u < SWING_DELAY) {
      const from = this.tracked ?? BACKLIFT;
      pose = sampleKeys([from, ...s.down], ease(u / SWING_DELAY));
      stepK = ease(Math.max(0, u + 0.06) / (SWING_DELAY + 0.06));
    } else {
      const k = Math.min(1, (u - SWING_DELAY) / FOLLOW_TIME);
      pose = sampleKeys([s.down[s.down.length - 1], ...s.through], easeOut(k));
      stepK = 1;
    }
    // Ease back to the tracked hands (or the stance) once the stroke is finished.
    const back = (u - SWING_DELAY - RECOVER) / 0.45;
    if (back > 0) {
      pose = lerpPose(pose, this.tracked ?? STANCE, ease(back));
      stepK = 1 - ease(back);
    }
    this.stride.set(step[0], step[1], step[2]).multiplyScalar(stepK);
    pose.pos.add(this.stride);
    this.apply(pose);
  }

  /** Stroke keyframes as poses, rotated towards the aimed direction. */
  private path() {
    const key = `${this.style}:${this.aimYaw.toFixed(3)}`;
    let p = this.strokeCache.get(key);
    if (!p) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.aimYaw);
      const toPose = ([x, y, z, dx, dy, dz]: Key): Pose => {
        const pose = batPose(new THREE.Vector3(x, y, z), new THREE.Vector3(dx, dy, dz));
        pose.pos.sub(AIM_PIVOT).applyQuaternion(q).add(AIM_PIVOT);
        pose.rot.premultiply(q);
        return pose;
      };
      const st = STROKES[this.style];
      p = { down: st.down.map(toPose), through: st.through.map(toPose) };
      if (this.strokeCache.size > 64) this.strokeCache.clear();
      this.strokeCache.set(key, p);
    }
    return p;
  }

  /** Smoothly follows a target pose (hides tracking jitter). */
  private follow(target: Pose) {
    const want = target.pos.clone().add(this.stride);
    this.shown.pos.lerp(want, 0.5);
    this.shown.rot.slerp(target.rot, 0.5);
    this.pivot.position.copy(this.shown.pos);
    this.pivot.quaternion.copy(this.shown.rot);
  }

  private apply(p: Pose) {
    this.shown.pos.copy(p.pos);
    this.shown.rot.copy(p.rot);
    this.pivot.position.copy(p.pos);
    this.pivot.quaternion.copy(p.rot);
  }
}

/**
 * Builds a bat pose from hand position and the direction the bat points
 * (from the hands towards the toe, continuing the line of the forearms).
 */
export function batPose(hands: THREE.Vector3, dir: THREE.Vector3): Pose {
  const y = dir.clone().normalize().negate(); // blade hangs along local -y
  const face = new THREE.Vector3(0, 0, 1); // blade face towards the bowler
  const z = face.sub(y.clone().multiplyScalar(face.dot(y)));
  if (z.lengthSq() < 1e-4) z.set(0, 1, 0).sub(y.clone().multiplyScalar(y.y));
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return { pos: hands.clone(), rot: new THREE.Quaternion().setFromRotationMatrix(m) };
}

export const BAT_STANCE_HANDS = STANCE.pos.clone();

/** Smooth path through poses: Catmull-Rom for the hands, eased slerp for the bat angle. */
function sampleKeys(keys: Pose[], k: number): Pose {
  const n = keys.length - 1;
  const f = Math.min(n - 1e-6, Math.max(0, k * n));
  const i = Math.floor(f);
  const u = f - i;
  const p0 = keys[Math.max(0, i - 1)].pos;
  const p1 = keys[i].pos;
  const p2 = keys[i + 1].pos;
  const p3 = keys[Math.min(n, i + 2)].pos;
  const u2 = u * u;
  const u3 = u2 * u;
  const pos = new THREE.Vector3();
  for (const a of ['x', 'y', 'z'] as const) {
    pos[a] = 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * u + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * u2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * u3);
  }
  return { pos, rot: keys[i].rot.clone().slerp(keys[i + 1].rot, u) };
}

function ease(x: number) {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
}

function easeOut(x: number) {
  const k = Math.min(1, Math.max(0, x));
  return 1 - (1 - k) ** 3;
}

function lerpPose(a: Pose, b: Pose, k: number): Pose {
  return { pos: a.pos.clone().lerp(b.pos, k), rot: a.rot.clone().slerp(b.rot, k) };
}

/** Pale willow with fine vertical grain, a maker's sticker and a team band. */
function willowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 512;
  const g = c.getContext('2d')!;
  const base = g.createLinearGradient(0, 0, 128, 0);
  base.addColorStop(0, '#d9bf86');
  base.addColorStop(0.5, '#efdcae');
  base.addColorStop(1, '#d9bf86');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 26; i++) {
    const x = 8 + Math.random() * 112;
    g.strokeStyle = `rgba(150, 110, 60, ${0.08 + Math.random() * 0.14})`;
    g.lineWidth = 0.6 + Math.random() * 1.2;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= 512; y += 32) g.lineTo(x + Math.sin(y * 0.01 + i) * 1.5, y);
    g.stroke();
  }
  // Maker's sticker on the upper face.
  g.fillStyle = '#0d1b33';
  g.fillRect(14, 70, 100, 150);
  g.fillStyle = '#ffd23f';
  g.fillRect(14, 70, 100, 12);
  g.fillRect(14, 208, 100, 12);
  g.save();
  g.translate(64, 145);
  g.rotate(-Math.PI / 2);
  g.fillStyle = '#ffffff';
  g.font = '800 44px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('ARENA', 0, 0);
  g.restore();
  // Toe guard band.
  g.fillStyle = '#0d1b33';
  g.fillRect(14, 470, 100, 8);
  // Ball marks near the sweet spot.
  g.fillStyle = 'rgba(160, 40, 40, 0.18)';
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.arc(30 + Math.random() * 70, 330 + Math.random() * 90, 3 + Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Spiral rubber grip. */
function gripTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#16181c';
  g.fillRect(0, 0, 64, 128);
  g.strokeStyle = '#c8102e';
  g.lineWidth = 3;
  for (let y = -64; y < 192; y += 14) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(64, y + 32);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
