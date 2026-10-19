import { GROUNDS } from '../data/grounds';
import { TEAMS, teamById } from '../data/teams';
import { ACHIEVEMENTS, BoardId, CareerStats, InningsSummary } from '../game/record';
import { saveCalibration } from '../input/webcamControl';
import { api, ApiError, SavedMatch } from '../services/api';
import * as auth from '../services/auth';
import { flattenCalibration, guestMatchCount, loadProfile, moveGuestProgress, unflattenCalibration } from '../services/progress';
import { settings, updateSettings, type Settings } from '../services/settings';
import type { Calibration } from '../input/batGesture';
import { hex } from './scorecard';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

/** A full-screen card overlay, created on first use. */
function overlay(id: string, wide = true) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('section');
    el.id = id;
    el.className = 'overlay account-overlay hidden';
    el.innerHTML = `<div class="menu-card ${wide ? 'wide' : 'small left'}" role="dialog" aria-modal="true"><button class="close" aria-label="Close">×</button><div class="body"></div></div>`;
    document.body.appendChild(el);
    $('.close', el).addEventListener('click', () => el!.classList.add('hidden'));
    el.addEventListener('click', (e) => e.target === el && el!.classList.add('hidden'));
  }
  el.classList.remove('hidden');
  return $('.body', el);
}

const close = (id: string) => document.getElementById(id)?.classList.add('hidden');

function busy(btn: HTMLButtonElement, on: boolean, label?: string) {
  btn.disabled = on;
  if (label) btn.textContent = label;
}

/**
 * Accounts layer: the menu's account chip, sign-in (Google or email),
 * profile with career stats and history, leaderboards and settings sync.
 */
export class Account {
  /** Called when synced settings arrive, so the menu can reflect them. */
  onSettingsLoaded: (s: Settings) => void = () => {};

  constructor() {
    $('#btn-account').addEventListener('click', () => (auth.currentUser() ? this.openProfile() : this.openSignIn()));
    $('#btn-profile').addEventListener('click', () => this.openProfile());
    $('#btn-leaders').addEventListener('click', () => this.openLeaderboard());
    auth.onAuthChange(() => this.renderChip());
    this.renderChip();
    void this.boot();
  }

  private async boot() {
    // Back from a password-reset email: ?token=...
    const q = new URLSearchParams(location.search);
    const resetToken = q.get('token');
    if (q.get('error')) this.openSignIn(`That link has expired or was already used (${esc(q.get('error')!)}).`);
    if (resetToken) this.openReset(resetToken);
    if (resetToken || q.get('error')) history.replaceState(null, '', location.pathname);
    const user = await auth.refreshSession();
    if (user) await this.afterSignIn(false);
  }

  private renderChip() {
    const u = auth.currentUser();
    const chip = $('#btn-account');
    chip.innerHTML = u
      ? `${u.image ? `<img src="${esc(u.image)}" alt="" referrerpolicy="no-referrer">` : `<i class="avatar">${esc(u.name[0]?.toUpperCase() ?? '?')}</i>`}<span>${esc(settings().displayName || u.name)}</span>`
      : `<i class="avatar">?</i><span>Guest · <b>Sign in</b></span>`;
  }

  // ---------------------------------------------------------------- sign in

