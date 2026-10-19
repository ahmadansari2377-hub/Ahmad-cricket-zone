import * as THREE from 'three';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n * 0.7;
  }
  ctx.putImageData(img, 0, 0);
}

const photoLoader = new THREE.TextureLoader();

/**
 * A photo-scanned surface map from public/textures (Poly Haven, CC0), tiled
 * `repeat` times. Colour maps are sRGB; normal, roughness and AO maps are data.
 */
export function photoTexture(file: string, repeatX: number, repeatY = repeatX, srgb = false) {
  const t = photoLoader.load(`${import.meta.env.BASE_URL}textures/${file}`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Loads a photo as an image (for painting into a canvas texture). */
export function photoImage(file: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `${import.meta.env.BASE_URL}textures/${file}`;
  });
}

function finish(c: HTMLCanvasElement, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Whole-outfield texture with mowing stripes. Covers a square `size` metres across. */
export function fieldTexture(size: number) {
  const N = 2048;
  const [c, ctx] = canvas(N, N);
  ctx.fillStyle = '#3f7a2a';
  ctx.fillRect(0, 0, N, N);
  const stripe = 6.5; // metres per mowing stripe
  const px = (stripe / size) * N;
  for (let i = 0; i * px < N; i++) {
    ctx.fillStyle = i % 2 ? '#467f2e' : '#3a7027';
    ctx.fillRect(i * px, 0, px, N);
  }
  // Subtle cross-cut checkerboard, as on international grounds.
  ctx.globalAlpha = 0.18;
  for (let j = 0; j * px < N; j++) {
    if (j % 2) continue;
    ctx.fillStyle = '#2f5f1f';
    ctx.fillRect(0, j * px, N, px);
  }
  ctx.globalAlpha = 1;
  // Patchy wear and colour variation.
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * N;
    const y = Math.random() * N;
    const r = 8 + Math.random() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tone = Math.random() < 0.5 ? '70,110,40' : '35,80,25';
    g.addColorStop(0, `rgba(${tone},0.14)`);
    g.addColorStop(1, `rgba(${tone},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  noise(ctx, N, N, 14);
  return finish(c);
}
export function pitchTexture() {
  const W = 256;
  const H = 2048;
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#a99a6a');
  g.addColorStop(0.12, '#c4b07f');
  g.addColorStop(0.5, '#cdb98a');
  g.addColorStop(0.88, '#c4b07f');
  g.addColorStop(1, '#a99a6a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Faint green tinge of live grass.
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = `rgba(110,130,60,${Math.random() * 0.12})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  // Cracks come from the scanned clay surface (see ground.ts), not drawn lines.
  // Bowlers' footmarks near each end.
  for (const yEnd of [H * 0.1, H * 0.9]) {
    for (let i = 0; i < 40; i++) {
      const x = W * (0.25 + Math.random() * 0.5);
      const y = yEnd + (Math.random() - 0.5) * H * 0.07;
      ctx.fillStyle = `rgba(120,95,60,${0.15 + Math.random() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 6 + Math.random() * 8, 10 + Math.random() * 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  noise(ctx, W, H, 22);
  return finish(c);
}

/** LED advertising boards around the boundary. */
export function boardTexture(lines: { text: string; bg: string; fg: string }[]) {
  const W = 2048;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  const seg = W / lines.length;
  lines.forEach((l, i) => {
    ctx.fillStyle = l.bg;
    ctx.fillRect(i * seg, 0, seg, H);
    ctx.fillStyle = l.fg;
    ctx.font = 'bold 38px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(l.text, i * seg + seg / 2, H / 2 + 2);
  });
  return finish(c, true, true);
}
