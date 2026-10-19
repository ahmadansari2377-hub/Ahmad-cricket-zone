import type { Vector3 } from 'three';
import { GROUNDS, GroundInfo } from '../data/grounds';
import { FIELD_CENTER_Z } from './constants';

/**
 * The ground currently being played on. Physics, fielding and scenery read
 * the boundary shape and the slope from here.
 */
export const ground = {
  info: GROUNDS.lords as GroundInfo,
};

export function setGround(info: GroundInfo) {
  ground.info = info;
}

/** Height of the playing surface at x (the slope runs across the field). */
export function groundY(x: number) {
  return x * ground.info.slope;
}

/** 1 at the rope, <1 inside, >1 beyond (elliptical boundary around the middle of the pitch). */
export function boundaryRatio(p: { x: number; z: number }) {
  const { rx, rz } = ground.info.boundary;
  const dz = p.z - FIELD_CENTER_Z;
  return Math.sqrt((p.x / rx) ** 2 + (dz / rz) ** 2);
}

export function beyondRope(p: Vector3 | { x: number; z: number }) {
  return boundaryRatio(p) >= 1;
}

/** Boundary radius in the direction of angle `a` (radians, 0 = +x) from the middle of the pitch. */
export function ropeRadius(a: number) {
  const { rx, rz } = ground.info.boundary;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return 1 / Math.sqrt((c / rx) ** 2 + (s / rz) ** 2);
}
