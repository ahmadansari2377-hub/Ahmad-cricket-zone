import * as THREE from 'three';
import type { GroundId, GroundInfo, TimeOfDay } from '../../data/grounds';
import { FIELD_CENTER_Z } from '../../game/constants';
import { crowdUniforms } from './common';
import { buildLords } from './lords';
import { buildMCG } from './mcg';

type Built = { group: THREE.Group; screens: { draw: (title: string, main: string, sub: string) => void }[] };

/** Builds and switches between the stadiums; drives crowd animation, floodlights and big screens. */
export function createStadiums(scene: THREE.Scene) {
  const holder = new THREE.Group();
  holder.position.z = FIELD_CENTER_Z;
  scene.add(holder);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 0.4, side: THREE.DoubleSide });
  const cache = new Map<GroundId, Built>();
  let current: Built | null = null;

  return {
    setGround(info: GroundInfo, time: TimeOfDay) {
      if (current) holder.remove(current.group);
      let b = cache.get(info.id);
      if (!b) {
        b = info.id === 'lords' ? buildLords(lampMat) : buildMCG(lampMat);
        cache.set(info.id, b);
      }
      current = b;
      holder.add(b.group);
      // Stands sit on the same tilted surface as the field.
      holder.rotation.z = Math.atan(info.slope);
      lampMat.emissiveIntensity = time === 'night' ? 7 : 0.35;
    },
    setCheer(v: number) {
      crowdUniforms.uCheer.value = v;
    },
    update(time: number) {
      crowdUniforms.uTime.value = time;
    },
    /** Shows the score on the big screens. */
    screen(title: string, main: string, sub: string) {
      current?.screens.forEach((s) => s.draw(title, main, sub));
    },
  };
}

export type Stadiums = ReturnType<typeof createStadiums>;
