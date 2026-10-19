import { describe, expect, it } from 'vitest';
import { DEFAULT_CALIBRATION, SwingDetector, type Point } from '../src/input/batGesture';

const ASPECT = 4 / 3;
const SW = 0.2;

/** Wrist midpoint over time for a downswing starting at `start` (s), lasting `dur`. */
function swingPath(start: number, dur = 0.22) {
  const from = { x: 0.6, y: 0.45 };
  const to = { x: 0.45, y: 0.74 };
  return (t: number): Point => {
    const u = Math.min(1, Math.max(0, (t - start) / dur));
    const k = (1 - Math.cos(u * Math.PI)) / 2;
    return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
  };
}

/** Feeds frames at `fps`; `drop(t)` hides the wrists for that frame. */
function run(d: SwingDetector, path: (t: number) => Point, fps: number, until: number, drop: (t: number) => boolean = () => false) {
  const starts: number[] = [];
  d.onSwingStart = (u) => starts.push(u.t);
  for (let t = 0; t <= until; t += 1 / fps) d.push(t, drop(t) ? null : path(t), ASPECT, SW);
  return starts;
}

describe('SwingDetector', () => {
  it('catches a real swing at 30 fps and at a slow 15 fps', () => {
    for (const fps of [30, 15]) {
      const starts = run(new SwingDetector({ ...DEFAULT_CALIBRATION }), swingPath(1), fps, 2);
      expect(starts.length).toBe(1);
      // Detected during the downswing, before the hands reach the bottom.
      expect(starts[0]).toBeGreaterThan(1);
      expect(starts[0]).toBeLessThan(1.22);
    }
  });

  it('catches the swing on the first frame the wrists reappear after blurring out', () => {
    // Wrists lost for the first three frames of the downswing.
    const lost = (t: number) => t > 0.99 && t < 1.1;
    let back = Infinity;
    for (let t = 0; t <= 2; t += 1 / 30) if (t > 1 && !lost(t)) back = Math.min(back, t);
    const starts = run(new SwingDetector({ ...DEFAULT_CALIBRATION }), swingPath(1), 30, 2, lost);
    expect(starts.length).toBe(1);
    expect(starts[0]).toBeCloseTo(back, 6);
  });

  it('ignores a tracking glitch that throws the hands for one frame', () => {
    const still: Point = { x: 0.5, y: 0.62 };
    const starts = run(new SwingDetector({ ...DEFAULT_CALIBRATION }), (t) => (Math.abs(t - 1) < 0.01 ? { x: 0.42, y: 0.75 } : still), 30, 2);
    expect(starts.length).toBe(0);
  });

  it('ignores tracking that suddenly jumps to a new spot and stays there', () => {
    const starts = run(new SwingDetector({ ...DEFAULT_CALIBRATION }), (t) => (t < 1 ? { x: 0.5, y: 0.62 } : { x: 0.42, y: 0.75 }), 30, 2);
    expect(starts.length).toBe(0);
  });

  it('ignores hands that are only fidgeting in the stance', () => {
    const fidget = (t: number): Point => ({ x: 0.5 + Math.sin(t * 6) * 0.01, y: 0.62 + Math.cos(t * 5) * 0.01 });
    const starts = run(new SwingDetector({ ...DEFAULT_CALIBRATION }), fidget, 30, 3);
    expect(starts.length).toBe(0);
  });

  it('is ready for the next stroke even if the hands never go still', () => {
    const first = swingPath(0.5);
    const second = swingPath(1.6);
    // Between strokes the hands keep moving at a steady pace.
    const path = (t: number): Point => {
      if (t < 0.75) return first(t);
      // Straight back up into the backlift: steady, never still, too slow to be a stroke.
      const drift = { x: 0.45 + (t - 0.75) * 0.17, y: 0.74 - (t - 0.75) * 0.34 };
      return t < 1.6 ? drift : second(t);
    };
    const starts = run(new SwingDetector({ ...DEFAULT_CALIBRATION }), path, 30, 2.4);
    expect(starts.length).toBe(2);
  });

  it('measures the time from detection to the fastest point, quick or slow swings', () => {
    for (const dur of [0.22, 0.45]) {
      for (const fps of [30, 60]) {
        const d = new SwingDetector({ ...DEFAULT_CALIBRATION });
        let detected = 0;
        let lead = -1;
        d.onSwingStart = (u) => (detected = u.tMid);
        d.onSwingEnd = (l) => (lead = l);
        const path = swingPath(1, dur);
        for (let t = 0; t <= 2.5; t += 1 / fps) d.push(t, path(t), ASPECT, SW);
        // The cosine swing is fastest halfway through.
        const truth = 1 + dur / 2 - detected;
        expect(lead).toBeGreaterThan(0);
        expect(Math.abs(lead - truth)).toBeLessThan(1.5 / fps);
      }
    }
  });
});
