import * as THREE from 'three';
import type { Sounds } from '../audio/sounds';
import { AUSTRALIA, PAKISTAN, Player, Team } from '../data/teams';
import type { SwingUpdate } from '../input/batGesture';
import type { KeyboardInput } from '../input/keyboardFallback';
import type { WebcamControl } from '../input/webcamControl';
import { BowlingArm } from '../pov/bowlingPov';
import { strokeStyle, type Bat } from '../pov/firstPersonBat';
import type { CameraRig } from '../scene/cameras';
import type { Ground } from '../scene/ground';
import { Humanoid } from '../scene/players';
import type { Stumps } from '../scene/stumps';
import type { Hud } from '../ui/hud';
import { commentate } from '../audio/commentary';
import { HawkEye } from '../scene/hawkeye';
import { DrsView } from '../ui/drsView';
import { inningsCard } from '../ui/scorecard';
import { inningsBreak, runToss } from '../ui/toss';
import { aiSwing } from './ai/aiBatter';
import { BowlControl, Delivery, lengthName, planDelivery, Variation } from './ai/aiBowler';
import { resolveShot, ShotResult, Swing, SWING_DELAY } from './batting';
import { BALL_R, PITCH_LEN } from './constants';
import { DIFFICULTY, Difficulty } from './difficulty';
import { FieldEvent, Fielder, Fielding } from './fielding';
import { ground, groundY } from './groundState';
import { checkLbw, LbwCheck } from './lbw';
import { BallOutcome, Match } from './match';
import { newMatchId, type MatchRecord } from './record';
import { falseNick, snickTrace, trackLbw, TrackingVerdict, umpireLbw } from './drs';
import { Recorder, ReplayKind, replayShots, Shot } from './replay';
import { indexAt, sampleAt, Sample, simulate } from './physics';

type Phase = 'menu' | 'prep' | 'runup' | 'delivery' | 'inplay' | 'dead' | 'over' | 'decision' | 'review' | 'replay';

/** An umpire's decision that may be reviewed with DRS. */
interface Decision {
  kind: 'lbw' | 'caught';
  umpireOut: boolean;
  wicket: string;
  outSub: string;
  lbw?: LbwCheck;
  played?: boolean;
  edge?: boolean;
}
export type Role = 'bat' | 'bowl';
/** 'full': toss and two innings. 'chase' / 'defend': one innings against a set target. */
export type MatchMode = 'full' | 'chase' | 'defend';

export interface MatchSetup {
  mode: MatchMode;
  /** The player's side. */
  home: Team;
  /** The computer's side. */
  away: Team;
  difficulty: Difficulty;
  timeOfDay: 'day' | 'night';
}

export interface GameDeps {
  scene: THREE.Scene;
  rig: CameraRig;
  hud: Hud;
  sounds: Sounds;
  input: KeyboardInput;
  stadium: { setCheer(v: number): void; screen(title: string, main: string, sub: string): void };
  ground: Pick<Ground, 'markBounce' | 'markFootmark' | 'resetWear'>;
  stumps: { batEnd: Stumps; bowlEnd: Stumps };
  bat: Bat;
  webcam: WebcamControl;
}

const PACE_OPTIONS: [Variation, string][] = [
  ['stock', 'Stock ball'],
  ['inswing', 'Inswinger'],
  ['outswing', 'Outswinger'],
  ['slower', 'Slower ball'],
];
const SPIN_OPTIONS = (leg: boolean): [Variation, string][] => [
  ['stock', leg ? 'Leg break' : 'Off break'],
  ['other', leg ? 'Googly' : 'Doosra'],
  ['slower', leg ? 'Flipper' : 'Arm ball'],
];

export class Game {
  phase: Phase = 'menu';
  role: Role = 'bat';
  paused = false;
  private t = 0;
  private match!: Match;
  private home: Team = PAKISTAN;
  private away: Team = AUSTRALIA;
  private batting: Team = PAKISTAN;
  private bowling: Team = AUSTRALIA;
  private difficulty: Difficulty = 'medium';
  private timeOfDay: 'day' | 'night' = 'day';
  /** Called with the full ball-by-ball record when a match finishes. */
  onMatchEnd: (record: MatchRecord) => void = () => {};
  private fielding: Fielding | null = null;

  private delivery: Delivery | null = null;
  private swing: Swing | null = null;
  private shot: ShotResult | null = null;
  private hitPath: Sample[] | null = null;
  private event: FieldEvent | null = null;
  private eventFired = false;
  private resolved = false;
  private stumpsHit = false;
  private playedOn = false;
  private outcome: BallOutcome | null = null;
  private deadFor = 0;
  private holdUntil = 0;
  private fieldingFor = '';
  private webcamSwing = false;
  /** performance.now() seconds at the last update, paired with this.t. */
  private perfAt = 0;
  private runDur = 2.6;
  private lastBounces = 0;
  private cheer = 0;
  private umpireSignal: 'out' | 'four' | 'six' | 'wide' | 'noball' | 'none' = 'none';
  private mode: MatchMode = 'full';
  private innings: Match[] = [];
  /** The current delivery is a no-ball (front foot over the crease). */
  private noBall = false;
  private lbw: LbwCheck | null = null;
  private padPath: Sample[] | null = null;

  // Replays and DRS.
  private recorder = new Recorder();
  private replay: { shots: Shot[]; idx: number; t: number; then: () => void } | null = null;
  private replayKind: ReplayKind | null = null;
  private noReplay = false;
  private hawk: HawkEye;
  private drs = new DrsView();
  /** Reviews left this innings for the batting and bowling sides. */
  private reviews = { bat: 1, bowl: 1 };
  private decision: Decision | null = null;
  /** While a decision is on screen: when it applies, and whether the player may review. */
  private pending: { t: number; limit: number; prompt: boolean; then: () => void } | null = null;
  private review: {
    t: number;
    side: 'bat' | 'bowl';
    verdict: TrackingVerdict | null;
    trace: number[] | null;
    finalOut: boolean;
    overturned: boolean;
    umpiresCall: boolean;
    step: number;
  } | null = null;

  // Bowling (player is the bowler).
  private bowlControl: BowlControl = { line: -0.15, length: 5.5, variation: 'stock' };
  private variationIdx = 0;
  private bowlRequested = false;
  private marker: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private arm: BowlingArm | null = null;
  private bowlerEyes = new THREE.Vector3();

  private ball: THREE.Group;
  private ballPos = new THREE.Vector3();
  private bowler!: Humanoid;
  private bowlerFielder!: Fielder;
  private batter!: Humanoid;
  private nonStriker!: Humanoid;
  private umpire: Humanoid;
  private legUmpire: Humanoid;
  private celebrating: Humanoid | null = null;

  constructor(private d: GameDeps) {
    const { scene } = d;
    this.ball = makeBall();
    scene.add(this.ball);
    this.hawk = new HawkEye(scene);
    this.drs.onReview = () => this.requestReview();

    this.umpire = new Humanoid({ shirt: 0x1d2b4f, trousers: 0x16161a, head: 'hat', headColor: 0xf2efe6, skin: 0xc79a7a });
    this.legUmpire = new Humanoid({ shirt: 0x1d2b4f, trousers: 0x16161a, head: 'hat', headColor: 0xf2efe6, skin: 0x8d5f43 });
    this.umpire.smooth = this.legUmpire.smooth = true;
    scene.add(this.umpire.group, this.legUmpire.group);
    this.umpire.group.position.set(0.7, 0, PITCH_LEN + 2.3);
    this.umpire.group.rotation.y = Math.PI;
    this.placeUmpires();
    this.buildCast();

    // Target marker for the player's bowling: where the ball should pitch.
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.32, 40),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.22, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    disc.position.z = -0.001;
    this.marker.add(disc);
    // Upright glowing target that always faces the bowler: readable even at a grazing angle.
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 14;
    g.beginPath();
    g.arc(64, 64, 48, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255,210,63,0.9)';
    g.beginPath();
    g.arc(64, 64, 14, 0, Math.PI * 2);
    g.fill();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    sprite.scale.set(0.55, 0.55, 1);
    sprite.position.set(0, 0, 0.3); // ring's local +z is world up
    this.marker.add(sprite);
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.01;
    this.marker.visible = false;
    scene.add(this.marker);

