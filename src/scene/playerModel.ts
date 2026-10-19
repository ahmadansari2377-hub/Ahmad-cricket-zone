import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { cloth, headGear, type Humanoid, type Kit } from './players';

/**
 * Realistic players: a rigged human body (Quaternius Universal Base
 * Characters, CC0) dressed in kit cut from its own surface, so shirt,
 * trousers and shoes bend with the skeleton.
 *
 * The game keeps animating its invisible procedural rig exactly as before;
 * every frame the model's bones copy that rig's pose. If the model cannot
 * load, the procedural players simply stay visible.
 */

const DIR = `${import.meta.env.BASE_URL}models/players/`;
const DOWN = new THREE.Vector3(0, -1, 0);
/** Horizontal slimming of the athletic base body. */
const LEAN = 0.94;

/** Kit cut from the body: which bones' skin each garment covers. */
const SHIRT = ['spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r'];
const SLEEVES = ['lowerarm_l', 'lowerarm_r'];
const TROUSERS = ['pelvis', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r'];
const SHOES = ['foot_l', 'foot_r', 'ball_l', 'ball_r', 'ball_leaf_l', 'ball_leaf_r'];

/** Skin tones as multipliers on the body texture, light to dark. */
const SKIN_TINTS = [0xffffff, 0xf0dccb, 0xd9b49a, 0xb98a6c, 0x8f6249, 0x6e4a37];
const HAIR_TINTS = [0x2a2018, 0x1a1410, 0x3b2a1c, 0x14100c, 0x5a3d22];

interface Assets {
  template: THREE.Object3D;
  hair: Record<'parted' | 'buzzed' | 'beard', THREE.Object3D>;
  /** Turn (radians about y) that makes the model face +z, like the rig. */
  turn: number;
  /** True when the file's "_l" bones end up on the rig's right after turning. */
  mirrored: boolean;
  scale: number;
  garments: { shirt: THREE.BufferGeometry; longShirt: THREE.BufferGeometry; trousers: THREE.BufferGeometry; shoes: THREE.BufferGeometry };
  /** Model-space boxes of the skin weighted to a bone (head, calves, hands), for fitting gear. */
  boxes: Record<string, THREE.Box3>;
}

let assets: Promise<Assets | null> | null = null;

function loadAssets() {
  assets ??= (async () => {
    try {
      const loader = new GLTFLoader();
      const [body, parted, buzzed, beard] = await Promise.all(
        ['male.glb', 'hair_simpleparted.glb', 'hair_buzzed.glb', 'hair_beard.glb'].map((f) => loader.loadAsync(DIR + f)),
      );
      const template = body.scene;
      template.updateMatrixWorld(true);
      const skinMesh = findBody(template);
      if (!skinMesh) throw new Error('no skinned body in male.glb');
      const bone = (n: string) => template.getObjectByName(n)!;
      const w = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

      // Which way the model faces: heel to toe.
      const toe = w(bone('ball_l')).sub(w(bone('foot_l')));
      const turn = -Math.atan2(toe.x, toe.z);
      // After turning, the person's left must be +x (the rig's left arm side).
      const leftArm = w(bone('upperarm_l')).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn);
      const box = new THREE.Box3().setFromObject(skinMesh);
      const scale = 1.79 / (box.max.y - box.min.y);

      const names = skinMesh.skeleton.bones.map((b) => b.name);
      const g = skinMesh.geometry;
      const pelvisIdx = names.indexOf('pelvis');
      const waist = skinMesh.worldToLocal(bone('pelvis').getWorldPosition(new THREE.Vector3())).y + 0.02;
      const belowWaistband = (v: number) => mainBone(g, v) === pelvisIdx && g.attributes.position.getY(v) > waist;
      const garments = {
        shirt: cutGarment(g, names, SHIRT, 0.009, belowWaistband),
        longShirt: cutGarment(g, names, [...SHIRT, ...SLEEVES], 0.009, belowWaistband),
        trousers: cutGarment(g, names, TROUSERS, 0.007),
        shoes: cutGarment(g, names, SHOES, 0.012),
      };
      const boxes: Record<string, THREE.Box3> = {};
      for (const n of ['Head', 'calf_l', 'calf_r']) boxes[n] = boneBox(skinMesh, [names.indexOf(n)]);
      // The body's outline at the waist, for the waistband that covers the shirt's edge.
      const waistBox = new THREE.Box3();
      const wp = new THREE.Vector3();
      for (let v = 0; v < g.attributes.position.count; v++) {
        wp.fromBufferAttribute(g.attributes.position, v);
        if (Math.abs(wp.y - waist) < 0.025) waistBox.expandByPoint(wp.clone().applyMatrix4(skinMesh.matrixWorld));
      }
      boxes.waist = waistBox;
      // The chest and upper back, for printing the name and number on the shirt.
      boxes.chest = boneBox(skinMesh, ['spine_02', 'spine_03'].map((n) => names.indexOf(n)));
      // A hand's skin mostly follows its finger bones: measure them all together.
      for (const s of ['l', 'r']) {
        const hand = names.map((n, i) => (n === `hand_${s}` || (/^(index|middle|ring|pinky|thumb)_0\d_/.test(n) && n.endsWith(`_${s}`)) ? i : -1));
        boxes[`hand_${s}`] = boneBox(skinMesh, hand.filter((i) => i >= 0));
      }
      return {
        template,
        hair: { parted: parted.scene, buzzed: buzzed.scene, beard: beard.scene },
        turn,
        mirrored: leftArm.x < 0,
        scale,
        garments,
        boxes,
      };
    } catch (err) {
      console.warn('Realistic players unavailable; using the built-in ones', err);
      return null;
    }
  })();
  return assets;
}

