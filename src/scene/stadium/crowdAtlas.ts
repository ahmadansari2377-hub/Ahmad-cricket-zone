import * as THREE from 'three';

/**
 * Spectator picture sheet: 8 kinds of person (columns) in two poses (rows:
 * seated, then cheering with arms up), drawn seen from the front.
 *
 * The sheet stores data, not colours, so 8 drawings can dress 40,000 people:
 *   red   = shading (0 dark to 255 lit)
 *   green = which part: shirt 255, skin 170, hair 85, other (hat, scarf) 0
 *   alpha = the person's outline
 * The crowd shader picks each spectator's shirt, skin, hair and accessory colour.
 */
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 2;
const CW = 128;
const CH = 208;

const SHIRT = 255;
const SKIN = 170;
const HAIR = 85;
const OTHER = 0;

type Ctx = CanvasRenderingContext2D;

const fill = (g: Ctx, shade: number, part: number) => (g.fillStyle = `rgb(${Math.round(shade)},${part},0)`);

/** Horizontal shading across a shape: darker at the edges, lit in the middle. */
function sideShade(g: Ctx, x0: number, x1: number, part: number, lo = 120, hi = 235) {
  const grad = g.createLinearGradient(x0, 0, x1, 0);
  grad.addColorStop(0, `rgb(${lo},${part},0)`);
  grad.addColorStop(0.45, `rgb(${hi},${part},0)`);
  grad.addColorStop(1, `rgb(${lo - 15},${part},0)`);
  g.fillStyle = grad;
}

function ellipse(g: Ctx, x: number, y: number, rx: number, ry: number) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

function poly(g: Ctx, pts: number[][]) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
  g.closePath();
  g.fill();
}

function torso(g: Ctx, hood: boolean) {
  sideShade(g, 16, 112, SHIRT);
  g.beginPath();
  g.moveTo(30, 100);
  g.quadraticCurveTo(64, 92, 98, 100);
  g.quadraticCurveTo(114, 104, 112, 124);
  g.lineTo(104, 208);
  g.lineTo(24, 208);
  g.lineTo(16, 124);
  g.quadraticCurveTo(14, 104, 30, 100);
  g.fill();
  // Collar shadow and a soft crease.
  fill(g, 95, SHIRT);
  g.beginPath();
  g.moveTo(52, 99);
  g.quadraticCurveTo(64, 112, 76, 99);
  g.lineTo(72, 99);
  g.quadraticCurveTo(64, 106, 56, 99);
  g.fill();
  if (hood) {
    fill(g, 150, SHIRT);
    g.beginPath();
    g.moveTo(34, 100);
    g.quadraticCurveTo(64, 116, 94, 100);
    g.quadraticCurveTo(64, 108, 34, 100);
    g.fill();
  }
}

function arms(g: Ctx, up: boolean) {
  if (!up) {
    // Arms by the sides, forearms resting forward on the lap.
    for (const s of [-1, 1]) {
      const x = 64 + s * 46;
      sideShade(g, x - 9, x + 9, SHIRT, 110, 210);
      poly(g, [[x - 8 * s, 104], [x + 8 * s, 108], [x + 6 * s, 150], [x - 6 * s, 150]]);
      sideShade(g, x - 8, x + 8, SKIN, 120, 225);
      poly(g, [[x - 6 * s, 150], [x + 6 * s, 150], [x - 14 * s, 186], [x - 26 * s, 184]]);
      fill(g, 200, SKIN);
      ellipse(g, x - 22 * s, 188, 8, 6);
    }
    return;
  }
  // Both arms raised in a V, hands open.
  for (const s of [-1, 1]) {
    const sx = 64 + s * 40;
    fill(g, 185, SHIRT);
    poly(g, [[sx - 7, 104], [sx + 7, 102], [sx + s * 20 + 6, 58], [sx + s * 20 - 8, 56]]);
    fill(g, 215, SKIN);
    poly(g, [[sx + s * 20 - 7, 58], [sx + s * 20 + 6, 60], [sx + s * 30 + 5, 20], [sx + s * 30 - 7, 18]]);
    ellipse(g, 64 + s * 70, 14, 8, 9);
  }
}

