import * as THREE from 'three';
import type { Delivery } from '../game/ai/aiBowler';
import { BALL_R, STUMP_H, STUMP_HALF_SPREAD } from '../game/constants';
import type { TrackingVerdict } from '../game/drs';

const RADIAL = 10;
const GOOD = 0x2fd16b;
const BAD = 0xff3b4e;
const AMBER = 0xffb020;

/**
 * Ball-tracking graphic for DRS: the real path up to the pad, the predicted
 * path on to the stumps, and the pitching / impact / wickets markers.
 */
export class HawkEye {
  group = new THREE.Group();
  private tracked: THREE.Mesh | null = null;
  private projected: THREE.Mesh | null = null;
  private markers = new THREE.Group();
  private ball: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    this.group.visible = false;
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * 1.6, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.group.add(this.markers, this.ball);
    scene.add(this.group);
  }

  private tube(points: THREE.Vector3[], color: number, opacity: number) {
    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, Math.max(8, points.length * 2), BALL_R * 1.35, RADIAL, false);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    geo.setDrawRange(0, 0);
    this.group.add(mesh);
    return mesh;
  }

  /** Builds the graphic for one delivery. `impactT` is when the ball hit the pad. */
  show(d: Delivery, impactT: number, v: TrackingVerdict) {
    this.clear();
    const upTo = d.path.filter((s) => s.t <= impactT).map((s) => s.p.clone());
    const beyond = d.path.filter((s) => s.t >= impactT && s.p.z >= -0.05).map((s) => s.p.clone());
    if (upTo.length > 1) this.tracked = this.tube(upTo, 0xff7a1a, 0.92);
    if (beyond.length > 1) this.projected = this.tube(beyond, 0x3d8bff, 0.75);

    // Red = points to out, green = points to not out, amber = umpire's call.
    const colour = (z: string) => (z === 'In line' || z === 'Hitting' ? BAD : z === "Umpire's call" ? AMBER : GOOD);
    // Pitching spot on the surface.
    const pitch = new THREE.Mesh(new THREE.CircleGeometry(0.11, 28), new THREE.MeshBasicMaterial({ color: colour(v.pitching), transparent: true, opacity: 0.85 }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.set(d.bounceAt.x, 0.012, d.bounceAt.z);
    // Impact on the pad, facing the bowler.
    const imp = upTo[upTo.length - 1] ?? d.contactP;
    const impact = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.08, 28), new THREE.MeshBasicMaterial({ color: colour(v.impact), side: THREE.DoubleSide }));
    impact.position.copy(imp).add(new THREE.Vector3(0, 0, 0.06));
    // The wicket zone in front of the stumps, coloured by the verdict.
    const zone = new THREE.Mesh(
      new THREE.PlaneGeometry(STUMP_HALF_SPREAD * 2 + BALL_R * 2, STUMP_H + BALL_R),
      new THREE.MeshBasicMaterial({ color: colour(v.wickets), transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
    );
    zone.position.set(0, (STUMP_H + BALL_R) / 2, 0.02);
    const hit = new THREE.Mesh(new THREE.CircleGeometry(BALL_R * 1.4, 20), new THREE.MeshBasicMaterial({ color: colour(v.wickets) }));
    hit.position.set(v.atStumps.x, v.atStumps.y, 0.03);
    // Line of the stumps along the pitch, so in-line reads at a glance.
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
    for (const x of [-STUMP_HALF_SPREAD - BALL_R, STUMP_HALF_SPREAD + BALL_R]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 20), lineMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(x, 0.011, 10);
      this.markers.add(strip);
    }
    for (const m of [pitch, impact, zone, hit]) m.visible = false;
    this.markers.add(pitch, impact, zone, hit);
    this.upTo = upTo;
    this.beyond = beyond;
    this.pitchMarker = pitch;
    this.impactMarker = impact;
    this.zoneMarkers = [zone, hit];
    this.group.visible = true;
  }

  private upTo: THREE.Vector3[] = [];
  private beyond: THREE.Vector3[] = [];
  private pitchMarker: THREE.Object3D | null = null;
  private impactMarker: THREE.Object3D | null = null;
  private zoneMarkers: THREE.Object3D[] = [];

  /**
   * Animates the reveal: u 0→1 draws the tracked path, 1→2 the projection.
   * Markers appear as the ball reaches them. Returns the ball position.
   */
  progress(u: number) {
    const draw = (m: THREE.Mesh | null, k: number) => {
      if (!m) return;
      const total = m.geometry.index!.count;
      const step = RADIAL * 6;
      m.geometry.setDrawRange(0, Math.floor((total * THREE.MathUtils.clamp(k, 0, 1)) / step) * step);
    };
    draw(this.tracked, u);
    draw(this.projected, u - 1);
    // The ball rides the tracked path, then the projection.
    const pts = u < 1 || !this.beyond.length ? this.upTo : this.beyond;
    const n = pts.length;
    if (n) {
      const k = THREE.MathUtils.clamp(u < 1 ? u : u - 1, 0, 1) * (n - 1);
      const i = Math.floor(k);
      this.ball.position.copy(pts[i]).lerp(pts[Math.min(n - 1, i + 1)], k - i);
    }
    if (this.pitchMarker && u > 0.45) this.pitchMarker.visible = true;
    if (this.impactMarker && u >= 1) this.impactMarker.visible = true;
    if (u >= 2) this.zoneMarkers.forEach((m) => (m.visible = true));
    return this.ball.position;
  }

  clear() {
    for (const m of [this.tracked, this.projected]) {
      if (!m) continue;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      this.group.remove(m);
    }
    this.tracked = this.projected = null;
    for (const m of [...this.markers.children]) {
      this.markers.remove(m);
      (m as THREE.Mesh).geometry?.dispose();
    }
    this.group.visible = false;
  }
}
