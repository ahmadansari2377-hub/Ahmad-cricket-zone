import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Delivery } from '../src/game/ai/aiBowler';
import { snickTrace, trackLbw } from '../src/game/drs';
import type { LbwCheck } from '../src/game/lbw';

/** A straight-line delivery that pitches at `bounce` and crosses the stumps' plane at (x, y). */
function delivery(bounceX: number, x: number, y: number) {
  const path = [];
  for (let i = 0; i <= 40; i++) {
    const z = 10 - i * 0.3; // 10 → -2
    const k = (10 - z) / 10;
    path.push({ t: i * 0.01, p: new Vector3(bounceX + (x - bounceX) * k, 0.1 + (y - 0.1) * k, z), v: new Vector3(0, 0, -30), bounces: 1, rolling: false });
  }
  const d = { path, bounceAt: new Vector3(bounceX, 0, 6), contactP: new Vector3(x, 0.4, 1.6), hitsStumps: Math.abs(x) < 0.15 && y < 0.75 } as unknown as Delivery;
  const impact = path.find((s) => s.p.z <= 1.0)!;
  const l: LbwCheck = { impact, out: d.hitsStumps, reason: '' };
  return { d, l };
}

describe('DRS ball tracking', () => {
  it('gives plumb LBWs out', () => {
    const { d, l } = delivery(0, 0, 0.4);
    const v = trackLbw(d, l, true, false);
    expect(v).toMatchObject({ pitching: 'In line', impact: 'In line', wickets: 'Hitting', out: true, umpiresCall: false });
  });

  it('is never out when pitching outside leg', () => {
    const { d, l } = delivery(0.4, 0, 0.4);
    expect(trackLbw(d, l, false, true)).toMatchObject({ pitching: 'Outside leg', out: false });
  });

  it('is not out when missing the stumps', () => {
    const { d, l } = delivery(-0.05, -0.05, 1.2);
    expect(trackLbw(d, l, true, true)).toMatchObject({ wickets: 'Missing', out: false });
  });

  it("keeps the on-field call when only clipping the stumps (umpire's call)", () => {
    const { d, l } = delivery(0, 0.13, 0.4);
    const asOut = trackLbw(d, l, true, true);
    const asNotOut = trackLbw(d, l, true, false);
    expect(asOut.umpiresCall).toBe(true);
    expect(asOut.out).toBe(true);
    expect(asNotOut.out).toBe(false);
  });

  it('only shows a snickometer spike for a real edge', () => {
    const peak = (t: number[]) => Math.max(...t.map(Math.abs));
    expect(peak(snickTrace(true, false))).toBeGreaterThan(0.5);
    expect(peak(snickTrace(false, false))).toBeLessThan(0.1);
  });
});
