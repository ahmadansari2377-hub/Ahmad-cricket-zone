import * as THREE from 'three';
import { attachPlayerModel, type PlayerModel } from './playerModel';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Kit {
  shirt: number;
  trousers: number;
  trim?: number;
  skin?: number;
  head: 'cap' | 'helmet' | 'hat' | 'none';
  headColor?: number;
  pads?: boolean;
  gloves?: boolean;
  /** Printed on the back of the shirt above the number. */
  name?: string;
  number?: number;
}

const SKIN_TONES = [0x8d5f43, 0x9a6a4a, 0xb07c58, 0xc79a7a, 0x6e4630, 0xd8ad8c, 0x7c5238];
const HAIR_COLORS = [0x1a1410, 0x241a12, 0x2e2218, 0x3b2a1c, 0x14100c, 0x5a3d22];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

// ---------------------------------------------------------------- geometry

/** Torso profile from the waist (y = -0.02) to the base of the neck. */
const TORSO_PROFILE = [
  [0.13, -0.04],
  [0.15, 0.0],
  [0.152, 0.08],
  [0.16, 0.18],
  [0.176, 0.28],
  [0.19, 0.38],
  [0.192, 0.45],
  [0.178, 0.51],
  [0.14, 0.555],
  [0.08, 0.585],
  [0.05, 0.6],
].map(([r, y]) => new THREE.Vector2(r, y));

