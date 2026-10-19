const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface ScoreView {
  team: string;
  runs: number;
  wickets: number;
  balls: number;
  /** Null in the first innings. */
  target: number | null;
  runRate: number;
  freeHit: boolean;
  oppTeam: string;
  striker: string;
  strikerRuns: number;
  strikerBalls: number;
  nonStriker: string;
  nonStrikerRuns: number;
  nonStrikerBalls: number;
  bowler: string;
  bowlerFigures: string;
  thisOver: string[];
}

export class Hud {
  private flashTimer = 0;

  show(id: 'menu' | 'hud' | 'result' | 'pause' | 'loading' | 'scorecard', on: boolean) {
    $(id).classList.toggle('hidden', !on);
  }

  setControl(mode: 'webcam' | 'keyboard') {
    $('pip-mode').textContent = mode === 'webcam' ? 'WEBCAM' : 'KEYBOARD';
    $('pip-canvas').classList.toggle('hidden', mode !== 'webcam');
    $('pip').classList.toggle('webcam', mode === 'webcam');
  }

  setRole(role: 'bat' | 'bowl') {
    $('hud').classList.toggle('bowling', role === 'bowl');
    if (role === 'bat') this.bowlPanel(null);
  }

  /** Bowling choices: variations (1–4), the selected one, and the aimed line/length. Null hides it. */
  bowlPanel(options: string[] | null, selected = 0, aim = '') {
    const el = $('bowl-panel');
    el.classList.toggle('hidden', !options);
    if (!options) return;
    $('bowl-options').innerHTML = options
      .map((o, i) => `<li class="${i === selected ? 'on' : ''}"><kbd>${i + 1}</kbd>${o}</li>`)
      .join('');
    $('bowl-aim').textContent = aim;
  }

  fps(text: string) {
    $('pip-fps').textContent = text;
  }

  menuError(text: string) {
    $('menu-error').textContent = text;
    $('menu-error').classList.toggle('hidden', !text);
  }

  score(s: ScoreView) {
    const overs = `${Math.floor(s.balls / 6)}.${s.balls % 6}`;
    $('sb-team').textContent = s.team;
    $('sb-score').textContent = `${s.runs}-${s.wickets}`;
    $('sb-overs').textContent = overs;
    $('sb-striker').innerHTML = `${s.striker}<b>*</b> <span>${s.strikerRuns} (${s.strikerBalls})</span>`;
    $('sb-nonstriker').innerHTML = `${s.nonStriker} <span>${s.nonStrikerRuns} (${s.nonStrikerBalls})</span>`;
    $('sb-bowler').innerHTML = `${s.bowler} <span>${s.bowlerFigures}</span>`;
    const left = 12 - s.balls;
    if (s.target === null) {
      $('sb-need').textContent = `Run rate ${s.runRate.toFixed(2)}`;
      $('sb-target').textContent = '1st innings';
    } else {
      const need = s.target - s.runs;
      $('sb-need').textContent = need > 0 ? `${s.team} need ${need} from ${left} ball${left === 1 ? '' : 's'}` : `${s.team} win!`;
      $('sb-target').textContent = `Target ${s.target}`;
    }
    if (s.freeHit) $('sb-target').textContent = 'FREE HIT';
    $('scorebug').classList.toggle('free-hit', s.freeHit);
    $('sb-over').innerHTML = s.thisOver
      .map((b) => `<i class="${b === 'W' ? 'w' : b === '4' ? 'four' : b === '6' ? 'six' : /wd|nb/.test(b) ? 'ex' : ''}">${b}</i>`)
      .join('');
  }

  speed(kmh: number | null, label = '') {
    $('speed').classList.toggle('hidden', kmh === null);
    if (kmh !== null) {
      $('speed-val').textContent = kmh.toFixed(1);
      $('speed-type').textContent = label;
    }
  }

  /** Big centre-screen call: FOUR!, SIX!, OUT!, etc. */
  flash(text: string, sub = '', kind: 'four' | 'six' | 'out' | 'info' = 'info', ms = 2200) {
    const el = $('flash');
    el.className = `flash ${kind}`;
    $('flash-main').textContent = text;
    $('flash-sub').textContent = sub;
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => el.classList.remove('on'), ms);
  }

  shot(name: string, timing: string, timingErr: number) {
    $('shot-name').textContent = name;
    $('timing-label').textContent = timing;
    $('timing-label').className = `timing ${timing.toLowerCase().replace(/\s/g, '-')}`;
    // Timing bar: centre = perfect, left = early, right = late.
    const x = Math.max(-1, Math.min(1, timingErr / 0.15));
    $('timing-marker').style.left = `${50 + x * 50}%`;
    $('shot-info').classList.add('on');
  }

  clearShot() {
    $('shot-info').classList.remove('on');
  }

  power(v: number) {
    $('power-fill').style.width = `${Math.round(v * 100)}%`;
  }

  aim(screenAim: number, loft: boolean) {
    $('aim-marker').style.left = `${50 + screenAim * 46}%`;
    $('loft').classList.toggle('on', loft);
  }

  camMode(mode: string) {
    $('cam-mode').textContent = mode === 'pov' ? 'POV' : 'TV';
  }

  result(title: string, detail: string) {
    $('result-title').textContent = title;
    $('result-detail').innerHTML = detail;
  }

  status(text: string) {
    $('status').textContent = text;
  }
}