/** Gives a Humanoid its realistic body as soon as the model files are loaded. */
export function attachPlayerModel(h: Humanoid) {
  void loadAssets().then((a) => {
    if (a && !h.model) h.useModel(new PlayerModel(a, h));
  });
}

function findBody(root: THREE.Object3D) {
  let best: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh && (!best || m.geometry.attributes.position.count > best.geometry.attributes.position.count)) best = m;
  });
  return best as THREE.SkinnedMesh | null;
}

/** Index of the bone with the largest skin weight for a vertex. */
function mainBone(g: THREE.BufferGeometry, v: number) {
  const si = g.attributes.skinIndex;
  const sw = g.attributes.skinWeight;
  let best = 0;
  let bw = -1;
  for (let k = 0; k < 4; k++) {
    const wgt = sw.getComponent(v, k);
    if (wgt > bw) {
      bw = wgt;
      best = si.getComponent(v, k);
    }
  }
  return best;
}

/**
 * A garment: the body's triangles mostly weighted to the given bones, pushed
 * out along the normals so it sits on the skin. It keeps the body's skin
 * weights, so it deforms with the same skeleton.
 */
function cutGarment(g: THREE.BufferGeometry, names: string[], bones: string[], inflate: number, extra?: (v: number) => boolean) {
  const want = new Set(bones.map((b) => names.indexOf(b)).filter((i) => i >= 0));
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const inside = new Uint8Array(pos.count);
  for (let v = 0; v < pos.count; v++) inside[v] = want.has(mainBone(g, v)) || extra?.(v) ? 1 : 0;
  const src = g.index ? g.index.array : Array.from({ length: pos.count }, (_, i) => i);
  const idx: number[] = [];
  for (let t = 0; t < src.length; t += 3) {
    const a = src[t];
    const b = src[t + 1];
    const c = src[t + 2];
    if (inside[a] + inside[b] + inside[c] >= 2) idx.push(a, b, c);
  }
  const out = new THREE.BufferGeometry();
  const p = new Float32Array(pos.count * 3);
  for (let v = 0; v < pos.count; v++) {
    p[v * 3] = pos.getX(v) + nrm.getX(v) * inflate;
    p[v * 3 + 1] = pos.getY(v) + nrm.getY(v) * inflate;
    p[v * 3 + 2] = pos.getZ(v) + nrm.getZ(v) * inflate;
  }
  out.setAttribute('position', new THREE.BufferAttribute(p, 3));
  for (const name of ['normal', 'uv', 'skinIndex', 'skinWeight']) if (g.attributes[name]) out.setAttribute(name, g.attributes[name]);
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}

/** Bounding box (model space, bind pose) of the vertices mostly weighted to any of the given bones. */
function boneBox(m: THREE.SkinnedMesh, boneIndices: number[]) {
  const want = new Set(boneIndices);
  const g = m.geometry;
  const box = new THREE.Box3();
  const v3 = new THREE.Vector3();
  for (let v = 0; v < g.attributes.position.count; v++) {
    if (!want.has(mainBone(g, v))) continue;
    box.expandByPoint(v3.fromBufferAttribute(g.attributes.position, v).applyMatrix4(m.matrixWorld));
  }
  return box;
}

