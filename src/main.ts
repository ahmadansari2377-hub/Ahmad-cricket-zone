import * as THREE from 'three';
import './style.css';
import './account.css';
import './broadcast.css';
import './theme.css';
import { hex } from './ui/scorecard';
import type { Team } from './data/teams';
import { Sounds } from './audio/sounds';
import { GROUNDS, type GroundId, type TimeOfDay } from './data/grounds';
import type { Difficulty } from './game/difficulty';
import { Game, type MatchMode } from './game/game';
import { setGround } from './game/groundState';
import { CalibrationFlow } from './input/calibration';
import { KeyboardInput } from './input/keyboardFallback';
import { WebcamControl } from './input/webcamControl';
import { drawPose } from './ui/pip';
import { Bat, BAT_STANCE_HANDS, batPose } from './pov/firstPersonBat';
import { CameraRig } from './scene/cameras';
import { createGround } from './scene/ground';
import { createEnvironment, createRenderer } from './scene/renderer';
import { grassUniforms, setGrassDensity } from './scene/grass';
import { createStadiums } from './scene/stadium';
import { Humanoid } from './scene/players';
import { Hud } from './ui/hud';
import { TeamPicker } from './ui/menus';
import { Account } from './ui/account';
import { ACHIEVEMENTS } from './game/record';
import { onCalibrationSaved } from './input/webcamControl';
import { saveMatch } from './services/progress';
import { onSettings, settings, updateSettings, type Settings } from './services/settings';
import { authEnabled, currentUser } from './services/auth';

const app = document.getElementById('app')!;
const renderer = createRenderer(app);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.05, 6000);
// The camera is in the scene so first-person items attached to it (bowling arm) render.
scene.add(camera);

const env = createEnvironment(scene, renderer, camera);
const ground = createGround(scene);
const stumps = { batEnd: ground.batEnd, bowlEnd: ground.bowlEnd };
const stadium = createStadiums(scene);
const bat = new Bat(scene);
const rig = new CameraRig(camera);
const hud = new Hud();
const sounds = new Sounds();
const input = new KeyboardInput(renderer.domElement);
const webcam = new WebcamControl();
const calibration = new CalibrationFlow(webcam);
const pipCanvas = document.getElementById('pip-canvas') as HTMLCanvasElement;

const game = new Game({ scene, rig, hud, sounds, input, stadium, stumps, bat, webcam, ground });

// ---- Teams ----
const teams = new TeamPicker();
function showFixture() {
  document.getElementById('fixture-home')!.textContent = teams.home.name;
  document.getElementById('fixture-away')!.textContent = teams.away.name;
  showJersey('mu-home', teams.home);
  showJersey('mu-away', teams.away);
}
/** Menu match-up card: each side's shirt in its own colours. */
function showJersey(id: string, t: Team) {
  const el = document.getElementById(id)!;
  el.style.setProperty('--shirt', hex(t.shirt));
  el.style.setProperty('--trim', hex(t.trim));
  el.querySelector('.mu-name')!.textContent = t.name;
}
teams.onChange = showFixture;
showFixture();

// ---- Ground and time of day ----
let groundId: GroundId = 'lords';
let timeOfDay: TimeOfDay = 'day';
let difficulty: Difficulty = settings().difficulty;

// ---- Accounts, settings and saving ----
const account = new Account();
function showDifficulty(d: Difficulty) {
  for (const b of document.querySelectorAll<HTMLButtonElement>('.seg[data-pick="difficulty"] button')) {
    b.classList.toggle('on', b.dataset.v === d);
    b.setAttribute('aria-pressed', String(b.dataset.v === d));
  }
}
showDifficulty(difficulty);
account.onSettingsLoaded = (s: Settings) => {
  difficulty = s.difficulty;
  showDifficulty(difficulty);
};
onCalibrationSaved((c) => void account.syncCalibration(c));

