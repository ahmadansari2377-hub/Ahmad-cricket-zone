import * as THREE from 'three';
import { ropeRadius } from '../../game/groundState';
import { boardTexture } from '../textures';
import { ATLAS_COLS, ATLAS_ROWS, crowdAtlas } from './crowdAtlas';

const DEG = Math.PI / 180;

/** Shared animation state for every stadium's crowd. */
export const crowdUniforms = { uTime: { value: 0 }, uCheer: { value: 0 } };

export interface StandSpec {
  /** Angle range in degrees around the middle of the pitch: 0 = +x, 90 = behind the bowler (+z). */
  from: number;
  to: number;
  /** Distance of the front row from the middle of the pitch. */
  r0: number;
  /** Height of the front of this tier above the ground. */
  baseH: number;
  rows: number;
  rowD?: number;
  rowH?: number;
  seat?: number;
  structure?: number;
  /** Fraction of seats filled. */
  fill?: number;
  /** Fan colours mixed into the crowd. */
  fans?: number[];
  roof?: { kind: 'flat' | 'tent'; height: number; color?: number; overhang?: number };
  /** Facade wall behind the top row. */
  backWall?: number;
}

/**
 * Collects spectators and empty seats from every stand, then builds them as
 * two instanced meshes. Each spectator is one picture card that turns to face
 * the camera, dressed from the shared picture sheet (see crowdAtlas.ts).
 */
export class CrowdBuilder {
  private mats: THREE.Matrix4[] = [];
  private colors: THREE.Color[] = [];
  private seats: THREE.Matrix4[] = [];
  private seatColors: THREE.Color[] = [];
  private palette = [0xf2f2f2, 0x222222, 0x2d4f8a, 0x8a2d2d, 0xd9c7a0, 0x5f6f3a, 0xc06a2a, 0x3a6a9a, 0x9a9a9a];

