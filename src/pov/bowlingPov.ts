import * as THREE from 'three';
import { BALL_R } from '../game/constants';

/**
 * First-person bowling arm, attached to the camera: you see your sleeve and
 * the ball pumping during the run-up, then the arm comes over the top and the
 * ball leaves your hand.
 */
export class BowlingArm {
  group = new THREE.Group();
  private shoulder = new THREE.Group();
  private elbow = new THREE.Group();
  private ball: THREE.Mesh;
  private leadArm = new THREE.Group();

  constructor(camera: THREE.Camera, sleeveColor: number, skin = 0x9a6a4a) {
    const sleeve = new THREE.MeshStandardMaterial({ color: sleeveColor, roughness: 0.8 });
    const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 });
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.26, 6, 12), sleeve);
    upper.position.y = -0.16;
    this.shoulder.add(upper);
    this.elbow.position.y = -0.32;
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.24, 6, 12), skinMat);
    fore.position.y = -0.14;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), skinMat);
    hand.position.y = -0.3;
    hand.scale.set(1, 1.15, 0.8);
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R * 1.3, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0xf7f5ef, roughness: 0.32 }),
    );
    this.ball.position.set(0, -0.35, -0.03);
    this.elbow.add(fore, hand, this.ball);
    this.shoulder.add(this.elbow);
    // Bowling (right) shoulder sits just right of and below the eyes.
    this.shoulder.position.set(0.26, -0.24, 0.12);
    this.group.add(this.shoulder);

    // Leading (left) arm points at the batter in the delivery stride.
    const lead = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.5, 6, 12), sleeve);
    lead.position.y = -0.3;
    const leadHand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), skinMat);
    leadHand.position.y = -0.6;
    this.leadArm.add(lead, leadHand);
    this.leadArm.position.set(-0.24, -0.2, 0.05);
    this.group.add(this.leadArm);

    this.group.visible = false;
    camera.add(this.group);
  }

  set visible(v: boolean) {
    this.group.visible = v;
  }

  /** Run-up: the arm pumps with the stride. `phase` advances with distance. */
  runup(phase: number, amt: number) {
    this.ball.visible = true;
    // Positive x-rotation swings the arm forward (down-and-ahead of the eyes) into view.
    this.shoulder.rotation.set(0.85 + Math.sin(phase) * 0.35 * amt, 0, -0.1);
    this.elbow.rotation.x = 0.7;
    this.leadArm.rotation.set(0.55 - Math.sin(phase) * 0.4 * amt, 0, 0.1);
  }

  /**
   * Delivery action: u = 0 at back-foot contact, 0.5 at release, 1 at the end
   * of the follow-through. The arm windmills from behind, up over the head and
   * down across the body.
   */
  deliver(u: number) {
    const k = Math.min(1, Math.max(0, u));
    // Camera looks along -z: rotation.x of -PI/2 points the arm backwards, -PI up, -1.5PI forwards.
    this.shoulder.rotation.set(-Math.PI / 2 - k * Math.PI * 1.45, 0, -0.12 + k * 0.35);
    this.elbow.rotation.x = 0;
    this.ball.visible = k < 0.5;
    // Lead arm reaches up towards the batter, then pulls down.
    this.leadArm.rotation.set(-Math.PI * (0.95 - k * 0.8), 0, 0.15 + k * 0.3);
  }
}
