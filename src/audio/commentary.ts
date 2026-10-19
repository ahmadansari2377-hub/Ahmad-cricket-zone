import { settings } from '../services/settings';

/**
 * Spoken commentary from short line pools, voiced by the browser's speech
 * synthesis (no recordings to download). Off in settings silences it.
 */

export type Moment =
  | 'four'
  | 'six'
  | 'bowled'
  | 'caught'
  | 'lbw'
  | 'runout'
  | 'dot'
  | 'beaten'
  | 'wide'
  | 'noball'
  | 'review'
  | 'overturned'
  | 'stands'
  | 'umpiresCall'
  | 'win'
  | 'loss'
  | 'tie'
  | 'innings';

const LINES: Record<Moment, string[]> = {
  four: ['Cracking shot, that races away for four!', 'Beautifully timed, four runs.', 'Pierces the gap, no stopping that one!', "That's found the rope!"],
  six: ["That's huge! Six!", 'Into the crowd! Maximum!', 'Launched! That is out of here!', 'What a strike, all the way for six!'],
  bowled: ['Bowled him! Timber!', 'Through the gate, the stumps are shattered!', 'Clean bowled!'],
  caught: ['Taken! Out caught!', 'In the air, and caught!', 'Safe hands, he has to go!'],
  lbw: ['Trapped in front! Given out L B W!', 'Plumb! The finger goes up!'],
  runout: ['Run out! Brilliant fielding!'],
  dot: ['Well bowled, no run.', 'Dot ball.', 'Defended solidly.'],
  beaten: ['Beaten! Lovely delivery.', 'Past the outside edge!', 'Played and missed!'],
  wide: ['Too wide, the umpire signals a wide.', "Wide called, that's an extra."],
  noball: ['No ball! Free hit coming up.', 'Overstepped! Free hit next ball.'],
  review: ["They've gone upstairs! This is being reviewed.", 'A review! Let us see what the technology says.'],
  overturned: ['The decision is overturned!', 'Technology to the rescue, decision reversed!'],
  stands: ['The original decision stands.', 'The umpire got it right.'],
  umpiresCall: ["Umpire's call! The on-field decision stays.", "So close! It's umpire's call."],
  win: ['And they have won it! What a performance!', 'Victory! A superb win!'],
  loss: ["It's not to be today. A tough defeat.", 'They fall short this time.'],
  tie: ["It's a tie! Scores level, what a finish!"],
  innings: ['Here we go, two overs, every ball counts.', 'The players are out, and we are ready to begin.'],
};

let voice: SpeechSynthesisVoice | null = null;
let lastAt = 0;

function pickVoice() {
  if (voice || typeof speechSynthesis === 'undefined') return;
  const voices = speechSynthesis.getVoices();
  voice = voices.find((v) => /en[-_](GB|AU|IN)/i.test(v.lang)) ?? voices.find((v) => /^en/i.test(v.lang)) ?? null;
}
if (typeof speechSynthesis !== 'undefined') speechSynthesis.addEventListener?.('voiceschanged', pickVoice);

/**
 * Says a line for the moment. Big moments interrupt; small ones are skipped
 * if something is still being said, and dot balls only get the odd word.
 */
export function commentate(m: Moment) {
  if (!settings().commentary || typeof speechSynthesis === 'undefined') return;
  const small = m === 'dot' || m === 'beaten';
  if (small && (Math.random() < 0.6 || speechSynthesis.speaking)) return;
  const now = performance.now();
  if (!small) speechSynthesis.cancel();
  else if (now - lastAt < 2500) return;
  lastAt = now;
  pickVoice();
  const pool = LINES[m];
  const u = new SpeechSynthesisUtterance(pool[Math.floor(Math.random() * pool.length)]);
  if (voice) u.voice = voice;
  u.rate = m === 'six' || m === 'four' || m === 'win' ? 1.12 : 1.02;
  u.pitch = m === 'six' ? 1.15 : 1;
  u.volume = 0.9;
  speechSynthesis.speak(u);
}

export function stopCommentary() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}