game.onMatchEnd = async (record) => {
  const el = document.getElementById('result-save')!;
  el.className = 'result-save';
  el.textContent = 'Saving…';
  try {
    const out = await saveMatch(record);
    const badges = out.newAchievements.map((c) => ACHIEVEMENTS[c]?.title ?? c);
    el.innerHTML =
      (out.where === 'account' ? 'Saved to your account.' : authEnabled ? 'Saved on this device. Sign in to keep it in your account and get on the leaderboards.' : 'Saved on this device.') +
      (badges.length ? ` <b>New badge${badges.length > 1 ? 's' : ''}: ${badges.join(', ')}</b>` : '');
  } catch (err) {
    console.error(err);
    el.classList.add('err');
    el.textContent = currentUser() ? `Not saved: ${(err as Error).message}` : 'This match could not be saved.';
  }
};
function applyWorld() {
  const info = GROUNDS[groundId];
  setGround(info);
  ground.setGround(info);
  stadium.setGround(info, timeOfDay);
  env.apply(info, timeOfDay);
  document.getElementById('fixture-venue')!.textContent = `${info.name}, ${info.city}${timeOfDay === 'night' ? ' · under lights' : ''}`;
  document.getElementById('mu-venue')!.textContent = `${info.name} · ${timeOfDay === 'night' ? 'Day-night' : 'Day match'}`;
}
applyWorld();

// ---- Graphics quality (from settings; lowered automatically if the frame rate struggles) ----
const QUALITY_ORDER = ['low', 'medium', 'high'] as const;
function applyQuality(q: Settings['graphicsQuality']) {
  env.setQuality(q);
  setGrassDensity(q === 'high' ? 1 : q === 'medium' ? 0.45 : 0);
  env.resize(window.innerWidth, window.innerHeight);
}
applyQuality(settings().graphicsQuality);
onSettings((s) => applyQuality(s.graphicsQuality));
const perf = { frames: 0, time: 0, lowered: 0 };
function watchFrameRate(dt: number) {
  perf.frames++;
  perf.time += dt;
  if (perf.time < 5) return;
  const fps = perf.frames / perf.time;
  perf.frames = 0;
  perf.time = 0;
  const q = settings().graphicsQuality;
  const i = QUALITY_ORDER.indexOf(q);
  // Only during play, at most twice, and never below low.
  if (fps < 32 && i > 0 && perf.lowered < 2 && !document.getElementById('hud')!.classList.contains('hidden') && !game.paused) {
    perf.lowered++;
    updateSettings({ graphicsQuality: QUALITY_ORDER[i - 1] });
    void account.syncSettings();
    hud.flash('Graphics lowered', `${Math.round(fps)} fps · now ${QUALITY_ORDER[i - 1]} quality (change in Profile)`, 'info', 2600);
  }
}

for (const seg of document.querySelectorAll<HTMLElement>('.seg[data-pick]')) {
  for (const btn of seg.querySelectorAll<HTMLButtonElement>('button')) {
    btn.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('on', b === btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });
      if (seg.dataset.pick === 'difficulty') {
        difficulty = btn.dataset.v as Difficulty;
        updateSettings({ difficulty });
        return void account.syncSettings();
      }
      if (seg.dataset.pick === 'ground') groundId = btn.dataset.v as GroundId;
      else timeOfDay = btn.dataset.v as TimeOfDay;
      applyWorld();
    });
  }
}

let scorecardOpen = false;
function toggleScorecard(open = !scorecardOpen) {
  const html = game.scorecard();
  if (open && !html) return;
  scorecardOpen = open;
  if (html) document.getElementById('scorecard-body')!.innerHTML = html;
  hud.show('scorecard', open);
  // The match waits while you read the card.
  game.paused = open || !document.getElementById('pause')!.classList.contains('hidden');
}

input.onPause = () => {
  if (scorecardOpen) toggleScorecard(false);
  game.paused = !game.paused;
  hud.show('pause', game.paused);
};

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Tab' || !input.enabled) return;
  e.preventDefault();
  if (!e.repeat) toggleScorecard();
});

