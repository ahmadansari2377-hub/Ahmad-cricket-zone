import type { PoseFrame, PoseTracker } from '../input/pose';
import { LM, POSE_CONNECTIONS } from '../input/pose';

// Upper body + legs; face mesh points are skipped for a cleaner overlay.
const BODY = POSE_CONNECTIONS.filter((c) => c.start >= 11 && c.end >= 11 && c.start <= 28 && c.end <= 28);
const ARMS = new Set(['11-13', '13-15', '12-14', '14-16']);
const JOINTS = [11, 12, 13, 14, 23, 24, 25, 26, 27, 28];

export interface PipState {
  /** Live hand speed, 0–1 of a full-power swing. */
  power: number;
  /** Peak power of the last swing, 0–1 (held marker). */
  peak: number;
  flash: number;
  label?: string;
}

interface TrailPoint {
  x: number;
  y: number;
  t: number;
  p: number;
}

const trails = new WeakMap<HTMLCanvasElement, TrailPoint[]>();

/**
 * Draws the mirrored webcam view: a clean, slightly graded video with a
 * glowing skeleton, the bat in your hands, a trail of the swing, a tracking
 * status pill and a power meter.
 */
export function drawPose(canvas: HTMLCanvasElement, tracker: PoseTracker, frame: PoseFrame | null, s: PipState) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const v = tracker.video;
  const now = performance.now() / 1000;
  const unit = W / 400;

  ctx.save();
  ctx.clearRect(0, 0, W, H);
  roundRect(ctx, 0, 0, W, H, 14 * unit);
  ctx.clip();
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0d1f3c');
  bg.addColorStop(1, '#050b18');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  let tracking = false;
  let handsSeen = false;
  if (v.readyState >= 2) {
    // Cover-fit and mirror the video, graded so the overlay stands out.
    const va = v.videoWidth / v.videoHeight;
    const ca = W / H;
    const dw = va > ca ? H * va : W;
    const dh = va > ca ? H : W / va;
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.filter = 'contrast(1.08) saturate(0.8) brightness(0.92)';
    ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.restore();
    ctx.filter = 'none';
    // Cinematic shading top and bottom.
    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, 'rgba(5,11,24,0.55)');
    shade.addColorStop(0.22, 'rgba(5,11,24,0)');
    shade.addColorStop(0.75, 'rgba(5,11,24,0)');
    shade.addColorStop(1, 'rgba(5,11,24,0.6)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);

    if (frame && frame.lm.length) {
      const map = (x: number, y: number) => [(W - dw) / 2 + x * dw, (H - dh) / 2 + y * dh] as const;
      const lm = frame.lm;
      tracking = lm[LM.lShoulder].visibility > 0.5 && lm[LM.rShoulder].visibility > 0.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Skeleton: soft glow underneath, crisp line on top. Arms in bright cyan.
      for (const pass of [0, 1]) {
        for (const c of BODY) {
          const a = lm[c.start];
          const b = lm[c.end];
          if (a.visibility < 0.4 || b.visibility < 0.4) continue;
          const arm = ARMS.has(`${Math.min(c.start, c.end)}-${Math.max(c.start, c.end)}`);
          const [x1, y1] = map(a.x, a.y);
          const [x2, y2] = map(b.x, b.y);
          ctx.strokeStyle = arm ? (pass ? '#7fe6ff' : 'rgba(63,208,255,0.35)') : pass ? 'rgba(255,255,255,0.85)' : 'rgba(255,210,63,0.25)';
          ctx.lineWidth = (pass ? 3 : 9) * unit * (arm ? 1.2 : 1);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }
      for (const i of JOINTS) {
        const p = lm[i];
        if (!p || p.visibility < 0.4) continue;
        const [x, y] = map(p.x, p.y);
        ctx.fillStyle = '#0b1d3a';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 * unit;
        ctx.beginPath();
        ctx.arc(x, y, 4 * unit, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // The bat in your hands: continues the line of the forearms.
      const lw = lm[LM.lWrist];
      const rw = lm[LM.rWrist];
      const le = lm[LM.lElbow];
      const re = lm[LM.rElbow];
      handsSeen = lw.visibility > 0.5 && rw.visibility > 0.5;
      if (handsSeen) {
        const [hx, hy] = map((lw.x + rw.x) / 2, (lw.y + rw.y) / 2);
        const [ex, ey] = map((le.x + re.x) / 2, (le.y + re.y) / 2);
        let dx = hx - ex;
        let dy = hy - ey;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        const batLen = Math.max(60 * unit, len * 2.4);
        drawBat(ctx, hx, hy, dx, dy, batLen, unit);

        // Swing trail coloured by speed.
        const trail = trails.get(canvas) ?? [];
        trail.push({ x: hx + dx * batLen * 0.75, y: hy + dy * batLen * 0.75, t: now, p: s.power });
        while (trail.length && now - trail[0].t > 0.35) trail.shift();
        trails.set(canvas, trail);
        for (let i = 1; i < trail.length; i++) {
          const a = trail[i - 1];
          const b = trail[i];
          const age = 1 - (now - b.t) / 0.35;
          ctx.strokeStyle = powerColor(b.p, age * 0.9);
          ctx.lineWidth = (2 + 10 * b.p) * unit * age;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }

        // Hands.
        for (const p of [lw, rw]) {
          const [x, y] = map(p.x, p.y);
          const glow = ctx.createRadialGradient(x, y, 0, x, y, 14 * unit);
          glow.addColorStop(0, 'rgba(63,208,255,0.9)');
          glow.addColorStop(1, 'rgba(63,208,255,0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(x, y, 14 * unit, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Head marker (for leaning and ducking in POV).
      const nose = lm[LM.nose];
      if (nose.visibility > 0.4) {
        const [x, y] = map(nose.x, nose.y);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2 * unit;
        ctx.beginPath();
        ctx.arc(x, y, 9 * unit, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  } else {
    ctx.fillStyle = '#a9b4c8';
    ctx.font = `600 ${Math.round(W / 18)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Starting camera…', W / 2, H / 2);
  }

  // Viewfinder corners.
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2.5 * unit;
  const m = 12 * unit;
  const c = 22 * unit;
  for (const [x, y, sx, sy] of [
    [m, m, 1, 1],
    [W - m, m, -1, 1],
    [m, H - m, 1, -1],
    [W - m, H - m, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x, y + c * sy);
    ctx.lineTo(x, y);
    ctx.lineTo(x + c * sx, y);
    ctx.stroke();
  }

  // Tracking status pill.
  if (v.readyState >= 2) {
    // The most useful fix first: light, then framing, then hands.
    const dark = tracker.brightness < 45;
    const ok = tracking && handsSeen && !dark;
    const text = dark ? 'TOO DARK: ADD LIGHT' : !tracking ? 'STEP INTO VIEW' : !handsSeen ? 'SHOW BOTH HANDS' : 'TRACKING';
    ctx.font = `700 ${Math.round(13 * unit)}px "Barlow Condensed", sans-serif`;
    const tw = ctx.measureText(text).width;
    const px = 20 * unit;
    const py = 20 * unit;
    ctx.fillStyle = 'rgba(5,11,24,0.7)';
    roundRect(ctx, px, py, tw + 30 * unit, 22 * unit, 11 * unit);
    ctx.fill();
    const pulse = 0.6 + 0.4 * Math.sin(now * 6);
    ctx.fillStyle = ok ? `rgba(63,245,138,${pulse})` : `rgba(255,77,94,${pulse})`;
    ctx.beginPath();
    ctx.arc(px + 12 * unit, py + 11 * unit, 4 * unit, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4f6fb';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, px + 21 * unit, py + 12 * unit);
  }

  // Swing flash: glowing border and a burst label.
  if (s.flash > 0) {
    ctx.strokeStyle = `rgba(63, 245, 138, ${s.flash})`;
    ctx.lineWidth = 8 * unit;
    roundRect(ctx, 0, 0, W, H, 14 * unit);
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = s.flash;
    ctx.translate(W / 2, H * 0.45);
    ctx.scale(1 + (1 - s.flash) * 0.4, 1 + (1 - s.flash) * 0.4);
    ctx.fillStyle = '#3ff58a';
    ctx.font = `800 ${Math.round(40 * unit)}px "Barlow Condensed", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(63,245,138,0.8)';
    ctx.shadowBlur = 18 * unit;
    ctx.fillText('SWING!', 0, 0);
    ctx.restore();
  }

  // Vertical power meter on the right edge.
  const mw = 10 * unit;
  const mx = W - mw - 18 * unit;
  const my = H * 0.16;
  const mh = H * 0.62;
  ctx.fillStyle = 'rgba(5,11,24,0.6)';
  roundRect(ctx, mx - 3 * unit, my - 3 * unit, mw + 6 * unit, mh + 6 * unit, 8 * unit);
  ctx.fill();
  const g = ctx.createLinearGradient(0, my + mh, 0, my);
  g.addColorStop(0, '#3ff58a');
  g.addColorStop(0.6, '#ffd23f');
  g.addColorStop(1, '#ff4d5e');
  ctx.fillStyle = g;
  const ph = mh * Math.min(1, s.power);
  if (ph > 1) {
    roundRect(ctx, mx, my + mh - ph, mw, ph, 5 * unit);
    ctx.fill();
  }
  if (s.peak > 0) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(mx - 4 * unit, my + mh - mh * Math.min(1, s.peak) - 1.5 * unit, mw + 8 * unit, 3 * unit);
  }
  ctx.save();
  ctx.translate(mx + mw / 2, my + mh + 16 * unit);
  ctx.fillStyle = 'rgba(244,246,251,0.85)';
  ctx.font = `700 ${Math.round(12 * unit)}px "Barlow Condensed", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(Math.min(1, s.peak) * 100)}%`, 0, 0);
  ctx.restore();

  if (s.label) {
    const bh = H / 7;
    const lg = ctx.createLinearGradient(0, H - bh, 0, H);
    lg.addColorStop(0, 'rgba(8,18,34,0)');
    lg.addColorStop(1, 'rgba(8,18,34,0.9)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, H - bh * 1.4, W, bh * 1.4);
    ctx.fillStyle = '#f4f6fb';
    ctx.font = `700 ${Math.round(H / 12)}px "Barlow Condensed", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.label, W / 2, H - bh / 2);
  }
  ctx.restore();
}

function drawBat(ctx: CanvasRenderingContext2D, hx: number, hy: number, dx: number, dy: number, len: number, unit: number) {
  const nx = -dy;
  const ny = dx;
  const handle = len * 0.28;
  const bw = 9 * unit;
  // Grip.
  ctx.strokeStyle = '#1a1c22';
  ctx.lineWidth = 5 * unit;
  ctx.beginPath();
  ctx.moveTo(hx - dx * 10 * unit, hy - dy * 10 * unit);
  ctx.lineTo(hx + dx * handle, hy + dy * handle);
  ctx.stroke();
  // Blade.
  const sx = hx + dx * handle;
  const sy = hy + dy * handle;
  const ex = hx + dx * len;
  const ey = hy + dy * len;
  const grad = ctx.createLinearGradient(sx + nx * bw, sy + ny * bw, sx - nx * bw, sy - ny * bw);
  grad.addColorStop(0, '#d9bf86');
  grad.addColorStop(0.5, '#f3e2b8');
  grad.addColorStop(1, '#c9ab6f');
  ctx.fillStyle = grad;
  ctx.strokeStyle = 'rgba(80,55,20,0.6)';
  ctx.lineWidth = 1.5 * unit;
  ctx.beginPath();
  ctx.moveTo(sx + nx * bw * 0.5, sy + ny * bw * 0.5);
  ctx.lineTo(sx + dx * 8 * unit + nx * bw, sy + dy * 8 * unit + ny * bw);
  ctx.lineTo(ex + nx * bw, ey + ny * bw);
  ctx.quadraticCurveTo(ex + dx * 5 * unit, ey + dy * 5 * unit, ex - nx * bw, ey - ny * bw);
  ctx.lineTo(sx + dx * 8 * unit - nx * bw, sy + dy * 8 * unit - ny * bw);
  ctx.lineTo(sx - nx * bw * 0.5, sy - ny * bw * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Sticker.
  ctx.strokeStyle = '#0d1b33';
  ctx.lineWidth = bw * 1.2;
  ctx.beginPath();
  ctx.moveTo(sx + dx * 14 * unit, sy + dy * 14 * unit);
  ctx.lineTo(sx + dx * 30 * unit, sy + dy * 30 * unit);
  ctx.stroke();
}

function powerColor(p: number, a: number) {
  const k = Math.min(1, Math.max(0, p));
  const r = Math.round(63 + (255 - 63) * Math.min(1, k * 1.6));
  const g = Math.round(245 - (245 - 77) * Math.max(0, k - 0.6) * 2.5);
  const b = Math.round(138 - 100 * k);
  return `rgba(${r},${g},${b},${Math.max(0, a)})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