  openSignIn(note = '') {
    const body = overlay('signin', false);
    if (!auth.authEnabled) {
      body.innerHTML = `<h2>Accounts</h2>
        <p class="muted">Online accounts aren't set up on this copy of the game yet, so you're playing as a guest.
        Your matches, stats and badges are saved on this device.</p>
        <p class="muted small">To turn accounts on, enable Neon Auth for the project and set <code>VITE_NEON_AUTH_URL</code> and <code>NEON_AUTH_BASE_URL</code> in <code>env/.env</code>.</p>`;
      return;
    }
    let mode: 'in' | 'up' | 'forgot' = 'in';
    const render = (msg = note, err = false) => {
      body.innerHTML = `<h2>${mode === 'up' ? 'Create account' : mode === 'forgot' ? 'Reset password' : 'Sign in'}</h2>
        ${msg ? `<p class="form-msg ${err ? 'err' : ''}" role="${err ? 'alert' : 'status'}">${msg}</p>` : ''}
        ${mode !== 'forgot' ? `<button class="btn google" id="g-btn"><span class="g">G</span> Continue with Google</button><div class="or"><span>or</span></div>` : ''}
        <form id="auth-form" class="form">
          ${mode === 'up' ? `<label>Name<input name="name" autocomplete="name" required maxlength="40"></label>` : ''}
          <label>Email<input name="email" type="email" autocomplete="email" required></label>
          ${mode !== 'forgot' ? `<label>Password<input name="password" type="password" minlength="8" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}" required></label>` : ''}
          <button class="btn primary" type="submit">${mode === 'up' ? 'Create account' : mode === 'forgot' ? 'Email me a reset link' : 'Sign in'}</button>
        </form>
        <p class="form-links">
          ${mode === 'in' ? `<button class="link" data-go="up">New here? Create an account</button><button class="link" data-go="forgot">Forgot password?</button>` : `<button class="link" data-go="in">Back to sign in</button>`}
        </p>
        <p class="muted small">Or close this and keep playing as a guest. Guest progress can be moved to your account later.</p>`;
      body.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) =>
        b.addEventListener('click', () => {
          mode = b.dataset.go as typeof mode;
          render('');
        }),
      );
      body.querySelector<HTMLButtonElement>('#g-btn')?.addEventListener('click', async (e) => {
        busy(e.currentTarget as HTMLButtonElement, true, 'Opening Google…');
        try {
          await auth.signInGoogle();
        } catch (err) {
          render((err as Error).message, true);
        }
      });
      $('#auth-form', body).addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target as HTMLFormElement);
        const email = String(f.get('email')).trim();
        const password = String(f.get('password') ?? '');
        const submit = $<HTMLButtonElement>('button[type=submit]', body);
        busy(submit, true, 'Please wait…');
        try {
          if (mode === 'forgot') {
            await auth.requestPasswordReset(email);
            mode = 'in';
            return render('If that email has an account, a reset link is on its way.');
          }
          const user = mode === 'up' ? await auth.signUpEmail(String(f.get('name')).trim(), email, password) : await auth.signInEmail(email, password);
          if (!user) {
            // Email verification required before the first sign-in.
            mode = 'in';
            return render(`Check <b>${esc(email)}</b> for a verification link, then sign in.`);
          }
          close('signin');
          await this.afterSignIn(true);
        } catch (err) {
          render((err as Error).message, true);
        }
      });
    };
    render();
  }

  private openReset(token: string) {
    const body = overlay('signin', false);
    body.innerHTML = `<h2>New password</h2>
      <form id="reset-form" class="form">
        <label>New password<input name="password" type="password" minlength="8" autocomplete="new-password" required></label>
        <button class="btn primary" type="submit">Save password</button>
      </form><p id="reset-msg" class="form-msg hidden"></p>`;
    $('#reset-form', body).addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = String(new FormData(e.target as HTMLFormElement).get('password'));
      try {
        await auth.resetPassword(token, pw);
        this.openSignIn('Password changed. Sign in with your new password.');
      } catch (err) {
        const m = $('#reset-msg', body);
        m.textContent = (err as Error).message;
        m.className = 'form-msg err';
      }
    });
  }

  /** Pulls synced settings and calibration, and offers to move guest progress. */
  private async afterSignIn(fresh: boolean) {
    try {
      const data = await api.profile();
      updateSettings({
        displayName: data.profile.displayName,
        favouriteTeam: data.profile.favouriteTeam,
        battingHand: data.profile.battingHand,
        difficulty: data.profile.difficulty,
        graphicsQuality: data.profile.graphicsQuality,
      });
      if (data.calibration) {
        const c = unflattenCalibration(data.calibration);
        if (c) saveCalibration(c, false);
      }
      this.onSettingsLoaded(settings());
    } catch (err) {
      console.warn('Could not load profile', err);
    }
    this.renderChip();
    const n = guestMatchCount();
    if (fresh && n > 0) {
      const body = overlay('move-guest', false);
      body.innerHTML = `<h2>Keep your guest games?</h2><p class="muted">You played ${n} match${n === 1 ? '' : 'es'} as a guest on this device. Move ${n === 1 ? 'it' : 'them'} to your account?</p>
        <div class="menu-buttons"><button class="btn primary" id="mv-yes">Move to my account</button><button class="btn ghost" id="mv-no">Not now</button></div><p id="mv-msg" class="form-msg hidden"></p>`;
      $('#mv-no', body).addEventListener('click', () => close('move-guest'));
      $('#mv-yes', body).addEventListener('click', async (e) => {
        busy(e.currentTarget as HTMLButtonElement, true, 'Moving…');
        const moved = await moveGuestProgress();
        const left = guestMatchCount();
        const msg = $('#mv-msg', body);
        msg.className = 'form-msg';
        msg.textContent = `Moved ${moved} match${moved === 1 ? '' : 'es'}.${left ? ` ${left} couldn't be sent right now and will be offered again.` : ''}`;
        setTimeout(() => close('move-guest'), 1600);
      });
    }
  }

  /** Called when settings change in the menu or profile; saved to the account when signed in. */
  async syncSettings() {
    this.renderChip();
    if (!auth.currentUser()) return;
    const s = settings();
    try {
      await api.saveProfile({
        displayName: s.displayName,
        favouriteTeam: s.favouriteTeam,
        battingHand: s.battingHand,
        difficulty: s.difficulty,
        graphicsQuality: s.graphicsQuality,
      });
    } catch (err) {
      console.warn('Settings not synced', err);
    }
  }

  async syncCalibration(c: Calibration) {
    if (!auth.currentUser()) return;
    try {
      await api.saveProfile({ ...this.profileFields(), calibration: flattenCalibration(c) });
    } catch (err) {
      console.warn('Calibration not synced', err);
    }
  }

  private profileFields() {
    const s = settings();
    return { displayName: s.displayName, favouriteTeam: s.favouriteTeam, battingHand: s.battingHand, difficulty: s.difficulty, graphicsQuality: s.graphicsQuality };
  }

  // ---------------------------------------------------------------- profile

  async openProfile() {
    const body = overlay('profile');
    body.innerHTML = `<h2>Profile</h2><p class="muted">Loading…</p>`;
    let data, matches: SavedMatch[];
    try {
      ({ data, matches } = await loadProfile());
    } catch (err) {
      body.innerHTML = `<h2>Profile</h2><p class="form-msg err" role="alert">${esc((err as Error).message)}</p>`;
      return;
    }
    const user = auth.currentUser();
    const s = data.stats;
    const earned = new Map(data.achievements.map((a) => [a.code, a.earnedAt]));
    body.innerHTML = `
      <div class="profile-head">
        <div><p class="eyebrow">${user ? esc(user.email) : 'Guest · saved on this device'}</p><h2>${esc(user ? settings().displayName || user.name : 'Guest')}</h2></div>
        ${user ? `<button class="btn ghost small" id="sign-out">Sign out</button>` : auth.authEnabled ? `<button class="btn primary small" id="sign-in">Sign in</button>` : ''}
      </div>
      ${statTiles(s)}
      <h3 class="section">Recent form</h3>
      ${formChart(matches)}
      <h3 class="section">Badges <span>${earned.size}/${Object.keys(ACHIEVEMENTS).length}</span></h3>
      <ul class="badges">${Object.entries(ACHIEVEMENTS)
        .map(([code, a]) => `<li class="${earned.has(code) ? 'on' : ''}" title="${esc(a.text)}"><b>${earned.has(code) ? '★' : '☆'} ${esc(a.title)}</b><span>${esc(a.text)}</span></li>`)
        .join('')}</ul>
      <h3 class="section">Match history <span>${matches.length}</span></h3>
      ${matches.length ? `<div class="history">${matches.map(historyRow).join('')}</div>` : `<p class="muted">No matches yet. Play one!</p>`}
      <h3 class="section">Settings</h3>
      ${settingsForm()}
      <h3 class="section">Your data</h3>
      <p class="muted small">Only game numbers are stored: scores, settings and calibration measurements. No webcam images or video are ever uploaded or saved.</p>
      <button class="btn danger small" id="delete-data">${user ? 'Delete my account and all data' : 'Clear progress on this device'}</button>`;

    body.querySelector('#sign-out')?.addEventListener('click', async () => {
      await auth.signOut();
      close('profile');
    });
    body.querySelector('#sign-in')?.addEventListener('click', () => {
      close('profile');
      this.openSignIn();
    });
    this.wireSettings(body);
    this.wireFormChart(body);
    $('#delete-data', body).addEventListener('click', () => this.confirmDelete());
  }

  private wireSettings(body: HTMLElement) {
    const form = $<HTMLFormElement>('#settings-form', body);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      updateSettings({
        displayName: String(f.get('displayName')).trim().slice(0, 30) || 'Player',
        favouriteTeam: String(f.get('favouriteTeam')) || null,
        battingHand: f.get('battingHand') === 'L' ? 'L' : 'R',
        difficulty: f.get('difficulty') as Settings['difficulty'],
        graphicsQuality: f.get('graphicsQuality') as Settings['graphicsQuality'],
        commentary: f.get('commentary') === 'on',
      });
      this.onSettingsLoaded(settings());
      await this.syncSettings();
      const msg = $('#settings-msg', body);
      msg.textContent = auth.currentUser() ? 'Saved to your account.' : 'Saved on this device.';
      msg.classList.remove('hidden');
    });
  }

  private wireFormChart(body: HTMLElement) {
    const chart = body.querySelector<HTMLElement>('.form-chart');
    const tip = body.querySelector<HTMLElement>('.form-tip');
    if (!chart || !tip) return;
    chart.querySelectorAll<SVGGElement>('.hit').forEach((g) => {
      const show = () => {
        tip.innerHTML = g.dataset.tip!;
        tip.classList.add('on');
        const r = g.getBoundingClientRect();
        const c = chart.getBoundingClientRect();
        tip.style.left = `${Math.min(c.width - 150, Math.max(0, r.left - c.left + r.width / 2 - 75))}px`;
        g.classList.add('hover');
      };
      const hide = () => {
        tip.classList.remove('on');
        g.classList.remove('hover');
      };
      g.addEventListener('mouseenter', show);
      g.addEventListener('mouseleave', hide);
      g.addEventListener('focus', show);
      g.addEventListener('blur', hide);
    });
  }

  private confirmDelete() {
    const user = auth.currentUser();
    const body = overlay('confirm-delete', false);
    body.innerHTML = `<h2>${user ? 'Delete account?' : 'Clear progress?'}</h2>
      <p class="muted">${user ? 'This permanently deletes your account, matches, stats, badges, settings and calibration. It cannot be undone.' : 'This clears guest matches, stats and badges saved on this device.'}</p>
      <div class="menu-buttons"><button class="btn danger" id="del-yes">${user ? 'Delete everything' : 'Clear'}</button><button class="btn ghost" id="del-no">Cancel</button></div>
      <p id="del-msg" class="form-msg hidden"></p>`;
    $('#del-no', body).addEventListener('click', () => close('confirm-delete'));
    $('#del-yes', body).addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      busy(btn, true, 'Deleting…');
      const msg = $('#del-msg', body);
      try {
        if (user) {
          await api.deleteAccountData();
          try {
            await auth.deleteAccount();
          } catch (err) {
            // Game data is gone; the sign-in itself may need a fresh login to delete.
            await auth.signOut();
            msg.className = 'form-msg';
            msg.textContent = `Your game data was deleted. The sign-in itself could not be removed (${(err as Error).message}); sign in again and repeat to finish.`;
            return;
          }
        } else {
          localStorage.removeItem('aca.guest.v1');
        }
        close('confirm-delete');
        close('profile');
      } catch (err) {
        msg.className = 'form-msg err';
        msg.textContent = (err as Error).message;
        busy(btn, false, 'Try again');
      }
    });
  }

  // ---------------------------------------------------------------- leaderboards

  async openLeaderboard() {
    const body = overlay('leaders');
    let board: BoardId = 'top_score';
    let period: 'all' | 'week' = 'all';
    let ground = '';
    const labels: Record<BoardId, [string, string]> = { top_score: ['Top scores', 'Runs'], most_sixes: ['Most sixes', 'Sixes'], fastest_ball: ['Fastest balls', 'km/h'] };
    const seg = <T extends string>(name: string, opts: [T, string][], on: T) =>
      `<div class="seg" data-f="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${v === on ? 'on' : ''}" aria-pressed="${v === on}">${l}</button>`).join('')}</div>`;
    const render = async () => {
      body.innerHTML = `<h2>Leaderboards</h2>
        <div class="filters">
          ${seg<BoardId>('board', [['top_score', 'Top score'], ['most_sixes', 'Sixes'], ['fastest_ball', 'Fastest']], board)}
          ${seg('period', [['all', 'All time'], ['week', 'This week']], period)}
          ${seg('ground', [['', 'All grounds'], ...Object.values(GROUNDS).map((g) => [g.id, g.id === 'mcg' ? 'MCG' : g.name] as [string, string])], ground)}
        </div>
        <div class="lb-body"><p class="muted">Loading…</p></div>`;
      body.querySelectorAll<HTMLElement>('.filters .seg').forEach((s) =>
        s.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
          b.addEventListener('click', () => {
            const v = b.dataset.v!;
            if (s.dataset.f === 'board') board = v as BoardId;
            else if (s.dataset.f === 'period') period = v as 'all' | 'week';
            else ground = v;
            void render();
          }),
        ),
      );
      const out = $('.lb-body', body);
      try {
        const { entries } = await api.leaderboard(board, period, ground);
        out.innerHTML = entries.length
          ? `<table class="lb"><tr><th class="n">#</th><th>Player</th><th>Team</th><th>Ground</th><th class="n">${labels[board][1]}</th></tr>
            ${entries
              .map(
                (e, i) =>
                  `<tr><td class="n">${i + 1}</td><td>${esc(e.name)}</td><td>${esc(teamById(e.team).short)}</td><td>${esc(GROUNDS[e.ground as keyof typeof GROUNDS]?.name ?? e.ground)}</td><td class="n"><b>${board === 'fastest_ball' ? e.value.toFixed(1) : e.value}</b></td></tr>`,
              )
              .join('')}</table>`
          : `<p class="muted">No ${labels[board][0].toLowerCase()} yet${period === 'week' ? ' this week' : ''}. Sign in and play to get on the board.</p>`;
      } catch (err) {
        const offline = err instanceof ApiError && (err.status === 0 || err.status === 503 || err.status === 404);
        out.innerHTML = `<p class="muted">${offline ? 'Leaderboards need the online database, which isn’t reachable right now.' : esc((err as Error).message)}</p>`;
      }
    };
    await render();
  }
}

