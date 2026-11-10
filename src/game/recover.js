// "Reset vehicle": instead of dropping you back in the hole you are stuck in,
// look around for the nearest firm, level, dry spot and put you there.

import { distToTrail } from '../world/world.js';
import { env } from '../world/surfaces.js';

export function findSafeSpot(G, from) {
  const { terrain, phys } = G;
  const ray = new phys.RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  const half = terrain.half - 8;
  let best = null, bestScore = Infinity;

  for (let r = 0; r <= 45; r += 3) {
    const count = r === 0 ? 1 : 12;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r;
      const x = from.x + Math.cos(a) * r, z = from.z + Math.sin(a) * r;
      if (Math.abs(x) > half || Math.abs(z) > half) continue;
      const h = terrain.heightAt(x, z);
      if (h < env.waterLevel + 0.35) continue; // in or right beside the water
      const slope = Math.hypot(terrain.heightAt(x + 1.5, z) - terrain.heightAt(x - 1.5, z), terrain.heightAt(x, z + 1.5) - terrain.heightAt(x, z - 1.5)) / 3;
      if (slope > 0.3) continue; // too steep to stand on
      // Is there a tree, hut or rock here? Look straight down and see what we hit first.
      ray.origin = { x, y: h + 9, z };
      const hit = phys.world.castRay(ray, 12, true, undefined, undefined, undefined, G.active.body);
      if (hit && hit.collider.handle !== phys.terrainHandle) continue;
      const score = r + 0.25 * distToTrail(x, z) + slope * 20;
      if (score < bestScore) { bestScore = score; best = { x, z }; }
    }
    if (best && r > bestScore) break; // nothing further out can beat it
  }
  return best ?? { x: from.x, z: from.z };
}

export function recover(G) {
  const v = G.active;
  const p = v.body.translation();
  const spot = findSafeSpot(G, p);
  v.place(spot.x, spot.z, v.yaw(), 0.4);
  return Math.hypot(spot.x - p.x, spot.z - p.z);
}