const tintedSkin = new Map<string, THREE.Material>();
function tinted(base: THREE.Material, key: string, color: number) {
  const k = `${base.uuid}-${key}-${color}`;
  let m = tintedSkin.get(k);
  if (!m) {
    m = base.clone();
    (m as THREE.MeshStandardMaterial).color.setHex(color);
    tintedSkin.set(k, m);
  }
  return m;
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

interface BoneMap {
  joint: (h: Humanoid) => THREE.Object3D;
  bone: THREE.Bone;
  /** The bone's bind-pose rotation (rig space), turned to the rig's zero pose. */
  aligned: THREE.Quaternion;
}

/** One player's realistic body, posed from a Humanoid's rig every frame. */
export class PlayerModel {
  root: THREE.Object3D;
  private maps: BoneMap[] = [];
  private order: THREE.Bone[] = [];
  private rest = new Map<THREE.Bone, THREE.Quaternion>();
  private fixedParent = new Map<THREE.Bone, THREE.Quaternion>();
  private groupQ = new Map<THREE.Object3D, THREE.Quaternion>();
  private target = new Map<THREE.Bone, THREE.Quaternion>();
  private pelvis: THREE.Bone;
  private pelvisBind = new THREE.Vector3();
  private toPelvisParent = new THREE.Matrix3();

  constructor(a: Assets, h: Humanoid) {
    const kit = h.kit;
    this.root = cloneSkinned(a.template);
    this.root.rotation.y = a.turn;
    // Superhero proportions slimmed a little towards a cricketer's build.
    this.root.scale.set(a.scale * LEAN, a.scale, a.scale * LEAN);
    h.group.add(this.root);
    h.group.updateMatrixWorld(true);

    const bone = (n: string) => this.root.getObjectByName(n) as THREE.Bone;
    const side = (n: string, s: 'l' | 'r') => bone(`${n}_${a.mirrored ? (s === 'l' ? 'r' : 'l') : s}`);
    const body = findBody(this.root)!;

    // ---- Skin, kit and shadows.
    const tone = pick(SKIN_TINTS);
    const browMeshes: THREE.SkinnedMesh[] = [];
    this.root.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.frustumCulled = false;
      m.castShadow = true;
      if (m === body) m.material = tinted(m.material as THREE.Material, 'skin', tone);
      else if (/brow/i.test(m.name)) browMeshes.push(m);
    });
    const isPlayer = kit.trim !== undefined;
    const garment = (geo: THREE.BufferGeometry, material: THREE.Material) => {
      const g = new THREE.SkinnedMesh(geo, material);
      g.bind(body.skeleton, body.bindMatrix);
      g.bindMode = body.bindMode;
      g.frustumCulled = false;
      g.castShadow = true;
      g.receiveShadow = true;
      body.parent!.add(g);
    };
    // Batters and keepers wear long sleeves under their gloves; officials wear long sleeves too.
    garment(kit.gloves || !isPlayer ? a.garments.longShirt : a.garments.shirt, cloth(kit.shirt));
    garment(a.garments.trousers, cloth(kit.trousers));
    garment(a.garments.shoes, cloth(isPlayer ? 0xf4f4ef : 0x1a1a1d));

    // ---- Hair, fitted to the head bone (hidden under a helmet).
    const head = bone('Head');
    const hairTint = pick(HAIR_TINTS);
    for (const m of browMeshes) m.material = tinted(m.material as THREE.Material, 'hair', hairTint);
    const hairStyle = kit.head === 'helmet' ? null : kit.head === 'none' ? pick(['parted', 'parted', 'buzzed'] as const) : 'buzzed';
    const addHair = (src: THREE.Object3D) => {
      const piece = src.clone(true);
      piece.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.material = tinted(m.material as THREE.Material, 'hair', hairTint);
          m.castShadow = true;
        }
      });
      this.root.add(piece);
      this.root.updateMatrixWorld(true);
      head.attach(piece);
    };
    if (hairStyle) addHair(a.hair[hairStyle]);
    if (kit.head !== 'helmet' && Math.random() < 0.35) addHair(a.hair.beard);

    // ---- Gear, built in rig space at the measured body part and attached to its bone.
    const fit = (obj: THREE.Object3D, modelPoint: THREE.Vector3, to: THREE.Bone) => {
      obj.position.copy(h.group.worldToLocal(this.root.localToWorld(modelPoint.clone())));
      h.group.add(obj);
      h.group.updateMatrixWorld(true);
      to.attach(obj);
    };
    const trimMat = cloth(kit.trim ?? kit.shirt);
    if (kit.head !== 'none') {
      const hb = a.boxes.Head;
      const size = hb.getSize(new THREE.Vector3());
      const gear = headGear(kit, trimMat);
      gear.scale.setScalar((Math.max(size.x, size.z) * a.scale) / 0.19);
      fit(gear, hb.getCenter(new THREE.Vector3()).add(new THREE.Vector3(0, size.y * 0.06, 0)), head);
    }
    // Waistband: hides the cut edge where the shirt meets the trousers.
    {
      const w = a.boxes.waist.getSize(new THREE.Vector3()).multiplyScalar(a.scale);
      // An oval round the hips (rig x and z), a little outside the skin and the shirt.
      const rx = (w.x * LEAN) / 2 + 0.02;
      const rz = (w.z * LEAN) / 2 + 0.02;
      const ring = Array.from({ length: 32 }, (_, i) => {
        const t = (i / 32) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(t) * rx, 0, Math.sin(t) * rz);
      });
      const band = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring, true), 48, 0.022, 6, true), cloth(kit.trousers));
      band.scale.y = 1.4; // a little taller than it is thick
      band.castShadow = true;
      fit(band, a.boxes.waist.getCenter(new THREE.Vector3()), bone('pelvis'));
    }
    // Name and number on the back of the shirt, riding on the upper spine.
    if (isPlayer && h.shirtNumber !== undefined) {
      const c = a.boxes.chest;
      const size = c.getSize(new THREE.Vector3());
      const centre = c.getCenter(new THREE.Vector3());
      // The back is the side of the chest box away from the way the model faces.
      const backward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), -a.turn);
      const depth = Math.abs(backward.x) > Math.abs(backward.z) ? size.x : size.z;
      const width = (Math.abs(backward.x) > Math.abs(backward.z) ? size.z : size.x) * a.scale * LEAN;
      const at = centre.clone().addScaledVector(backward, depth / 2 + 0.012).add(new THREE.Vector3(0, size.y * 0.05, 0));
      fit(backPrint(width * 0.62, kit, h.shirtNumber), at, bone('spine_03'));
    }
    if (kit.pads) {
      for (const s of ['l', 'r'] as const) {
        const b = a.boxes[`calf_${a.mirrored ? (s === 'l' ? 'r' : 'l') : s}`];
        const size = b.getSize(new THREE.Vector3()).multiplyScalar(a.scale);
        const front = b.getCenter(new THREE.Vector3());
        fit(battingPad(size.y), front, side('calf', s));
      }
    }
    if (kit.gloves) {
      for (const s of ['l', 'r'] as const) {
        const b = a.boxes[`hand_${a.mirrored ? (s === 'l' ? 'r' : 'l') : s}`];
        // Sized from the measured hand (fingers included), with room for the padding.
        fit(glove(b.getSize(new THREE.Vector3()).multiplyScalar(a.scale * 1.08)), b.getCenter(new THREE.Vector3()), side('hand', s));
      }
    }

    // ---- Pose mapping: rig joint -> bone, with the bind pose turned to the rig's zero pose.
    const invG = h.group.getWorldQuaternion(new THREE.Quaternion()).invert();
    const rigQ = (o: THREE.Object3D) => invG.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion()));
    const rigDir = (from: THREE.Object3D, to: THREE.Object3D) => {
      const d = to.getWorldPosition(new THREE.Vector3()).sub(from.getWorldPosition(new THREE.Vector3()));
      return d.applyQuaternion(invG).normalize();
    };
    const map = (joint: BoneMap['joint'], b: THREE.Bone, child?: THREE.Bone) => {
      const q = rigQ(b);
      const align = child ? new THREE.Quaternion().setFromUnitVectors(rigDir(b, child), DOWN) : new THREE.Quaternion();
      this.maps.push({ joint, bone: b, aligned: align.multiply(q) });
    };
    map((x) => x.body, bone('pelvis'));
    map((x) => x.torso, bone('spine_01'));
    map((x) => x.head, head);
    for (const s of ['l', 'r'] as const) {
      const arm = s === 'l' ? (x: Humanoid) => x.lArm : (x: Humanoid) => x.rArm;
      const leg = s === 'l' ? (x: Humanoid) => x.lLeg : (x: Humanoid) => x.rLeg;
      map((x) => arm(x).upper, side('upperarm', s), side('lowerarm', s));
      map((x) => arm(x).lower, side('lowerarm', s), side('hand', s));
      map((x) => leg(x).upper, side('thigh', s), side('calf', s));
      map((x) => leg(x).lower, side('calf', s), side('foot', s));
    }

    // Bones parent-first, their rest rotations, and the fixed rotation above the skeleton.
    const roots = body.skeleton.bones.filter((b) => !(b.parent as THREE.Bone)?.isBone);
    const walk = (b: THREE.Object3D) => {
      if ((b as THREE.Bone).isBone) {
        const bb = b as THREE.Bone;
        this.order.push(bb);
        this.rest.set(bb, bb.quaternion.clone());
      }
      for (const c of b.children) if ((c as THREE.Bone).isBone) walk(c);
    };
    roots.forEach(walk);
    for (const r of roots) this.fixedParent.set(r, rigQ(r.parent!));

    this.pelvis = bone('pelvis');
    this.pelvisBind.copy(this.pelvis.position);
    // Rig-space offsets to the pelvis's parent space (rotation and scale at bind).
    const parentWorld = this.pelvis.parent!.matrixWorld;
    const toParent = new THREE.Matrix4().copy(parentWorld).invert().multiply(h.group.matrixWorld);
    this.toPelvisParent.setFromMatrix4(toParent);
  }

  /** Copies the rig's current pose onto the bones. */
  pose(h: Humanoid) {
    h.group.updateMatrixWorld(true);
    const invG = h.group.getWorldQuaternion(new THREE.Quaternion()).invert();
    const q = new THREE.Quaternion();
    for (const m of this.maps) {
      const t = this.target.get(m.bone) ?? new THREE.Quaternion();
      t.copy(invG).multiply(m.joint(h).getWorldQuaternion(q)).multiply(m.aligned);
      this.target.set(m.bone, t);
    }
    for (const b of this.order) {
      const parentQ = (b.parent as THREE.Bone).isBone ? this.groupQ.get(b.parent!)! : this.fixedParent.get(b)!;
      const t = this.target.get(b);
      if (t) b.quaternion.copy(parentQ).invert().multiply(t);
      else b.quaternion.copy(this.rest.get(b)!);
      const g = this.groupQ.get(b) ?? new THREE.Quaternion();
      this.groupQ.set(b, g.copy(parentQ).multiply(b.quaternion));
    }
    // Crouches and jumps move the hips.
    const dy = h.body.position.y - 0.95;
    this.pelvis.position.copy(this.pelvisBind).add(new THREE.Vector3(0, dy, 0).applyMatrix3(this.toPelvisParent));
  }
}

