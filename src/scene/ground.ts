import * as THREE from 'three';
import type { GroundInfo } from '../data/grounds';
import { FIELD_CENTER_Z, PITCH_HALF_W, PITCH_LEN, POPPING, WIDE_LINE } from '../game/constants';
import { ropeRadius } from '../game/groundState';
import { createGrass } from './grass';
import { Stumps } from './stumps';
import { fieldTexture, photoImage, photoTexture, pitchTexture } from './textures';

const FIELD_R = 100;
const PITCH_TOTAL = PITCH_LEN + 5;
/** Size (m) of one tile of the scanned grass and clay surfaces. */
const GRASS_TILE = 1.1;
const CLAY_TILE = 1.5;

/**
 * Outfield, pitch, crease markings, rope and stumps. The surface group is
 * tilted to match the ground's slope (Lord's falls ~2.5 m across).
 */
export function createGround(scene: THREE.Scene) {
  const surface = new THREE.Group();
  surface.position.z = FIELD_CENTER_Z;
  scene.add(surface);

  // Outfield: the mown colour and stripes are painted; the blade-level surface
  // (relief, roughness and shading between blades) comes from a scanned lawn.
  const grassRepeat = (FIELD_R * 2) / GRASS_TILE;
  const field = new THREE.Mesh(
    new THREE.CircleGeometry(FIELD_R, 180),
    new THREE.MeshStandardMaterial({
      map: fieldTexture(FIELD_R * 2),
      normalMap: photoTexture('grass_nor.jpg', grassRepeat),
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughnessMap: photoTexture('grass_rough.jpg', grassRepeat),
      roughness: 1,
      aoMap: photoTexture('grass_ao.jpg', grassRepeat),
      aoMapIntensity: 0.6,
    }),
  );
  field.rotation.x = -Math.PI / 2;
  field.receiveShadow = true;
  surface.add(field);

  // Pitch strip, with a live canvas so ball marks and footmarks build up over the match.
  const pitchCanvas = pitchTexture().image as HTMLCanvasElement;
  const pristine = document.createElement('canvas');
  pristine.width = pitchCanvas.width;
  pristine.height = pitchCanvas.height;
  pristine.getContext('2d')!.drawImage(pitchCanvas, 0, 0);
  const pTex = new THREE.CanvasTexture(pitchCanvas);
  pTex.colorSpace = THREE.SRGBColorSpace;
  pTex.anisotropy = 8;
  // Rolled clay: scanned cracks and grain, lined up with the colour painted below.
  const clayX = (PITCH_HALF_W * 2) / CLAY_TILE;
  const clayY = PITCH_TOTAL / CLAY_TILE;
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH_HALF_W * 2, PITCH_TOTAL),
    new THREE.MeshStandardMaterial({
      map: pTex,
      normalMap: photoTexture('pitch_nor.jpg', clayX, clayY),
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughnessMap: photoTexture('pitch_rough.jpg', clayX, clayY),
      roughness: 1,
    }),
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 0.004;
  pitch.receiveShadow = true;
  surface.add(pitch);

  // Crease markings (5 cm white paint lines).
  const paint = new THREE.MeshStandardMaterial({ color: 0xf6f6f0, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
  const line = (x: number, z: number, w: number, d: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), paint);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.006, z - FIELD_CENTER_Z);
    m.receiveShadow = true;
    surface.add(m);
  };
  for (const end of [0, PITCH_LEN]) {
    const dir = end === 0 ? 1 : -1;
    const popZ = end + dir * POPPING;
    line(0, end, 2.64, 0.05); // bowling crease
    line(0, popZ, 3.66 + 0.6, 0.05); // popping crease
    for (const x of [-1.32, 1.32]) line(x, end, 0.05, POPPING * 2); // return creases
    for (const x of [-WIDE_LINE, WIDE_LINE]) line(x, popZ + dir * 0.45, 0.04, 0.9); // T20 wide guidelines
  }

  createGrass(surface);

  // Per-ground pieces: rope and 30-yard circle follow each ground's boundary shape.
  let perGround = new THREE.Group();
  surface.add(perGround);
  const discGeo = new THREE.CylinderGeometry(0.18, 0.2, 0.03, 16);
  const discMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x1b4fa8, roughness: 0.5 });

  const batEnd = new Stumps(0);
  const bowlEnd = new Stumps(PITCH_LEN);
  scene.add(batEnd.group, bowlEnd.group);

  const toCanvas = (x: number, z: number) => ({
    cx: ((x + PITCH_HALF_W) / (PITCH_HALF_W * 2)) * pitchCanvas.width,
    cy: ((z - (FIELD_CENTER_Z - PITCH_TOTAL / 2)) / PITCH_TOTAL) * pitchCanvas.height,
  });
  const ctx = pitchCanvas.getContext('2d')!;

  // Blend the scanned clay's colour into the painted pitch, tile for tile with
  // its normal map. Footmarks and ball marks are drawn on top as before.
  void photoImage('pitch_diff.jpg')
    .then((img) => {
      const tw = pitchCanvas.width / clayX;
      const th = pitchCanvas.height / clayY;
      const pc = pristine.getContext('2d')!;
      pc.save();
      pc.globalCompositeOperation = 'soft-light';
      pc.globalAlpha = 0.9;
      for (let y = 0; y < pitchCanvas.height; y += th) for (let x = 0; x < pitchCanvas.width; x += tw) pc.drawImage(img, x, y, tw, th);
      pc.restore();
      ctx.drawImage(pristine, 0, 0);
      pTex.needsUpdate = true;
    })
    .catch((err) => console.warn('Pitch photo unavailable; keeping the painted pitch', err));

  return {
    batEnd,
    bowlEnd,

    setGround(info: GroundInfo) {
      surface.rotation.z = Math.atan(info.slope);
      surface.remove(perGround);
      perGround = new THREE.Group();
      surface.add(perGround);

      // Elliptical rope.
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 256; i++) {
        const a = (i / 256) * Math.PI * 2;
        const r = ropeRadius(a);
        pts.push(new THREE.Vector3(Math.cos(a) * r, 0.07, Math.sin(a) * r));
      }
      const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 256, 0.09, 8, true), ropeMat);
      rope.castShadow = true;
      perGround.add(rope);

      // 30-yard (27.43 m) fielding circle markers.
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const d = new THREE.Mesh(discGeo, discMat);
        d.position.set(Math.cos(a) * 27.43, 0.015, Math.sin(a) * 27.43 * 1.15);
        perGround.add(d);
      }
      this.resetWear();
    },

    /** A scuff where the ball pitched. */
    markBounce(x: number, z: number) {
      const { cx, cy } = toCanvas(x, z);
      ctx.fillStyle = 'rgba(95, 75, 50, 0.35)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 2.5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      pTex.needsUpdate = true;
    },

    /** The bowler's front-foot landing mark, which roughens the pitch for spinners. */
    markFootmark(x: number, z: number) {
      const { cx, cy } = toCanvas(x, z);
      ctx.fillStyle = 'rgba(110, 88, 58, 0.22)';
      ctx.beginPath();
      ctx.ellipse(cx + (Math.random() - 0.5) * 6, cy + (Math.random() - 0.5) * 10, 7, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      pTex.needsUpdate = true;
    },

    resetWear() {
      ctx.drawImage(pristine, 0, 0);
      pTex.needsUpdate = true;
    },
  };
}

export type Ground = ReturnType<typeof createGround>;
