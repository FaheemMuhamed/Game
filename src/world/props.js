// Everything standing on the terrain: trees, boulders, the village, docks,
// the log bridge, lanterns, crates. This file only produces plain data:
//   boxes      voxel boxes to draw            { x, y, z, sx, sy, sz, color, glow }
//   colliders  solid boxes for the physics    { x, y, z, hx, hy, hz }
//   dynamics   loose boxes you can push       { x, y, z, sx, sy, sz, color }
//   lanterns   positions of warm lights       { x, y, z }
// The renderer and the physics world each read what they need from it.

import { GRASS, SAND, ROCK, WATER_LEVEL } from './surfaces.js';
import { PLACES, riverZ, distToTrail, TRAILS, MOUNTAIN_ROAD } from './heightmap.js';
import { MUD } from './surfaces.js';
import { MAP } from './maps/index.js';
import { makeKit } from './propkit.js';

// Small seeded random number generator, so the world is the same every time.
function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Nudge a colour lighter or darker by `amount` (-1..1).
function shade(hex, amount) {
  const f = 1 + amount;
  const r = Math.min(255, ((hex >> 16) & 255) * f), g = Math.min(255, ((hex >> 8) & 255) * f), b = Math.min(255, (hex & 255) * f);
  return (r << 16) | (g << 8) | b;
}

const LANTERN_GLOW = 0xffa040;
const WINDOW_GLOW = 0xffc060;