/**
 * Surname and number for the back of a shirt, on a slightly curved card
 * facing -z (the player's back), sized to the given width in metres.
 */
function backPrint(width: number, kit: Kit, number: number) {
  const W = 256;
  const H = 300;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const light = luminance(kit.shirt) > 0.55;
  const ink = light ? '#14181f' : '#ffffff';
  const edge = `#${(kit.trim ?? kit.shirt).toString(16).padStart(6, '0')}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  if (kit.name) {
    g.font = '700 46px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.fillStyle = ink;
    g.fillText(kit.name.split(' ').slice(-1)[0].toUpperCase(), W / 2, 40, W - 16);
  }
  g.font = '800 200px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.lineWidth = 12;
  g.strokeStyle = edge;
  g.strokeText(String(number), W / 2, 180);
  g.fillStyle = ink;
  g.fillText(String(number), W / 2, 180);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const height = (width * H) / W;
  const geo = new THREE.PlaneGeometry(width, height, 8, 1);
  // Wrap round the back: the edges curve forward a little.
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, -((p.getX(i) / width) ** 2) * width * 0.35);
  geo.computeVertexNormals();
  geo.rotateY(Math.PI);
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  return m;
}

function luminance(c: number) {
  return (0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)) / 255;
}

/** Batting pad for a shin of the given length (m), facing +z. */
function battingPad(len: number) {
  const white = cloth(0xf4f4ef);
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.17, len + 0.12, 0.05), white);
  base.position.z = 0.07;
  g.add(base);
  const roll = new THREE.CylinderGeometry(0.024, 0.024, len + 0.1, 8);
  for (const x of [-0.06, -0.02, 0.02, 0.06]) {
    const r = new THREE.Mesh(roll, white);
    r.position.set(x, 0, 0.1);
    g.add(r);
  }
  const knee = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.18, 10), white);
  knee.rotation.z = Math.PI / 2;
  knee.position.set(0, len / 2 + 0.06, 0.09);
  g.add(knee);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** A padded batting glove around a hand of the given size: rounded, a little thicker than the hand. */
function glove(size: THREE.Vector3) {
  const w = Math.max(0.07, size.x);
  const h = Math.max(0.06, size.y * 1.6);
  const d = Math.max(0.07, size.z);
  const g = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.4), cloth(0xeeeeea));
  g.castShadow = true;
  return g;
}

