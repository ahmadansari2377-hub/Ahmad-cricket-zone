/**
 * Procedural cricket audio with the Web Audio API (no sound files needed yet):
 * crowd ambience, bat crack, edges, bounce, stumps and crowd roars.
 */
export class Sounds {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private crowdGain!: GainNode;
  private noiseBuf!: AudioBuffer;

  start() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // Brown-ish noise: warmer, more like a distant crowd.
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5 + (Math.random() * 2 - 1) * 0.05;
    }

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.5;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0.18;
    src.connect(bp).connect(this.crowdGain).connect(this.master);
    src.start();
  }

  private burst(freq: number, q: number, dur: number, gain: number, type: BiquadFilterType = 'bandpass') {
    const ctx = this.ctx;
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine') {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Willow on leather: a sharp crack with a woody resonance. */
  bat(quality: number) {
    this.burst(2400, 1.2, 0.05, 1.6 * (0.5 + quality));
    this.tone(820 + quality * 260, 0.09, 0.5 * (0.5 + quality), 'triangle');
    this.tone(1650, 0.04, 0.25);
  }

  edge() {
    this.burst(4200, 2, 0.04, 0.9);
    this.tone(2300, 0.03, 0.2);
  }

  bounce() {
    this.burst(260, 1, 0.06, 0.7, 'lowpass');
  }

  stumps() {
    this.burst(1800, 3, 0.12, 1.2);
    this.tone(540, 0.18, 0.4, 'triangle');
    setTimeout(() => this.tone(760, 0.12, 0.3, 'triangle'), 40);
  }

  /** Coin flick and ring for the toss. */
  coin() {
    this.tone(2600, 0.5, 0.25, 'triangle');
    this.tone(3900, 0.35, 0.12, 'sine');
  }

  gloves() {
    this.burst(500, 1, 0.08, 0.8, 'lowpass');
  }

  /** Two-note broadcast sting when a decision goes upstairs. */
  chime() {
    this.tone(880, 0.35, 0.18, 'sine');
    setTimeout(() => this.tone(1320, 0.5, 0.16, 'sine'), 160);
  }

  /** Crowd swell for boundaries and wickets. */
  roar(strength: number, seconds = 3) {
    const ctx = this.ctx;
    if (!ctx) return;
    const g = this.crowdGain.gain;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.18 + 0.9 * strength, t + 0.35);
    g.linearRampToValueAtTime(0.18 + 0.5 * strength, t + seconds * 0.6);
    g.linearRampToValueAtTime(0.18, t + seconds);
  }
}
