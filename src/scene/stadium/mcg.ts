import * as THREE from 'three';
import { AUSTRALIA, PAKISTAN } from '../../data/teams';
import { ropeRadius } from '../../game/groundState';
import { buildBigScreen, buildBoards, buildFloodlight, buildSightscreens, buildStand, buildSurroundings, CrowdBuilder } from './common';

const DEG = Math.PI / 180;

/**
 * The MCG: a vast, fully enclosed three-tier bowl for 100,000 people under a
 * continuous roof, with six towering light poles and giant screens at both ends.
 */
export function buildMCG(lampMat: THREE.Material) {
  const root = new THREE.Group();
  const crowd = new CrowdBuilder();
  const fans = [AUSTRALIA.shirt, AUSTRALIA.shirt, PAKISTAN.shirt, 0x0e5a3a];

  let maxRope = 0;
  for (let a = 0; a < 360; a += 2) maxRope = Math.max(maxRope, ropeRadius(a * DEG));

  // Sections round the bowl: Members Reserve (behind the batter) in deep red, the Great Southern Stand in blue.
  const sections: [number, number, number][] = [
    [-130, -50, 0x7a2e2e], // Members Reserve
    [-50, 40, 0x2c4a6e], // Olympic Stand side
    [40, 140, 0x1d3c6e], // Great Southern Stand
    [140, 230, 0x2c4a6e], // Ponsford Stand side
  ];
  const tiers = [
    { r0: maxRope + 7, baseH: 1.6, rows: 22, rowH: 0.42 },
    { r0: maxRope + 7 + 22 * 0.85 + 2.5, baseH: 1.6 + 22 * 0.42 + 5, rows: 18, rowH: 0.47 },
    { r0: maxRope + 7 + 22 * 0.85 + 2.5 + 18 * 0.85 + 2.5, baseH: 1.6 + 22 * 0.42 + 5 + 18 * 0.47 + 6, rows: 16, rowH: 0.55 },
  ];
  const top = tiers[2];
  const roofH = top.baseH + top.rows * top.rowH + 10;
  tiers.forEach((t, i) => {
    for (const [from, to, seat] of sections) {
      root.add(
        buildStand(
          {
            from,
            to,
            r0: t.r0,
            baseH: t.baseH,
            rows: t.rows,
            rowH: t.rowH,
            seat,
            fans,
            fill: 0.8,
            backWall: i === 2 ? 4 : 2.5,
            roof: i === 2 ? { kind: 'flat', height: roofH, overhang: -t.r0 + tiers[1].r0 + 4, color: 0xdfe3e8 } : undefined,
          },
          crowd,
        ),
      );
    }
  });

  // Six light towers rising high above the roof.
  for (let k = 0; k < 6; k++) {
    const a = (k * 60 + 30) * DEG;
    const r = top.r0 + top.rows * 0.85 + 8;
    root.add(buildFloodlight(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r), roofH + 32, lampMat));
  }

  // Giant screens high in both ends.
  const screens = [] as ReturnType<typeof buildBigScreen>[];
  for (const a of [70, 250]) {
    const s = buildBigScreen(32, 13);
    const r = tiers[2].r0 + 2;
    s.group.position.set(Math.cos(a * DEG) * r, tiers[2].baseH + 4, Math.sin(a * DEG) * r);
    s.group.lookAt(0, 10, 0);
    root.add(s.group);
    screens.push(s);
  }

  root.add(
    buildBoards([
      { text: "AHMAD'S CRICKET ARENA", bg: '#0b1d3a', fg: '#ffd23f' },
      { text: 'MCG · MELBOURNE', bg: '#1d3c6e', fg: '#ffffff' },
      { text: 'PAKISTAN v AUSTRALIA', bg: '#0f7a3d', fg: '#ffffff' },
      { text: 'HANDS-ON CRICKET', bg: '#111111', fg: '#3fd0ff' },
    ]),
  );
  root.add(buildSightscreens((end) => ropeRadius((end > 0 ? 90 : 270) * DEG) + 6.3, 26, 10));
  // Melbourne CBD towers beyond the Yarra Park trees.
  root.add(buildSurroundings(top.r0 + top.rows * 0.85 + 30, { trees: 220, buildings: 18, buildingColor: 0x6d7a88 }));
  const cbd = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0x5f7488, roughness: 0.25, metalness: 0.6 });
  for (let i = 0; i < 16; i++) {
    const h = 60 + Math.random() * 140;
    const b = new THREE.Mesh(new THREE.BoxGeometry(18 + Math.random() * 14, h, 18 + Math.random() * 14), glass);
    const a = (120 + Math.random() * 40) * DEG;
    const r = 420 + Math.random() * 160;
    b.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    cbd.add(b);
  }
  root.add(cbd);
  root.add(crowd.build());
  return { group: root, screens };
}
