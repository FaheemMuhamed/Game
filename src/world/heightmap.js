// The shape of the world: how high the ground is at every point, and what
// it is made of. Everything else (the voxel mesh, the physics collider,
// where trees go) is built from the grid this file produces.

import { clamp, lerp, smoothstep } from '../physics/vec.js';
import { GRASS, DIRT, ROCK, MUD, SAND, RIVERBED, WATER_LEVEL } from './surfaces.js';

export const MAP_SIZE = 360; // metres along each side
export const CELL = 0.5; // size of one voxel column

// ---- Places on the map (x, z in metres, map centre is 0,0) ----
export const PLACES = {
  spawn: { x: -12, z: -10, yaw: -Math.PI / 2 },
  village: { x: 5, z: -8, r: 20 },
  ford: { x: -30 },
  bridge: { x: 55 },
  mud: { x: -65, z: -55, r: 15 },
  rocks: { x: 70, z: -65, r: 22 },
  hill: { x: -75, z: 75, height: 20, sigma: 20 },
  // the outer lands
  mountain: { x: 118, z: -118, height: 34, sigma: 26 },
  dunes: { x: 115, z: 118, r: 52 },
  swamp: { x: -118, z: -115, r: 46 },
  forest: { x: -125, z: 125, r: 50 },
  park: { x: -18, z: -64, r: 21, level: 4 }, // the proving ground: a levelled yard full of built obstacles
};

// The mountain road: a spiral that winds up to the summit.
const SPIRAL = [];
for (let i = 0; i <= 30; i++) {
  const t = i / 30, ang = 2.2 + t * 1.75 * Math.PI * 2, r = 42 * (1 - t) + 3 * t;
  SPIRAL.push([PLACES.mountain.x + Math.cos(ang) * r, PLACES.mountain.z + Math.sin(ang) * r]);
}

// Dirt trails joining the places together, as lists of [x, z] points.
export const TRAILS = [
  [[-12, -10], [-30, -8], [-30, 0.3], [-32, 12], [-50, 40], [-75, 75]],
  [[-12, -10], [-35, -30], [-65, -55]],
  [[5, -8], [35, -30], [70, -65]],
  [[35, -30], [55, 20], [55, 34], [55, 53], [55, 70], [20, 85], [-40, 80], [-75, 75]],
  [[70, -65], [84, -76], SPIRAL[0], ...SPIRAL.slice(1)], // rock field up the mountain
  [[55, 70], [85, 95], [115, 118], [140, 105]], // out to the dunes
  [[-65, -55], [-90, -85], [-118, -115], [-140, -120]], // down into the swamp
  [[-75, 75], [-105, 105], [-130, 130]], // into the deep forest
  [[-35, -30], [-30, -46], [-22, -58]], // spur to the proving ground
];
export const MOUNTAIN_ROAD = SPIRAL;

// Centre line of the river: for a given x, the z the river flows through.
export const riverZ = (x) => 18 + 26 * Math.sin(x / 40);
const RIVER_HALF_WIDTH = 7;

// ---- Seeded noise (same world every time) ----
function hash(ix, iz, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}
// Several layers of noise added together: big hills plus smaller bumps. Returns 0..1.
function fbm(x, z, seed, octaves) {
  let sum = 0, amp = 0.5, total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x, z, seed + i * 17) * amp;
    total += amp;
    x *= 2.03; z *= 2.03; amp *= 0.5;
  }
  return sum / total;
}

function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
export function distToTrail(x, z) {
  let best = Infinity;
  for (const trail of TRAILS) {
    for (let i = 0; i < trail.length - 1; i++) {
      const d = distToSegment(x, z, trail[i][0], trail[i][1], trail[i + 1][0], trail[i + 1][1]);
      if (d < best) best = d;
    }
  }
  return best;
}

// Nearest point on any trail: how far away it is, and where.
function nearestOnTrail(x, z) {
  let best = Infinity, bx = 0, bz = 0;
  for (const trail of TRAILS) {
    for (let i = 0; i < trail.length - 1; i++) {
      const ax = trail[i][0], az = trail[i][1], dx = trail[i + 1][0] - ax, dz = trail[i + 1][1] - az;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
      if (d < best) { best = d; bx = px; bz = pz; }
    }
  }
  return { d: best, x: bx, z: bz };
}