// ---------------------------------------------------------------- pieces

function statTiles(s: CareerStats) {
  const sr = s.ballsFaced ? ((s.runs / s.ballsFaced) * 100).toFixed(0) : '–';
  const econ = s.ballsBowled ? ((s.runsConceded / s.ballsBowled) * 6).toFixed(1) : '–';
  const tiles: [string, string | number][] = [
    ['Matches', s.matches],
    ['Won', `${s.wins}<small> / ${s.losses}L${s.ties ? ` ${s.ties}T` : ''}</small>`],
    ['Runs', s.runs],
    ['Highest', s.highest],
    ['Strike rate', sr],
    ['4s / 6s', `${s.fours} / ${s.sixes}`],
    ['Wickets', s.wickets],
    ['Best', s.bestWkts ? `${s.bestWkts}-${s.bestRuns}` : '–'],
    ['Economy', econ],
    ['Fastest', s.fastestKmh ? `${s.fastestKmh.toFixed(1)}<small> km/h</small>` : '–'],
  ];
  return `<div class="tiles">${tiles.map(([k, v]) => `<div class="tile"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
}

/** Your side's batting total in each of the last 12 matches, oldest left. One series, so no legend. */
function formChart(matches: SavedMatch[]) {
  const recent = matches.slice(0, 12).reverse();
  if (!recent.length) return `<p class="muted">Your batting scores will appear here.</p>`;
  const W = 600;
  const H = 150;
  const pad = { l: 28, r: 6, t: 10, b: 22 };
  const max = Math.max(20, ...recent.map((m) => m.homeRuns));
  const top = Math.ceil(max / 10) * 10;
  const slot = (W - pad.l - pad.r) / 12;
  const bw = Math.min(26, slot * 0.6);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const grid = [0, top / 2, top]
    .map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pad.l - 6}" y="${y(v) + 4}" class="axis" text-anchor="end">${v}</text>`)
    .join('');
  const bars = recent
    .map((m, i) => {
      const x = pad.l + slot * i + (slot - bw) / 2;
      const h = Math.max(2, y(0) - y(m.homeRuns));
      const yy = y(0) - h;
      const r = Math.min(4, bw / 2, h);
      // Rounded top, square base on the baseline.
      const d = `M${x},${y(0)} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy + r} V${y(0)} Z`;
      const name = (id: string) => m.scorecard.teamNames?.[id] ?? teamById(id).name;
      const tip = `<b>${m.homeRuns}/${m.homeWickets}</b> v ${esc(name(m.away))}<br>${m.result === 'won' ? 'Won' : m.result === 'lost' ? 'Lost' : 'Tied'} ${esc(m.margin)}<br><span>${new Date(m.playedAt).toLocaleDateString()}</span>`;
      const res = m.result === 'won' ? 'W' : m.result === 'lost' ? 'L' : 'T';
      return `<g class="hit" tabindex="0" data-tip="${esc(tip)}" aria-label="${m.homeRuns} runs, ${res}"><rect x="${pad.l + slot * i}" y="${pad.t}" width="${slot}" height="${H - pad.t - pad.b}" fill="transparent"/><path d="${d}" class="bar"/><text x="${x + bw / 2}" y="${H - 6}" class="axis" text-anchor="middle">${res}</text></g>`;
    })
    .join('');
  return `<div class="form-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Your batting totals in recent matches">${grid}${bars}</svg><div class="form-tip" role="status"></div></div>`;
}

