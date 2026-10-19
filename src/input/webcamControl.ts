import * as THREE from 'three';
import { Calibration, DEFAULT_CALIBRATION, DEFAULT_CONTACT_LEAD, SwingDetector, SwingUpdate } from './batGesture';
import { LM, PoseFrame, PoseTracker } from './pose';

const STORE_KEY = 'aca.calibration.v1';

export function loadCalibration(): Calibration | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? { ...DEFAULT_CALIBRATION, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

let syncCalibration: ((c: Calibration) => void) | null = null;

/** Lets the account layer upload a new calibration when one is saved. */
export function onCalibrationSaved(fn: (c: Calibration) => void) {
  syncCalibration = fn;
}

export function saveCalibration(c: Calibration, sync = true) {
  if (sync) syncCalibration?.(c);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable (private mode): calibration just isn't remembered */
  }
}

/**
 * Webcam play: swing detection for batting and head tracking for the POV
 * camera. Video is processed on this device only.
 */
export class WebcamControl {
  tracker = new PoseTracker();
  detector: SwingDetector;
  calib: Calibration;
  /** Smoothed head offset (metres) for the POV camera. */
  headOffset = new THREE.Vector3();
  /** Seconds between a real movement and its detection (camera + inference). */
  latency = 0.07;
  enabled = false;
  swingFlash = 0;
  onSwingStart: (u: SwingUpdate) => void = () => {};
  onSwingUpdate: (u: SwingUpdate) => void = () => {};
  onFrame: (f: PoseFrame) => void = () => {};
  /** Listeners used by calibration; they hear every swing, in or out of a match. */
  onAnySwingStart: (u: SwingUpdate) => void = () => {};
  onAnySwingUpdate: (u: SwingUpdate) => void = () => {};
  private headTarget = new THREE.Vector3();
  /** Slow running average of body size in the image, the baseline for detecting a step. */
  private sizeBase = 0;
  private sizeT = 0;

  constructor() {
    this.calib = loadCalibration() ?? { ...DEFAULT_CALIBRATION };
    this.detector = new SwingDetector(this.calib);
    this.detector.onSwingStart = (u) => {
      this.swingFlash = 1;
      this.onAnySwingStart(u);
      if (this.enabled) this.onSwingStart(u);
    };
    this.detector.onSwingUpdate = (u) => {
      this.onAnySwingUpdate(u);
      if (this.enabled) this.onSwingUpdate(u);
    };
    this.detector.onSwingEnd = (lead, peak) => this.learnLead(lead, peak);
    this.tracker.onFrame = (f) => {
      this.detector.push(f.t, f.hands, f.aspect, f.shoulderW);
      this.trackHead(f);
      this.trackHands(f);
      this.onFrame(f);
    };
  }

  setCalibration(c: Calibration) {
    // Calibration steps and account copies do not carry the learned swing timing: keep it.
    const next = { ...c, contactLead: c.contactLead ?? this.calib.contactLead };
    this.calib = next;
    this.detector.calib = next;
    this.detector.reset();
    saveCalibration(next);
  }

  /** Seconds from a detected swing to the moment the bat meets the ball, for this player. */
  get contactLead() {
    return this.calib.contactLead ?? DEFAULT_CONTACT_LEAD;
  }

  /**
   * performance.now() seconds when this swing's bat meets the ball: the
   * detection time, moved on by the player's learned lead, minus camera latency.
   */
  contactTime(u: SwingUpdate) {
    return u.tMid + this.contactLead - this.latency;
  }

  /** Each full swing refines the lead (blocks are too gentle to measure). */
  private learnLead(lead: number, peak: number) {
    if (peak < 5 || lead < 0 || lead > 0.45) return;
    const next = this.contactLead + (lead - this.contactLead) * 0.35;
    this.calib = { ...this.calib, contactLead: Math.round(Math.min(0.4, Math.max(0.03, next)) * 1000) / 1000 };
    this.detector.calib = this.calib;
    // Remembered on this device only; not worth an account upload after every ball.
    saveCalibration(this.calib, false);
  }

  /** 0–1 live swing power for the meter. */
  get livePower() {
    return Math.min(1, this.detector.speed / this.calib.fullSpeed);
  }

  get peakPower() {
    return Math.min(1, this.detector.peak / this.calib.fullSpeed);
  }

  /**
   * Hands in world space (relative to the stance position) and the bat's
   * pointing direction, taken from the forearms. Null when wrists aren't seen.
   */
  handsWorld: THREE.Vector3 | null = null;
  batDir = new THREE.Vector3(0, -1, 0.3);
  private handsTarget = new THREE.Vector3();
  private dirTarget = new THREE.Vector3(0, -1, 0.3);
  private handsSeen = 0;

