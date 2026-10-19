import { SNICK_AT } from '../game/drs';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export type Tone = 'good' | 'bad' | 'amber' | 'plain';

/** On-screen DRS: the "review?" prompt, the verdict panel, the snickometer and the replay badge. */
export class DrsView {
  onReview: () => void = () => {};

  constructor() {
    $('drs-btn').addEventListener('click', () => this.onReview());
  }

  /** Shows the review prompt with `frac` (1→0) of the time left; null hides it. */
  prompt(frac: number | null, left = 1, side = '') {
    $('drs-prompt').classList.toggle('hidden', frac === null);
    if (frac === null) return;
    $('drs-left').textContent = `${side ? `${side} · ` : ''}${left} review${left === 1 ? '' : 's'} left`;
    $('drs-timer-bar').style.transform = `scaleX(${Math.max(0, frac)})`;
  }

  open(title: string) {
    $('drs-panel').classList.remove('hidden');
    $('drs-kind').textContent = title;
    $('drs-rows').innerHTML = '';
    $('drs-decision').textContent = '';
    $('drs-decision').className = '';
    $('snicko').classList.add('hidden');
  }

  row(label: string, value: string, tone: Tone) {
    const li = document.createElement('li');
    li.innerHTML = `<span>${label}</span><b class="${tone}">${value}</b>`;
    $('drs-rows').appendChild(li);
  }

  decision(text: string, sub: string, tone: Tone) {
    const el = $('drs-decision');
    el.className = tone;
    el.innerHTML = `${text}<small>${sub}</small>`;
  }

  /** Draws the snickometer trace up to `progress` (0–1). */
  snicko(trace: number[], progress: number) {
    const c = $<HTMLCanvasElement>('snicko');
    c.classList.remove('hidden');
    const g = c.getContext('2d')!;
    const { width: w, height: h } = c;
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(5, 12, 26, 0.85)';
    g.fillRect(0, 0, w, h);
    // Where the ball passes the bat.
    g.strokeStyle = 'rgba(255, 210, 63, 0.55)';
    g.setLineDash([4, 4]);
    g.beginPath();
    g.moveTo(w * SNICK_AT, 6);
    g.lineTo(w * SNICK_AT, h - 6);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = '#7cf0a0';
    g.lineWidth = 2;
    g.beginPath();
    const n = Math.floor(trace.length * Math.min(1, progress));
    for (let i = 0; i < n; i++) {
      const x = (i / (trace.length - 1)) * w;
      const y = h / 2 - trace[i] * (h / 2 - 6);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = 'rgba(169, 180, 200, 0.9)';
    g.font = '600 11px Inter, sans-serif';
    g.fillText('SNICKOMETER', 8, 16);
  }

  close() {
    $('drs-panel').classList.add('hidden');
  }

  replayBadge(label: string | null) {
    $('replay-badge').classList.toggle('hidden', label === null);
    if (label !== null) $('replay-label').textContent = label;
  }
}
