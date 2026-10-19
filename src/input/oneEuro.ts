/**
 * One Euro filter (Casiez et al.): smooths jitter when still while keeping
 * fast movements (like a bat swing) responsive.
 */
export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private lastT = 0;

  constructor(
    private minCutoff = 1.5,
    private beta = 0.02,
    private dCutoff = 1,
  ) {}

  private alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value: number, t: number) {
    if (this.x === null) {
      this.x = value;
      this.lastT = t;
      return value;
    }
    const dt = Math.max(1e-3, t - this.lastT);
    this.lastT = t;
    const rawDx = (value - this.x) / dt;
    const aD = this.alpha(this.dCutoff, dt);
    this.dx = aD * rawDx + (1 - aD) * this.dx;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = this.alpha(cutoff, dt);
    this.x = a * value + (1 - a) * this.x;
    return this.x;
  }

  reset() {
    this.x = null;
    this.dx = 0;
  }
}
