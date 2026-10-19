import { describe, expect, it } from 'vitest';
import { AUSTRALIA, PAKISTAN } from '../src/data/teams';
import { Match } from '../src/game/match';
import { applyMatch, EMPTY_STATS, MatchRecord, RecordError, summarise, validate } from '../src/game/record';

/** Plays a random innings through the real scoring engine. */
function playInnings(target: number | null, seed: number, batting = PAKISTAN, bowling = AUSTRALIA) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const m = new Match(batting, bowling, target);
  while (!m.done) {
    const r = rnd();
    if (r < 0.05) m.record({ runs: 0, wide: true });
    else if (r < 0.08) m.record({ runs: rnd() < 0.5 ? 4 : 0, noBall: true });
    else if (r < 0.2) m.record({ runs: 0, wicket: 'b Cummins', speedKmh: 140 });
    else m.record({ runs: [0, 1, 2, 3, 4, 6][Math.floor(rnd() * 6)], shot: 'Cover drive', timing: rnd() < 0.3 ? 'Perfect' : 'Good', power: 0.8, speedKmh: 120 + rnd() * 30 });
  }
  return m;
}

function fullMatch(seed: number): { record: MatchRecord; first: Match; second: Match } {
  const first = playInnings(null, seed);
  const second = playInnings(first.runs + 1, seed + 7, AUSTRALIA, PAKISTAN);
  return {
    first,
    second,
    record: {
      home: 'pak',
      away: 'aus',
      ground: 'lords',
      timeOfDay: 'day',
      mode: 'full',
      difficulty: 'medium',
      innings: [
        { batting: 'pak', bowling: 'aus', target: null, balls: first.ballLog },
        { batting: 'aus', bowling: 'pak', target: first.runs + 1, balls: second.ballLog },
      ],
      teamNames: { pak: 'Pakistan', aus: 'Australia' },
      playedAt: new Date().toISOString(),
    },
  };
}

describe('match records', () => {
  it('rebuilds the same totals the game showed, for many random matches', () => {
    for (let seed = 1; seed < 300; seed++) {
      const { record, first, second } = fullMatch(seed);
      const sums = validate(record);
      expect(sums[0].runs).toBe(first.runs);
      expect(sums[0].wickets).toBe(first.wickets);
      expect(sums[0].legalBalls).toBe(first.balls);
      expect(sums[1].runs).toBe(second.runs);
      expect(sums[1].wides + sums[1].noBalls).toBe(second.totalExtras);
      for (const b of first.batters.filter((x) => x.balls)) {
        expect(sums[0].batters.find((x) => x.name === b.name)?.runs).toBe(b.runs);
      }
    }
  });

  it('rejects an inflated score', () => {
    const { record } = fullMatch(3);
    record.innings[0].balls[0] = { ...record.innings[0].balls[0], runs: 12, extra: undefined };
    expect(() => validate(record)).toThrow(RecordError);
  });

  it('rejects extra balls after an innings ended', () => {
    const { record } = fullMatch(5);
    record.innings[1].balls.push({ batter: 'x', bowler: 'y', runs: 6 });
    expect(() => validate(record)).toThrow(RecordError);
  });

  it('rejects a target that does not match the first innings', () => {
    const { record } = fullMatch(9);
    record.innings[1].target! += 20;
    expect(() => validate(record)).toThrow(RecordError);
  });

  it('rejects impossible ball speeds', () => {
    const { record } = fullMatch(11);
    record.innings[0].balls[0].speedKmh = 240;
    expect(() => validate(record)).toThrow(/speed/);
  });

  it('updates career stats and awards achievements once', () => {
    const { record } = fullMatch(21);
    const out = applyMatch(record, EMPTY_STATS, new Set());
    expect(out.stats.matches).toBe(1);
    expect(out.stats.wins + out.stats.losses + out.stats.ties).toBe(1);
    expect(out.stats.runs).toBe(summarise(record.innings[0]).batters.reduce((a, b) => a + b.runs, 0));
    const again = applyMatch(record, out.stats, new Set(out.newAchievements));
    expect(again.newAchievements.filter((c) => out.newAchievements.includes(c))).toEqual([]);
    expect(again.stats.matches).toBe(2);
  });

  it('counts maidens and hat-tricks', () => {
    const balls = Array.from({ length: 12 }, (_, i) => ({ batter: `B${i}`, bowler: i < 6 ? 'P1' : 'P2', runs: 0, ...(i >= 6 && i < 9 ? { wicket: 'b P2' } : {}) }));
    const record: MatchRecord = {
      home: 'pak', away: 'aus', ground: 'mcg', timeOfDay: 'night', mode: 'defend', difficulty: 'hard',
      innings: [{ batting: 'aus', bowling: 'pak', target: 25, balls }],
      teamNames: {}, playedAt: new Date().toISOString(),
    };
    const out = applyMatch(record, EMPTY_STATS, new Set());
    expect(out.result).toBe('won');
    expect(out.newAchievements).toEqual(expect.arrayContaining(['maiden', 'hat_trick', 'first_win']));
    expect(out.stats.bestWkts).toBe(3);
  });
});
