/**
 * Keyboard and mouse controls, used until webcam tracking arrives in Phase 2
 * and kept as a fallback afterwards.
 *   Mouse left/right or A/D (←/→): aim the shot
 *   Space or left click: play an attacking shot (timing matters)
 *   Hold Shift or W (↑): loft the ball in the air
 *   S (↓): defensive block
 *   C: switch camera (POV / TV)
 */
export class KeyboardInput {
  /** -1..1 in screen space: -1 = screen left. */
  screenAim = 0;
  loft = false;
  onSwing: (defend: boolean) => void = () => {};
  onCamera: () => void = () => {};
  onPause: () => void = () => {};
  /** Any other key while playing (e.g. 1–4 to pick a bowling variation). */
  onKey: (code: string) => void = () => {};
  /** Mouse in normalised device coordinates (-1..1, y up), for aiming on the pitch. */
  mouse = { x: 0, y: -0.3 };
  enabled = false;
  private keys = new Set<string>();

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (!this.enabled) return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.onSwing(false);
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        this.onSwing(true);
      } else if (e.code === 'KeyC') {
        this.onCamera();
      } else if (e.code === 'KeyP' || e.code === 'Escape') {
        this.onPause();
      } else {
        this.onKey(e.code);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('mousemove', (e) => {
      this.screenAim = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.x = this.screenAim;
      this.mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
    });
    target.addEventListener('mousedown', (e) => {
      if (this.enabled && e.button === 0) this.onSwing(false);
    });
  }

  update(dt: number) {
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    if (left) this.screenAim = Math.max(-1, this.screenAim - dt * 2.5);
    if (right) this.screenAim = Math.min(1, this.screenAim + dt * 2.5);
    this.loft = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.keys.has('KeyW') || this.keys.has('ArrowUp');
  }
}