    d.input.onSwing = (defend) => {
      if (this.phase === 'replay') return this.endReplay();
      if (this.phase === 'decision' || this.phase === 'review') return;
      if (this.role === 'bowl') this.requestBowl();
      else this.onSwing(defend);
    };
    d.input.onKey = (code) => this.onKey(code);
    d.webcam.onSwingStart = (u) => this.onWebcamSwing(u);
    d.webcam.onSwingUpdate = (u) => this.refineWebcamSwing(u);
    d.input.onCamera = () => {
      d.rig.toggle();
      d.hud.camMode(d.rig.mode);
    };
  }

  /** Square-leg umpire stands on the (possibly sloping) outfield. */
  private placeUmpires() {
    this.legUmpire.group.position.set(24, groundY(24), POPPING_Z);
    this.legUmpire.group.lookAt(0, groundY(24), POPPING_Z);
  }

  /** (Re)creates the batters and bowler in the right team colours. */
  private buildCast() {
    const { scene } = this.d;
    for (const h of [this.bowler, this.batter, this.nonStriker]) if (h) scene.remove(h.group);
    const bat = this.batting;
    const bowl = this.bowling;
    const batKit = { shirt: bat.shirt, trousers: bat.trousers, trim: bat.trim, head: 'helmet' as const, headColor: bat.helmet, pads: true, gloves: true };
    this.bowler = new Humanoid({ shirt: bowl.shirt, trousers: bowl.trousers, trim: bowl.trim, head: 'none' });
    this.batter = new Humanoid(batKit);
    this.nonStriker = new Humanoid(batKit);
    this.nonStriker.smooth = true;
    scene.add(this.bowler.group, this.batter.group, this.nonStriker.group);
    this.bowlerFielder = { role: 'bowler', name: '', body: this.bowler, home: new THREE.Vector3(0, 0, PITCH_LEN - 3), pos: new THREE.Vector3(), runPhase: 0 };
    this.nonStriker.group.position.set(1.3, 0, PITCH_LEN - 1.6);
    this.nonStriker.group.rotation.y = Math.PI;
    this.batter.group.position.set(0.42, 0, 0.95);
    this.batter.group.rotation.y = -1.25;
    this.bowler.group.position.set(-0.7, 0, PITCH_LEN + 16);
    this.bowler.group.rotation.y = Math.PI;
  }

  async startMatch(setup: MatchSetup) {
    const { hud } = this.d;
    const { mode } = setup;
    this.mode = mode;
    this.home = setup.home;
    this.away = setup.away;
    this.difficulty = setup.difficulty;
    this.timeOfDay = setup.timeOfDay;
    this.innings = [];
    this.phase = 'over';
    hud.show('menu', false);
    hud.show('result', false);
    this.placeUmpires();
    this.d.ground.resetWear();
    if (mode === 'full') {
      hud.show('hud', false);
      const firstRole = await runToss(this.home, this.away, () => this.d.sounds.coin());
      this.beginInnings(firstRole, null);
    } else {
      this.beginInnings(mode === 'chase' ? 'bat' : 'bowl', 20 + Math.floor(Math.random() * 11));
    }
  }

  private beginInnings(role: Role, target: number | null) {
    const { scene, hud, rig } = this.d;
    this.role = role;
    this.batting = role === 'bat' ? this.home : this.away;
    this.bowling = role === 'bat' ? this.away : this.home;
    this.buildCast();
    this.arm?.group.removeFromParent();
    this.arm = role === 'bowl' ? new BowlingArm(rig.camera, this.bowling.shirt) : null;

    this.match = new Match(this.batting, this.bowling, target);
    this.reviews = { bat: 1, bowl: 1 };
    if (this.innings.length === 0) commentate('innings');
    this.innings.push(this.match);
    this.fielding?.dispose(scene);
    this.fielding = null;
    this.fieldingFor = '';
    hud.show('hud', true);
    hud.camMode(rig.mode);
    hud.setRole(role);
    const venue = `${ground.info.name}, ${ground.info.city}`;
    if (target === null) hud.flash(role === 'bat' ? 'You bat first' : 'You bowl first', `${venue} · ${this.batting.name} innings · 2 overs`, 'info', 3200);
    else if (role === 'bat') hud.flash(`Target ${target}`, `${venue} · ${this.batting.name} need ${target} from 12 balls`, 'info', 3400);
    else hud.flash(`Defend ${target - 1}`, `${venue} · ${this.batting.name} need ${target} from 12 balls`, 'info', 3400);
    this.d.input.enabled = true;
    this.nextBall(1.8);
  }

  private nextBall(extraWait = 0) {
    const { hud, stumps, bat } = this.d;
    if (this.match.done) return void this.endInnings();
    this.match.newOverIfNeeded();

    const bowler = this.match.bowler;
    const spin = bowler.bowl === 'offspin' || bowler.bowl === 'legspin';
    this.runDur = spin ? 1.5 : 2.6;
    this.bowlerFielder.name = bowler.name;
    this.bowlerFielder.home.set(-0.4, 0, PITCH_LEN - 3);
    // Fielders are named from the bowling side, minus the current bowler.
    if (this.fieldingFor !== bowler.name) {
      this.fielding?.dispose(this.d.scene);
      this.fielding = new Fielding(this.d.scene, this.bowling, bowler.name);
      this.fieldingFor = bowler.name;
      if (this.variationIdx >= this.options().length) this.variationIdx = 0;
    }
    this.bowlerFielder.pos.copy(this.bowlerFielder.home);
    this.fielding!.setField(spin, this.bowlerFielder);

    stumps.batEnd.reset();
    stumps.bowlEnd.reset();
    bat.reset();
    this.delivery = null;
    this.swing = null;
    this.shot = null;
    this.hitPath = null;
    this.event = null;
    this.eventFired = false;
    this.resolved = false;
    this.stumpsHit = false;
    this.playedOn = false;
    this.outcome = null;
    this.lastBounces = 0;
    this.umpireSignal = 'none';
    this.celebrating = null;
    this.bowlRequested = false;
    this.noBall = false;
    this.lbw = null;
    this.padPath = null;
    this.replayKind = null;
    this.noReplay = false;
    this.decision = null;
    this.pending = null;
    this.umpire.reset();
    this.bowler.reset();
    this.ball.visible = true;
    this.phase = 'prep';
    this.t = -extraWait;
    hud.clearShot();
    hud.speed(null);
    hud.power(0);
    this.updateScore();
    const s = this.match.batters[this.match.striker].name;
    if (this.match.freeHit) hud.flash('FREE HIT', 'Cannot be bowled or caught', 'info', 1800);
    if (this.role === 'bowl') {
      hud.status(`${bowler.name} (you) to ${s}`);
      this.showBowlPanel();
    } else hud.status(`${bowler.name} to ${s}`);
  }

  // ---------------------------------------------------------------- batting input

  private onSwing(defend: boolean) {
    if (this.role !== 'bat' || this.swing || !(this.phase === 'runup' || this.phase === 'delivery')) return;
    const aimSign = this.d.rig.mode === 'pov' ? -1 : 1;
    const pressTime = this.phase === 'delivery' ? this.t : this.t - this.runDur;
    this.swing = {
      pressTime,
      aim: THREE.MathUtils.clamp(this.d.input.screenAim * aimSign, -1, 1),
      loft: this.d.input.loft,
      defend,
      power: 1,
    };
    this.webcamSwing = false;
    this.d.bat.swing(pressTime, this.swing.aim, this.swing.loft, defend, this.styleFor(this.swing.aim, this.swing.loft, defend));
  }

  /** Pull or cut a short ball, drive a pitched-up one. */
  private styleFor(aim: number, loft: boolean, defend: boolean) {
    const len = this.delivery?.length;
    return strokeStyle(aim, loft, defend, len === 'Short' || len === 'Bouncer');
  }

  /** Converts a performance.now() time (s) to the delivery clock. */
  private deliveryClockAt(perfSeconds: number) {
    const clock = this.t - (this.perfAt - perfSeconds);
    return this.phase === 'delivery' ? clock : clock - this.runDur;
  }

  private onWebcamSwing(u: SwingUpdate) {
    if (this.role !== 'bat' || this.paused || this.resolved || !(this.phase === 'runup' || this.phase === 'delivery')) return;
    // The bat meets the ball at this player's measured fastest point of the swing.
    const pressTime = this.deliveryClockAt(this.d.webcam.contactTime(u)) - SWING_DELAY;
    // Far too early to be a stroke at this ball (getting into the stance, a twitch during the run-up): ignore it.
    if (this.delivery && pressTime + SWING_DELAY < this.delivery.tContact - IGNORE_EARLY) return;
    if (this.swing) {
      // Only a webcam swing that would reach the ball far too early may be replaced:
      // hands moving in the stance or backlift must not use up the real stroke.
      const dl = this.delivery;
      const tooEarly = dl && this.swing.pressTime + SWING_DELAY < dl.tContact - EARLY_REPLACE;
      if (!this.webcamSwing || !tooEarly || pressTime <= this.swing.pressTime) return;
    }
    this.swing = { pressTime, aim: u.aim, loft: u.loft || this.d.input.loft, defend: u.defend, power: u.power };
    this.webcamSwing = true;
    this.d.bat.swing(pressTime, u.aim, this.swing.loft, u.defend, this.styleFor(u.aim, this.swing.loft, u.defend));
  }

  /** Power, direction and loft keep sharpening for a few frames until the ball arrives. */
  private refineWebcamSwing(u: SwingUpdate) {
    if (!this.swing || !this.webcamSwing || this.resolved) return;
    this.swing.aim = u.aim;
    this.swing.power = u.power;
    this.swing.loft = u.loft || this.d.input.loft;
    this.swing.defend = u.defend;
    this.d.bat.swing(this.swing.pressTime, u.aim, this.swing.loft, u.defend, this.styleFor(u.aim, this.swing.loft, u.defend));
  }

  // ---------------------------------------------------------------- bowling input

  private options() {
    const b = this.match?.bowler;
    if (!b) return PACE_OPTIONS;
    return b.bowl === 'offspin' || b.bowl === 'legspin' ? SPIN_OPTIONS(b.bowl === 'legspin') : PACE_OPTIONS;
  }

  private onKey(code: string) {
    if (code === 'KeyR' && this.phase === 'decision') return this.requestReview();
    if (code === 'Enter' && this.phase === 'replay') return this.endReplay();
    if (this.role !== 'bowl') return;
    const m = /^Digit([1-4])$/.exec(code);
    if (!m) return;
    const i = Number(m[1]) - 1;
    if (i < this.options().length && this.phase === 'prep') {
      this.variationIdx = i;
      this.showBowlPanel();
    }
  }

  private requestBowl() {
    if (this.phase === 'prep' && this.t > -0.5) this.bowlRequested = true;
  }

  private showBowlPanel() {
    const opts = this.options();
    this.d.hud.bowlPanel(
      opts.map(([, label]) => label),
      this.variationIdx,
      `${lengthName(this.bowlControl.length, opts !== PACE_OPTIONS)} · ${lineName(this.bowlControl.line)}`,
    );
  }

  /** Mouse ray onto the pitch sets where the player wants the ball to land. */
  private aimBowl() {
    const { input, rig } = this.d;
    this.raycaster.setFromCamera(new THREE.Vector2(input.mouse.x, input.mouse.y), rig.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) {
      this.bowlControl.line = THREE.MathUtils.clamp(hit.x, -1.4, 1.2);
      this.bowlControl.length = THREE.MathUtils.clamp(hit.z, 0.5, 12);
    }
    this.bowlControl.variation = this.options()[this.variationIdx][0];
    this.marker.position.set(this.bowlControl.line, 0.01, this.bowlControl.length);
    this.showBowlPanel();
  }

  // ---------------------------------------------------------------- frame update

  update(dt: number, time: number) {
    const { rig, hud, input, stumps, bat } = this.d;
    input.update(dt);
    hud.aim(input.screenAim, input.loft);
    stumps.batEnd.update(dt);
    stumps.bowlEnd.update(dt);
    this.cheer = Math.max(0, this.cheer - dt * 0.35);
    this.d.stadium.setCheer(this.cheer);

    if (this.paused) return;
    this.t += dt;
    if (this.phase === 'replay') return this.updateReplay(dt);
    if (this.phase === 'review') return this.updateReview(dt);
    this.perfAt = performance.now() / 1000;
    const pov = rig.mode === 'pov';
    const bowlPov = pov && this.role === 'bowl' && this.phase !== 'menu' && this.phase !== 'over';
    this.batter.group.visible = !(pov && this.role === 'bat');
    this.bowler.group.visible = !bowlPov;
    if (this.arm) this.arm.visible = bowlPov && (this.phase === 'prep' || this.phase === 'runup' || this.phase === 'delivery');
    this.marker.visible = this.role === 'bowl' && this.phase === 'prep';
    if (this.celebrating) this.celebrating.celebrate(time);
    if (this.umpireSignal !== 'none') this.umpire.signal(this.umpireSignal, time);

    switch (this.phase) {
      case 'menu':
        rig.update('menu', time, dt, null);
        return;
      case 'prep':
        this.updatePrep();
        break;
      case 'runup':
        this.updateRunup();
        break;
      case 'delivery':
        this.updateDelivery(dt);
        break;
      case 'inplay':
        this.updateInPlay(dt);
        break;
      case 'dead':
        this.fielding?.animate(this.event, this.t + 10, this.ballPos, dt);
        this.deadFor -= dt;
        if (this.deadFor <= 0) this.afterBall();
        break;
      case 'decision': {
        const p = this.pending!;
        p.t += dt;
        // The ball keeps rolling away off the pad while the umpire decides.
        if (this.padPath && this.lbw) sampleAt(this.padPath, this.t - this.lbw.impact.t, this.ballPos);
        if (p.prompt) this.drs.prompt(1 - p.t / p.limit, this.reviews[this.role], 'DRS');
        if (p.t >= p.limit) {
          this.pending = null;
          this.drs.prompt(null);
          p.then();
        }
        break;
      }
      case 'over':
        break;
    }

    const bt = this.phase === 'delivery' ? this.t : this.swing ? this.swing.pressTime + 1 : 0;
    bat.update(bt);
    this.batterPose();
    // Everyone on the field watches the ball from the run-up until it is dead.
    if (this.phase === 'runup' || this.phase === 'delivery' || this.phase === 'inplay' || this.phase === 'dead' || this.phase === 'decision') {
      this.fielding?.watch(this.ballPos, time);
      for (const h of [this.umpire, this.legUmpire, this.nonStriker]) h.look(this.ballPos, time, false);
    }
    this.ball.position.copy(this.ballPos);
    // In bowling POV the ball is in the first-person hand until release.
    const ballInHand = this.phase === 'prep' || this.phase === 'runup';
    const showBall = this.ball.visible && !(bowlPov && ballInHand);
    this.ball.children.forEach((c) => (c.visible = showBall));

    // The bowler's eyes ride along with the run-up for bowling POV.
    let eyes: THREE.Vector3 | null = null;
    if (this.role === 'bowl') {
      this.bowler.group.updateMatrixWorld(true);
      this.bowler.head.getWorldPosition(this.bowlerEyes);
      this.bowlerEyes.y += 0.04;
      eyes = this.bowlerEyes;
    }
    if (this.phase === 'runup' || this.phase === 'delivery' || this.phase === 'inplay' || this.phase === 'dead' || this.phase === 'decision') {
      this.recorder.capture(dt);
    }
    const camPhase = this.phase === 'inplay' || this.phase === 'dead' ? 'inplay' : this.phase === 'delivery' ? 'delivery' : 'prep';
    // With the webcam your own body supplies most of the footwork (head tracking), so the scripted step is smaller.
    rig.stepOffset.copy(this.role === 'bat' ? bat.stride : new THREE.Vector3()).multiplyScalar(this.d.webcam.enabled ? 0.4 : 1);
    rig.update(camPhase, time, dt, this.ball.visible ? this.ballPos : null, eyes);
  }

  private updatePrep() {
    const start = new THREE.Vector3(-0.7, 0, PITCH_LEN + (this.runDur > 2 ? 17 : 7));
    this.bowler.group.position.copy(start);
    this.bowler.group.rotation.y = Math.PI;
    this.bowler.reset();
    this.fielding!.resetPoses();
    this.handBall();

    if (this.role === 'bowl') {
      this.aimBowl();
      this.arm?.runup(0, 0);
      if (!this.bowlRequested || this.t < 0) return;
      this.delivery = planDelivery(this.match.bowler, { ...this.bowlControl });
      this.d.hud.bowlPanel(null);
    } else {
      if (this.t < 0.9) return;
      // Computer bowler: rating and pace adjusted for the difficulty.
      const diff = DIFFICULTY[this.difficulty];
      const b = this.match.bowler;
      const adjusted: Player = { ...b, bowling: Math.min(99, Math.max(20, (b.bowling ?? 60) + diff.aiBowling)) };
      this.delivery = planDelivery(adjusted, undefined, diff.pace);
    }
    this.phase = 'runup';
    this.t = 0;
    this.recorder.begin(this.replayRoots());
  }

  private updateRunup() {
    const stride = 0.38;
    const runEnd = this.runDur - stride;
    const start = PITCH_LEN + (this.runDur > 2 ? 17 : 7);
    const crease = PITCH_LEN + 0.55;
    const g = this.bowler.group;
    if (this.t < runEnd) {
      const u = this.t / runEnd;
      const z = start + (crease - start) * (u * (2 - u) * 0.3 + u * 0.7);
      g.position.set(-0.7, 0, z);
      const phase = this.t * (this.runDur > 2 ? 13 : 11);
      this.bowler.run(phase, Math.min(1, 0.4 + u));
      this.arm?.runup(phase, Math.min(1, 0.4 + u));
    } else {
      const u = (this.t - runEnd) / stride;
      g.position.set(-0.7, 0, crease - u * 0.4);
      this.bowler.bowl(u * 0.5);
      this.arm?.deliver(u * 0.5);
    }
    this.handBall();
    const ready = THREE.MathUtils.clamp((this.t - (this.runDur - 0.9)) / 0.6, 0, 1);
    this.d.bat.setReady(ready);
    this.fielding!.walkIn(this.t / Math.max(0.1, this.runDur - 0.9));
    this.fielding!.ready(ready);

    if (this.t >= this.runDur) {
      // Front-foot landing mark just behind the popping crease.
      this.d.ground.markFootmark(-0.75, PITCH_LEN - 1.1);
      // Overstepping the popping crease: no-ball, called as the ball is delivered.
      const spinner = this.match.bowler.bowl === 'offspin' || this.match.bowler.bowl === 'legspin';
      this.noBall = Math.random() < (this.role === 'bowl' ? 0.02 : spinner ? 0.015 : 0.035);
      if (this.noBall) {
        this.umpireSignal = 'noball';
        this.d.hud.flash('NO BALL', 'Overstepped · free hit next ball', 'info', 1400);
      }
      this.phase = 'delivery';
      this.t = 0;
      this.recorder.mark('release');
      const dl = this.delivery!;
      this.d.hud.speed(dl.speedKmh, dl.variation || dl.length);
      if (this.role === 'bowl') this.aiBat(dl);
    }
  }

  /** The computer batter decides how to play the player's delivery. */
  private aiBat(dl: Delivery) {
    const m = this.match;
    // Batting rating 0–100 maps to 0.4–0.9 skill, then the difficulty shifts it.
    const rating = m.batters[m.striker].player.batting;
    const skill = Math.min(0.95, Math.max(0.3, 0.4 + rating * 0.005 + DIFFICULTY[this.difficulty].aiBatting));
    const ballsLeft = m.maxBalls - m.balls;
    // Batting first there is no target yet, so the AI aims for a par rate of 9 an over.
    const runsNeeded = m.target !== null ? m.target - m.runs : Math.round((ballsLeft * 9) / 6);
    const sw = aiSwing(dl, skill, { runsNeeded, ballsLeft });
    this.swing = sw;
    if (sw) this.d.bat.swing(sw.pressTime, sw.aim, sw.loft, sw.defend, this.styleFor(sw.aim, sw.loft, sw.defend));
  }

  private handBall() {
    this.bowler.group.updateMatrixWorld(true);
    this.bowler.rHand.getWorldPosition(this.ballPos);
  }

  private updateDelivery(dt: number) {
    const dl = this.delivery!;
    const { hud, sounds, stumps } = this.d;

    // Bowler follow-through.
    const fu = Math.min(1, this.t / 0.55);
    this.bowler.bowl(0.5 + fu * 0.5);
    this.bowler.group.position.z = PITCH_LEN + 0.15 - fu * 2.4;
    this.arm?.deliver(0.5 + fu * 0.5);

    if (!this.stumpsHit) {
      sampleAt(dl.path, this.t, this.ballPos);
      const s = dl.path[indexAt(dl.path, this.t)];
      if (s.bounces > this.lastBounces) {
        this.lastBounces = s.bounces;
        sounds.bounce();
        if (s.bounces === 1) this.d.ground.markBounce(s.p.x, s.p.z);
      }
    }

    if (!this.resolved && this.t >= dl.tContact) {
      this.resolved = true;
      // The player's timing error is scaled by the difficulty (Easy is more forgiving).
      if (this.role === 'bat' && this.swing) {
        const ideal = dl.tContact - SWING_DELAY;
        this.swing.pressTime = ideal + (this.swing.pressTime - ideal) * DIFFICULTY[this.difficulty].timing;
      }
      this.shot = resolveShot(this.swing, dl);
      this.recorder.mark('contact');
      const sh = this.shot;
      if (sh.kind === 'hit' || sh.kind === 'edge' || sh.kind === 'playedOn') {
        let v = sh.velocity;
        if (sh.kind === 'playedOn') {
          v = new THREE.Vector3(0, 0.3, 0).sub(dl.contactP).normalize().multiplyScalar(9);
          this.playedOn = true;
          sounds.edge();
        } else if (sh.kind === 'edge') sounds.edge();
        else sounds.bat(sh.quality);
        if (this.role === 'bat') this.d.rig.kick(sh.kind === 'hit' ? 0.006 + 0.012 * sh.quality * (this.swing?.power ?? 1) : 0.02);
        this.hitPath = simulate(dl.contactP, v, { lift: sh.lift, maxT: 12 });
        this.event = this.playedOn ? null : this.fielding!.computeEvent(this.hitPath);
        hud.shot(sh.shotName, sh.timing, sh.timingError);
        hud.power(sh.kind === 'hit' ? sh.quality * (this.swing?.power ?? 1) : 0.15);
        this.lastBounces = 0;
        this.phase = 'inplay';
        this.t = 0;
        return;
      }
      if (sh.kind === 'miss') hud.shot(this.role === 'bowl' ? 'Beaten!' : 'Played and missed', sh.timing, sh.timingError);
      else if (!dl.hitsStumps) hud.shot('Left alone', '', 0);
      this.lbw = checkLbw(dl, sh.kind === 'miss');
    }

    // Ball hits the pad: deflects away, the fielders appeal, the umpire decides.
    if (this.lbw && this.t >= this.lbw.impact.t) {
      const l = this.lbw;
      if (!this.padPath) {
        this.padPath = simulate(l.impact.p, new THREE.Vector3((Math.random() - 0.5) * 2, 0.8, 2 + Math.random() * 1.5), { maxT: 3 });
        sounds.gloves();
        hud.flash('HOWZAT?', 'Appeal for LBW', 'info', 1100);
        sounds.roar(0.45, 1.6);
      }
      sampleAt(this.padPath, this.t - l.impact.t, this.ballPos);
      if (this.t >= l.impact.t + 1.25 && !this.outcome && !this.decision) {
        const played = this.shot?.kind === 'miss';
        this.decide({ kind: 'lbw', umpireOut: umpireLbw(dl, l, played), wicket: `lbw b ${surname(dl.bowler.name)}`, outSub: 'LBW', lbw: l, played });
      }
      return;
    }

    // Ball went past the bat.
    if (this.resolved && !this.lbw && !this.stumpsHit && dl.hitsStumps && this.t >= dl.tStumps) {
      this.stumpsHit = true;
      stumps.batEnd.knock(dl.path[indexAt(dl.path, dl.tStumps)].v.clone().normalize(), 1);
      sounds.stumps();
      this.ballPos.y = Math.max(BALL_R, this.ballPos.y - 0.1);
      this.finish({ runs: 0, wicket: `b ${surname(dl.bowler.name)}` }, this.outTitle(), 'Bowled', 'out', 2.8);
      return;
    }
    const end = dl.path[dl.path.length - 1].t;
    if (this.resolved && !this.stumpsHit && this.t >= Math.min(end, dl.tContact + 0.75)) {
      sounds.gloves();
      this.ball.visible = false;
      if (dl.isWide) {
        this.umpireSignal = 'wide';
        this.finish({ runs: 0, wide: true }, 'WIDE', '+1 extra', 'info', 1.8);
      } else if (this.shot?.kind === 'miss' && !this.noBall && !this.match.freeHit && falseNick(dl, this.shot.timingError)) {
        // The fielders go up for a nick that wasn't there.
        const keeper = this.fielding?.fielders.find((f) => f.role === 'keeper');
        this.d.hud.flash('HOWZAT?', 'Appeal for caught behind', 'info', 1100);
        sounds.roar(0.45, 1.6);
        this.decide({ kind: 'caught', umpireOut: true, edge: false, wicket: `c †${surname(keeper?.name ?? 'Keeper')} b ${surname(dl.bowler.name)}`, outSub: 'Caught behind' });
      } else {
        this.finish({ runs: 0 }, '', '', 'info', 1.4);
      }
    }
  }

  private outTitle() {
    return this.role === 'bowl' ? 'WICKET!' : 'OUT!';
  }

  private updateInPlay(dt: number) {
    const path = this.hitPath!;
    const { sounds, stumps } = this.d;
    const fu = Math.min(1, 0.55 + this.t);
    this.bowler.bowl(Math.min(1, fu));

    if (this.playedOn) {
      sampleAt(path, this.t, this.ballPos);
      if (!this.stumpsHit && this.ballPos.z <= 0.05) {
        this.stumpsHit = true;
        stumps.batEnd.knock(new THREE.Vector3(0, 0, -1), 0.6);
        sounds.stumps();
        this.finish({ runs: 0, wicket: `b ${surname(this.delivery!.bowler.name)}` }, this.outTitle(), 'Played on', 'out', 2.6);
      }
      return;
    }

    const ev = this.event!;
    const f = ev.fielder;
    if (this.t < ev.t || ev.kind === 'four' || ev.kind === 'six') {
      sampleAt(path, Math.min(this.t, ev.kind === 'dropped' ? ev.t - 1.1 : this.t), this.ballPos);
      const s = path[indexAt(path, this.t)];
      if (s.bounces > this.lastBounces && this.t < ev.t) {
        this.lastBounces = s.bounces;
        sounds.bounce();
      }
    } else if (f) {
      // Ball in the fielder's hands, then thrown back to the keeper's end.
      const hand = new THREE.Vector3(f.pos.x, ev.kind === 'caught' ? 1.6 : 1.2, f.pos.z);
      const throwStart = ev.t + 0.45;
      const dist = Math.hypot(hand.x, hand.z);
      const throwDur = Math.max(0.4, dist / 26);
      if (ev.kind === 'caught' || this.t < throwStart) this.ballPos.copy(hand);
      else {
        const u = Math.min(1, (this.t - throwStart) / throwDur);
        const to = new THREE.Vector3(0.2, 0.9, -0.6);
        this.ballPos.copy(hand).lerp(to, u);
        this.ballPos.y += Math.sin(u * Math.PI) * dist * 0.08;
        if (u >= 1) this.ball.visible = false;
      }
    }

    this.fielding!.animate(ev, this.t, this.ballPos, dt);
    if (this.outcome && this.t >= this.holdUntil) this.phase = 'dead';

    if (!this.eventFired && this.t >= ev.t) {
      this.eventFired = true;
      const by = f ? surname(f.name) : '';
      const bowler = surname(this.delivery!.bowler.name);
      switch (ev.kind) {
        case 'six':
          this.finish({ runs: 6 }, 'SIX!', `${this.shot!.shotName} · ${Math.round(Math.hypot(ev.point.x, ev.point.z))} m`, 'six', 3);
          this.umpireSignal = 'six';
          this.cheer = 1;
          sounds.roar(1, 4);
          break;
        case 'four':
          this.finish({ runs: 4 }, 'FOUR!', this.shot!.shotName, 'four', 2.6);
          this.umpireSignal = 'four';
          this.cheer = 0.8;
          sounds.roar(0.75, 3);
          break;
        case 'caught': {
          const keeper = f?.role === 'keeper';
          const wk = f?.role === 'bowler' ? `c & b ${bowler}` : `c ${keeper ? '†' : ''}${by} b ${bowler}`;
          // A thin edge behind the wicket can be reviewed.
          if (this.shot?.kind === 'edge' && (keeper || f?.role === 'slip') && !this.noBall && !this.match.freeHit) {
            sounds.gloves();
            this.decide({ kind: 'caught', umpireOut: true, edge: true, wicket: wk, outSub: `Caught by ${f?.name}` });
            break;
          }
          this.finish({ runs: 0, wicket: wk }, this.outTitle(), `Caught by ${f?.name}`, 'out', 2.8);
          this.umpireSignal = 'out';
          this.celebrating = f?.body ?? null;
          sounds.gloves();
          sounds.roar(0.6, 3);
          break;
        }
        case 'dropped':
        case 'fielded': {
          const r = ev.runs;
          const sub = ev.kind === 'dropped' ? `Dropped by ${f?.name}!` : `Fielded by ${f?.name}`;
          const throwDur = Math.max(0.4, Math.hypot(ev.point.x, ev.point.z) / 26);
          this.finish({ runs: r }, r === 0 ? 'DOT BALL' : `${r} RUN${r > 1 ? 'S' : ''}`, sub, 'info', 1.0 + throwDur);
          if (ev.kind === 'dropped') sounds.roar(0.4, 2);
          break;
        }
      }
    }
  }

  /** Records the ball, shows the call, and holds the scene for `hold` seconds. */
  private finish(o: BallOutcome, title: string, sub: string, kind: 'four' | 'six' | 'out' | 'info', hold: number) {
    if (this.outcome) return;
    if (this.noBall) {
      o = { ...o, wide: false, noBall: true };
      if (!title || title === 'WIDE') [title, sub] = ['NO BALL', '+1 · free hit next ball'];
    }
    // No-balls and free hits: the batter can't be bowled, caught or lbw.
    if (o.wicket && (this.noBall || this.match.freeHit)) {
      o = { ...o, wicket: undefined };
      [title, sub, kind] = ['NOT OUT', this.noBall ? 'It was a no-ball!' : 'Free hit!', 'info'];
      this.umpireSignal = this.noBall ? 'noball' : 'none';
      this.celebrating = null;
    }
    // Details for the ball-by-ball record.
    const sh = this.shot;
    o = {
      ...o,
      shot: sh && sh.kind !== 'leave' ? sh.shotName || undefined : undefined,
      timing: sh?.timing || undefined,
      power: this.swing && sh && sh.kind !== 'leave' ? this.swing.power : undefined,
      speedKmh: this.delivery?.speedKmh,
    };
    this.outcome = o;
    this.match.record(o);
    this.recorder.mark('event');
    if (!this.noReplay) this.replayKind = kind === 'six' ? 'six' : kind === 'four' ? 'four' : o.wicket ? 'wicket' : null;
    commentate(
      kind === 'six'
        ? 'six'
        : kind === 'four'
          ? 'four'
          : o.wicket
            ? /^lbw/.test(o.wicket)
              ? 'lbw'
              : /^b /.test(o.wicket)
                ? 'bowled'
                : /run out/.test(o.wicket)
                  ? 'runout'
                  : 'caught'
            : o.noBall
              ? 'noball'
              : o.wide
                ? 'wide'
                : this.shot?.kind === 'miss'
                  ? 'beaten'
                  : 'dot',
    );
    this.updateScore();
    if (title) this.d.hud.flash(title, sub, kind, Math.max(1500, hold * 1000));
    // Big screens celebrate the big moments.
    if (kind !== 'info') this.d.stadium.screen(title.replace('!', ''), title === 'SIX!' ? '6' : title === 'FOUR!' ? '4' : 'OUT', sub);
    if (o.wicket) {
      this.umpireSignal = this.umpireSignal === 'none' ? 'out' : this.umpireSignal;
      if (!this.celebrating) this.celebrating = this.bowler;
      this.d.sounds.roar(0.6, 3);
      this.cheer = Math.max(this.cheer, 0.5);
    }
    // In play, keep animating the ball and fielders until the hold expires.
    if (this.phase === 'inplay') {
      this.holdUntil = this.t + hold;
      this.deadFor = 0.2;
    } else {
      this.phase = 'dead';
      this.deadFor = hold;
    }
  }

  // ---------------------------------------------------------------- DRS

  /**
   * The umpire gives a decision. The side it goes against may review it:
   * the player gets a few seconds to press Review; the computer reviews
   * when it is fairly sure the umpire got it wrong.
   */
  private decide(dec: Decision) {
    this.decision = dec;
    if (this.noBall || this.match.freeHit) return this.applyDecision(dec.umpireOut, false);
    const { hud } = this.d;
    this.umpireSignal = dec.umpireOut ? 'out' : 'none';
    if (dec.umpireOut) this.celebrating = this.bowler;
    hud.flash(dec.umpireOut ? 'OUT!' : 'NOT OUT', dec.umpireOut ? dec.outSub : 'Appeal turned down', dec.umpireOut ? 'out' : 'info', 1800);
    const side: 'bat' | 'bowl' = dec.umpireOut ? 'bat' : 'bowl';
    this.phase = 'decision';
    const apply = () => this.applyDecision(dec.umpireOut, false);
    if (this.reviews[side] <= 0) {
      this.pending = { t: 0, limit: 1.3, prompt: false, then: apply };
    } else if (this.role === side) {
      this.pending = { t: 0, limit: 5, prompt: true, then: apply };
    } else {
      const wrong = this.truth(dec) !== dec.umpireOut;
      const reviews = Math.random() < (wrong ? 0.65 : 0.12);
      this.pending = { t: 0, limit: reviews ? 1.6 : 1.3, prompt: false, then: reviews ? () => this.startReview(side) : apply };
    }
  }

  /** What ball tracking / UltraEdge would show. */
  private truth(dec: Decision) {
    if (dec.kind === 'caught') return Boolean(dec.edge);
    return trackLbw(this.delivery!, dec.lbw!, Boolean(dec.played), dec.umpireOut).out;
  }

  private requestReview() {
    if (this.phase !== 'decision' || !this.pending?.prompt) return;
    this.pending = null;
    this.drs.prompt(null);
    this.startReview(this.role);
  }

  private startReview(side: 'bat' | 'bowl') {
    const dec = this.decision!;
    const dl = this.delivery!;
    const team = side === 'bat' ? this.match.batting : this.match.bowling;
    this.d.hud.flash('REVIEW', `${team.name} review the decision`, 'info', 1600);
    this.d.sounds.chime();
    commentate('review');
    const verdict = dec.kind === 'lbw' ? trackLbw(dl, dec.lbw!, Boolean(dec.played), dec.umpireOut) : null;
    const finalOut = verdict ? verdict.out : Boolean(dec.edge);
    const umpiresCall = verdict?.umpiresCall ?? false;
    const overturned = finalOut !== dec.umpireOut;
    // An unsuccessful review is lost; umpire's call keeps it.
    if (!overturned && !umpiresCall) this.reviews[side]--;
    this.review = { t: 0, side, verdict, trace: dec.kind === 'caught' ? snickTrace(Boolean(dec.edge), false) : null, finalOut, overturned, umpiresCall, step: 0 };
    this.drs.open(dec.kind === 'lbw' ? 'LBW · ball tracking' : 'Caught behind · snickometer');
    if (verdict) {
      this.hawk.show(dl, dec.lbw!.impact.t, verdict);
      this.setCastVisible(false);
    }
    this.phase = 'review';
  }

  private updateReview(dt: number) {
    const r = this.review!;
    const cam = this.d.rig.camera;
    r.t += dt;
    const tone = (z: string) => (z === "Umpire's call" ? 'amber' : z === 'In line' || z === 'Hitting' ? 'bad' : 'good');
    let doneAt: number;
    if (r.verdict) {
      // Ball tracking: draw the path from behind the bowler, then look side-on at the stumps.
      const v = r.verdict;
      const u = Math.min(2, r.t / 1.5);
      this.hawk.progress(u);
      if (r.t < 3.6) {
        cam.position.set(0.5, 2.3, PITCH_LEN + 3);
        cam.fov = 17;
        cam.lookAt(0, 0.45, 0.6);
      } else {
        cam.position.set(-3.4, 1.0, 2.6);
        cam.fov = 38;
        cam.lookAt(0, 0.4, 0.4);
      }
      cam.updateProjectionMatrix();
      if (r.step === 0 && u >= 0.55) (this.drs.row('Pitching', v.pitching, tone(v.pitching)), r.step++);
      if (r.step === 1 && u >= 1) (this.drs.row('Impact', v.impact, tone(v.impact)), r.step++);
      if (r.step === 2 && u >= 2) (this.drs.row('Wickets', v.wickets, tone(v.wickets)), r.step++);
      if (r.step === 3 && r.t >= 4.4) (this.showReviewDecision(), r.step++);
      doneAt = 7;
    } else {
      // UltraEdge: slow replay of the ball passing the bat with the sound trace.
      const contact = this.recorder.markAt('contact') ?? 0;
      if (this.recorder.hasClip) {
        this.recorder.apply(contact - 0.45 + Math.min(r.t, 3.2) * 0.25, new Set([this.batter.group, this.bowler.group]));
        cam.position.set(-2.9, 1.15, 1.9);
        cam.fov = 34;
        cam.lookAt(0, 0.75, 1.2);
        cam.updateProjectionMatrix();
      }
      this.drs.snicko(r.trace!, r.t / 3);
      if (r.step === 0 && r.t >= 3.2) {
        this.drs.row('Bat', this.review!.finalOut ? 'Spike: edge detected' : 'No spike: no edge', this.review!.finalOut ? 'bad' : 'good');
        r.step++;
      }
      if (r.step === 1 && r.t >= 3.6) (this.showReviewDecision(), r.step++);
      doneAt = 6;
    }
    if (r.t >= doneAt) this.finishReview();
  }

  private showReviewDecision() {
    const r = this.review!;
    const sub = r.umpiresCall ? "Umpire's call · review retained" : r.overturned ? 'Decision overturned' : 'Original decision stands';
    this.drs.decision(r.finalOut ? 'OUT' : 'NOT OUT', sub, r.finalOut ? 'bad' : 'good');
    commentate(r.umpiresCall ? 'umpiresCall' : r.overturned ? 'overturned' : 'stands');
    if (r.overturned) this.d.sounds.roar(0.7, 2.5);
  }

  private finishReview() {
    const r = this.review!;
    this.review = null;
    this.hawk.clear();
    this.setCastVisible(true);
    this.drs.close();
    if (this.recorder.hasClip) this.recorder.restoreEnd();
    this.noReplay = true;
    this.phase = 'decision';
    this.applyDecision(r.finalOut, true, r.overturned ? 'Overturned on review' : r.umpiresCall ? "Umpire's call" : 'Upheld on review');
  }

  /** Records the final decision as an ordinary ball outcome. */
  private applyDecision(out: boolean, reviewed: boolean, note = '') {
    const dec = this.decision!;
    this.pending = null;
    this.drs.prompt(null);
    if (reviewed) this.noReplay = true;
    this.phase = 'dead';
    if (out) {
      this.finish({ runs: 0, wicket: dec.wicket }, this.outTitle(), note ? `${dec.outSub} · ${note}` : dec.outSub, 'out', 2.6);
    } else {
      this.umpireSignal = 'none';
      this.celebrating = null;
      this.finish({ runs: 0 }, 'NOT OUT', note || 'Appeal turned down', 'info', reviewed ? 1.6 : 1.2);
    }
  }

  /** Hides players so the ball-tracking graphic reads clearly. */
  private setCastVisible(v: boolean) {
    const cast = [this.batter, this.nonStriker, this.bowler, this.umpire, this.legUmpire, ...(this.fielding?.fielders.map((f) => f.body) ?? [])];
    for (const h of cast) h.group.visible = v;
    this.d.bat.pivot.visible = v;
  }

  // ---------------------------------------------------------------- replays

  /** Everything that moves during a delivery. */
  private replayRoots() {
    const set = new Set<THREE.Object3D>([
      this.ball,
      this.d.bat.pivot,
      this.batter.group,
      this.nonStriker.group,
      this.bowler.group,
      this.umpire.group,
      this.legUmpire.group,
      this.d.stumps.batEnd.group,
      this.d.stumps.bowlEnd.group,
    ]);
    for (const f of this.fielding?.fielders ?? []) set.add(f.body.group);
    return [...set];
  }

  /** After the dead-ball pause: a TV replay of big moments, then the next ball. */
  private afterBall() {
    const kind = this.replayKind;
    this.replayKind = null;
    if (!kind || !this.recorder.hasClip || this.d.rig.mode === 'pov' && kind !== 'wicket' && kind !== 'six') return this.nextBall();
    const shots = replayShots(kind, this.recorder);
    this.replay = { shots, idx: 0, t: shots[0].from, then: () => this.nextBall() };
    this.phase = 'replay';
    this.drs.replayBadge(shots[0].label);
  }

  private updateReplay(dt: number) {
    const r = this.replay!;
    const shot = r.shots[r.idx];
    r.t += dt * shot.speed;
    this.recorder.apply(r.t, new Set([this.batter.group, this.bowler.group, this.d.bat.pivot]));
    shot.cam(r.t, this.ball.position, this.d.rig.camera);
    if (r.t >= shot.to) {
      r.idx++;
      if (r.idx >= r.shots.length) return this.endReplay();
      r.t = r.shots[r.idx].from;
      this.drs.replayBadge(r.shots[r.idx].label);
    }
  }

  private endReplay() {
    const r = this.replay;
    if (!r) return;
    this.replay = null;
    this.recorder.restoreEnd();
    this.drs.replayBadge(null);
    r.then();
  }

  private batterPose() {
    // Rough arm placement towards the bat handle for the TV view.
    const b = this.batter;
    b.reset();
    b.body.position.y = 0.9;
    b.torso.rotation.x = 0.25;
    const stroke = this.d.bat.stroke;
    const k = stroke ? 1 : 0;
    b.lArm.upper.rotation.x = -0.7 - k * 0.6;
    b.rArm.upper.rotation.x = -0.6 - k * 0.6;
    b.lArm.upper.rotation.z = -0.3;
    b.rArm.upper.rotation.z = 0.2;
    b.lLeg.upper.rotation.x = -0.15;
    b.rLeg.upper.rotation.x = 0.15;
    b.lLeg.lower.rotation.x = 0.25;
    b.rLeg.lower.rotation.x = 0.25;
    if (stroke === 'drive' || stroke === 'loft' || stroke === 'defend') {
      // Front-foot stride towards the pitch of the ball, head over it.
      b.lLeg.upper.rotation.x = -0.75;
      b.lLeg.lower.rotation.x = 0.55;
      b.rLeg.upper.rotation.x = 0.35;
      b.rLeg.lower.rotation.x = 0.2;
      b.body.position.y = 0.84;
      b.torso.rotation.x = 0.4;
      b.head.rotation.x = 0.25;
      if (stroke !== 'defend') b.torso.rotation.y = -0.45;
    } else if (stroke === 'cut' || stroke === 'pull') {
      // Back and across: weight on the back foot, chest opening up.
      b.rLeg.upper.rotation.x = 0.1;
      b.lLeg.upper.rotation.x = -0.25;
      b.body.position.y = 0.92;
      b.torso.rotation.x = 0.1;
      b.torso.rotation.y = stroke === 'pull' ? -0.9 : 0.5;
      b.lArm.upper.rotation.x = -1.5;
      b.rArm.upper.rotation.x = -1.4;
    }
  }

  /** Live scorecard of every innings so far, or null before a match starts. */
  scorecard(): string | null {
    if (!this.innings.length) return null;
    const head = `<p class="margin">${this.home.name} v ${this.away.name} · ${ground.info.name}</p>`;
    return head + this.innings.map((m) => inningsCard(m, m === this.match)).join('');
  }

  private updateScore() {
    const m = this.match;
    const st = m.batters[m.striker];
    const ns = m.batters[m.nonStriker];
    this.d.stadium.screen(
      `${m.batting.name.toUpperCase()} v ${m.bowling.name.toUpperCase()}`,
      `${m.runs}/${m.wickets}`,
      m.target !== null ? `${m.overs} ov · Target ${m.target}` : `${m.overs} ov · Run rate ${m.runRate.toFixed(2)}`,
    );
    this.d.hud.score({
      team: m.batting.short,
      runs: m.runs,
      wickets: m.wickets,
      balls: m.balls,
      target: m.target,
      runRate: m.runRate,
      freeHit: m.freeHit,
      oppTeam: m.bowling.short,
      striker: st.name,
      strikerRuns: st.runs,
      strikerBalls: st.balls,
      nonStriker: ns.name,
      nonStrikerRuns: ns.runs,
      nonStrikerBalls: ns.balls,
      bowler: m.bowler.name,
      bowlerFigures: m.figuresOf(m.bowler.name),
      thisOver: m.thisOver,
    });
  }

  private async endInnings() {
    const { hud, input } = this.d;
    this.phase = 'over';
    input.enabled = false;
    hud.bowlPanel(null);
    const m = this.match;
    if (this.mode === 'full' && this.innings.length === 1) {
      const target = m.runs + 1;
      await new Promise((r) => setTimeout(r, 1500));
      await inningsBreak(
        'Innings break',
        `<b>${m.batting.name} ${m.runs}/${m.wickets}</b> (${m.overs} ov) · Extras ${m.totalExtras}<br>${m.bowling.name} need <b>${target}</b> to win from 12 balls`,
      );
      this.beginInnings(this.role === 'bat' ? 'bowl' : 'bat', target);
      return;
    }
    this.endMatch();
  }

  private endMatch() {
    const { hud, sounds } = this.d;
    const inns = this.innings;
    const last = inns[inns.length - 1];
    const target = last.target ?? 0;
    const chased = last.won;
    const tie = !chased && last.runs === target - 1;
    const winner = tie ? null : chased ? last.batting : last.bowling;
    const left = 10 - last.wickets;
    const margin = chased
      ? `by ${left} wicket${left === 1 ? '' : 's'} (${last.maxBalls - last.balls} ball${last.maxBalls - last.balls === 1 ? '' : 's'} left)`
      : `by ${target - 1 - last.runs} run${target - 1 - last.runs === 1 ? '' : 's'}`;
    const title = winner ? `${winner.name} win!` : 'Match tied!';
    const potm = playerOfTheMatch(inns, winner);

    hud.result(
      title,
      `<p class="margin">${winner ? `${winner.name} won ${margin}` : 'Scores level'}</p>
       ${potm ? `<p class="potm">Player of the Match: <b>${potm.name}</b> <span>${potm.line}</span></p>` : ''}
       <div class="cards">${inns.map((m) => inningsCard(m)).join('')}</div>`,
    );
    this.d.stadium.screen('RESULT', winner ? `${winner.short} WIN` : 'TIED', winner ? margin : 'Scores level');
    commentate(winner === this.home ? 'win' : winner ? 'loss' : 'tie');
    // The player's side winning gets the big roar.
    if (winner === this.home) {
      this.cheer = 1;
      sounds.roar(1, 5);
    }
    setTimeout(() => hud.show('result', true), 1200);
    this.onMatchEnd({
      id: newMatchId(),
      home: this.home.id,
      away: this.away.id,
      ground: ground.info.id,
      timeOfDay: this.timeOfDay,
      mode: this.mode,
      difficulty: this.difficulty,
      innings: inns.map((m) => ({ batting: m.batting.id, bowling: m.bowling.id, target: m.target, balls: m.ballLog })),
      teamNames: { [this.home.id]: this.home.name, [this.away.id]: this.away.name },
      playedAt: new Date().toISOString(),
    });
  }
}

