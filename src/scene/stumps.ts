import * as THREE from 'three';
import { STUMP_H, STUMP_HALF_SPREAD } from '../game/constants';

interface Piece {
  mesh: THREE.Mesh;
  home: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  pivotBase: boolean;
}

const stumpGeo = new THREE.CylinderGeometry(0.0175, 0.0175, STUMP_H, 12);
stumpGeo.translate(0, STUMP_H / 2, 0);
const bailGeo = new THREE.CapsuleGeometry(0.008, 0.095, 4, 8);
bailGeo.rotateZ(Math.PI / 2);
const stumpMat = new THREE.MeshStandardMaterial({ color: 0xead9b0, roughness: 0.45 });
const bailMat = new THREE.MeshStandardMaterial({ color: 0xff3a2a, roughness: 0.3, emissive: 0x000000 });

/** A set of three stumps and two bails that can be knocked over. */
export class Stumps {
  group = new THREE.Group();
  private pieces: Piece[] = [];
  private active = false;
  private bails: THREE.MeshStandardMaterial;

  constructor(z: number) {
    this.group.position.z = z;
    // LED bails light up when dislodged, as in T20 cricket.
    this.bails = bailMat.clone();
    const xs = [-STUMP_HALF_SPREAD + 0.0175, 0, STUMP_HALF_SPREAD - 0.0175];
    for (const x of xs) {
      const m = new THREE.Mesh(stumpGeo, stumpMat);
      m.position.set(x, 0, 0);
      m.castShadow = true;
      this.add(m, true);
    }
    for (const x of [-0.048, 0.048]) {
      const m = new THREE.Mesh(bailGeo, this.bails);
      m.position.set(x, STUMP_H + 0.01, 0);
      m.castShadow = true;
      this.add(m, false);
    }
  }

  private add(mesh: THREE.Mesh, pivotBase: boolean) {
    this.group.add(mesh);
    this.pieces.push({ mesh, home: mesh.position.clone(), vel: new THREE.Vector3(), spin: new THREE.Vector3(), pivotBase });
  }

  /** Breaks the wicket. `dir` is the ball's travel direction. */
  knock(dir: THREE.Vector3, power = 1) {
    this.active = true;
    this.bails.emissive.setHex(0xff2010);
    this.bails.emissiveIntensity = 3;
    for (const p of this.pieces) {
      const r = () => (Math.random() - 0.5) * 2;
      if (p.pivotBase) {
        p.vel.set(dir.x * 0.6 + r() * 0.4, 0, dir.z * 0.6).multiplyScalar(power);
        p.spin.set(-Math.sign(dir.z || -1) * (3 + Math.random() * 4) * power, 0, r() * 2);
      } else {
        p.vel.set(dir.x * 2 + r() * 1.5, 2.5 + Math.random() * 2.5, dir.z * 2.5 + r()).multiplyScalar(power);
        p.spin.set(r() * 20, r() * 20, r() * 20);
      }
    }
  }

  update(dt: number) {
    if (!this.active) return;
    for (const p of this.pieces) {
      const m = p.mesh;
      if (p.pivotBase) {
        // Stumps lean over from the base until they hit the ground.
        if (Math.abs(m.rotation.x) < 1.35) {
          m.rotation.x += p.spin.x * dt;
          m.rotation.z += p.spin.z * dt;
          m.position.addScaledVector(p.vel, dt * 0.3);
        }
      } else if (m.position.y > 0.01 || p.vel.y > 0) {
        p.vel.y -= 9.81 * dt;
        m.position.addScaledVector(p.vel, dt);
        m.rotation.x += p.spin.x * dt;
        m.rotation.y += p.spin.y * dt;
        m.rotation.z += p.spin.z * dt;
        if (m.position.y < 0.01) {
          m.position.y = 0.01;
          p.vel.multiplyScalar(0.3);
          p.vel.y = Math.abs(p.vel.y) > 0.5 ? -p.vel.y * 0.3 : 0;
        }
      }
    }
  }

  reset() {
    this.active = false;
    this.bails.emissive.setHex(0x000000);
    for (const p of this.pieces) {
      p.mesh.position.copy(p.home);
      p.mesh.rotation.set(0, 0, 0);
      p.vel.set(0, 0, 0);
    }
  }
}
