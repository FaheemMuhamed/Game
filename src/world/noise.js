// Shared land-shaping tools for the maps: seeded noise, and small helpers.

import { clamp, lerp, smoothstep } from '../physics/vec.js';
export { clamp, lerp, smoothstep };

function hash(ix, iz, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// Smooth random bumps, 0..1. The same (x, z, seed) always gives the same answer.
export function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}
// Several layers of noise added together: big shapes plus smaller detail. 0..1.
export function fbm(x, z, seed, octaves = 4) {
  let sum = 0, amp = 0.5, total = 0;
  for (let i = 0; i < octaves; i++) { sum += valueNoise(x, z, seed + i * 17) * amp; total += amp; x *= 2.03; z *= 2.03; amp *= 0.5; }
  return sum / total;
}
// 1 at the centre of a round area, fading to 0 between `inner` and `outer` metres out.
export const blob = (x, z, p, inner, outer) => 1 - smoothstep(inner, outer, Math.hypot(x - p.x, z - p.z));
// A raised rim round the edge of a square map, so you cannot drive off it.
export const rim = (x, z, size, height = 16) => height * smoothstep(size / 2 - 20, size / 2, Math.max(Math.abs(x), Math.abs(z))) ** 2;
// Small seeded random number generator.
export function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
