/**
 * Turns tracked wrist movement into cricket shots. All positions are in a
 * mirrored image (what the player sees) and measured in shoulder-widths, so
 * the thresholds work at any distance from the camera.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Calibration {
  hand: 'R' | 'L';
  /** Shoulder width as a fraction of the image width when standing in position. */
  shoulderW: number;
  /** Nose position (mirrored, normalised) in the batting stance. */
  restNose: Point;
  /** Wrist midpoint (mirrored, normalised) in the batting stance. */
  restHands: Point;
  /** Direction (deg) of the player's natural straight drive: 0 = straight down, negative = towards screen-left. */
  neutralAngle: number;
  /** Peak hand speed (shoulder-widths/s) of a full-power swing. */
  fullSpeed: number;
  /**
   * Seconds from detecting a swing to its fastest point, where the bat meets
   * the ball. Learned from this player's own swings; missing means the default.
   */
  contactLead?: number;
}

/** Starting estimate of contactLead before any swings have been measured. */
export const DEFAULT_CONTACT_LEAD = 0.2;

export const DEFAULT_CALIBRATION: Calibration = {
  hand: 'R',
  shoulderW: 0.2,
  restNose: { x: 0.5, y: 0.3 },
  restHands: { x: 0.5, y: 0.62 },
  neutralAngle: -35,
  fullSpeed: 11,
};

export interface SwingUpdate {
  /** performance.now() seconds of the frame where the swing was detected. */
  t: number;
  /** Time the measured hand speed refers to (between the frames it was taken from). */
  tMid: number;
  aim: number;
  power: number;
  loft: boolean;
  defend: boolean;
  speed: number;
  angle: number;
}

/** Speed (shoulder-widths/s) that starts a swing. */
const START = 3.2;
/** Peak speed that makes it an attacking shot rather than a block. */
const ATTACK = 5.0;
/** Longest wrist drop-out (s) a swing survives. */
const MAX_GAP = 0.15;
/** A new swing can always start this long after the last one ended (s). */
const REARM_MAX = 0.6;
/** Longest a single swing is followed while looking for its fastest point (s). */
const MAX_SWING = 0.5;
/** How long after the start we keep refining power/direction (s). */
const WINDOW = 0.12;

interface Sample {
  t: number;
  p: Point;
}

export class SwingDetector {
  /** Live smoothed hand speed for the power meter (shoulder-widths/s). */
  speed = 0;
  /** Peak speed of the current/last swing. */
  peak = 0;
  onSwingStart: (s: SwingUpdate) => void = () => {};
  onSwingUpdate: (s: SwingUpdate) => void = () => {};
  /** A finished swing: seconds from detection to its fastest point, and that peak speed. */
  onSwingEnd: (lead: number, peak: number) => void = () => {};

  private hist: Sample[] = [];
  private active: { start: number; startMid: number; peakMid: number; topSpeed: number; sum: Point; peak: number; current: SwingUpdate } | null = null;
  private calmSince = 0;
  private endedAt = 0;
  private armed = true;
  /** First fast frame of a possible swing, waiting for a second one to confirm it. */
  private candidate: { t: number; mid: number; v: Point; sp: number } | null = null;
  private lostSince = -1;

  constructor(public calib: Calibration) {}

  reset() {
    this.hist = [];
    this.active = null;
    this.armed = true;
    this.candidate = null;
    this.speed = 0;
  }