function head(g: Ctx) {
  // Neck then face.
  fill(g, 150, SKIN);
  g.fillRect(55, 80, 18, 22);
  const grad = g.createRadialGradient(58, 52, 4, 64, 60, 30);
  grad.addColorStop(0, `rgb(240,${SKIN},0)`);
  grad.addColorStop(1, `rgb(140,${SKIN},0)`);
  g.fillStyle = grad;
  ellipse(g, 64, 60, 21, 26);
  // Ears.
  fill(g, 170, SKIN);
  ellipse(g, 43, 62, 4, 7);
  ellipse(g, 85, 62, 4, 7);
  // Eyes, nose shadow and mouth: darker skin, readable even at a distance.
  fill(g, 55, SKIN);
  ellipse(g, 56, 60, 3, 2.2);
  ellipse(g, 72, 60, 3, 2.2);
  fill(g, 120, SKIN);
  g.fillRect(62, 63, 4, 9);
  fill(g, 80, SKIN);
  g.fillRect(57, 76, 14, 2.5);
}

function shortHair(g: Ctx) {
  fill(g, 190, HAIR);
  g.beginPath();
  g.ellipse(64, 50, 22, 18, 0, Math.PI, 0);
  g.lineTo(86, 56);
  g.quadraticCurveTo(64, 44, 42, 56);
  g.fill();
}

function longHair(g: Ctx) {
  fill(g, 170, HAIR);
  g.beginPath();
  g.moveTo(40, 92);
  g.quadraticCurveTo(34, 40, 64, 32);
  g.quadraticCurveTo(94, 40, 88, 92);
  g.lineTo(80, 92);
  g.quadraticCurveTo(84, 60, 64, 46);
  g.quadraticCurveTo(44, 60, 48, 92);
  g.fill();
}

function cap(g: Ctx) {
  // Team cap: same colour as the shirt.
  fill(g, 215, SHIRT);
  g.beginPath();
  g.ellipse(64, 46, 23, 15, 0, Math.PI, 0);
  g.fill();
  fill(g, 140, SHIRT);
  g.fillRect(40, 44, 48, 6);
  ellipse(g, 64, 50, 20, 4);
}

function sunHat(g: Ctx) {
  fill(g, 225, OTHER);
  ellipse(g, 64, 42, 38, 7);
  fill(g, 200, OTHER);
  g.beginPath();
  g.ellipse(64, 40, 21, 14, 0, Math.PI, 0);
  g.fill();
  fill(g, 90, OTHER);
  g.fillRect(43, 37, 42, 4);
}

function sunglasses(g: Ctx) {
  // Drawn in the hair channel so they come out dark whatever the accessory colour.
  fill(g, 40, HAIR);
  g.fillRect(48, 56, 14, 8);
  g.fillRect(66, 56, 14, 8);
  g.fillRect(60, 58, 8, 2);
}

function scarf(g: Ctx) {
  fill(g, 200, OTHER);
  g.beginPath();
  g.ellipse(64, 100, 22, 7, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(66, 100, 10, 40);
}

function flag(g: Ctx) {
  // A flag on a pole in the right hand, in the shirt colour.
  fill(g, 160, OTHER);
  g.fillRect(118, 2, 3, 30);
  fill(g, 225, SHIRT);
  poly(g, [[94, 2], [119, 2], [119, 26], [94, 22]]);
}

function hood(g: Ctx) {
  sideShade(g, 36, 92, SHIRT, 110, 200);
  g.beginPath();
  g.moveTo(38, 100);
  g.quadraticCurveTo(30, 40, 64, 30);
  g.quadraticCurveTo(98, 40, 90, 100);
  g.lineTo(84, 100);
  g.quadraticCurveTo(88, 52, 64, 40);
  g.quadraticCurveTo(40, 52, 44, 100);
  g.fill();
}

const VARIANTS: ((g: Ctx, up: boolean) => void)[] = [
  (g) => shortHair(g),
  (g) => cap(g),
  (g) => longHair(g),
  () => {}, // shaved head
  (g) => sunHat(g),
  (g) => {
    shortHair(g);
    sunglasses(g);
  },
  (g, up) => {
    shortHair(g);
    if (up) flag(g);
    else scarf(g);
  },
  (g) => hood(g),
];

/** Draws the sheet once; every crowd shares it. */
let atlas: THREE.CanvasTexture | null = null;
export function crowdAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = CW * ATLAS_COLS;
  c.height = CH * ATLAS_ROWS;
  const g = c.getContext('2d')!;
  for (let row = 0; row < ATLAS_ROWS; row++) {
    for (let col = 0; col < ATLAS_COLS; col++) {
      g.save();
      g.translate(col * CW, row * CH);
      g.beginPath();
      g.rect(0, 0, CW, CH);
      g.clip();
      const up = row === 1;
      if (col === 2) longHair(g); // long hair falls behind the shoulders
      torso(g, col === 7);
      arms(g, up);
      head(g);
      VARIANTS[col](g, up);
      g.restore();
    }
  }
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.NoColorSpace; // data, not colour
  atlas.anisotropy = 4;
  return atlas;
}