const POPPING_Z = 1.22;
/** A webcam swing that would meet the ball this many seconds early can be replaced by a later one. */
const EARLY_REPLACE = 0.15;
/** Webcam movement that would meet the ball more than this many seconds early is not treated as a swing. */
const IGNORE_EARLY = 0.35;

function lineName(x: number) {
  if (x < -0.6) return 'wide outside off';
  if (x < -0.2) return 'outside off';
  if (x < -0.05) return 'off stump';
  if (x < 0.06) return 'middle stump';
  if (x < 0.2) return 'leg stump';
  return 'down leg';
}

/** Best all-round contribution, with a bonus for the winning side. */
function playerOfTheMatch(inns: Match[], winner: Team | null) {
  const score = new Map<string, { team: Team; pts: number; bat?: string; bowl?: string }>();
  const get = (name: string, team: Team) => {
    let e = score.get(name);
    if (!e) score.set(name, (e = { team, pts: 0 }));
    return e;
  };
  for (const m of inns) {
    for (const b of m.batters) {
      if (!b.balls) continue;
      const e = get(b.name, m.batting);
      e.pts += b.runs + b.sixes * 2 + (b.balls ? (b.runs / b.balls) * 4 : 0);
      e.bat = `${b.runs}${b.out ? '' : '*'} (${b.balls})`;
    }
    for (const bw of m.bowlers) {
      const f = m.figures.get(bw.name);
      if (!f || !f.balls) continue;
      const e = get(bw.name, m.bowling);
      e.pts += f.wkts * 22 + Math.max(0, 12 - f.runs);
      e.bowl = `${f.wkts}-${f.runs}`;
    }
  }
  let best: { name: string; line: string } | null = null;
  let bestPts = -1;
  for (const [name, e] of score) {
    const pts = e.pts * (e.team === winner ? 1.3 : 1);
    if (pts > bestPts) {
      bestPts = pts;
      best = { name, line: [e.bat, e.bowl].filter(Boolean).join(' & ') };
    }
  }
  return best;
}

function surname(name: string) {
  const parts = name.split(' ');
  return parts[parts.length - 1];
}

function makeBall() {
  const g = new THREE.Group();
  const leather = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R * 1.3, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xf7f5ef, roughness: 0.32 }),
  );
  leather.castShadow = true;
  const seam = new THREE.Mesh(
    new THREE.TorusGeometry(BALL_R * 1.3, 0.0035, 6, 32),
    new THREE.MeshStandardMaterial({ color: 0xb8b2a6, roughness: 0.6 }),
  );
  g.add(leather, seam);
  return g;
}
