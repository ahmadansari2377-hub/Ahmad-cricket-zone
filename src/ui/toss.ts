import type { Team } from '../data/teams';

export type Role = 'bat' | 'bowl';

const $ = (id: string) => document.getElementById(id)!;

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function choose<T extends string>(buttons: [string, T][]): Promise<T> {
  const box = $('toss-actions');
  box.innerHTML = '';
  return new Promise((resolve) => {
    buttons.forEach(([label, value], i) => {
      const b = document.createElement('button');
      b.className = `btn ${i === 0 ? 'primary' : 'ghost'}`;
      b.textContent = label;
      b.addEventListener('click', () => resolve(value), { once: true });
      box.appendChild(b);
    });
  });
}

/**
 * The toss: the player calls heads or tails, the coin spins, and the winner
 * chooses. Resolves with the player's role in the first innings.
 */
export async function runToss(home: Team, away: Team, playSound: () => void): Promise<Role> {
  const coin = $('coin');
  $('toss').classList.remove('hidden');
  coin.className = 'coin';
  $('toss-title').textContent = 'The toss';
  $('toss-text').textContent = `${away.name} captain spins the coin. ${home.name}, call it!`;

  const call = await choose<'heads' | 'tails'>([
    ['Heads', 'heads'],
    ['Tails', 'tails'],
  ]);
  $('toss-actions').innerHTML = '';
  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  $('toss-text').textContent = `${home.name} call ${call}…`;
  playSound();
  void coin.offsetWidth;
  coin.classList.add('spin', result);
  await wait(2200);

  const won = call === result;
  $('toss-title').textContent = result === 'heads' ? 'Heads!' : 'Tails!';
  if (won) {
    $('toss-text').textContent = `${home.name} won the toss. What will you do?`;
    const pick = await choose<Role>([
      ['Bat first', 'bat'],
      ['Bowl first', 'bowl'],
    ]);
    $('toss').classList.add('hidden');
    return pick;
  }
  // Chasing is usually preferred in short games.
  const theyBat = Math.random() < 0.4;
  $('toss-text').textContent = `${away.name} won the toss and chose to ${theyBat ? 'bat' : 'bowl'} first.`;
  await choose<'go'>([[theyBat ? 'Take the field' : 'Pad up', 'go']]);
  $('toss').classList.add('hidden');
  return theyBat ? 'bowl' : 'bat';
}

/** Between innings: summary and a button to start the chase. */
export async function inningsBreak(title: string, text: string): Promise<void> {
  $('break-title').textContent = title;
  $('break-text').innerHTML = text;
  $('break').classList.remove('hidden');
  await new Promise<void>((resolve) => $('btn-break').addEventListener('click', () => resolve(), { once: true }));
  $('break').classList.add('hidden');
}