// 1 at the centre of a round area, fading to 0 at its edge.
const blob = (x, z, p, inner, outer) => 1 - smoothstep(inner, outer, Math.hypot(x - p.x, z - p.z));

// ---- The real world height function ----
// The natural lie of the land, before trails are cut into it.
function landHeight(x, z) {
  // Rolling hills.
  let h = 1.5 + 9 * Math.pow(fbm(x / 60, z / 60, 7, 4), 1.4);

  // The mountain in the south-east.
  const M = PLACES.mountain;
  h += M.height * Math.exp(-((x - M.x) ** 2 + (z - M.z) ** 2) / (2 * M.sigma * M.sigma));

  // Dunes in the north-east: long rippling ridges of sand.
  const duneW = blob(x, z, PLACES.dunes, PLACES.dunes.r * 0.6, PLACES.dunes.r);
  if (duneW > 0) {
    const ridge = Math.abs(Math.sin((x * 0.6 + z * 0.8) / 9 + valueNoise(x / 25, z / 25, 61) * 3));
    h = lerp(h, 2.2 + 3.4 * Math.pow(ridge, 1.5), duneW);
  }

  // Swamp in the south-west: flat, barely above the water, dotted with pools.
  const swampW = blob(x, z, PLACES.swamp, PLACES.swamp.r * 0.6, PLACES.swamp.r);
  if (swampW > 0) {
    const pool = smoothstep(0.52, 0.66, valueNoise(x / 8, z / 8, 71));
    h = lerp(h, 0.22 - 0.55 * pool, swampW);
  }

  // The big hill climb.
  const H = PLACES.hill;
  h += H.height * Math.exp(-((x - H.x) ** 2 + (z - H.z) ** 2) / (2 * H.sigma * H.sigma));

  // Rock crawl: sharp lumpy ground.
  const rockW = blob(x, z, PLACES.rocks, PLACES.rocks.r * 0.6, PLACES.rocks.r);
  if (rockW > 0) {
    const lump = Math.abs(valueNoise(x * 0.3, z * 0.3, 91) - 0.5) * 2;
    h += rockW * (1.0 * lump + 0.3 * valueNoise(x * 0.9, z * 0.9, 92));
  }

  // Mud pit: a shallow flat bowl.
  const mudW = blob(x, z, PLACES.mud, PLACES.mud.r * 0.7, PLACES.mud.r * 2.0);
  h = lerp(h, 2.2, mudW);

  // Village: flattened ground.
  const villageW = blob(x, z, PLACES.village, PLACES.village.r, PLACES.village.r + 12);
  h = lerp(h, 1.4, villageW);

  // Proving ground: dead level.
  h = lerp(h, PLACES.park.level, blob(x, z, PLACES.park, PLACES.park.r, PLACES.park.r + 12));
  return h;
}

export function worldHeight(x, z) {
  let h = landHeight(x, z);

  // Trails are cut level into the hillside: across the trail the ground is flat,
  // at the height of the land under the trail's centre line. Further out it blends back.
  const t = nearestOnTrail(x, z);
  if (t.d < 6.5) h = lerp(landHeight(t.x, t.z), h, smoothstep(2.6, 6.5, t.d));

  // River valley: land eases down to the water, then the river bed itself.
  const d = Math.abs(z - riverZ(x));
  h = lerp(0.45, h, smoothstep(RIVER_HALF_WIDTH, 38, d));
  if (d < RIVER_HALF_WIDTH) {
    const fordW = 1 - smoothstep(5, 10, Math.abs(x - PLACES.ford.x));
    const depth = lerp(1.7, 0.35, fordW); // the ford is shallow enough to drive through
    const profile = 1 - (d / RIVER_HALF_WIDTH) ** 2;
    h = 0.45 - (0.45 + depth) * profile;
  }

  // A raised rim around the edge so you cannot drive off the map.
  const edge = Math.max(Math.abs(x), Math.abs(z));
  h += 16 * smoothstep(MAP_SIZE / 2 - 20, MAP_SIZE / 2, edge) ** 2;

  return h;
}

