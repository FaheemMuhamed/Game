// The world being played, whichever map that is. Everything outside the
// world folder asks here, so it does not need to know which map is loaded.

import * as valley from './heightmap.js';
import { MAP } from './maps/index.js';

const isValley = MAP.id === 'valley';
export { MAP };
export const MAP_SIZE = valley.MAP_SIZE;
export const PLACES = isValley ? valley.PLACES : MAP.places;
export const TRAILS = isValley ? valley.TRAILS : MAP.trails;
export const riverZ = valley.riverZ;

export function makeTerrain() {
  return isValley ? valley.makeTerrain() : valley.makeTerrain({ size: MAP.size, heightFn: MAP.height, surfaceFn: MAP.surface });
}

// Distance from a point to the nearest trail or road.
export function distToTrail(x, z) {
  if (isValley) return valley.distToTrail(x, z);
  let best = Infinity;
  for (const t of TRAILS) for (let i = 0; i < t.length - 1; i += 2) { // roads are finely sampled, so every other point is plenty
    const d = Math.hypot(x - t[i][0], z - t[i][1]);
    if (d < best) best = d;
  }
  return best;
}

// The land of any map, for drawing previews in the map picker.
export function landOf(map) {
  return map.id === 'valley' ? { height: valley.worldHeight, surface: valley.worldSurface } : { height: map.height, surface: map.surface };
}
