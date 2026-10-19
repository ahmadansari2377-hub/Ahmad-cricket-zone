import { COMPETITIONS, Competition, Team, teamById, teamsIn } from '../data/teams';
import { hex } from './scorecard';

const STORE_KEY = 'aca.teams';

/**
 * Main-menu team select: a competition switch (International, PSL, IPL, BBL)
 * and two grids of kit-coloured chips for your team and the opponent.
 * The choice is remembered on this device.
 */
export class TeamPicker {
  competition: Competition = 'International';
  home: Team = teamById('pak');
  away: Team = teamById('aus');
  onChange: () => void = () => {};

  private comp = document.getElementById('comp-pick')!;
  private homeGrid = document.getElementById('home-grid')!;
  private awayGrid = document.getElementById('away-grid')!;

  constructor() {
    this.load();
    for (const c of COMPETITIONS) {
      const b = document.createElement('button');
      b.textContent = c === 'International' ? 'Intl' : c;
      b.title = c;
      b.addEventListener('click', () => this.setCompetition(c));
      this.comp.appendChild(b);
    }
    this.render();
  }

  private setCompetition(c: Competition) {
    if (c === this.competition) return;
    const teams = teamsIn(c);
    this.competition = c;
    this.home = teams[0];
    this.away = teams[1];
    this.changed();
  }

  private changed() {
    this.save();
    this.render();
    this.onChange();
  }

  private render() {
    COMPETITIONS.forEach((c, i) => {
      const b = this.comp.children[i] as HTMLButtonElement;
      b.classList.toggle('on', c === this.competition);
      b.setAttribute('aria-pressed', String(c === this.competition));
    });
    this.grid(this.homeGrid, this.home, this.away, (t) => {
      this.home = t;
      this.changed();
    });
    this.grid(this.awayGrid, this.away, this.home, (t) => {
      this.away = t;
      this.changed();
    });
  }

  private grid(el: HTMLElement, selected: Team, other: Team, pick: (t: Team) => void) {
    el.innerHTML = '';
    for (const t of teamsIn(this.competition)) {
      const b = document.createElement('button');
      b.className = 'team-chip';
      b.classList.toggle('on', t === selected);
      b.disabled = t === other;
      b.title = t.name;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(t === selected));
      b.innerHTML = `<i class="kit" style="background:${hex(t.shirt)};border-color:${hex(t.trim)}"></i>${t.short}`;
      b.addEventListener('click', () => pick(t));
      el.appendChild(b);
    }
  }

  private load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as { home: string; away: string } | null;
      if (!saved) return;
      const home = teamById(saved.home);
      const away = teamById(saved.away);
      if (home !== away && home.competition === away.competition) {
        this.home = home;
        this.away = away;
        this.competition = home.competition;
      }
    } catch {
      // Storage blocked or corrupt: keep the defaults.
    }
  }

  private save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ home: this.home.id, away: this.away.id }));
    } catch {
      // Not saved; the menu still works.
    }
  }
}