// What the ground is made of at a point. `slope` is rise over run (1 = 45 degrees).
export function worldSurface(x, z, h, slope) {
  if (h < WATER_LEVEL + 0.12) return RIVERBED;
  const d = Math.abs(z - riverZ(x));
  if (d < 10.5) return SAND;
  if (blob(x, z, PLACES.mud, PLACES.mud.r * 0.7, PLACES.mud.r * 2.0) > 0.9) return MUD; // only the flat floor is mud, not the banks
  if (blob(x, z, PLACES.swamp, PLACES.swamp.r * 0.6, PLACES.swamp.r) > 0.5) return MUD;
  if (blob(x, z, PLACES.dunes, PLACES.dunes.r * 0.6, PLACES.dunes.r) > 0.35) return SAND;
  if (blob(x, z, PLACES.rocks, PLACES.rocks.r * 0.6, PLACES.rocks.r) > 0.3) return ROCK;
  if (slope > 0.75) return ROCK;
  const trail = distToTrail(x, z);
  if (trail < 2.4 + valueNoise(x * 0.4, z * 0.4, 33) * 1.2) return DIRT;
  if (h > 15 && Math.hypot(x - PLACES.mountain.x, z - PLACES.mountain.z) < 60) return ROCK; // bare mountain top
  if (blob(x, z, PLACES.village, PLACES.village.r, PLACES.village.r + 12) > 0.55) return DIRT;
  if (blob(x, z, PLACES.park, PLACES.park.r, PLACES.park.r + 12) > 0.6) return DIRT;
  // Boggy patches in the lowlands.
  if (h < 3.2 && valueNoise(x / 9, z / 9, 55) > 0.74) return MUD;
  if (valueNoise(x / 6, z / 6, 44) > 0.78) return DIRT;
  return GRASS;
}

// Build the grid that the renderer and the physics both read.
//   heights  (n+1) x (n+1) corner heights, index = iz * (n+1) + ix
//   surfaces n x n surface ids, one per voxel column, index = iz * n + ix
export function makeTerrain({ size = MAP_SIZE, cell = CELL, heightFn = worldHeight, surfaceFn = worldSurface } = {}) {
  const n = Math.round(size / cell);
  const half = size / 2;
  const heights = new Float32Array((n + 1) * (n + 1));
  for (let iz = 0; iz <= n; iz++) {
    for (let ix = 0; ix <= n; ix++) {
      heights[iz * (n + 1) + ix] = heightFn(ix * cell - half, iz * cell - half);
    }
  }
  const surfaces = new Uint8Array(n * n);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const i = iz * (n + 1) + ix;
      const h00 = heights[i], h10 = heights[i + 1], h01 = heights[i + n + 1], h11 = heights[i + n + 2];
      const h = (h00 + h10 + h01 + h11) / 4;
      const sx = (h10 + h11 - h00 - h01) / (2 * cell);
      const sz = (h01 + h11 - h00 - h10) / (2 * cell);
      surfaces[iz * n + ix] = surfaceFn((ix + 0.5) * cell - half, (iz + 0.5) * cell - half, h, Math.hypot(sx, sz));
    }
  }

  // Ground height at any point, blending between the four nearest corners.
  function heightAt(x, z) {
    const gx = clamp((x + half) / cell, 0, n - 1e-6), gz = clamp((z + half) / cell, 0, n - 1e-6);
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const fx = gx - ix, fz = gz - iz;
    const i = iz * (n + 1) + ix;
    return lerp(lerp(heights[i], heights[i + 1], fx), lerp(heights[i + n + 1], heights[i + n + 2], fx), fz);
  }
  function surfaceAt(x, z) {
    const ix = clamp(Math.floor((x + half) / cell), 0, n - 1);
    const iz = clamp(Math.floor((z + half) / cell), 0, n - 1);
    return surfaces[iz * n + ix];
  }

  // Ruts: how deep the wheels have dug into each column of soft ground.
  const ruts = new Float32Array(n * n);
  const dirty = []; // columns whose rut changed since the renderer last looked
  const colAt = (x, z) => clamp(Math.floor((z + half) / cell), 0, n - 1) * n + clamp(Math.floor((x + half) / cell), 0, n - 1);
  const rutAt = (x, z) => ruts[colAt(x, z)];
  function digRut(x, z, amount, max) {
    const i = colAt(x, z);
    if (ruts[i] >= max) return;
    ruts[i] = Math.min(max, ruts[i] + amount);
    dirty.push(i);
  }

  return { size, cell, n, half, heights, surfaces, heightAt, surfaceAt, ruts, dirty, rutAt, digRut };
}