  add(pos: THREE.Vector3, facing: number, fans: number[]) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing);
    const s = 0.92 + Math.random() * 0.18;
    this.mats.push(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(s, s, s)));
    const c = new THREE.Color(
      Math.random() < 0.55 && fans.length ? fans[(Math.random() * fans.length) | 0] : this.palette[(Math.random() * this.palette.length) | 0],
    );
    c.offsetHSL(0, 0, (Math.random() - 0.5) * 0.12);
    this.colors.push(c);
  }

  /** An empty seat, so gaps in the crowd read as seats rather than holes. */
  addSeat(pos: THREE.Vector3, facing: number, color: number) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing);
    this.seats.push(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1)));
    this.seatColors.push(new THREE.Color(color).offsetHSL(0, 0, 0.06));
  }

  build(): THREE.Object3D {
    const group = new THREE.Group();
    group.add(this.buildPeople());
    if (this.seats.length) group.add(this.buildSeats());
    return group;
  }

  private buildPeople() {
    // A card 0.64 m wide and 1.04 m tall, standing on the seat.
    const geo = new THREE.PlaneGeometry(0.64, 1.04);
    geo.translate(0, 0.52, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = crowdUniforms.uTime;
      shader.uniforms.uCheer = crowdUniforms.uCheer;
      shader.uniforms.uAtlas = { value: crowdAtlas() };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime;
          uniform float uCheer;
          varying vec2 vAtlas;
          varying vec3 vSkin;
          varying vec3 vHair;
          varying vec3 vOther;`,
        )
        // Light each card as if it faced the field and slightly up, whatever the camera angle.
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(vec3(0.0, 0.55, 1.0));')
        .replace(
          '#include <begin_vertex>',
          `mat4 inst = modelMatrix * instanceMatrix;
          vec3 center = inst[3].xyz;
          // Turn the card about its own upright axis to face the camera.
          vec3 toCam = transpose(mat3(inst)) * (cameraPosition - center);
          vec3 fwd = normalize(vec3(toCam.x, 0.0, toCam.z) + vec3(1e-4, 0.0, 1e-4));
          vec3 right = vec3(fwd.z, 0.0, -fwd.x);
          float ph = center.x * 1.7 + center.z * 0.9;
          float h1 = fract(sin(dot(center.xz, vec2(12.9898, 78.233))) * 43758.5453);
          float h2 = fract(sin(dot(center.xz, vec2(39.3468, 11.135))) * 24634.6345);
          float h3 = fract(h1 * 7.13 + h2 * 3.71);
          // About two in three stand and raise their arms when the crowd cheers.
          float cheering = step(0.05, uCheer) * step(0.35, fract(ph * 0.37));
          vec3 transformed = right * position.x + vec3(0.0, position.y, 0.0);
          transformed.y += max(0.0, sin(uTime * 9.0 + ph)) * 0.3 * uCheer * cheering + sin(uTime * 1.3 + ph) * 0.01;
          float col = min(floor(h2 * ${ATLAS_COLS}.0), ${ATLAS_COLS - 1}.0);
          vAtlas = vec2((col + uv.x) / ${ATLAS_COLS}.0, 1.0 - (cheering + 1.0 - uv.y) / ${ATLAS_ROWS}.0);
          vSkin = mix(vec3(0.30, 0.18, 0.11), vec3(0.93, 0.75, 0.62), h1);
          vHair = h3 < 0.12 ? vec3(0.72, 0.58, 0.34) : h3 < 0.2 ? vec3(0.62) : vec3(0.06 + 0.1 * h3, 0.045 + 0.06 * h3, 0.03);
          vOther = h3 < 0.3 ? vec3(0.92, 0.9, 0.84) : h3 < 0.5 ? vec3(0.12) : h3 < 0.7 ? vec3(0.22, 0.32, 0.5) : vec3(0.72, 0.62, 0.45);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D uAtlas;
          varying vec2 vAtlas;
          varying vec3 vSkin;
          varying vec3 vHair;
          varying vec3 vOther;`,
        )
        .replace(
          '#include <map_fragment>',
          `vec4 at = texture2D(uAtlas, vAtlas);
          if (at.a < 0.5) discard;
          // Green says which part of the person this is; red is its shading.
          vec3 base = at.g > 0.83 ? vColor.rgb : at.g > 0.5 ? vSkin : at.g > 0.16 ? vHair : vOther;
          diffuseColor.rgb = base * (0.25 + 0.95 * at.r);`,
        )
        // The shirt colour is applied above, only to the shirt.
        .replace('#include <color_fragment>', '');
    };

    const mesh = new THREE.InstancedMesh(geo, mat, this.mats.length);
    this.mats.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, this.colors[i]);
    });
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  private buildSeats() {
    // A moulded seat: pan and back.
    const pan = new THREE.BoxGeometry(0.46, 0.05, 0.4);
    pan.translate(0, 0.42, 0.02);
    const back = new THREE.BoxGeometry(0.46, 0.42, 0.05);
    back.rotateX(-0.12);
    back.translate(0, 0.66, -0.2);
    const geo = mergeBoxes([pan, back]);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.55 }), this.seats.length);
    this.seats.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, this.seatColors[i]);
    });
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return mesh;
  }
}

/** Joins indexed box geometries (same attributes) into one. */
function mergeBoxes(geos: THREE.BufferGeometry[]) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const parts = geos.map((g) => g.getAttribute(name).array as Float32Array);
    const merged = new Float32Array(parts.reduce((n, a) => n + a.length, 0));
    let o = 0;
    for (const a of parts) {
      merged.set(a, o);
      o += a.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(merged, geos[0].getAttribute(name).itemSize));
  }
  const idx: number[] = [];
  let base = 0;
  for (const g of geos) {
    const src = g.index!.array;
    for (let k = 0; k < src.length; k++) idx.push(src[k] + base);
    base += g.getAttribute('position').count;
  }
  out.setIndex(idx);
  return out;
}

/** LED ribbon text along the front of the upper tiers (shared image; each stand sets its own tiling). */
let fasciaImage: THREE.CanvasTexture | null = null;
function fasciaMaterial(arcLength: number) {
  fasciaImage ??= boardTexture([
    { text: "AHMAD'S CRICKET ARENA", bg: '#0b1d3a', fg: '#ffd23f' },
    { text: 'HANDS-ON CRICKET', bg: '#111418', fg: '#3fd0ff' },
    { text: 'FOUR', bg: '#1f8fd6', fg: '#ffffff' },
    { text: 'SIX', bg: '#0b1d3a', fg: '#ffffff' },
  ]);
  const tex = fasciaImage.clone();
  tex.wrapS = THREE.RepeatWrapping;
  // The lathe runs its texture right to left as seen from the field: mirror it so text reads normally.
  tex.repeat.set(-arcLength / 18, 1);
  tex.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.85, roughness: 0.4, side: THREE.DoubleSide });
}

const glassMat = new THREE.MeshStandardMaterial({ color: 0xbfd6e6, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });

/** A curved, tiered stand section with seats, crowd and optional roof. */
export function buildStand(spec: StandSpec, crowd: CrowdBuilder): THREE.Group {
  const g = new THREE.Group();
  const rowD = spec.rowD ?? 0.85;
  const rowH = spec.rowH ?? 0.42;
  const a0 = spec.from * DEG;
  const a1 = spec.to * DEG;
  // LatheGeometry measures phi from +z towards +x.
  const phiStart = Math.PI / 2 - a1;
  const phiLength = a1 - a0;
  const segs = Math.max(8, Math.round((phiLength / (Math.PI * 2)) * 180));

  const profile: THREE.Vector2[] = [new THREE.Vector2(spec.r0 - 0.6, spec.baseH - 1.4), new THREE.Vector2(spec.r0 - 0.6, spec.baseH), new THREE.Vector2(spec.r0, spec.baseH)];
  for (let i = 0; i < spec.rows; i++) {
    const r = spec.r0 + i * rowD;
    const h = spec.baseH + i * rowH;
    profile.push(new THREE.Vector2(r, h + rowH), new THREE.Vector2(r + rowD, h + rowH));
  }
  const top = profile[profile.length - 1];
  const wallH = spec.backWall ?? 3;
  profile.push(new THREE.Vector2(top.x, top.y + wallH), new THREE.Vector2(top.x + 1.5, top.y + wallH), new THREE.Vector2(top.x + 1.5, Math.max(0, spec.baseH - 6)));
  const seatMat = new THREE.MeshStandardMaterial({ color: spec.seat ?? 0x3a4250, roughness: 0.8, side: THREE.DoubleSide, vertexColors: true });
  // Flat faces, so every row reads as a step: lit treads, shaded risers.
  const bowlGeo = new THREE.LatheGeometry(profile, segs, phiStart, phiLength).toNonIndexed();
  bowlGeo.computeVertexNormals();
  const nrm = bowlGeo.getAttribute('normal');
  const shade = new Float32Array(nrm.count * 3);
  for (let i = 0; i < nrm.count; i++) {
    const k = Math.abs(nrm.getY(i)) > 0.5 ? 1 : 0.68;
    shade.set([k, k, k], i * 3);
  }
  bowlGeo.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  const bowl = new THREE.Mesh(bowlGeo, seatMat);
  bowl.receiveShadow = true;
  bowl.castShadow = true;
  g.add(bowl);

  // Front of the tier: an LED ribbon on raised tiers, and a glass barrier on every tier.
  const band = (r: number, y0: number, y1: number) => new THREE.LatheGeometry([new THREE.Vector2(r, y0), new THREE.Vector2(r, y1)], segs, phiStart, phiLength);
  if (spec.baseH > 2) {
    const ribbon = new THREE.Mesh(band(spec.r0 - 0.66, spec.baseH - 1.25, spec.baseH - 0.15), fasciaMaterial(phiLength * (spec.r0 - 0.66)));
    g.add(ribbon);
  }
  const glass = new THREE.Mesh(band(spec.r0 - 0.5, spec.baseH, spec.baseH + 1.05), glassMat);
  glass.renderOrder = 2;
  g.add(glass);

  // Structure under raised tiers.
  if (spec.baseH > 2) {
    const under = new THREE.Mesh(
      new THREE.LatheGeometry([new THREE.Vector2(spec.r0 - 0.6, 0), new THREE.Vector2(spec.r0 - 0.6, spec.baseH - 1.4)], segs, phiStart, phiLength),
      new THREE.MeshStandardMaterial({ color: spec.structure ?? 0x8d8f96, roughness: 0.9, side: THREE.DoubleSide }),
    );
    g.add(under);
  }

  // Spectators.
  const fill = spec.fill ?? 0.82;
  for (let i = 0; i < spec.rows; i++) {
    if (i % 12 === 11) continue; // walkway
    const r = spec.r0 + i * rowD + rowD * 0.45;
    const h = spec.baseH + (i + 1) * rowH;
    const step = 0.62 / r;
    for (let a = a0 + step / 2; a < a1; a += step) {
      if (((a / DEG) % 10 + 10) % 10 < 0.55) continue; // aisles
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const p = new THREE.Vector3(x, h, z);
      if (Math.random() > fill) crowd.addSeat(p, Math.atan2(-x, -z), spec.seat ?? 0x3a4250);
      else crowd.add(p, Math.atan2(-x, -z), spec.fans ?? []);
    }
  }

  // Roof.
  if (spec.roof) {
    const roofMat = new THREE.MeshStandardMaterial({ color: spec.roof.color ?? 0xe9ecef, roughness: 0.45, metalness: 0.25, side: THREE.DoubleSide });
    const inner = spec.r0 + (spec.roof.overhang ?? spec.rows * rowD * 0.35);
    const outer = top.x + 2;
    if (spec.roof.kind === 'flat') {
      const roof = new THREE.Mesh(
        new THREE.LatheGeometry([new THREE.Vector2(inner, spec.roof.height + 1), new THREE.Vector2(outer, spec.roof.height - 1.5)], segs, phiStart, phiLength),
        roofMat,
      );
      roof.castShadow = true;
      g.add(roof);
    } else {
      // Lord's Mound Stand style: a row of white fabric tent peaks.
      const peaks = Math.max(2, Math.round((phiLength * ((inner + outer) / 2)) / 11));
      const coneGeo = new THREE.ConeGeometry((outer - inner) * 0.62, 7, 4, 1, true);
      for (let k = 0; k < peaks; k++) {
        const a = a0 + ((k + 0.5) / peaks) * phiLength;
        const r = (inner + outer) / 2;
        const cone = new THREE.Mesh(coneGeo, roofMat);
        cone.position.set(Math.cos(a) * r, spec.roof.height + 3.5, Math.sin(a) * r);
        cone.rotation.y = -a + Math.PI / 4;
        cone.castShadow = true;
        g.add(cone);
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 10, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
        mast.position.set(Math.cos(a) * r, spec.roof.height + 5, Math.sin(a) * r);
        g.add(mast);
      }
    }
    // Slim columns holding the roof.
    const colGeo = new THREE.CylinderGeometry(0.3, 0.35, spec.roof.height, 8);
    const colMat = new THREE.MeshStandardMaterial({ color: 0xcfd2d6, roughness: 0.5 });
    const cols = Math.max(2, Math.round((phiLength * outer) / 18));
    for (let k = 0; k <= cols; k++) {
      const a = a0 + (k / cols) * phiLength;
      const c = new THREE.Mesh(colGeo, colMat);
      c.position.set(Math.cos(a) * (top.x + 0.5), spec.roof.height / 2, Math.sin(a) * (top.x + 0.5));
      g.add(c);
    }
  }
  return g;
}

/** LED advertising boards that follow the elliptical rope, a few metres outside it. */
export function buildBoards(lines: { text: string; bg: string; fg: string }[]) {
  const tex = boardTexture(lines);
  tex.wrapS = THREE.RepeatWrapping;
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.4, side: THREE.DoubleSide });
  const N = 360;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let len = 0;
  let prev: THREE.Vector2 | null = null;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = ropeRadius(a) + 3.2;
    const p = new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
    if (prev) len += p.distanceTo(prev);
    prev = p;
    // Text runs left-to-right as seen from inside the ground.
    const u = len / 26;
    pos.push(p.x, 0, p.y, p.x, 0.9, p.y);
    uv.push(u, 0, u, 1);
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

/** Black sightscreens at both ends (white-ball cricket). */
export function buildSightscreens(distance: (end: 1 | -1) => number, width = 24, height = 9) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.9 });
  for (const end of [1, -1] as const) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.5), mat);
    s.position.set(0, height / 2, end * distance(end));
    s.castShadow = true;
    g.add(s);
  }
  return g;
}

/** A floodlight mast with a lamp head angled at the middle. Returns the lamp material for night glow. */
export function buildFloodlight(at: THREE.Vector2, height: number, lampMat: THREE.Material, slim = false) {
  const g = new THREE.Group();
  const mastMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.5, metalness: 0.6 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(slim ? 0.45 : 0.9, slim ? 0.8 : 1.8, height, 10), mastMat);
  mast.position.y = height / 2;
  g.add(mast);
  const head = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(slim ? 7 : 13, slim ? 4 : 8, 0.8), mastMat);
  head.add(frame);
  // Grid of lamps.
  const lampGeo = new THREE.CircleGeometry(0.45, 12);
  const cols = slim ? 5 : 8;
  const rows = slim ? 3 : 5;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const l = new THREE.Mesh(lampGeo, lampMat);
      l.position.set((i - (cols - 1) / 2) * 1.4, (j - (rows - 1) / 2) * 1.4, 0.45);
      head.add(l);
    }
  }
  head.position.y = height + 2;
  head.rotation.x = 0.5;
  g.add(head);
  g.position.set(at.x, 0, at.y);
  g.lookAt(0, 0, 0);
  return g;
}

/** Giant replay/score screen. Call `draw` with lines of text to update it. */
export function buildBigScreen(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.round((1024 * height) / width);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.1, roughness: 0.3 }),
  );
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 1, height + 1, 0.8), new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.6 }));
  frame.position.z = -0.45;
  const g = new THREE.Group();
  g.add(frame, screen);
  const draw = (title: string, main: string, sub: string) => {
    const c = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;
    const grad = c.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0b1d3a');
    grad.addColorStop(1, '#05101f');
    c.fillStyle = grad;
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#ffd23f';
    c.fillRect(0, 0, W, H * 0.2);
    c.fillStyle = '#0b1d3a';
    c.font = `800 ${Math.round(H * 0.13)}px "Barlow Condensed", Arial, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(title, W / 2, H * 0.1);
    c.fillStyle = '#ffffff';
    c.font = `800 ${Math.round(H * 0.34)}px "Barlow Condensed", Arial, sans-serif`;
    c.fillText(main, W / 2, H * 0.5);
    c.fillStyle = '#a9b4c8';
    c.font = `600 ${Math.round(H * 0.12)}px "Barlow Condensed", Arial, sans-serif`;
    c.fillText(sub, W / 2, H * 0.83);
    tex.needsUpdate = true;
  };
  draw("AHMAD'S CRICKET ARENA", 'WELCOME', 'Pakistan v Australia');
  return { group: g, draw };
}

/** Trees and city blocks visible through gaps between stands. */
export function buildSurroundings(radius: number, opts: { trees: number; buildings: number; buildingColor: number }) {
  const g = new THREE.Group();
  const treeGeo = new THREE.IcosahedronGeometry(1, 1);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x2f5a2a, roughness: 0.95, flatShading: true });
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, opts.trees);
  const m = new THREE.Matrix4();
  for (let i = 0; i < opts.trees; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = radius + Math.random() * 25;
    const s = 4 + Math.random() * 5;
    m.compose(new THREE.Vector3(Math.cos(a) * r, s * 0.9, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(s, s * 1.2, s));
    trees.setMatrixAt(i, m);
  }
  g.add(trees);
  const bMat = new THREE.MeshStandardMaterial({ color: opts.buildingColor, roughness: 0.85 });
  for (let i = 0; i < opts.buildings; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = radius + 30 + Math.random() * 80;
    const h = 12 + Math.random() * 40;
    const b = new THREE.Mesh(new THREE.BoxGeometry(14 + Math.random() * 20, h, 14 + Math.random() * 20), bMat);
    b.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    b.rotation.y = Math.random() * Math.PI;
    g.add(b);
  }
  return g;
}
