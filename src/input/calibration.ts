import type { Calibration } from './batGesture';
import { LM, type PoseFrame } from './pose';
import type { WebcamControl } from './webcamControl';
import { drawPose } from '../ui/pip';

type Step = 'position' | 'hand' | 'stance' | 'practice' | 'done';

const $ = (id: string) => document.getElementById(id)!;

/**
 * Calibration before a webcam match: distance and lighting check, batting
 * hand, stance (rest position for head tracking) and practice swings that set
 * the player's natural straight-drive direction and full-power speed.
 */
export class CalibrationFlow {
  private step: Step = 'position';
  private goodSince = 0;
  private stillSince = 0;
  private noseSum = { x: 0, y: 0, n: 0 };
  private handSum = { x: 0, y: 0, n: 0 };
  private swSum = { v: 0, n: 0 };
  private swings: { angle: number; peak: number }[] = [];
  private draft: Calibration;
  private raf = 0;
  private resolve: (ok: boolean) => void = () => {};

  constructor(private cam: WebcamControl) {
    this.draft = { ...cam.calib };
    $('calib-right').addEventListener('click', () => this.chooseHand('R'));
    $('calib-left').addEventListener('click', () => this.chooseHand('L'));
    $('calib-skip').addEventListener('click', () => this.finishPractice(true));
    $('calib-cancel').addEventListener('click', () => this.close(false));
  }

  run(): Promise<boolean> {
    this.draft = { ...this.cam.calib };
    this.step = 'position';
    this.goodSince = 0;
    this.swings = [];
    $('calib').classList.remove('hidden');
    this.render();
    this.cam.enabled = false;
    this.cam.onFrame = (f) => this.onFrame(f);
    const tick = () => {
      drawPose($('calib-canvas') as HTMLCanvasElement, this.cam.tracker, this.cam.tracker.latest, {
        power: this.cam.livePower,
        peak: this.step === 'practice' ? this.cam.peakPower : 0,
        flash: this.cam.swingFlash,
      });
      this.cam.update(1 / 60);
      this.raf = requestAnimationFrame(tick);
    };
    tick();
    return new Promise((res) => (this.resolve = res));
  }

  private close(ok: boolean) {
    cancelAnimationFrame(this.raf);
    this.cam.onFrame = () => {};
    this.cam.onAnySwingStart = () => {};
    this.cam.onAnySwingUpdate = () => {};
    $('calib').classList.add('hidden');
    this.resolve(ok);
  }

  private onFrame(f: PoseFrame) {
    const t = f.t;
    if (this.step === 'position') {
      const msg = this.checkPosition(f);
      $('calib-check').textContent = msg ?? 'Perfect, hold that position…';
      $('calib-check').className = msg ? 'calib-check warn' : 'calib-check ok';
      if (msg) this.goodSince = 0;
      else if (!this.goodSince) this.goodSince = t;
      else if (t - this.goodSince > 1.0) this.go('hand');
    } else if (this.step === 'stance') {
      const msg = this.checkPosition(f);
      const nose = f.lm[LM.nose];
      if (msg || !nose) {
        $('calib-check').textContent = msg ?? 'Can’t see your head';
        $('calib-check').className = 'calib-check warn';
        this.stillSince = 0;
        return;
      }
      if (this.cam.detector.speed > 1.0 || !this.stillSince) {
        this.stillSince = t;
        this.noseSum = { x: 0, y: 0, n: 0 };
        this.handSum = { x: 0, y: 0, n: 0 };
        this.swSum = { v: 0, n: 0 };
      }
      this.noseSum.x += nose.x;
      this.noseSum.y += nose.y;
      this.noseSum.n++;
      if (f.hands) {
        this.handSum.x += f.hands.x;
        this.handSum.y += f.hands.y;
        this.handSum.n++;
      }
      this.swSum.v += f.shoulderW;
      this.swSum.n++;
      const held = t - this.stillSince;
      $('calib-check').textContent = `Hold still… ${Math.max(0, 1.5 - held).toFixed(1)}s`;
      $('calib-check').className = 'calib-check ok';
      if (held > 1.5 && this.noseSum.n > 5) {
        this.draft.restNose = { x: this.noseSum.x / this.noseSum.n, y: this.noseSum.y / this.noseSum.n };
        this.draft.shoulderW = this.swSum.v / this.swSum.n;
        if (this.handSum.n) this.draft.restHands = { x: this.handSum.x / this.handSum.n, y: this.handSum.y / this.handSum.n };
        this.go('practice');
      }
    }
  }