  /**
   * Feed one tracked frame. `hands` is the midpoint of both wrists in mirrored
   * normalised coordinates; `aspect` is image width / height; `shoulderW` the
   * live shoulder width (normalised x).
   */
  push(t: number, hands: Point | null, aspect: number, shoulderW: number) {
    if (!hands) {
      // Motion blur hides the wrists for a frame or two in a fast swing: keep the
      // history across short gaps and only forget it after a real loss.
      if (this.lostSince < 0) this.lostSince = t;
      if (t - this.lostSince > MAX_GAP) this.hist = [];
      this.speed *= 0.8;
      return;
    }
    this.lostSince = -1;
    const sw = Math.max(0.04, shoulderW || this.calib.shoulderW);
    // Same units on both axes: shoulder-widths.
    const p = { x: hands.x / sw, y: hands.y / (sw * aspect) };
    this.hist.push({ t, p });
    while (this.hist.length > 2 && t - this.hist[0].t > 0.1 + MAX_GAP) this.hist.shift();
    if (this.hist.length < 2) return;

    // Velocity across the last ~2 frames.
    const a = this.hist[Math.max(0, this.hist.length - 3)];
    const dt = Math.max(1 / 120, t - a.t);
    const v = { x: (p.x - a.p.x) / dt, y: (p.y - a.p.y) / dt };
    const sp = Math.hypot(v.x, v.y);
    const mid = (t + a.t) / 2;
    this.speed = sp > this.speed ? sp : this.speed * 0.85 + sp * 0.15;

    if (this.active) {
      const s = this.active;
      if (sp > s.topSpeed) {
        s.topSpeed = sp;
        s.peakMid = mid;
      }
      if (t - s.start <= WINDOW) {
        s.sum.x += v.x;
        s.sum.y += v.y;
        s.peak = Math.max(s.peak, sp);
        s.current = this.describe(s.start, mid, s.sum, s.peak);
        this.peak = s.peak;
        this.onSwingUpdate(s.current);
      }
      // Keep watching past the refine window until the hands slow down, to find the fastest point.
      const age = t - s.start;
      if (age > MAX_SWING || (age > WINDOW && sp < s.topSpeed * 0.5)) {
        this.active = null;
        this.armed = false;
        this.calmSince = t;
        this.endedAt = t;
        this.onSwingEnd(s.peakMid - s.startMid, s.topSpeed);
      }
      return;
    }

    // Re-arm once the hands have settled after a swing.
    if (!this.armed) {
      if (sp > 1.2) this.calmSince = t;
      // Settled hands, or enough time for the next stroke even if they keep moving.
      if (t - this.calmSince > 0.35 || t - this.endedAt > REARM_MAX) this.armed = true;
      return;
    }

    // A rising movement (backlift) needs to be much faster to count as a swing.
    const upward = v.y < -0.5 * sp;
    if (sp <= (upward ? ATTACK * 1.3 : START)) {
      this.candidate = null;
      return;
    }
    // Tracking glitches jump the hands for one frame; a real swing stays fast.
    const c = this.candidate;
    if (!c) {
      this.candidate = { t, mid, v, sp };
      return;
    }
    this.candidate = null;
    // A jump to a new spot looks fast across two frames too, but then stops dead:
    // the latest single step must still be moving fast the same way.
    const prev = this.hist[this.hist.length - 2];
    const dt1 = Math.max(1 / 120, t - prev.t);
    const v1 = { x: (p.x - prev.p.x) / dt1, y: (p.y - prev.p.y) / dt1 };
    if (Math.hypot(v1.x, v1.y) < START * 0.6 || v1.x * c.v.x + v1.y * c.v.y <= 0) return;
    // Timed from the first fast frame, where the swing really began.
    const sum = { x: c.v.x + v.x, y: c.v.y + v.y };
    const peak = Math.max(c.sp, sp);
    this.active = {
      start: c.t,
      startMid: c.mid,
      peakMid: sp > c.sp ? mid : c.mid,
      topSpeed: peak,
      sum,
      peak,
      current: this.describe(c.t, c.mid, sum, peak),
    };
    this.peak = peak;
    this.onSwingStart(this.active.current);
  }

  private describe(t: number, tMid: number, dir: Point, peak: number): SwingUpdate {
    // Fold upward swings onto downward ones so lofted shots aim the same way.
    const angle = (Math.atan2(dir.x, Math.abs(dir.y)) * 180) / Math.PI;
    const c = this.calib;
    // Relative to the player's natural straight drive; more "across" = leg side.
    const delta = wrapDeg(angle - c.neutralAngle);
    const toLeg = c.hand === 'R' ? -delta : delta;
    const aim = Math.max(-1, Math.min(1, toLeg / 50));
    const defend = peak < ATTACK;
    const power = Math.max(0.2, Math.min(1, (peak - ATTACK * 0.6) / (c.fullSpeed - ATTACK * 0.6)));
    const upwards = dir.y < -0.35 * Math.hypot(dir.x, dir.y);
    return { t, tMid, aim, power, loft: upwards && !defend, defend, speed: peak, angle };
  }
}

function wrapDeg(d: number) {
  let x = d;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}