/** A limb shell from (radius, y) pairs listed bottom to top. */
const limb = (pts: number[][], seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

const geo = {
  torso: new THREE.LatheGeometry(TORSO_PROFILE, 28, Math.PI / 2),
  pelvis: new THREE.LatheGeometry(
    [
      [0.12, -0.2],
      [0.155, -0.16],
      [0.162, -0.08],
      [0.154, 0.0],
      [0.145, 0.03],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    20,
  ),
  belt: new THREE.TorusGeometry(0.15, 0.014, 6, 24),
  collar: new THREE.TorusGeometry(0.062, 0.016, 6, 18),
  shoulder: new THREE.SphereGeometry(0.068, 14, 10),
  thigh: limb([[0.02, -0.46], [0.058, -0.44], [0.064, -0.38], [0.074, -0.26], [0.085, -0.12], [0.091, -0.02], [0.088, 0.04], [0.06, 0.08], [0.02, 0.1]]),
  knee: new THREE.SphereGeometry(0.068, 12, 8),
  shin: limb([[0.02, -0.44], [0.04, -0.43], [0.043, -0.37], [0.052, -0.27], [0.063, -0.15], [0.065, -0.07], [0.058, 0.0], [0.05, 0.05], [0.02, 0.08]]),
  ankle: new THREE.SphereGeometry(0.045, 10, 8),
  shoe: new THREE.CapsuleGeometry(0.05, 0.17, 4, 10),
  sole: new THREE.BoxGeometry(0.105, 0.025, 0.28),
  shoeStripe: new THREE.BoxGeometry(0.004, 0.03, 0.09),
  padBase: new THREE.BoxGeometry(0.17, 0.5, 0.06),
  padRoll: new THREE.CylinderGeometry(0.026, 0.026, 0.5, 8),
  kneeRoll: new THREE.CylinderGeometry(0.05, 0.05, 0.18, 10),
  padStrap: new THREE.BoxGeometry(0.19, 0.025, 0.12),
  neck: new THREE.CylinderGeometry(0.05, 0.058, 0.11, 12),
  skull: new THREE.SphereGeometry(0.1, 24, 18),
  jaw: new THREE.SphereGeometry(0.075, 16, 12),
  nose: new THREE.ConeGeometry(0.016, 0.04, 8),
  ear: new THREE.SphereGeometry(0.022, 8, 8),
  eyeWhite: new THREE.SphereGeometry(0.014, 10, 8),
  pupil: new THREE.SphereGeometry(0.008, 8, 6),
  brow: new THREE.BoxGeometry(0.034, 0.007, 0.01),
  hair: new THREE.SphereGeometry(0.106, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
  beard: new THREE.SphereGeometry(0.079, 14, 10, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.45, Math.PI * 0.4),
  shades: new THREE.BoxGeometry(0.12, 0.028, 0.02),
  upperArm: limb([[0.02, -0.33], [0.044, -0.31], [0.049, -0.25], [0.058, -0.15], [0.063, -0.06], [0.06, 0.0], [0.045, 0.04], [0.015, 0.06]], 14),
  cuff: new THREE.TorusGeometry(0.056, 0.012, 6, 16),
  elbow: new THREE.SphereGeometry(0.047, 10, 8),
  forearm: limb([[0.015, -0.29], [0.031, -0.275], [0.034, -0.23], [0.044, -0.12], [0.049, -0.06], [0.045, -0.01], [0.034, 0.03], [0.012, 0.05]], 14),
  palm: new THREE.BoxGeometry(0.075, 0.085, 0.035),
  fingers: new THREE.CapsuleGeometry(0.018, 0.05, 3, 6),
  thumb: new THREE.CapsuleGeometry(0.014, 0.035, 3, 6),
  glove: new THREE.BoxGeometry(0.1, 0.1, 0.085),
  gloveFinger: new THREE.CapsuleGeometry(0.019, 0.07, 3, 8),
  gloveCuff: new THREE.CylinderGeometry(0.055, 0.052, 0.07, 12),
  capCrown: new THREE.SphereGeometry(0.112, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  capBrim: new THREE.CylinderGeometry(0.085, 0.085, 0.01, 18, 1, false, -Math.PI / 2, Math.PI),
  capButton: new THREE.SphereGeometry(0.014, 8, 6),
  helmet: new THREE.SphereGeometry(0.132, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6),
  helmetPeak: new THREE.CylinderGeometry(0.15, 0.15, 0.012, 20, 1, false, -Math.PI * 0.42, Math.PI * 0.84),
  helmetStripe: new THREE.TorusGeometry(0.134, 0.006, 4, 32, Math.PI),
  neckGuard: new THREE.CylinderGeometry(0.12, 0.13, 0.07, 16, 1, true, Math.PI * 0.65, Math.PI * 0.7),
  grilleBar: new THREE.TorusGeometry(0.128, 0.0055, 5, 24, Math.PI * 0.75),
  grilleStem: new THREE.CylinderGeometry(0.005, 0.005, 0.12, 5),
  hatCrown: new THREE.CylinderGeometry(0.095, 0.11, 0.1, 18),
  hatBrim: new THREE.CylinderGeometry(0.21, 0.21, 0.01, 28),
  hatBand: new THREE.CylinderGeometry(0.112, 0.112, 0.022, 18, 1, true),
};

// ---------------------------------------------------------------- materials

const matCache = new Map<string, THREE.Material>();
export function mat(color: number, roughness = 0.75, metalness = 0) {
  const key = `s-${color}-${roughness}-${metalness}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    matCache.set(key, m);
  }
  return m;
}

/** Soft fabric: a sheen layer catches the light at grazing angles like real cloth. */
export function cloth(color: number, map?: THREE.Texture, key = '') {
  const k = `c-${color}-${key}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({
      color: map ? 0xffffff : color,
      map: map ?? null,
      normalMap: fabricNormal(),
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: 0.82,
      sheen: 0.6,
      sheenRoughness: 0.55,
      sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.55),
    });
    matCache.set(k, m);
  }
  return m;
}

/**
 * Tangent-space normal map of a fine knit with soft creases, built once from
 * a height field so clothing catches the light like real fabric.
 */
let fabricTex: THREE.Texture | null = null;
function fabricNormal() {
  if (fabricTex) return fabricTex;
  const N = 256;
  const h = new Float32Array(N * N);
  const folds = Array.from({ length: 7 }, () => [Math.random() * N, Math.random() * N, 0.02 + Math.random() * 0.05, Math.random() * Math.PI]);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // Knit: interleaved rows of small bumps.
      const knit = Math.sin((x + (y % 8 < 4 ? 0 : 2)) * Math.PI * 0.5) * Math.sin(y * Math.PI * 0.25) * 0.35;
      let crease = 0;
      for (const [cx, cy, fr, a] of folds) {
        const d = (x - cx) * Math.cos(a) + (y - cy) * Math.sin(a);
        crease += Math.sin(d * fr) * 0.8;
      }
      h[y * N + x] = knit + crease;
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N);
  const at = (x: number, y: number) => h[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * N + x) * 4;
      img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  fabricTex = new THREE.CanvasTexture(c);
  fabricTex.wrapS = fabricTex.wrapT = THREE.RepeatWrapping;
  fabricTex.repeat.set(9, 9);
  fabricTex.anisotropy = 4;
  return fabricTex;
}

function skinMat(color: number) {
  const k = `skin-${color}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.52, sheen: 0.25, sheenColor: new THREE.Color(0xffd9c2), sheenRoughness: 0.6 });
    matCache.set(k, m);
  }
  return m;
}

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/**
 * Shirt texture wrapped around the torso: U = 0.25 is the middle of the back,
 * U = 0.75 the middle of the chest. Side panels and collar in the trim colour,
 * a chest crest, and the name and number on the back.
 */
const shirtTexCache = new Map<string, THREE.CanvasTexture>();
function shirtTexture(shirt: number, trim: number, name?: string, number?: number, team = true) {
  const key = `${shirt}-${trim}-${name ?? ''}-${number ?? ''}-${team}`;
  let tex = shirtTexCache.get(key);
  if (tex) return tex;
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = css(shirt);
  g.fillRect(0, 0, W, H);
  // Soft shading towards the sides and a faint mesh-fabric weave.
  const shade = g.createLinearGradient(0, 0, W, 0);
  for (const [s, a] of [[0, 0.22], [0.25, 0], [0.5, 0.22], [0.75, 0], [1, 0.22]] as const) shade.addColorStop(s, `rgba(0,0,0,${a})`);
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.07;
  g.fillStyle = '#fff';
  for (let y = 0; y < H; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < W; x += 4) g.fillRect(x, y, 1, 1);
  g.globalAlpha = 1;
  if (team) {
    // Side panels (under the arms) and a diagonal sash on the chest.
    g.fillStyle = css(trim);
    for (const x of [0, 0.5]) g.fillRect(x * W - 14, 0, 28, H);
    g.fillRect(W - 14, 0, 14, H);
    g.save();
    g.globalAlpha = 0.85;
    g.translate(0.75 * W, H * 0.55);
    g.rotate(-0.5);
    g.fillRect(-140, -9, 280, 18);
    g.restore();
    // Collar band along the top edge.
    g.fillRect(0, 0, W, 10);
    // Chest crest.
    g.fillStyle = css(trim);
    g.beginPath();
    g.arc(0.75 * W + 40, 58, 13, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 2;
    g.stroke();
  }
  // Name and number on the back.
  const tc = luminance(shirt) > 0.55 ? '#14181f' : '#ffffff';
  g.fillStyle = tc;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (name) {
    g.font = '700 26px "Barlow Condensed", "Arial Narrow", sans-serif';
    const surname = name.split(' ').slice(-1)[0].toUpperCase();
    g.fillText(surname, 0.25 * W, 50, 120);
  }
  if (number !== undefined) {
    g.font = '800 92px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.lineWidth = 5;
    g.strokeStyle = css(trim);
    g.strokeText(String(number), 0.25 * W, 118);
    g.fillText(String(number), 0.25 * W, 118);
  }
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  shirtTexCache.set(key, tex);
  return tex;
}

function luminance(c: number) {
  return (0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)) / 255;
}

/** Soft round contact shadow under each player's feet. */
let blobMat: THREE.MeshBasicMaterial | null = null;
function blobShadow() {
  if (!blobMat) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.2)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), blobMat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  m.renderOrder = 1;
  return m;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
}

/**
 * Bakes the static meshes under each joint into one mesh per material, so a
 * detailed player costs about as many draw calls as the old blocky one.
 */
function mergeStatic(root: THREE.Object3D) {
  const joints: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) joints.push(o);
  });
  for (const j of joints) {
    const byMat = new Map<THREE.Material, THREE.Mesh[]>();
    for (const c of j.children) {
      const m = c as THREE.Mesh;
      if (!m.isMesh || m.children.length || m.userData.keep) continue;
      const list = byMat.get(m.material as THREE.Material) ?? [];
      list.push(m);
      byMat.set(m.material as THREE.Material, list);
    }
    for (const [material, meshes] of byMat) {
      if (meshes.length < 2) continue;
      const geoms = meshes.map((m) => {
        m.updateMatrix();
        const gg = (m.geometry.index ? m.geometry.clone() : m.geometry.clone()).applyMatrix4(m.matrix);
        for (const name of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(name)) gg.deleteAttribute(name);
        return gg;
      });
      const allIndexed = geoms.every((g) => g.index);
      const merged = mergeGeometries(allIndexed ? geoms : geoms.map((g) => (g.index ? g.toNonIndexed() : g)));
      geoms.forEach((g) => g.dispose());
      if (!merged) continue;
      for (const m of meshes) j.remove(m);
      j.add(new THREE.Mesh(merged, material));
    }
  }
}

interface Limb {
  upper: THREE.Group;
  lower: THREE.Group;
}


/**
 * Helmet, cap or umpire's hat, centred on a head of the procedural size
 * (about 0.19 m wide) and facing +z. Realistic models scale it to their head.
 */
export function headGear(kit: Kit, trimMat: THREE.Material): THREE.Group {
  const h = new THREE.Group();
  const hc = kit.headColor ?? kit.shirt;
  if (kit.head === 'cap') {
    const capMat = cloth(hc);
    h.add(mesh(geo.capCrown, capMat, 0, 0.025, 0));
    h.add(mesh(geo.capButton, trimMat, 0, 0.135, 0));
    const brim = mesh(geo.capBrim, capMat, 0, 0.035, 0.09);
    brim.rotation.x = 0.12;
    h.add(brim);
    if (Math.random() < 0.35) {
      const shades = mesh(geo.shades, mat(0x0b0b10, 0.1, 0.6), 0, 0.022, 0.1);
      shades.userData.keep = true;
      h.add(shades);
    }
  } else if (kit.head === 'helmet') {
    const shell = mat(kit.headColor ?? 0x1a3a6a, 0.28, 0.15);
    const metal = mat(0x9aa0a8, 0.3, 0.9);
    h.add(mesh(geo.helmet, shell, 0, -0.005, -0.004));
    const peak = mesh(geo.helmetPeak, shell, 0, 0.025, 0.035);
    peak.rotation.x = 0.1;
    h.add(peak);
    const stripe = mesh(geo.helmetStripe, trimMat, 0, 0.0, -0.004);
    stripe.rotation.y = Math.PI / 2;
    h.add(stripe);
    const guard = mesh(geo.neckGuard, shell, 0, -0.06, 0);
    h.add(guard);
    // Grille: three curved bars and two uprights.
    for (const [y, sc] of [
      [-0.03, 1],
      [-0.07, 0.95],
      [-0.11, 0.85],
    ] as const) {
      const bar = mesh(geo.grilleBar, metal, 0, y, 0.0);
      bar.rotation.set(Math.PI / 2, 0, Math.PI * 0.125);
      bar.scale.set(sc, sc, 1);
      h.add(bar);
    }
    for (const x of [0.03, -0.03]) {
      const stem = mesh(geo.grilleStem, metal, x, -0.075, 0.122);
      stem.rotation.x = -0.15;
      h.add(stem);
    }
  } else if (kit.head === 'hat') {
    const hatMat = cloth(hc);
    h.add(mesh(geo.hatCrown, hatMat, 0, 0.1, 0));
    h.add(mesh(geo.hatBrim, hatMat, 0, 0.05, 0));
    h.add(mesh(geo.hatBand, mat(0x1d2b4f, 0.8), 0, 0.065, 0));
  }
  h.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return h;
}

/** A detailed jointed cricketer. Faces +z by default; feet at y = 0. */
export class Humanoid {
  private static all = new Set<Humanoid>();

  /**
   * Blends every smoothed player's joints towards the pose the game set this
   * frame, so stance changes flow instead of snapping. Call once per frame.
   */
  static updateAll(dt: number) {
    const k = 1 - Math.exp(-dt * 10);
    for (const h of Humanoid.all) {
      if (!h.group.parent) {
        Humanoid.all.delete(h);
        continue;
      }
      if (h.smooth) h.blend(k);
      h.model?.pose(h);
    }
  }

  /** Blend pose changes over a few frames (fielders and umpires). */
  smooth = false;
  private seed = Math.random() * 100;
  private shown: THREE.Euler[] | null = null;
  private shownY = 0.95;
  /** Set by fast motions (running, bowling, signals) so blending does not damp them. */
  private live = false;

  group = new THREE.Group();
  body = new THREE.Group();
  torso = new THREE.Group();
  head = new THREE.Group();
  lLeg: Limb;
  rLeg: Limb;
  lArm: Limb;
  rArm: Limb;
  rHand = new THREE.Object3D();
  /** Number printed on the back (players only). */
  shirtNumber: number | undefined;
  /** The realistic body that copies this rig's pose, once loaded (null: the procedural body shows). */
  model: PlayerModel | null = null;

  constructor(public readonly kit: Kit) {
    const skin = skinMat(kit.skin ?? pick(SKIN_TONES));
    const hairColor = pick(HAIR_COLORS);
    const hair = mat(hairColor, 0.9);
    const trim = kit.trim ?? kit.shirt;
    const isPlayer = kit.trim !== undefined;
    const number = kit.number ?? (isPlayer ? 1 + Math.floor(Math.random() * 99) : undefined);
    this.shirtNumber = number;
    const shirtMat = cloth(kit.shirt, shirtTexture(kit.shirt, trim, kit.name, number, isPlayer), `${trim}-${kit.name ?? ''}-${number ?? ''}`);
    const sleeve = cloth(kit.shirt);
    const trimMat = cloth(trim);
    const trousers = cloth(kit.trousers);
    const white = cloth(0xf4f4ef);
    const sole = mat(0x2a2a2e, 0.7);
    const leather = mat(0x1c1c1f, 0.5);

    this.group.add(this.body);
    this.body.position.y = 0.95;
    // Small natural variation in build.
    const build = 0.96 + Math.random() * 0.08;
    this.group.scale.set(build, 0.97 + Math.random() * 0.06, build);

    // Hips and belt.
    const pelvis = mesh(geo.pelvis, trousers);
    pelvis.scale.set(1.08, 1, 0.7);
    this.body.add(pelvis);
    const belt = mesh(geo.belt, leather, 0, 0.0);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1.08, 0.78, 1);
    this.body.add(belt);

    this.lLeg = this.makeLeg(0.1, trousers, kit.pads ? white : null, white, sole, trimMat);
    this.rLeg = this.makeLeg(-0.1, trousers, kit.pads ? white : null, white, sole, trimMat);

    // Chest: a sculpted lathe with the printed shirt wrapped round it.
    this.body.add(this.torso);
    const chest = mesh(geo.torso, shirtMat);
    chest.scale.set(1.18, 1, 0.74);
    chest.userData.keep = true;
    this.torso.add(chest);
    for (const x of [0.2, -0.2]) {
      const sh = mesh(geo.shoulder, sleeve, x, 0.47, 0);
      sh.scale.set(1, 0.85, 1.05);
      this.torso.add(sh);
    }
    const collar = mesh(geo.collar, trimMat, 0, 0.585, 0.004);
    collar.rotation.x = Math.PI / 2 - 0.25;
    collar.scale.set(1.1, 1, 1);
    this.torso.add(collar);
    this.torso.add(mesh(geo.neck, skin, 0, 0.62, 0));

    this.head.position.y = 0.72;
    this.torso.add(this.head);
    this.buildHead(kit, skin, hair, trimMat);

    const glove = kit.gloves ? white : null;
    this.lArm = this.makeArm(0.24, sleeve, trimMat, skin, glove, 1);
    this.rArm = this.makeArm(-0.24, sleeve, trimMat, skin, glove, -1);
    this.rArm.lower.add(this.rHand);
    this.rHand.position.y = -0.3;

    mergeStatic(this.group);
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.group.add(blobShadow());
    this.reset();
    Humanoid.all.add(this);
    attachPlayerModel(this);
  }

  /** Hides the procedural body (its joints stay as the rig) and shows a realistic model. */
  useModel(model: PlayerModel) {
    // Every procedural mesh hangs under the body (gear included); the rig joints stay.
    this.body.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.visible = false;
    });
    this.model = model;
    this.group.add(model.root);
  }

  private get joints() {
    return [this.body, this.torso, this.head, this.lLeg.upper, this.lLeg.lower, this.rLeg.upper, this.rLeg.lower, this.lArm.upper, this.lArm.lower, this.rArm.upper, this.rArm.lower];
  }

  private blend(k: number) {
    const joints = this.joints;
    if (!this.shown) {
      this.shown = joints.map((j) => j.rotation.clone());
      this.shownY = this.body.position.y;
      return;
    }
    if (this.live) {
      // Track fast motion exactly; blending resumes from here when it stops.
      this.live = false;
      joints.forEach((j, i) => this.shown![i].copy(j.rotation));
      this.shownY = this.body.position.y;
      return;
    }
    joints.forEach((j, i) => {
      const s = this.shown![i];
      s.set(s.x + (j.rotation.x - s.x) * k, s.y + (j.rotation.y - s.y) * k, s.z + (j.rotation.z - s.z) * k);
      j.rotation.copy(s);
    });
    this.shownY += (this.body.position.y - this.shownY) * k;
    this.body.position.y = this.shownY;
  }

  /**
   * Turns the head (and a little of the chest) to watch a point in the world,
   * with a slow breathing sway so standing players never look frozen.
   */
  look(target: THREE.Vector3, time: number, idle = true) {
    this.group.updateMatrixWorld();
    const local = this.group.worldToLocal(target.clone());
    const yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1.4, 1.4);
    const pitch = Math.atan2(local.y - 1.65, Math.max(0.5, Math.hypot(local.x, local.z)));
    this.head.rotation.y = yaw * 0.75;
    this.head.rotation.x = THREE.MathUtils.clamp(-pitch, -0.6, 0.5);
    if (idle) {
      // Absolute values: the pose may persist across frames, so nothing here accumulates.
      this.torso.rotation.y = yaw * 0.2;
      this.torso.rotation.z = Math.sin(time * 0.6 + this.seed) * 0.025 + Math.sin(time * 1.7 + this.seed) * 0.008;
    }
  }

  private buildHead(kit: Kit, skin: THREE.Material, hair: THREE.Material, trimMat: THREE.Material) {
    const h = this.head;
    const skull = mesh(geo.skull, skin, 0, 0.01, 0);
    skull.scale.set(0.92, 1.08, 1);
    h.add(skull);
    const jaw = mesh(geo.jaw, skin, 0, -0.045, 0.022);
    jaw.scale.set(1, 0.9, 1);
    h.add(jaw);
    const nose = mesh(geo.nose, skin, 0, -0.005, 0.1);
    nose.rotation.x = Math.PI / 2 + 0.35;
    h.add(nose);
    for (const s of [1, -1]) {
      const ear = mesh(geo.ear, skin, s * 0.094, 0.0, -0.005);
      ear.scale.set(0.5, 1.2, 0.9);
      h.add(ear);
      h.add(mesh(geo.eyeWhite, mat(0xf2eee6, 0.3), s * 0.035, 0.022, 0.085));
      h.add(mesh(geo.pupil, mat(0x1a120c, 0.2), s * 0.035, 0.022, 0.097));
      const brow = mesh(geo.brow, hair, s * 0.036, 0.046, 0.093);
      brow.rotation.z = s * -0.12;
      h.add(brow);
    }
    // Mouth line.
    const mouth = mesh(geo.brow, mat(0x6a3a2c, 0.6), 0, -0.05, 0.097);
    mouth.scale.set(1.1, 0.8, 1);
    h.add(mouth);
    if (kit.head !== 'helmet') {
      const hr = mesh(geo.hair, hair, 0, 0.015, -0.006);
      hr.rotation.x = -0.25;
      hr.scale.set(0.95, 1.05, 1.02);
      h.add(hr);
    }
    if (Math.random() < 0.4) h.add(mesh(geo.beard, hair, 0, -0.04, 0.02));

    h.add(headGear(kit, trimMat));
  }

  private makeLeg(x: number, trousers: THREE.Material, pad: THREE.Material | null, shoe: THREE.Material, sole: THREE.Material, trim: THREE.Material): Limb {
    const upper = new THREE.Group();
    upper.position.set(x, -0.04, 0);
    const thigh = mesh(geo.thigh, trousers, 0, 0, 0);
    thigh.scale.set(1, 1, 1.08);
    upper.add(thigh);
    const lower = new THREE.Group();
    lower.position.y = -0.43;
    lower.add(mesh(geo.knee, trousers, 0, 0, 0.005));
    lower.add(mesh(geo.shin, trousers, 0, 0, 0));
    lower.add(mesh(geo.ankle, trousers, 0, -0.4, 0));
    if (pad) {
      // Batting pad: a base shell with vertical bolsters, a knee roll and straps.
      lower.add(mesh(geo.padBase, pad, 0, -0.2, 0.05));
      for (const dx of [-0.06, -0.02, 0.02, 0.06]) lower.add(mesh(geo.padRoll, pad, dx, -0.2, 0.085));
      const kr = mesh(geo.kneeRoll, pad, 0, 0.06, 0.07);
      kr.rotation.z = Math.PI / 2;
      lower.add(kr);
      for (const y of [-0.05, -0.3]) lower.add(mesh(geo.padStrap, trim, 0, y, 0.03));
    }
    // Spiked shoe: rounded upper, dark sole, three stripes on each side.
    const shoeUp = mesh(geo.shoe, shoe, 0, -0.44, 0.055);
    shoeUp.rotation.x = Math.PI / 2;
    shoeUp.scale.set(1, 1, 0.75);
    lower.add(shoeUp);
    lower.add(mesh(geo.sole, sole, 0, -0.47, 0.055));
    for (const s of [1, -1]) for (const dz of [0.02, 0.05, 0.08]) {
      const st = mesh(geo.shoeStripe, trim, s * 0.05, -0.44, dz + 0.02);
      st.rotation.x = -0.5;
      lower.add(st);
    }
    upper.add(lower);
    this.body.add(upper);
    return { upper, lower };
  }

  private makeArm(x: number, sleeve: THREE.Material, trim: THREE.Material, skin: THREE.Material, glove: THREE.Material | null, side: number): Limb {
    const upper = new THREE.Group();
    upper.position.set(x, 0.47, 0);
    upper.add(mesh(geo.upperArm, sleeve, 0, 0, 0));
    const cuff = mesh(geo.cuff, trim, 0, -0.25, 0);
    cuff.rotation.x = Math.PI / 2;
    upper.add(cuff);
    const lower = new THREE.Group();
    lower.position.y = -0.3;
    lower.add(mesh(geo.elbow, sleeve, 0, 0.0, 0));
    lower.add(mesh(geo.forearm, glove ? sleeve : skin, 0, 0, 0));
    if (glove) {
      // Padded batting glove with finger rolls.
      lower.add(mesh(geo.gloveCuff, glove, 0, -0.22, 0));
      lower.add(mesh(geo.glove, glove, 0, -0.29, 0));
      for (const dx of [-0.033, -0.011, 0.011, 0.033]) lower.add(mesh(geo.gloveFinger, glove, dx, -0.36, 0.012));
      const th = mesh(geo.gloveFinger, glove, side * -0.055, -0.29, 0.03);
      th.rotation.z = side * 0.6;
      lower.add(th);
    } else {
      lower.add(mesh(geo.palm, skin, 0, -0.285, 0));
      const f = mesh(geo.fingers, skin, 0, -0.345, 0.004);
      f.scale.set(1.9, 1, 0.9);
      lower.add(f);
      const th = mesh(geo.thumb, skin, side * -0.042, -0.29, 0.018);
      th.rotation.z = side * 0.5;
      lower.add(th);
    }
    upper.add(lower);
    this.torso.add(upper);
    return { upper, lower };
  }

  reset() {
    this.body.position.y = 0.95;
    this.body.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    for (const l of [this.lLeg, this.rLeg, this.lArm, this.rArm]) {
      l.upper.rotation.set(0, 0, 0);
      l.lower.rotation.set(0, 0, 0);
    }
    this.lArm.upper.rotation.z = 0.12;
    this.rArm.upper.rotation.z = -0.12;
    this.lArm.lower.rotation.x = -0.12;
    this.rArm.lower.rotation.x = -0.12;
  }

  /** Running cycle. `phase` advances with distance; `amt` 0 (stand) to 1 (sprint). */
  run(phase: number, amt: number) {
    this.live = true;
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    this.lLeg.upper.rotation.x = -s * 0.85 * amt;
    this.rLeg.upper.rotation.x = s * 0.85 * amt;
    this.lLeg.lower.rotation.x = Math.max(0, c) * 1.3 * amt + 0.05;
    this.rLeg.lower.rotation.x = Math.max(0, -c) * 1.3 * amt + 0.05;
    this.lArm.upper.rotation.x = s * 0.8 * amt;
    this.rArm.upper.rotation.x = -s * 0.8 * amt;
    this.lArm.lower.rotation.x = -0.9 * amt - 0.12;
    this.rArm.lower.rotation.x = -0.9 * amt - 0.12;
    this.body.position.y = 0.95 - 0.04 * amt + Math.abs(c) * 0.06 * amt;
    this.torso.rotation.x = 0.18 * amt;
    this.torso.rotation.y = s * 0.12 * amt;
    this.head.rotation.y = -s * 0.1 * amt;
  }

  /** Ready crouch used by fielders (0.4) and the wicketkeeper (1). */
  crouch(amt: number) {
    this.lLeg.upper.rotation.x = -1.0 * amt;
    this.rLeg.upper.rotation.x = -1.0 * amt;
    this.lLeg.lower.rotation.x = 1.7 * amt;
    this.rLeg.lower.rotation.x = 1.7 * amt;
    this.lLeg.upper.rotation.z = 0.15 * amt;
    this.rLeg.upper.rotation.z = -0.15 * amt;
    this.body.position.y = 0.95 - 0.42 * amt;
    this.torso.rotation.x = 0.45 * amt;
    this.head.rotation.x = -0.35 * amt;
    this.lArm.upper.rotation.x = -0.6 * amt;
    this.rArm.upper.rotation.x = -0.6 * amt;
    this.lArm.lower.rotation.x = -0.5 * amt;
    this.rArm.lower.rotation.x = -0.5 * amt;
  }

  /** Bowling action from back-foot contact (u = 0) to follow-through (u = 1). */
  bowl(u: number) {
    this.live = true;
    const k = Math.min(1, Math.max(0, u));
    this.rArm.upper.rotation.x = k * Math.PI * 2.1;
    this.rArm.lower.rotation.x = 0;
    this.lArm.upper.rotation.x = Math.PI * (0.9 - 0.9 * k) + 0.2;
    this.torso.rotation.x = -0.25 + k * 0.85;
    this.torso.rotation.y = 0.6 - k * 1.0;
    this.head.rotation.x = -k * 0.4;
    this.lLeg.upper.rotation.x = -0.6 + k * 0.3;
    this.lLeg.lower.rotation.x = 0.1;
    this.rLeg.upper.rotation.x = 0.4 - k * 1.1;
    this.rLeg.lower.rotation.x = 0.6 * (1 - k) + 0.4 * k;
  }

  /** Celebration: both arms up, jumping. */
  celebrate(t: number) {
    this.reset();
    this.live = true;
    this.lArm.upper.rotation.x = -2.8 + Math.sin(t * 9) * 0.25;
    this.rArm.upper.rotation.x = -2.8 + Math.cos(t * 9) * 0.25;
    this.lArm.lower.rotation.x = -0.3;
    this.rArm.lower.rotation.x = -0.3;
    this.head.rotation.x = -0.3;
    const hop = Math.max(0, Math.sin(t * 9));
    this.body.position.y = 0.95 + hop * 0.12;
    this.lLeg.lower.rotation.x = hop * 0.5;
    this.rLeg.lower.rotation.x = hop * 0.5;
  }

  /** Umpire signals. */
  signal(kind: 'out' | 'four' | 'six' | 'wide' | 'noball' | 'none', t: number) {
    this.reset();
    this.live = kind === 'four';
    if (kind === 'out') {
      this.rArm.upper.rotation.x = -Math.PI * 0.95;
      this.rArm.lower.rotation.x = 0;
    } else if (kind === 'six') {
      this.lArm.upper.rotation.x = -Math.PI;
      this.rArm.upper.rotation.x = -Math.PI;
      this.lArm.lower.rotation.x = 0;
      this.rArm.lower.rotation.x = 0;
    } else if (kind === 'wide') {
      this.lArm.upper.rotation.z = Math.PI / 2;
      this.rArm.upper.rotation.z = -Math.PI / 2;
      this.lArm.lower.rotation.x = 0;
      this.rArm.lower.rotation.x = 0;
    } else if (kind === 'noball') {
      this.rArm.upper.rotation.z = -Math.PI / 2;
      this.rArm.lower.rotation.x = 0;
    } else if (kind === 'four') {
      this.rArm.upper.rotation.x = -Math.PI / 2;
      this.rArm.upper.rotation.y = Math.sin(t * 6) * 0.9;
      this.rArm.lower.rotation.x = 0;
    } else {
      // Idle: a gentle breathing sway.
      this.torso.rotation.x = Math.sin(t * 1.4) * 0.015;
    }
  }
}
