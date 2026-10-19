import * as THREE from 'three';
import { FIELD_CENTER_Z, PITCH_LEN } from '../game/constants';

export type CamMode = 'pov' | 'broadcast';
export type CamPhase = 'menu' | 'prep' | 'delivery' | 'inplay';

/**
 * POV: the batter's eyes at the crease (head offset will come from webcam head
 * tracking in Phase 3). Broadcast: the classic telephoto end-on TV camera,
 * then a high follow camera once the ball is hit.
 */
export class CameraRig {
  mode: CamMode = 'pov';
  /** Head offset in metres, fed by head tracking in POV mode. */
  headOffset = new THREE.Vector3();
  /** Batter footwork (front-foot stride, back-and-across) carried by the POV camera. */
  stepOffset = new THREE.Vector3();
  private shake = 0;
  private look = new THREE.Vector3(0, 1.4, PITCH_LEN);
  private followPos = new THREE.Vector3();
  private bowlFov = 60;

  constructor(public camera: THREE.PerspectiveCamera) {}

  /** A short jolt, e.g. the bat jarring on impact. */
  kick(amount: number) {
    this.shake = Math.max(this.shake, amount);
  }

  toggle() {
    this.mode = this.mode === 'pov' ? 'broadcast' : 'pov';
  }

  update(phase: CamPhase, time: number, dt: number, ball: THREE.Vector3 | null, bowlerEyes: THREE.Vector3 | null = null) {
    const cam = this.camera;
    const k = 1 - Math.exp(-dt * 5);
    this.shake *= Math.exp(-dt * 14);

    // Bowling POV: through the bowler's eyes, from the run-up to the follow-through.
    if (this.mode === 'pov' && bowlerEyes && phase !== 'menu') {
      cam.position.copy(bowlerEyes).add(this.headOffset);
      // Stare down at the target while aiming, then widen out for the run-up.
      this.bowlFov += ((phase === 'prep' ? 24 : 60) - this.bowlFov) * (1 - Math.exp(-dt * (phase === 'prep' ? 6 : 3)));
      cam.fov = this.bowlFov;
      const target = new THREE.Vector3(0, 0.7, 0);
      if ((phase === 'delivery' || phase === 'inplay') && ball) target.copy(ball);
      this.look.lerp(target, phase === 'prep' ? 1 - Math.exp(-dt * 6) : 1 - Math.exp(-dt * 8));
      cam.lookAt(this.look);
      if (phase === 'inplay' && ball) {
        const d = ball.distanceTo(cam.position);
        cam.fov = THREE.MathUtils.clamp(60 - (d - 20) * 0.3, 32, 60);
        this.bowlFov = cam.fov;
      }
      cam.updateProjectionMatrix();
      return;
    }

    if (phase === 'menu') {
      const a = time * 0.06;
      cam.position.set(Math.cos(a) * 58, 22, FIELD_CENTER_Z + Math.sin(a) * 58);
      cam.fov = 45;
      this.look.set(0, 2, FIELD_CENTER_Z);
      cam.lookAt(this.look);
      cam.updateProjectionMatrix();
      return;
    }

    if (this.mode === 'pov') {
      const breathe = Math.sin(time * 1.6) * 0.006;
      cam.position.set(0.1, 1.52 + breathe, 0.45).add(this.headOffset).add(this.stepOffset);
      if (this.shake > 1e-4) cam.position.add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0).multiplyScalar(this.shake));
      cam.fov = 62;
      const target = new THREE.Vector3(0, 1.0, PITCH_LEN);
      // Watch the ball out of the hand and all the way onto the bat.
      if ((phase === 'inplay' || phase === 'delivery') && ball) {
        target.copy(ball);
        if (phase === 'delivery') target.lerp(new THREE.Vector3(0, 1.0, PITCH_LEN), 0.25);
      }
      this.look.lerp(target, phase === 'prep' ? k : 1 - Math.exp(-dt * (phase === 'delivery' ? 7 : 9)));
      cam.lookAt(this.look);
      // Zoom a little when tracking a ball far away, like eyes focusing.
      if (phase === 'inplay' && ball) {
        const d = ball.distanceTo(cam.position);
        cam.fov = THREE.MathUtils.clamp(58 - (d - 10) * 0.35, 30, 58);
      }
    } else if (phase === 'inplay' && ball) {
      const want = new THREE.Vector3(ball.x * 0.5, 34, ball.z * 0.5 - 40);
      this.followPos.lerp(want, 1 - Math.exp(-dt * 2));
      cam.position.copy(this.followPos);
      this.look.lerp(ball, 1 - Math.exp(-dt * 8));
      cam.lookAt(this.look);
      cam.fov = THREE.MathUtils.clamp(14 + this.followPos.distanceTo(ball) * 0.25, 20, 42);
    } else {
      // Above and in front of the bowler's-end sightscreen, long lens.
      cam.position.set(0.4, 10.5, PITCH_LEN + 48);
      this.followPos.copy(cam.position);
      this.look.set(0, 0.8, 2.5);
      cam.lookAt(this.look);
      cam.fov = 13;
    }
    cam.updateProjectionMatrix();
  }
}
