import * as THREE from 'three';
import { AUSTRALIA, PAKISTAN } from '../../data/teams';
import { ropeRadius } from '../../game/groundState';
import { buildBigScreen, buildBoards, buildFloodlight, buildSightscreens, buildStand, buildSurroundings, CrowdBuilder, StandSpec } from './common';

const DEG = Math.PI / 180;

/** Front row distance for a stand covering `from`–`to` degrees: just behind the boards. */
function frontRow(from: number, to: number, gap = 6.5) {
  let r = 0;
  for (let a = from; a <= to; a += 2) r = Math.max(r, ropeRadius(a * DEG));
  return r + gap;
}

/** Facade texture: red brick with cream arched windows, like the Lord's Pavilion. */
function pavilionFacade() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#9a4b34';
  g.fillRect(0, 0, 1024, 256);
  // Brick texture.
  for (let y = 0; y < 256; y += 6) {
    for (let x = (y / 6) % 2 ? 0 : 6; x < 1024; x += 12) {
      g.fillStyle = `rgba(${120 + Math.random() * 40},${50 + Math.random() * 20},${35},0.35)`;
      g.fillRect(x, y, 11, 5);
    }
  }
  // Three floors of tall arched windows with cream stone surrounds.
  for (let floor = 0; floor < 3; floor++) {
    const y0 = 30 + floor * 78;
    for (let x = 30; x < 1000; x += 58) {
      g.fillStyle = '#efe4c8';
      g.fillRect(x - 4, y0 - 4, 34, 56);
      g.beginPath();
      g.arc(x + 13, y0 - 4, 17, Math.PI, 0);
      g.fill();
      g.fillStyle = '#2b3240';
      g.fillRect(x, y0, 26, 48);
      g.beginPath();
      g.arc(x + 13, y0, 13, Math.PI, 0);
      g.fill();
      g.fillStyle = 'rgba(160,190,220,0.35)';
      g.fillRect(x + 2, y0 + 2, 10, 44);
    }
    // Stone string course.
    g.fillStyle = '#e8dcc0';
    g.fillRect(0, y0 + 56, 1024, 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function buildPavilion() {
  const g = new THREE.Group();
  const facade = pavilionFacade();
  const brick = new THREE.MeshStandardMaterial({ color: 0x9a4b34, roughness: 0.85 });
  const front = new THREE.MeshStandardMaterial({ map: facade, roughness: 0.8 });
  const slate = new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.7 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xefe6cf, roughness: 0.7 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.5 });

  // Main block: face +z (towards the field).
  const main = new THREE.Mesh(new THREE.BoxGeometry(62, 17, 16), [brick, brick, slate, brick, front, brick]);
  main.position.y = 8.5;
  main.castShadow = true;
  g.add(main);
  // Pitched slate roof.
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 9, 5, 4, 1), slate);
  roof.scale.set(3.6, 1, 1);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 19.5;
  g.add(roof);
  // Two corner towers with pyramid roofs.
  for (const x of [-34, 34]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(9, 24, 12), [brick, brick, slate, brick, front, brick]);
    tower.position.set(x, 12, 1);
    tower.castShadow = true;
    g.add(tower);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(7.2, 8, 4), slate);
    cap.position.set(x, 28, 1);
    cap.rotation.y = Math.PI / 4;
    g.add(cap);
    const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 6), cream);
    finial.position.set(x, 33, 1);
    g.add(finial);
  }
  // Players' balconies and the members' seating in front of the Long Room.
  for (const [y, depth] of [
    [6, 3],
    [11.5, 2.4],
  ]) {
    const bal = new THREE.Mesh(new THREE.BoxGeometry(56, 0.4, depth), cream);
    bal.position.set(0, y, 8 + depth / 2);
    g.add(bal);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(56, 1, 0.08), white);
    rail.position.set(0, y + 0.7, 8 + depth);
    g.add(rail);
  }
  // Central clock gable.
  const gable = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 1), cream);
  gable.position.set(0, 19, 8.2);
  g.add(gable);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
  clock.position.set(0, 19.5, 8.75);
  g.add(clock);
  return g;
}

/** The Media Centre: a white semi-monocoque pod raised high above the Nursery End. */
function buildMediaCentre() {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.22, metalness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2635, roughness: 0.1, metalness: 0.8 });
  const pod = new THREE.Mesh(new THREE.CapsuleGeometry(6.5, 28, 12, 32), shell);
  pod.rotation.z = Math.PI / 2;
  pod.scale.set(0.8, 1, 1.15);
  pod.castShadow = true;
  g.add(pod);
  // Sloping glazed front facing the pitch.
  const window = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 6.6, 26, 32, 1, true, -0.55, 1.1), glass);
  window.rotation.z = Math.PI / 2;
  window.rotation.x = Math.PI;
  window.scale.set(0.82, 1, 1.17);
  g.add(window);
  // Two concrete legs.
  for (const x of [-9, 9]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 20, 12), new THREE.MeshStandardMaterial({ color: 0xbfc3c8, roughness: 0.8 }));
    leg.position.set(x, -14, 2);
    g.add(leg);
  }
  return g;
}

