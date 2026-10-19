import type { Match } from '../game/match';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Full scorecard for one innings: batting, extras, fall of wickets and bowling. */
export function inningsCard(m: Match, live = false): string {
  const atCrease = (i: number) => live && !m.done && (i === m.striker || i === m.nonStriker);
  const batted = m.batters.map((b, i) => ({ b, i })).filter(({ b, i }) => b.balls > 0 || b.out || atCrease(i));
  const rows = batted
    .map(({ b, i }) => {
      const sr = b.balls ? ((b.runs / b.balls) * 100).toFixed(0) : '–';
      const star = live && i === m.striker && !m.done ? ' <i class="on-strike" title="On strike">●</i>' : '';
      const keeper = b.player.keeper ? ' <small>†</small>' : '';
      return `<tr><td>${esc(b.name)}${keeper}${star}</td><td class="how">${esc(b.out || 'not out')}</td><td class="n"><b>${b.runs}</b></td><td class="n">${b.balls}</td><td class="n">${b.fours}</td><td class="n">${b.sixes}</td><td class="n">${sr}</td></tr>`;
    })
    .join('');
  const yetToBat = m.batters.filter((b, i) => !batted.some((x) => x.i === i)).map((b) => esc(b.name));

  const bowl = m.bowlers
    .filter((b, i, all) => all.indexOf(b) === i)
    .map((b) => {
      const f = m.figures.get(b.name);
      const balls = f?.balls ?? 0;
      const econ = balls ? ((f!.runs / balls) * 6).toFixed(1) : '–';
      return `<tr><td>${esc(b.name)}</td><td></td><td class="n">${Math.floor(balls / 6)}.${balls % 6}</td><td class="n">${f?.maidens ?? 0}</td><td class="n">${f?.runs ?? 0}</td><td class="n"><b>${f?.wkts ?? 0}</b></td><td class="n">${econ}</td></tr>`;
    })
    .join('');

  const fow = m.fow.map((w) => `${w.score}-${w.wicket} (${esc(w.name)}, ${w.overs} ov)`).join(' · ');

  return `<h3 class="inn"><span class="sw" style="background:${hex(m.batting.shirt)}"></span>${esc(m.batting.name)} <b>${m.runs}/${m.wickets}</b> <span>(${m.overs} ov · RR ${m.runRate.toFixed(2)})</span></h3>
    <table>
      <tr><th>Batter</th><th></th><th class="n">R</th><th class="n">B</th><th class="n">4s</th><th class="n">6s</th><th class="n">SR</th></tr>
      ${rows}
      <tr class="sub"><td>Extras</td><td class="how">wd ${m.extras.wides}, nb ${m.extras.noBalls}</td><td class="n"><b>${m.totalExtras}</b></td><td colspan="4"></td></tr>
      ${yetToBat.length ? `<tr class="sub"><td colspan="7"><span class="muted">Yet to bat:</span> ${yetToBat.join(', ')}</td></tr>` : ''}
      ${fow ? `<tr class="sub"><td colspan="7"><span class="muted">Fall of wickets:</span> ${fow}</td></tr>` : ''}
      <tr><th>${esc(m.bowling.name)} bowling</th><th></th><th class="n">O</th><th class="n">M</th><th class="n">R</th><th class="n">W</th><th class="n">Econ</th></tr>
      ${bowl}
    </table>`;
}

export function hex(c: number) {
  return `#${c.toString(16).padStart(6, '0')}`;
}