  private checkPosition(f: PoseFrame): string | null {
    if (this.cam.tracker.brightness < 50) return 'Too dark: turn on a light or face a window';
    if (!f.lm.length) return 'Step into view of the camera';
    const need = [LM.nose, LM.lShoulder, LM.rShoulder, LM.lWrist, LM.rWrist];
    if (need.some((i) => f.lm[i].visibility < 0.5)) return 'Show your head, shoulders and both hands';
    if (f.shoulderW > 0.36) return 'Too close: step back a little';
    if (f.shoulderW < 0.09) return 'Too far: step closer';
    if (f.lm[LM.lWrist].y > 0.98 || f.lm[LM.rWrist].y > 0.98) return 'Keep your hands inside the picture';
    return null;
  }

  private chooseHand(h: 'R' | 'L') {
    this.draft.hand = h;
    // A natural straight drive comes down and across the body.
    this.draft.neutralAngle = h === 'R' ? -35 : 35;
    this.go('stance');
  }

  private go(step: Step) {
    this.step = step;
    this.stillSince = 0;
    if (step === 'practice') {
      this.swings = [];
      this.cam.setCalibration({ ...this.draft });
      const det = this.cam.detector;
      this.cam.onAnySwingStart = (u) => {
        this.lastAngle = u.angle;
        // Read the refined direction and peak once the swing window has passed.
        setTimeout(() => {
          if (this.step !== 'practice') return;
          this.swings.push({ angle: this.lastAngle, peak: det.peak });
          this.render();
          if (this.swings.length >= 3) this.finishPractice(false);
        }, 200);
      };
      this.cam.onAnySwingUpdate = (u) => (this.lastAngle = u.angle);
    }
    this.render();
  }

  private lastAngle = 0;

  private finishPractice(skipped: boolean) {
    if (this.step !== 'practice') return;
    if (!skipped && this.swings.length) {
      const n = this.swings.length;
      this.draft.neutralAngle = this.swings.reduce((s, w) => s + w.angle, 0) / n;
      this.draft.fullSpeed = Math.max(6, (this.swings.reduce((s, w) => s + w.peak, 0) / n) * 1.05);
    }
    this.cam.setCalibration({ ...this.draft });
    this.step = 'done';
    this.render();
    setTimeout(() => this.close(true), 700);
  }

  private render() {
    const steps: Step[] = ['position', 'hand', 'stance', 'practice'];
    steps.forEach((s, i) => {
      const el = $('calib-steps').children[i] as HTMLElement;
      el.className = s === this.step ? 'on' : steps.indexOf(this.step) > i || this.step === 'done' ? 'done' : '';
    });
    const text: Record<Step, [string, string]> = {
      position: ['Get in position', 'Stand 2–3 metres from the camera so your head, shoulders and both hands are in the picture.'],
      hand: ['Which way do you bat?', 'Choose your batting hand.'],
      stance: ['Take your stance', 'Stand as you would at the crease, holding an imaginary bat, and keep still. This sets your head position for POV.'],
      practice: ['Practice swings', `Play 3 full-power straight drives. ${this.swings.length}/3 done.`],
      done: ['All set!', 'Calibration saved on this device.'],
    };
    $('calib-title').textContent = text[this.step][0];
    $('calib-text').textContent = text[this.step][1];
    $('calib-hand').classList.toggle('hidden', this.step !== 'hand');
    $('calib-skip').classList.toggle('hidden', this.step !== 'practice');
    $('calib-check').classList.toggle('hidden', !(this.step === 'position' || this.step === 'stance'));
  }
}
