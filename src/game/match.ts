import type { Player, Team } from '../data/teams';
import { OVERS } from './constants';
import type { BallRecord } from './record';

export interface BatterCard {
  name: string;
  player: Player;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: string;
}

export interface BowlerFigures {
  balls: number;
  runs: number;
  wkts: number;
  maidens: number;
  /** Runs conceded in the bowler's current over. */
  overRuns: number;
}

export interface FallOfWicket {
  score: number;
  wicket: number;
  overs: string;
  name: string;
}

export interface BallOutcome {
  runs: number;
  wide?: boolean;
  noBall?: boolean;
  /** Dismissal text, e.g. "c Smith b Cummins". */
  wicket?: string;
  /** Details kept for the ball-by-ball record. */
  shot?: string;
  timing?: string;
  power?: number;
  speedKmh?: number;
}

/** Scoring for one 2-over innings. The second innings has a target to chase. */
export class Match {
  runs = 0;
  wickets = 0;
  balls = 0;
  extras = { wides: 0, noBalls: 0 };
  batters: BatterCard[];
  striker = 0;
  nonStriker = 1;
  private nextIn = 2;
  bowlers: Player[];
  figures = new Map<string, BowlerFigures>();
  fow: FallOfWicket[] = [];
  /** Every delivery, for saving the match. */
  ballLog: BallRecord[] = [];
  thisOver: string[] = [];
  log: string[] = [];
  /** The next legal delivery is a free hit (after a no-ball). */
  freeHit = false;

  constructor(
    public batting: Team,
    public bowling: Team,
    /** Runs needed to win, or null in the first innings. */
    public target: number | null,
  ) {
    this.batters = batting.players.map((p) => ({ name: p.name, player: p, runs: 0, balls: 0, fours: 0, sixes: 0, out: '' }));
    const pace = bowling.players.filter((p) => p.bowl === 'fast' || p.bowl === 'fastMedium');
    const spin = bowling.players.filter((p) => p.bowl === 'offspin' || p.bowl === 'legspin');
    const best = (list: Player[]) => [...list].sort((a, b) => (b.bowling ?? 0) - (a.bowling ?? 0))[Math.floor(Math.random() * 2)] ?? list[0];
    // One pace over and one spin over; a side without both uses its best two bowlers.
    const all = bowling.players.filter((p) => p.bowl);
    const first = best(pace.length ? pace : all);
    const second = best((spin.length ? spin : all).filter((p) => p !== first)) ?? first;
    this.bowlers = [first, second].slice(0, OVERS);
  }

  get bowler() {
    return this.bowlers[Math.min(this.bowlers.length - 1, Math.floor(this.balls / 6))];
  }

  get maxBalls() {
    return OVERS * 6;
  }

  get totalExtras() {
    return this.extras.wides + this.extras.noBalls;
  }

  record(o: BallOutcome) {
    const bowler = this.bowler;
    const fig = this.figures.get(bowler.name) ?? { balls: 0, runs: 0, wkts: 0, maidens: 0, overRuns: 0 };
    this.figures.set(bowler.name, fig);
    const bat = this.batters[this.striker];
    this.ballLog.push({
      batter: bat.name,
      bowler: bowler.name,
      runs: o.runs,
      ...(o.wide ? { extra: 'wd' as const } : o.noBall ? { extra: 'nb' as const } : {}),
      ...(o.wicket && !o.wide && !o.noBall ? { wicket: o.wicket } : {}),
      ...(o.shot ? { shot: o.shot } : {}),
      ...(o.timing ? { timing: o.timing } : {}),
      ...(o.power !== undefined ? { power: Math.round(Math.min(1, Math.max(0, o.power)) * 100) / 100 } : {}),
      ...(o.speedKmh ? { speedKmh: Math.round(o.speedKmh * 10) / 10 } : {}),
    });

    if (o.wide) {
      const r = 1 + o.runs;
      this.runs += r;
      this.extras.wides += r;
      fig.runs += r;
      fig.overRuns += r;
      this.thisOver.push(o.runs ? `${r}wd` : 'wd');
      return;
    }

    if (o.noBall) {
      // One extra, plus whatever the batter hits. Not a legal ball; next ball is a free hit.
      this.runs += 1 + o.runs;
      this.extras.noBalls += 1;
      fig.runs += 1 + o.runs;
      fig.overRuns += 1 + o.runs;
      bat.runs += o.runs;
      bat.balls++;
      if (o.runs === 4) bat.fours++;
      if (o.runs === 6) bat.sixes++;
      this.thisOver.push(o.runs ? `${o.runs}nb` : 'nb');
      if (o.runs % 2 === 1) this.swapStrike();
      this.freeHit = true;
      return;
    }

    this.freeHit = false;
    this.balls++;
    fig.balls++;
    bat.balls++;
    if (o.wicket) {
      this.wickets++;
      fig.wkts += /run out/.test(o.wicket) ? 0 : 1;
      bat.out = o.wicket;
      this.thisOver.push('W');
      this.log.push(`${bat.name} ${o.wicket}`);
      this.fow.push({ score: this.runs, wicket: this.wickets, overs: this.overs, name: bat.name });
      if (this.nextIn < this.batters.length) this.striker = this.nextIn++;
    } else {
      this.runs += o.runs;
      fig.runs += o.runs;
      fig.overRuns += o.runs;
      bat.runs += o.runs;
      if (o.runs === 4) bat.fours++;
      if (o.runs === 6) bat.sixes++;
      this.thisOver.push(o.runs ? String(o.runs) : '•');
      if (o.runs % 2 === 1) this.swapStrike();
    }
    if (fig.balls % 6 === 0) {
      if (fig.overRuns === 0) fig.maidens++;
      fig.overRuns = 0;
    }
    if (this.balls % 6 === 0 && !this.done) this.swapStrike();
  }

  /** Called before the first ball of a new over. */
  newOverIfNeeded() {
    const legal = this.thisOver.filter((b) => !b.includes('wd') && !b.includes('nb')).length;
    if (this.balls > 0 && this.balls % 6 === 0 && legal >= 6) this.thisOver = [];
  }

  private swapStrike() {
    [this.striker, this.nonStriker] = [this.nonStriker, this.striker];
  }

  get done() {
    return this.balls >= this.maxBalls || this.wickets >= 10 || (this.target !== null && this.runs >= this.target);
  }

  /** Chasing side has reached the target. */
  get won() {
    return this.target !== null && this.runs >= this.target;
  }

  get runRate() {
    return this.balls ? (this.runs / this.balls) * 6 : 0;
  }

  figuresOf(name: string) {
    const f = this.figures.get(name) ?? { balls: 0, runs: 0, wkts: 0, maidens: 0, overRuns: 0 };
    return `${f.wkts}-${f.runs} (${Math.floor(f.balls / 6)}.${f.balls % 6})`;
  }

  get overs() {
    return `${Math.floor(this.balls / 6)}.${this.balls % 6}`;
  }
}