export function generateProps(terrain) {
  // The other maps describe their own scenery with the prop kit; the valley's is written out below.
  if (MAP.id !== 'valley') { const kit = makeKit(terrain, 77); MAP.props(kit, terrain); return kit.result(); }
  const rand = makeRandom(20261110);
  const boxes = [], colliders = [], dynamics = [], lanterns = [], chimneys = [];
  const half = terrain.half;

  const box = (x, y, z, sx, sy, sz, color, glow = false) => boxes.push({ x, y, z, sx, sy, sz, color, glow });
  const solid = (x, y, z, sx, sy, sz) => colliders.push({ x, y, z, hx: sx / 2, hy: sy / 2, hz: sz / 2 });
  const ground = (x, z) => terrain.heightAt(x, z);

  function lantern(x, z, baseY = null, height = 2.2) {
    const y = baseY ?? ground(x, z);
    box(x, y + height / 2, z, 0.18, height, 0.18, 0x3a2a1e);
    box(x, y + height + 0.05, z, 0.5, 0.1, 0.5, 0x2a1e16);
    box(x, y + height + 0.3, z, 0.34, 0.4, 0.34, LANTERN_GLOW, true);
    box(x, y + height + 0.55, z, 0.44, 0.1, 0.44, 0x2a1e16);
    solid(x, y + height / 2, z, 0.2, height, 0.2);
    lanterns.push({ x, y: y + height + 0.3, z });
  }

  function crate(x, y, z, size = 0.9) {
    dynamics.push({ x, y: y + size / 2 + 0.02, z, sx: size, sy: size, sz: size, color: shade(0xa67844, (rand() - 0.5) * 0.25), kind: 'crate' });
  }
  function barrel(x, y, z) {
    dynamics.push({ x, y: y + 0.52, z, sx: 0.7, sy: 1.0, sz: 0.7, color: shade(0x7c4a2c, (rand() - 0.5) * 0.2), kind: 'barrel' });
  }

  // ---- Trees ----
  const autumn = [0xc8642a, 0xd98a2b, 0xb8432a];
  function pine(x, z, s) {
    const y = ground(x, z);
    box(x, y + 0.6 * s, z, 0.4 * s, 1.2 * s, 0.4 * s, 0x4a3323);
    const green = shade(0x2f5a34, (rand() - 0.5) * 0.3);
    const tiers = [2.4, 1.8, 1.2, 0.6];
    tiers.forEach((w, i) => box(x, y + (1.2 + 0.35 + i * 0.7) * s, z, w * s, 0.7 * s, w * s, shade(green, i * 0.06)));
    solid(x, y + 1 * s, z, 0.5 * s, 2 * s, 0.5 * s);
  }
  function roundTree(x, z, s) {
    const y = ground(x, z);
    const leaf = rand() < 0.3 ? autumn[Math.floor(rand() * autumn.length)] : shade(0x3f7a3a, (rand() - 0.5) * 0.3);
    box(x, y + 0.9 * s, z, 0.5 * s, 1.8 * s, 0.5 * s, 0x503624);
    box(x, y + 2.5 * s, z, 2.4 * s, 1.6 * s, 2.4 * s, leaf);
    box(x + 0.3 * s, y + 3.5 * s, z - 0.2 * s, 1.5 * s, 0.9 * s, 1.5 * s, shade(leaf, 0.1));
    box(x - 0.9 * s, y + 2.1 * s, z + 0.6 * s, 1.1 * s, 0.9 * s, 1.1 * s, shade(leaf, -0.1));
    solid(x, y + 1 * s, z, 0.6 * s, 2 * s, 0.6 * s);
  }
  let placed = 0, tries = 0;
  while (placed < 700 && tries++ < 14000) {
    // the last 220 trees are all planted in the deep forest, so it is properly thick
    const inForest = placed >= 480;
    const x = inForest ? PLACES.forest.x + (rand() * 2 - 1) * 55 : (rand() * 2 - 1) * (half - 6);
    const z = inForest ? PLACES.forest.z + (rand() * 2 - 1) * 55 : (rand() * 2 - 1) * (half - 6);
    if (Math.abs(x) > half - 6 || Math.abs(z) > half - 6) continue;
    if (terrain.surfaceAt(x, z) !== GRASS) continue;
    if (Math.hypot(x - PLACES.spawn.x, z - PLACES.spawn.z) < 14) continue;
    if (Math.hypot(x - PLACES.village.x, z - PLACES.village.z) < PLACES.village.r + 6) continue;
    // keep clear of trails: check the ground a couple of metres around is all grass
    let clear = true;
    for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) if (terrain.surfaceAt(x + dx, z + dz) !== GRASS) clear = false;
    if (distToTrail(x, z) < 6) clear = false;
    if (!clear) continue;
    const s = 0.8 + rand() * 0.7;
    if (rand() < (inForest ? 0.85 : 0.6)) pine(x, z, inForest ? s * 1.25 : s); else roundTree(x, z, s);
    placed++;
  }

  // ---- Swamp: dead trees standing in the mud ----
  for (let i = 0; i < 90; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * PLACES.swamp.r;
    const x = PLACES.swamp.x + Math.cos(a) * r, z = PLACES.swamp.z + Math.sin(a) * r;
    if (Math.abs(x) > half - 6 || Math.abs(z) > half - 6 || distToTrail(x, z) < 5) continue;
    const y = Math.max(ground(x, z), WATER_LEVEL - 0.2), h = 2 + rand() * 3;
    box(x, y + h / 2, z, 0.35, h, 0.35, shade(0x4a443c, (rand() - 0.5) * 0.3));
    if (rand() < 0.6) box(x + 0.5, y + h * 0.7, z, 1.0, 0.18, 0.18, 0x4a443c);
    if (rand() < 0.4) box(x, y + h * 0.55, z - 0.45, 0.18, 0.18, 0.9, 0x4a443c);
    solid(x, y + h / 2, z, 0.4, h, 0.4);
  }

  // ---- Camps at the far ends of the trails ----
  function tent(x, z, color) {
    const y = ground(x, z);
    for (let i = 0; i < 4; i++) box(x, y + 0.25 + i * 0.5, z, 3 - i * 0.75, 0.5, 3.4, shade(color, i * 0.05));
    solid(x, y + 1, z, 2.4, 2, 3.4);
  }
  const D = PLACES.dunes, S = PLACES.swamp, MT = PLACES.mountain, F = PLACES.forest;
  tent(D.x + 5, D.z + 3, 0xb5523a); lantern(D.x + 1, D.z + 5); lantern(D.x + 8, D.z - 2);
  tent(S.x - 6, S.z + 5, 0x55704a); lantern(S.x - 2, S.z + 7);
  tent(F.x - 4, F.z + 5, 0x6a5a8a); lantern(F.x, F.z + 2);
  // summit lookout
  lantern(MT.x + 4, MT.z + 1); lantern(MT.x - 3, MT.z - 4);
  box(MT.x - 4.5, ground(MT.x - 4.5, MT.z + 3) + 2.2, MT.z + 3, 0.3, 4.4, 0.3, 0x3a2a1e);
  box(MT.x - 3.7, ground(MT.x - 4.5, MT.z + 3) + 3.9, MT.z + 3, 1.4, 0.8, 0.06, 0xc8452c);
  // lanterns along the mountain road and the new trails
  const beside = (x, z) => {
    for (let a = 0; a < 8; a++) {
      const lx = x + Math.cos(a * 0.785) * 5, lz = z + Math.sin(a * 0.785) * 5;
      if (distToTrail(lx, lz) > 4 && ground(lx, lz) > 0.3) { lantern(lx, lz); return; }
    }
  };
  MOUNTAIN_ROAD.forEach(([x, z], i) => { if (i % 4 === 1) beside(x, z); });
  for (const t of TRAILS.slice(5)) for (const [x, z] of t.slice(1)) beside(x, z);

  // ---- Boulders (rock crawl and scattered) ----
  // `slab` boulders are low and wide: made to be driven over.
  function boulder(x, z, s, slab = false) {
    const y = ground(x, z);
    const grey = shade(0x777a84, (rand() - 0.5) * 0.25);
    const h = slab ? 0.25 + rand() * 0.17 : s * (0.5 + rand() * 0.4);
    box(x, y + h / 2 - 0.12, z, s, h, s * (0.8 + rand() * 0.4), grey);
    solid(x, y + h / 2 - 0.12, z, s, h, s);
    if (!slab && rand() < 0.5) {
      const s2 = s * 0.55, ox = (rand() - 0.5) * s, oz = (rand() - 0.5) * s;
      box(x + ox, y + s2 * 0.3, z + oz, s2, s2 * 0.9, s2, shade(grey, 0.1));
      solid(x + ox, y + s2 * 0.3, z + oz, s2, s2 * 0.9, s2);
    }
  }
  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * PLACES.rocks.r * 0.9;
    boulder(PLACES.rocks.x + Math.cos(a) * r, PLACES.rocks.z + Math.sin(a) * r, 0.9 + rand() * 1.4, true);
  }
  for (let i = 0; i < 200; i++) {
    const x = (rand() * 2 - 1) * (half - 8), z = (rand() * 2 - 1) * (half - 8);
    if (distToTrail(x, z) < 4.5) continue;
    const s = terrain.surfaceAt(x, z);
    if (s === ROCK || (s === SAND && ground(x, z) > 0.2 && Math.abs(x - PLACES.ford.x) > 8)) boulder(x, z, 0.5 + rand() * 0.9);
  }

  // ---- Reeds along the river bank (no collision) ----
  for (let i = 0; i < 260; i++) {
    const x = (rand() * 2 - 1) * (half - 22);
    const side = rand() < 0.5 ? -1 : 1;
    const z = riverZ(x) + side * (5.6 + rand() * 2.2);
    if (Math.abs(x - PLACES.ford.x) < 6 || Math.abs(x - PLACES.bridge.x) < 4) continue;
    const y = Math.max(ground(x, z), WATER_LEVEL);
    const h = 0.5 + rand() * 0.7;
    box(x, y + h / 2, z, 0.14, h, 0.14, shade(0x5d7d3c, (rand() - 0.5) * 0.4));
  }

  // ---- Village huts ----
  function hut(x, z, w, d, doorSide) {
    const y = Math.min(ground(x - w / 2, z - d / 2), ground(x + w / 2, z + d / 2), ground(x, z));
    const wallH = 2.4, rows = 6, rowH = wallH / rows;
    box(x, y + 0.1, z, w + 0.4, 0.6, d + 0.4, 0x5f5a55); // stone footing
    for (let r = 0; r < rows; r++) {
      const c = shade(0x7a4e30, (r % 2 ? -0.08 : 0.04) + (rand() - 0.5) * 0.08);
      box(x, y + 0.4 + rowH * (r + 0.5), z, w, rowH, d, c);
    }
    // glowing windows and a doorway
    const wy = y + 0.4 + 1.4;
    box(x + w / 2 + 0.02, wy, z + d * 0.2, 0.08, 0.7, 0.7, WINDOW_GLOW, true);
    box(x - w / 2 - 0.02, wy, z - d * 0.2, 0.08, 0.7, 0.7, WINDOW_GLOW, true);
    box(x + w * 0.15, y + 0.4 + 0.95, z + doorSide * (d / 2 + 0.02), 0.9, 1.9, 0.08, 0xffb050, true);
    box(x - w * 0.25, wy, z + doorSide * (d / 2 + 0.02), 0.7, 0.7, 0.08, WINDOW_GLOW, true);
    // stepped gable roof
    const steps = Math.ceil((w + 1) / 2 / 0.5);
    for (let i = 0; i < steps; i++) {
      const rw = w + 1 - i * 1.0;
      if (rw <= 0.2) break;
      box(x, y + 0.4 + wallH + 0.2 + i * 0.4, z, rw, 0.4, d + 1, shade(0x2c2a33, (i % 2) * 0.12));
    }
    solid(x, y + 1.6, z, w, 3.2, d);
    lanterns.push({ x: x + w * 0.15, y: y + 1.6, z: z + doorSide * (d / 2 + 0.6) });
    // chimney (the smoke itself is added by the renderer)
    const top = y + 0.4 + wallH + steps * 0.4 + 0.5;
    box(x - w * 0.25, top - 0.7, z - d * 0.2, 0.6, 1.6, 0.6, 0x5f5a55);
    chimneys.push({ x: x - w * 0.25, y: top + 0.2, z: z - d * 0.2 });
  }
  const V = PLACES.village;
  hut(V.x - 2, V.z - 11, 6, 5, 1);
  hut(V.x + 10, V.z - 8, 5, 6, 1);
  hut(V.x + 14, V.z + 3, 6, 5, -1);
  hut(V.x - 8, V.z + 6, 5, 5, -1);

  // village lanterns, crates and barrels
  for (const [dx, dz] of [[-6, -4], [4, -3], [9, 1], [-1, 5], [5, 9], [-12, 0], [16, -4]]) lantern(V.x + dx, V.z + dz);
  for (const [dx, dz] of [[2, -6], [2.9, -6.1], [2.4, -6], [7, 2], [-5, 2], [12, 8], [12.9, 8.2], [-3, 10]]) {
    crate(V.x + dx, ground(V.x + dx, V.z + dz) + (dx === 2.4 ? 0.92 : 0), V.z + dz);
  }
  for (const [dx, dz] of [[3.6, -5.2], [8, 3], [-6, 3], [11, 7]]) barrel(V.x + dx, ground(V.x + dx, V.z + dz), V.z + dz);

  // ---- Docks on the river by the village ----
  const deckTop = 0.78;
  function dock(x0, x1, z0, z1) {
    for (let x = x0; x < x1 - 0.01; x += 0.5) {
      box(x + 0.25, deckTop - 0.09, (z0 + z1) / 2, 0.47, 0.18, z1 - z0, shade(0x8a5a36, (rand() - 0.5) * 0.25));
    }
    solid((x0 + x1) / 2, deckTop - 0.15, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0);
    // ramp up from the bank
    box((x0 + x1) / 2, deckTop - 0.2, z0 - 0.3, x1 - x0, 0.2, 0.6, 0x6e4628);
    solid((x0 + x1) / 2, deckTop - 0.24, z0 - 0.3, x1 - x0, 0.2, 0.6);
    for (const px of [x0 + 0.2, x1 - 0.2]) {
      for (let z = z0 + 0.3; z <= z1; z += 2.9) box(px, deckTop / 2 - 1.2, z, 0.3, deckTop + 2.4, 0.3, 0x4a3020);
    }
  }
  const dockZ0 = riverZ(V.x + 4) - 10, dockZ1 = riverZ(V.x + 4) - 2.5;
  dock(V.x - 1, V.x + 4, dockZ0, dockZ1);
  dock(V.x + 8, V.x + 12, dockZ0 + 1, dockZ1 - 1.5);
  dock(V.x + 4, V.x + 8, dockZ1 - 4.5, dockZ1 - 1.5);
  lantern(V.x - 0.6, dockZ1 - 0.5, deckTop, 1.8);
  lantern(V.x + 11.6, dockZ1 - 2, deckTop, 1.8);
  lantern(V.x + 3.6, dockZ0 + 0.5, deckTop, 1.8);
  crate(V.x + 1, deckTop, dockZ1 - 1.5);
  crate(V.x + 2, deckTop, dockZ1 - 1.4, 0.8);
  crate(V.x + 1.5, deckTop + 0.92, dockZ1 - 1.5, 0.75);
  barrel(V.x + 9.5, deckTop, dockZ1 - 3);
  barrel(V.x + 10.4, deckTop, dockZ1 - 3.2);
  crate(V.x + 6, deckTop, dockZ1 - 3);

  // ---- Log bridge ----
  const bx = PLACES.bridge.x, bzc = riverZ(bx), bz0 = bzc - 9.5, bz1 = bzc + 9.5;
  for (let z = bz0; z < bz1 - 0.01; z += 0.5) {
    box(bx + (rand() - 0.5) * 0.15, deckTop - 0.15, z + 0.25, 3.5, 0.3, 0.46, shade(0x6b4529, (rand() - 0.5) * 0.3));
  }
  solid(bx, deckTop - 0.15, bzc, 3.4, 0.3, bz1 - bz0);
  for (const z of [bz0 - 0.35, bz1 + 0.35]) {
    box(bx, deckTop - 0.22, z, 3.4, 0.2, 0.7, 0x5a3a22);
    solid(bx, deckTop - 0.24, z, 3.4, 0.2, 0.7);
  }
  for (let z = bz0 + 1; z <= bz1; z += 4.2) {
    for (const sx of [-1.75, 1.75]) box(bx + sx, deckTop / 2 - 1, z, 0.35, deckTop + 2.6, 0.35, 0x49301f);
  }
  for (const [sx, z] of [[-2.1, bz0 - 0.2], [2.1, bz0 - 0.2], [-2.1, bz1 + 0.2], [2.1, bz1 + 0.2]]) lantern(bx + sx, z);

  // ---- Ford markers, trail-side lanterns ----
  const fx = PLACES.ford.x, fz = riverZ(fx);
  for (const [dx, dz] of [[-6.5, -6.2], [6.5, -6.2], [-6.5, 6.2], [6.5, 6.2]]) lantern(fx + dx, fz + dz);
  for (const [x, z] of [[-33, -30], [-52, -46], [-62, -40], [36, -33], [56, -52], [60, -78], [84, -62], [54, 18], [55, 68], [20, 88], [-40, 83], [-48, 42], [-62, 58], [-84, 66]]) {
    // stand the post beside the trail, never on it
    for (let a = 0; a < 8; a++) {
      const lx = x + Math.cos(a * 0.785) * 5, lz = z + Math.sin(a * 0.785) * 5;
      if (distToTrail(lx, lz) > 4 && ground(lx, lz) > 0.3) { lantern(lx, lz); break; }
    }
  }

  // ---- Proving ground: built obstacles on a level yard ----
  {
    const P = PLACES.park, y0 = P.level, rock = 0x7b7d86, timber = 0x6b4529;
    const block = (x, y, z, sx, sy, sz, color) => { box(x, y, z, sx, sy, sz, color); solid(x, y, z, sx, sy, sz); };
    // 1. Ledges: three steps up to a deck, three steps down. Each step is 30 cm.
    const lx = P.x - 12, lz = P.z - 8;
    for (let i = 0; i < 3; i++) {
      const h = 0.3 * (i + 1);
      block(lx + i * 1.7, y0 + h / 2, lz, 1.7, h, 5, shade(rock, i * 0.05));
      block(lx + 11.9 - i * 1.7, y0 + h / 2, lz, 1.7, h, 5, shade(rock, i * 0.05));
    }
    block(lx + 5.95, y0 + 0.45, lz, 6.8, 0.9, 5, shade(rock, 0.14));
    // 2. Side slope: a ramp tilted 18 degrees sideways, built from stepped strips. Drive along it without sliding off.
    const sx0 = P.x + 9, sz0 = P.z - 11;
    for (let i = 0; i < 10; i++) {
      const h = 0.16 * (i + 1);
      block(sx0, y0 + h / 2, sz0 + i * 0.5, 15, h, 0.5, shade(0x8c6b47, (i % 2) * 0.06));
    }
    // 3. Log crossing: six logs laid across the path.
    for (let i = 0; i < 6; i++) block(P.x - 12 + i * 1.8, y0 + 0.19, P.z + 8, 0.42, 0.38, 5.2, shade(timber, (rand() - 0.5) * 0.3));
    // 4. Rock garden: low slabs to pick a line through, with cairns marking the way in and out.
    for (let i = 0; i < 18; i++) {
      const s = 0.9 + rand() * 1.3, h = 0.22 + rand() * 0.22;
      block(P.x + 3 + rand() * 13, y0 + h / 2 - 0.04, P.z + 5 + rand() * 7, s, h, s * (0.7 + rand() * 0.5), shade(rock, (rand() - 0.5) * 0.25));
    }
    const cairn = (x, z) => { for (let i = 0; i < 4; i++) box(x, y0 + 0.18 + i * 0.3, z, 0.6 - i * 0.12, 0.3, 0.6 - i * 0.12, shade(rock, i * 0.08)); box(x, y0 + 1.42, z, 0.22, 0.22, 0.22, LANTERN_GLOW, true); solid(x, y0 + 0.6, z, 0.6, 1.2, 0.6); };
    cairn(P.x + 1.5, P.z + 5); cairn(P.x + 1.5, P.z + 12); cairn(P.x + 17.5, P.z + 5); cairn(P.x + 17.5, P.z + 12);
    for (const [dx, dz] of [[-19, 0], [19, 0], [0, -19], [0, 19]]) lantern(P.x + dx, P.z + dz);
  }

  // ---- Landmarks you can steer by from a long way off ----
  function tower(x, z, height = 14) {
    const y = ground(x, z);
    for (let i = 0; i < height / 2; i++) box(x, y + 1 + i * 2, z, 3.2 - i * 0.12, 2, 3.2 - i * 0.12, shade(0x6f6a64, (i % 2) * 0.07 + (rand() - 0.5) * 0.05));
    box(x, y + height + 0.25, z, 4, 0.5, 4, 0x4a443c);
    box(x, y + height + 1.2, z, 1.6, 1.4, 1.6, LANTERN_GLOW, true); // the beacon
    for (const [dx, dz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) box(x + dx, y + height + 1.2, z + dz, 0.3, 1.4, 0.3, 0x3a2a1e);
    box(x, y + height + 2.15, z, 4.2, 0.5, 4.2, 0x2c2a33);
    box(x, y + height + 2.7, z, 2.6, 0.6, 2.6, 0x2c2a33);
    solid(x, y + height / 2, z, 3.2, height, 3.2);
    lanterns.push({ x, y: y + 3, z });
  }
  tower(-8, 132); tower(-152, -70); tower(152, 40);
  // the old stone bridge, long since fallen in: piers and stubs across the river
  {
    const bx2 = -95, bz = riverZ(bx2);
    for (const dz of [-9, -3.5, 3.5, 9]) {
      const y = Math.max(ground(bx2, bz + dz), -1.5), top = 2.2;
      box(bx2, (y + top) / 2, bz + dz, 3.4, top - y, 1.6, shade(0x6f6a64, (rand() - 0.5) * 0.1));
      solid(bx2, (y + top) / 2, bz + dz, 3.4, top - y, 1.6);
    }
    box(bx2, 2.45, bz - 10.5, 3.4, 0.5, 4.5, 0x77726b); solid(bx2, 2.45, bz - 10.5, 3.4, 0.5, 4.5); // deck stub, south bank
    box(bx2, 2.45, bz + 10.5, 3.4, 0.5, 4.5, 0x77726b); solid(bx2, 2.45, bz + 10.5, 3.4, 0.5, 4.5);
    box(bx2 + 0.4, 2.3, bz - 5.5, 3.0, 0.5, 2.2, 0x6a655f); // a slab hanging off the first pier
  }

  // ---- Villagers ----
  const coats = [0x35506b, 0x8a4a3a, 0x556b3a, 0x7a6a3a, 0x5a4a7a];
  function person(x, z, i) {
    const y = ground(x, z), coat = coats[i % coats.length];
    box(x - 0.11, y + 0.35, z, 0.16, 0.7, 0.2, 0x2f2a26); box(x + 0.11, y + 0.35, z, 0.16, 0.7, 0.2, 0x2f2a26);
    box(x, y + 1.0, z, 0.46, 0.62, 0.28, coat);
    box(x, y + 1.5, z, 0.3, 0.3, 0.3, 0xd9b08c);
    box(x, y + 1.7, z, 0.4, 0.1, 0.4, shade(coat, -0.3));
    solid(x, y + 0.9, z, 0.4, 1.8, 0.3);
  }
  [[V.x + 1, V.z - 7], [V.x + 2, V.z - 7.6], [V.x + 12, V.z - 3.5], [V.x - 5.5, V.z + 9.5], [V.x + 15.5, V.z + 6.5], [V.x + 2.5, dockZ1 - 2.5], [V.x + 10, dockZ1 - 4]].forEach(([x, z], i) => person(x, z, i));
  person(PLACES.park.x - 20.5, PLACES.park.z + 1.5, 3); person(D.x + 2.5, D.z + 3.5, 1); person(MT.x + 2, MT.z + 2.5, 4);

  return { boxes, colliders, dynamics, lanterns, chimneys };
}