let mode: 'webcam' | 'keyboard' = 'keyboard';
let matchMode: MatchMode = 'full';

for (const btn of document.querySelectorAll<HTMLButtonElement>('.role')) {
  btn.addEventListener('click', () => {
    matchMode = btn.dataset.mode as MatchMode;
    for (const b of document.querySelectorAll<HTMLButtonElement>('.role')) {
      b.classList.toggle('on', b === btn);
      b.setAttribute('aria-checked', String(b === btn));
    }
  });
}

const startMatch = () => {
  sounds.start();
  hud.setControl(mode);
  webcam.enabled = mode === 'webcam';
  game.startMatch({ mode: matchMode, home: teams.home, away: teams.away, difficulty, timeOfDay });
};

document.getElementById('btn-start')!.addEventListener('click', () => {
  mode = 'keyboard';
  startMatch();
});

document.getElementById('btn-webcam')!.addEventListener('click', async () => {
  hud.menuError('');
  sounds.start();
  try {
    if (!webcam.tracker.active) {
      hud.show('loading', true);
      // The fast model: a high frame rate catches the swing; the full model was too slow on many laptops.
      await webcam.tracker.start('lite');
    }
  } catch (err) {
    console.error(err);
    const name = (err as DOMException)?.name;
    hud.menuError(
      name === 'NotAllowedError'
        ? 'Camera access was blocked. Allow it in your browser settings, or play with keyboard.'
        : name === 'NotFoundError'
          ? 'No webcam found. Plug one in, or play with keyboard.'
          : 'The webcam could not start. You can still play with keyboard.',
    );
    return;
  } finally {
    hud.show('loading', false);
  }
  hud.show('menu', false);
  const ok = await calibration.run();
  if (!ok) {
    hud.show('menu', true);
    return;
  }
  mode = 'webcam';
  startMatch();
});

document.getElementById('btn-again')!.addEventListener('click', startMatch);
document.getElementById('btn-menu')!.addEventListener('click', () => {
  hud.show('result', false);
  hud.show('hud', false);
  hud.show('menu', true);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  env.resize(window.innerWidth, window.innerHeight);
});

const timer = new THREE.Timer();
renderer.setAnimationLoop((now) => {
  timer.update(now);
  const raw = timer.getDelta();
  const dt = Math.min(raw, 1 / 20);
  if (!document.hidden) watchFrameRate(raw);
  const time = timer.getElapsed();
  if (webcam.enabled && webcam.tracker.active) {
    webcam.update(dt);
    rig.headOffset.copy(webcam.headOffset);
    // Your real hands hold the bat between swings.
    bat.tracked = game.role === 'bat' && webcam.handsWorld ? batPose(BAT_STANCE_HANDS.clone().add(webcam.handsWorld), webcam.batDir) : null;
    drawPose(pipCanvas, webcam.tracker, webcam.tracker.latest, {
      power: webcam.livePower,
      peak: webcam.peakPower,
      flash: webcam.swingFlash,
    });
    hud.fps(`${Math.round(webcam.tracker.fps)} fps`);
  } else {
    rig.headOffset.set(0, 0, 0);
    bat.tracked = null;
  }
  game.update(dt, time);
  Humanoid.updateAll(dt);
  stadium.update(time);
  grassUniforms.uTime.value = time;
  env.composer.render(dt);
});

// Exposed for debugging in the browser console during development only.
if (import.meta.env.DEV) {
  Object.assign(window, {
    game,
    webcam,
    startWebcamMatch: (m: MatchMode = 'full') => {
      mode = 'webcam';
      matchMode = m;
      startMatch();
    },
    startKeyboardMatch: (m: MatchMode = 'full') => {
      mode = 'keyboard';
      matchMode = m;
      startMatch();
    },
  });
}