/** Father Time weather vane: the old man removing the bails, in silhouette. */
function buildFatherTime() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#111';
  g.beginPath();
  g.ellipse(64, 40, 10, 12, 0, 0, Math.PI * 2); // head
  g.fill();
  g.fillRect(52, 50, 22, 40); // body
  g.fillRect(40, 60, 14, 6); // arm reaching to bails
  g.fillRect(30, 80, 6, 30); // stumps
  g.fillRect(40, 80, 6, 30);
  g.lineWidth = 4;
  g.strokeStyle = '#111';
  g.beginPath(); // scythe
  g.moveTo(80, 30);
  g.lineTo(80, 110);
  g.moveTo(80, 30);
  g.quadraticCurveTo(100, 20, 110, 40);
  g.stroke();
  g.fillRect(20, 110, 90, 6); // base
  const tex = new THREE.CanvasTexture(c);
  const vane = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshStandardMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 }));
  const grp = new THREE.Group();
  vane.position.y = 3.5;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.5, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  pole.position.y = 1.25;
  grp.add(vane, pole);
  return grp;
}

export function buildLords(lampMat: THREE.Material) {
  const root = new THREE.Group();
  const crowd = new CrowdBuilder();
  const fans = [PAKISTAN.shirt, AUSTRALIA.shirt, 0xffffff, 0xf2f2f2];

  const two = (from: number, to: number, seat: number, roof: StandSpec['roof'] | undefined, rows = [14, 12]) => {
    const r0 = frontRow(from, to);
    root.add(buildStand({ from, to, r0, baseH: 1.4, rows: rows[0], seat, fans }, crowd));
    const r1 = r0 + rows[0] * 0.85 + 1.5;
    const h1 = 1.4 + rows[0] * 0.42 + 3.2;
    root.add(buildStand({ from, to, r0: r1, baseH: h1, rows: rows[1], seat, fans, roof }, crowd));
  };

  // Clockwise from the Mound Stand (+x side, the low side of the slope).
  two(-40, 28, 0xe8e8e4, { kind: 'tent', height: 19 }, [13, 9]); // Mound Stand
  two(-68, -42, 0x2f3a4a, { kind: 'flat', height: 18 }, [13, 8]); // Tavern Stand
  two(30, 78, 0x2f3a4a, { kind: 'flat', height: 19 }); // Edrich Stand
  root.add(buildStand({ from: 80, to: 100, r0: frontRow(80, 100), baseH: 1.4, rows: 12, seat: 0x2f3a4a, fans }, crowd)); // under the Media Centre
  two(102, 150, 0x2f3a4a, { kind: 'flat', height: 19 }); // Compton Stand
  two(155, 208, 0xf0f0ec, { kind: 'flat', height: 24, color: 0xf4f4f4 }, [15, 14]); // Grand Stand
  two(212, 246, 0x2f3a4a, { kind: 'flat', height: 18 }, [12, 8]); // Warner Stand
  // Members' terrace in front of the Pavilion.
  root.add(buildStand({ from: 250, to: 290, r0: frontRow(250, 290, 5), baseH: 0.8, rows: 7, seat: 0xf3f0e6, fans: [0xf0e6c8, 0xd94848, 0xf2c94c], fill: 0.9 }, crowd));

  const pav = buildPavilion();
  const pr = frontRow(260, 280, 5) + 7 * 0.85 + 9;
  pav.position.set(0, 0, -pr);
  root.add(pav);

  const media = buildMediaCentre();
  media.position.set(0, 24, frontRow(80, 100) + 12 * 0.85 + 7);
  root.add(media);

  const ft = buildFatherTime();
  ft.position.set(-(frontRow(170, 190) + 32), 27, 0);
  ft.rotation.y = Math.PI / 2;
  root.add(ft);

  // Six slim telescopic floodlight masts.
  for (const a of [12, 62, 118, 168, 214, 328]) {
    const r = frontRow(a - 3, a + 3) + 30;
    root.add(buildFloodlight(new THREE.Vector2(Math.cos(a * DEG) * r, Math.sin(a * DEG) * r), 46, lampMat, true));
  }

  // Two big screens in the corners.
  const screens = [] as ReturnType<typeof buildBigScreen>[];
  for (const a of [29, 209]) {
    const s = buildBigScreen(15, 8.5);
    const r = frontRow(a - 1, a + 1) + 6;
    s.group.position.set(Math.cos(a * DEG) * r, 13, Math.sin(a * DEG) * r);
    s.group.lookAt(0, 6, 0);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 13, 8), new THREE.MeshStandardMaterial({ color: 0x555a60 }));
    post.position.set(Math.cos(a * DEG) * (r + 1), 6.5, Math.sin(a * DEG) * (r + 1));
    root.add(s.group, post);
    screens.push(s);
  }

  root.add(
    buildBoards([
      { text: "AHMAD'S CRICKET ARENA", bg: '#0b1d3a', fg: '#ffd23f' },
      { text: "LORD'S · HOME OF CRICKET", bg: '#1d3b2a', fg: '#ffffff' },
      { text: 'PAKISTAN v AUSTRALIA', bg: '#0f7a3d', fg: '#ffffff' },
      { text: '2-OVER SHOOTOUT', bg: '#8a1730', fg: '#ffffff' },
    ]),
  );
  root.add(buildSightscreens((end) => ropeRadius((end > 0 ? 90 : 270) * DEG) + 6.3, 22, 8));
  root.add(buildSurroundings(150, { trees: 160, buildings: 30, buildingColor: 0x8a6d5a }));
  root.add(crowd.build());
  return { group: root, screens };
}
