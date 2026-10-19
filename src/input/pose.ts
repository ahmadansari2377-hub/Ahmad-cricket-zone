// Types only: the tracking library itself is loaded on demand when the webcam starts,
// so keyboard players never download it.
import type { NormalizedLandmark, PoseLandmarker } from '@mediapipe/tasks-vision';
import { OneEuro } from './oneEuro';

export const LM = {
  nose: 0,
  lEye: 2,
  rEye: 5,
  lShoulder: 11,
  rShoulder: 12,
  lElbow: 13,
  rElbow: 14,
  lWrist: 15,
  rWrist: 16,
  lPinky: 17,
  rPinky: 18,
  lIndex: 19,
  rIndex: 20,
  lHip: 23,
  rHip: 24,
} as const;

export interface PoseFrame {
  /** performance.now() in seconds. */
  t: number;
  /** Mirrored (selfie-view) landmarks, smoothed. */
  lm: NormalizedLandmark[];
  /** Raw (unsmoothed) mirrored wrist midpoint, for fast swing detection. */
  hands: { x: number; y: number } | null;
  shoulderW: number;
  aspect: number;
}

export type Quality = 'lite' | 'full';

/**
 * Webcam + MediaPipe Pose Landmarker. Runs on-device; video frames are never
 * uploaded or stored.
 */
export class PoseTracker {
  video = document.createElement('video');
  latest: PoseFrame | null = null;
  fps = 0;
  brightness = 128;
  onFrame: (f: PoseFrame) => void = () => {};
  private landmarker: PoseLandmarker | null = null;
  private stream: MediaStream | null = null;
  private running = false;
  private filters = new Map<number, [OneEuro, OneEuro]>();
  private frames = 0;
  private fpsT = 0;
  private lightCanvas = document.createElement('canvas');
  private lastVideoTime = -1;
  /** Model in use; the full model drops to lite if the device cannot keep up. */
  quality: Quality = 'lite';
  private makeLandmarker: ((q: Quality) => Promise<PoseLandmarker>) | null = null;
  private startedAt = 0;
  private switching = false;
  /** Half the vector from the left to the right wrist, last time both were seen. */
  private wristGap: { x: number; y: number } | null = null;

  constructor() {
    this.video.playsInline = true;
    this.video.muted = true;
    this.lightCanvas.width = 32;
    this.lightCanvas.height = 24;
  }

  get active() {
    return this.running;
  }

  async start(quality: Quality = 'lite') {
    if (this.running) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 }, facingMode: 'user' },
        audio: false,
      });
    } catch (err) {
      // Some webcams reject any preferences: fall back to whatever they offer.
      if ((err as DOMException).name !== 'OverconstrainedError') throw err;
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    this.video.srcObject = this.stream;
    await this.video.play();

    const base = import.meta.env.BASE_URL;
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);
    const make = (q: Quality, delegate: 'GPU' | 'CPU') =>
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `${base}models/pose_landmarker_${q}.task`, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    this.makeLandmarker = async (q) => {
      try {
        return await make(q, 'GPU');
      } catch {
        return await make(q, 'CPU');
      }
    };
    this.landmarker = await this.makeLandmarker(quality);
    this.quality = quality;
    this.startedAt = performance.now() / 1000;
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.landmarker?.close();
    this.landmarker = null;
    this.latest = null;
  }

  private loop() {
    if (!this.running) return;
    const v = this.video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    const next = () => this.loop();
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => (this.process(), next()));
    else requestAnimationFrame(() => (this.process(), next()));
  }

  private process() {
    if (!this.landmarker || this.video.readyState < 2) return;
    if (this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;
    const nowMs = performance.now();
    const t = nowMs / 1000;
    const res = this.landmarker.detectForVideo(this.video, nowMs);

    this.frames++;
    if (t - this.fpsT >= 1) {
      this.fps = this.frames / (t - this.fpsT);
      this.frames = 0;
      this.fpsT = t;
      this.measureLight();
      // Too slow for good swing timing: switch to the lighter model once.
      if (this.quality === 'full' && !this.switching && t - this.startedAt > 4 && this.fps < 22) void this.downgrade();
    }

    const raw = res.landmarks?.[0];
    const aspect = this.video.videoWidth / Math.max(1, this.video.videoHeight);
    if (!raw) {
      this.latest = { t, lm: [], hands: null, shoulderW: 0, aspect };
      this.onFrame(this.latest);
      return;
    }
    // Mirror so the player sees themselves like in a mirror.
    const mirrored = raw.map((p) => ({ ...p, x: 1 - p.x }));
    const smooth = mirrored.map((p, i) => {
      let f = this.filters.get(i);
      if (!f) {
        f = [new OneEuro(1.2, 0.05), new OneEuro(1.2, 0.05)];
        this.filters.set(i, f);
      }
      return { ...p, x: f[0].filter(p.x, t), y: f[1].filter(p.y, t) };
    });

    const lw = mirrored[LM.lWrist];
    const rw = mirrored[LM.rWrist];
    // Fast swings blur the wrists, so accept lower confidence. If only one wrist
    // is found, the hands are together on the handle: that wrist plus its last
    // known offset from the midpoint stands in, so the position does not jump.
    const lOk = lw.visibility > 0.3;
    const rOk = rw.visibility > 0.3;
    let hands: { x: number; y: number } | null = null;
    if (lOk && rOk) {
      hands = { x: (lw.x + rw.x) / 2, y: (lw.y + rw.y) / 2 };
      this.wristGap = { x: (rw.x - lw.x) / 2, y: (rw.y - lw.y) / 2 };
    } else if (this.wristGap && (lOk || rOk)) {
      const w = lOk ? lw : rw;
      const k = lOk ? 1 : -1;
      hands = { x: w.x + this.wristGap.x * k, y: w.y + this.wristGap.y * k };
    }
    const ls = smooth[LM.lShoulder];
    const rs = smooth[LM.rShoulder];
    const shoulderW = Math.hypot(ls.x - rs.x, (ls.y - rs.y) / aspect);

    this.latest = { t, lm: smooth, hands, shoulderW, aspect };
    this.onFrame(this.latest);
  }

  private async downgrade() {
    if (!this.makeLandmarker) return;
    this.switching = true;
    try {
      const lite = await this.makeLandmarker('lite');
      if (!this.running) return lite.close();
      const old = this.landmarker;
      this.landmarker = lite;
      this.quality = 'lite';
      old?.close();
    } catch (err) {
      console.warn('Could not switch to the lite pose model', err);
    } finally {
      this.switching = false;
    }
  }

  private measureLight() {
    const ctx = this.lightCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(this.video, 0, 0, 32, 24);
    const d = ctx.getImageData(0, 0, 32, 24).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    this.brightness = sum / (d.length / 4);
  }
}

/** MediaPipe's pose skeleton links (shoulders, arms, hands, torso, legs). */
export const POSE_CONNECTIONS: { start: number; end: number }[] = [
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32],
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
].map(([start, end]) => ({ start, end }));