function historyRow(m: SavedMatch) {
  const name = (id: string) => m.scorecard.teamNames?.[id] ?? teamById(id).name;
  const home = teamById(m.home);
  const date = new Date(m.playedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return `<details class="match">
    <summary><span class="res ${m.result}">${m.result === 'won' ? 'W' : m.result === 'lost' ? 'L' : 'T'}</span>
      <span class="who"><i class="sw" style="background:${hex(home.shirt)}"></i>${esc(name(m.home))} <b>${m.homeRuns}/${m.homeWickets}</b> v ${esc(name(m.away))} <b>${m.awayRuns}/${m.awayWickets}</b></span>
      <span class="when">${esc(GROUNDS[m.ground as keyof typeof GROUNDS]?.name ?? m.ground)} · ${date}</span></summary>
    <p class="margin">${m.result === 'tied' ? 'Match tied' : `${esc(m.result === 'won' ? name(m.home) : name(m.away))} won ${esc(m.margin)}`}</p>
    ${m.scorecard.innings.map((i) => summaryCard(i, name)).join('')}
  </details>`;
}

function summaryCard(s: InningsSummary, name: (id: string) => string) {
  const balls = (b: number) => `${Math.floor(b / 6)}.${b % 6}`;
  return `<h4>${esc(name(s.batting))} ${s.runs}/${s.wickets} <span>(${balls(s.legalBalls)} ov · extras ${s.wides + s.noBalls})</span></h4>
    <table><tr><th>Batter</th><th></th><th class="n">R</th><th class="n">B</th><th class="n">4s</th><th class="n">6s</th></tr>
    ${s.batters.map((b) => `<tr><td>${esc(b.name)}</td><td class="how">${esc(b.out || 'not out')}</td><td class="n"><b>${b.runs}</b></td><td class="n">${b.balls}</td><td class="n">${b.fours}</td><td class="n">${b.sixes}</td></tr>`).join('')}
    <tr><th>Bowler</th><th></th><th class="n">O</th><th class="n">M</th><th class="n">R</th><th class="n">W</th></tr>
    ${s.bowlers.map((b) => `<tr><td>${esc(b.name)}</td><td></td><td class="n">${balls(b.balls)}</td><td class="n">${b.maidens}</td><td class="n">${b.runs}</td><td class="n"><b>${b.wkts}</b></td></tr>`).join('')}
    </table>`;
}

function settingsForm() {
  const s = settings();
  const opt = (v: string, label: string, cur: string | null) => `<option value="${v}" ${v === (cur ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
  return `<form id="settings-form" class="form settings">
    <label>Display name<input name="displayName" maxlength="30" value="${esc(s.displayName)}"></label>
    <label>Favourite team<select name="favouriteTeam">${opt('', 'None', s.favouriteTeam)}${TEAMS.map((t) => opt(t.id, t.name, s.favouriteTeam)).join('')}</select></label>
    <label>Batting hand<select name="battingHand">${opt('R', 'Right-handed', s.battingHand)}${opt('L', 'Left-handed', s.battingHand)}</select></label>
    <label>Difficulty<select name="difficulty">${opt('easy', 'Easy', s.difficulty)}${opt('medium', 'Medium', s.difficulty)}${opt('hard', 'Hard', s.difficulty)}</select></label>
    <label>Graphics<select name="graphicsQuality">${opt('low', 'Low (fastest)', s.graphicsQuality)}${opt('medium', 'Medium', s.graphicsQuality)}${opt('high', 'High', s.graphicsQuality)}</select></label>
    <label class="check"><input type="checkbox" name="commentary" ${s.commentary ? 'checked' : ''}> Spoken commentary</label>
    <div class="menu-buttons"><button class="btn primary small" type="submit">Save settings</button><span id="settings-msg" class="form-msg hidden"></span></div>
  </form>`;
}