  private trackHands(f: PoseFrame) {
    const lw = f.lm[LM.lWrist];
    const rw = f.lm[LM.rWrist];
    const le = f.lm[LM.lElbow];
    const re = f.lm[LM.rElbow];
    if (!lw || lw.visibility < 0.5 || rw.visibility < 0.5 || !f.shoulderW) {
      this.handsSeen = Math.max(0, this.handsSeen - 1);
      return;
    }
    this.handsSeen = Math.min(10, this.handsSeen + 1);
    const sw = f.shoulderW;
    const hx = (lw.x + rw.x) / 2;
    const hy = (lw.y + rw.y) / 2;
    const r = this.calib.restHands;
    // Image movement to metres (shoulder width ~0.4 m). Mirror view: screen-right is -x in the POV world.
    const dx = ((hx - r.x) / sw) * 0.4;
    const dy = ((hy - r.y) / (sw * f.aspect)) * 0.4;
    this.handsTarget.set(
      THREE.MathUtils.clamp(-dx * 1.1, -0.7, 0.7),
      THREE.MathUtils.clamp(-dy * 1.1, -0.45, 0.9),
      THREE.MathUtils.clamp(dy * 0.3, -0.25, 0.3),
    );
    // Bat continues the line of the forearms (elbow → wrist), turned further
    // by how much the wrists are cocked (wrist → knuckles against the forearm).
    const fx = (lw.x - le.x + rw.x - re.x) / 2;
    const fy = (lw.y - le.y + rw.y - re.y) / 2 / f.aspect;
    const len = Math.hypot(fx, fy);
    if (len > 0.01) {
      let ang = Math.atan2(fy, fx);
      const bend = this.wristBend(f, ang);
      ang += bend * 0.8;
      this.dirTarget.set(-Math.cos(ang), -Math.sin(ang), 0.35).normalize();
    }
  }

  /** Average angle between the hands and the forearms (radians), or 0 if the hands are not seen. */
  private wristBend(f: PoseFrame, forearm: number) {
    let sum = 0;
    let n = 0;
    for (const [w, i, p] of [
      [LM.lWrist, LM.lIndex, LM.lPinky],
      [LM.rWrist, LM.rIndex, LM.rPinky],
    ] as const) {
      const a = f.lm[w];
      const bi = f.lm[i];
      const bp = f.lm[p];
      if (!bi || !bp || bi.visibility < 0.5 || bp.visibility < 0.5) continue;
      const hx = (bi.x + bp.x) / 2 - a.x;
      const hy = ((bi.y + bp.y) / 2 - a.y) / f.aspect;
      if (Math.hypot(hx, hy) < 0.005) continue;
      let d = Math.atan2(hy, hx) - forearm;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      sum += d;
      n++;
    }
    return n ? THREE.MathUtils.clamp(sum / n, -1.0, 1.0) : 0;
  }

  /**
   * Footwork: stepping towards the camera makes your body bigger in the image.
   * Measured against a slow running average, so it adapts to where you stand.
   * Uses the torso (shoulders to hips) when visible because it barely changes
   * as you turn, and the shoulder width otherwise.
   */
  private trackStep(f: PoseFrame) {
    const ls = f.lm[LM.lShoulder];
    const rs = f.lm[LM.rShoulder];
    const lh = f.lm[LM.lHip];
    const rh = f.lm[LM.rHip];
    let size = f.shoulderW;
    if (lh && rh && lh.visibility > 0.6 && rh.visibility > 0.6) {
      size = Math.abs((lh.y + rh.y) / 2 - (ls.y + rs.y) / 2) / f.aspect;
    }
    if (!size) return 0;
    const dt = this.sizeT ? Math.min(0.2, f.t - this.sizeT) : 0;
    this.sizeT = f.t;
    if (!this.sizeBase) this.sizeBase = size;
    this.sizeBase += (size - this.sizeBase) * (1 - Math.exp(-dt / 3));
    const scale = size / this.sizeBase;
    // Roughly 2 m from the camera: 10% bigger is about a 20 cm step forward.
    return THREE.MathUtils.clamp((1 - 1 / scale) * 2.2, -0.35, 0.55);
  }

  private trackHead(f: PoseFrame) {
    const nose = f.lm[LM.nose];
    if (!nose || nose.visibility < 0.5 || !f.shoulderW) return;
    const sw = f.shoulderW;
    // A real shoulder width is ~0.4 m: convert image movement into metres.
    const dx = ((nose.x - this.calib.restNose.x) / sw) * 0.4;
    const dy = ((nose.y - this.calib.restNose.y) / (sw * f.aspect)) * 0.4;
    // Mirror view: moving to screen-left moves the POV camera to screen-left (+x in world).
    this.headTarget.set(THREE.MathUtils.clamp(-dx, -0.6, 0.6), THREE.MathUtils.clamp(-dy, -0.7, 0.2), this.trackStep(f));
  }

  update(dt: number) {
    this.headOffset.lerp(this.headTarget, 1 - Math.exp(-dt * 8));
    if (this.handsSeen >= 3) {
      if (!this.handsWorld) this.handsWorld = this.handsTarget.clone();
      this.handsWorld.lerp(this.handsTarget, 1 - Math.exp(-dt * 18));
      this.batDir.lerp(this.dirTarget, 1 - Math.exp(-dt * 14)).normalize();
    } else if (this.handsSeen === 0) {
      this.handsWorld = null;
    }
    this.swingFlash = Math.max(0, this.swingFlash - dt * 2.5);
  }
}
