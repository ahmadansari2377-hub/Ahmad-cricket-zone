import * as THREE from 'three';
import { PITCH_LEN } from '../game/constants';

export const grassUniforms = { uTime: { value: 0 } };

let grassMesh: THREE.InstancedMesh | null = null;
let grassTotal = 0;

/** Graphics quality: draws only a fraction of the blades (0 hides the grass). */
export function setGrassDensity(fraction: number) {
  if (!grassMesh) return;
  grassMesh.count = Math.floor(grassTotal * Math.min(1, Math.max(0, fraction)));
  grassMesh.visible = grassMesh.count > 0;
}

/**
 * Individual grass blades around both ends of the pitch, where the POV
 * cameras are close to the ground. One instanced mesh; the wind sways the
 * tips in the vertex shader.
 */
export function createGrass(parent: THREE.Object3D) {
  // One blade: a thin tapered triangle, darker at the root. Colours are linear
  // (not sRGB) and normals point up so blades are lit exactly like the turf.
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.006, 0, 0, 0.006, 0, 0, 0, 1, 0], 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute([0.05, 0.15, 0.03, 0.05, 0.15, 0.03, 0.1, 0.24, 0.05], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = grassUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 root = instanceMatrix[3].xyz;
        float sway = sin(uTime * 1.7 + root.x * 0.8 + root.z * 0.6) * 0.5 + sin(uTime * 3.1 + root.z) * 0.2;
        transformed.x += sway * position.y * position.y * 0.6;`,
      );
    // Two-sided blades normally flip their normal when seen from behind, which
    // turns them black under floodlights. Keep the upward normal on both sides.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n  normal = normalize( vNormal );',
    );
  };

  const COUNT = 70000;
  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let n = 0;
  // The surface group is centred on the middle of the pitch.
  const half = PITCH_LEN / 2;
  while (n < COUNT) {
    const end = n % 2 === 0 ? -half : half;
    const r = 1.6 + Math.pow(Math.random(), 0.7) * 13;
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = end + Math.sin(a) * r;
    if (Math.abs(x) < 1.65 && Math.abs(z) < half + 2.6) continue; // keep off the pitch strip
    pos.set(x, 0, z);
    q.setFromAxisAngle(up, Math.random() * Math.PI);
    const h = 0.035 + Math.random() * 0.035;
    s.set(1 + Math.random(), h, 1);
    m.compose(pos, q, s);
    mesh.setMatrixAt(n++, m);
  }
  mesh.frustumCulled = false;
  mesh.receiveShadow = false; // tiny blades only pick up shadow-map speckle
  parent.add(mesh);
  grassMesh = mesh;
  grassTotal = COUNT;
  return mesh;
}
