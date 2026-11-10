// A box of ready-made voxel things for building a map: trees, cacti, rocks,
// tents, cabins, towers, people, lanterns, rally furniture. Each one adds
// boxes to draw and, where it should be solid, something to bump into.
// A map's props(kit) function calls these to dress its world.

import { makeRandom } from './noise.js';

function shade(hex, amount) {
  const f = 1 + amount;
  const r = Math.min(255, ((hex >> 16) & 255) * f), g = Math.min(255, ((hex >> 8) & 255) * f), b = Math.min(255, (hex & 255) * f);
  return (r << 16) | (g << 8) | b;
}
const GLOW = 0xffa040;

export function makeKit(terrain, seed = 1) {
  const rand = makeRandom(seed);
  const boxes = [], colliders = [], dynamics = [], lanterns = [], chimneys = [];
  const half = terrain.half;
  const box = (x, y, z, sx, sy, sz, color, glow = false) => boxes.push({ x, y, z, sx, sy, sz, color, glow });
  const solid = (x, y, z, sx, sy, sz) => colliders.push({ x, y, z, hx: sx / 2, hy: sy / 2, hz: sz / 2 });
  const block = (x, y, z, sx, sy, sz, color) => { box(x, y, z, sx, sy, sz, color); solid(x, y, z, sx, sy, sz); };
  const ground = (x, z) => terrain.heightAt(x, z);

  const kit = {
    rand, half, box, solid, block, ground, shade, boxes, colliders, dynamics, lanterns, chimneys,

    lantern(x, z, height = 2.2) {
      const y = ground(x, z);
      box(x, y + height / 2, z, 0.18, height, 0.18, 0x3a2a1e);
      box(x, y + height + 0.3, z, 0.34, 0.4, 0.34, GLOW, true);
      box(x, y + height + 0.55, z, 0.44, 0.1, 0.44, 0x2a1e16);
      solid(x, y + height / 2, z, 0.2, height, 0.2);
      lanterns.push({ x, y: y + height + 0.3, z });
    },
    pine(x, z, s = 1, snowy = false) {
      const y = ground(x, z), green = shade(snowy ? 0x2b4a3a : 0x2f5a34, (rand() - 0.5) * 0.3);
      box(x, y + 0.6 * s, z, 0.4 * s, 1.2 * s, 0.4 * s, 0x4a3323);
      [2.4, 1.8, 1.2, 0.6].forEach((w, i) => {
        box(x, y + (1.55 + i * 0.7) * s, z, w * s, 0.7 * s, w * s, shade(green, i * 0.06));
        if (snowy) box(x, y + (1.9 + i * 0.7) * s, z, w * s * 0.86, 0.14 * s, w * s * 0.86, 0xeef3f6); // snow lying on each tier
      });
      solid(x, y + s, z, 0.5 * s, 2 * s, 0.5 * s);
    },
    // a tall broad-leaved jungle tree: bare trunk, wide flat canopy
    jungle(x, z, s = 1) {
      const y = ground(x, z), green = shade(0x2f6a34, (rand() - 0.5) * 0.3);
      box(x, y + 1.6 * s, z, 0.5 * s, 3.2 * s, 0.5 * s, 0x4a3323);
      box(x, y + 3.5 * s, z, 3.4 * s, 0.8 * s, 3.4 * s, green);
      box(x + 0.3 * s, y + 4.2 * s, z - 0.2 * s, 2.3 * s, 0.7 * s, 2.3 * s, shade(green, 0.1));
      box(x - 1.2 * s, y + 2.9 * s, z + 0.9 * s, 1.5 * s, 0.6 * s, 1.5 * s, shade(green, -0.1));
      solid(x, y + 1.6 * s, z, 0.6 * s, 3.2 * s, 0.6 * s);
    },
    cactus(x, z, s = 1) {
      const y = ground(x, z), c = shade(0x4f8a4a, (rand() - 0.5) * 0.2);
      box(x, y + 1.3 * s, z, 0.5 * s, 2.6 * s, 0.5 * s, c);
      if (rand() < 0.8) { box(x + 0.6 * s, y + 1.3 * s, z, 0.7 * s, 0.35 * s, 0.35 * s, c); box(x + 0.85 * s, y + 1.8 * s, z, 0.35 * s, 1.0 * s, 0.35 * s, c); }
      if (rand() < 0.6) { box(x - 0.6 * s, y + 0.9 * s, z, 0.7 * s, 0.35 * s, 0.35 * s, c); box(x - 0.85 * s, y + 1.3 * s, z, 0.35 * s, 0.8 * s, 0.35 * s, c); }
      solid(x, y + 1.3 * s, z, 0.5 * s, 2.6 * s, 0.5 * s);
    },
    palm(x, z, s = 1) {
      const y = ground(x, z);
      for (let i = 0; i < 5; i++) box(x + i * 0.12 * s, y + (0.5 + i) * s, z, 0.4 * s, s, 0.4 * s, shade(0x8a6a44, (i % 2) * 0.08));
      const top = y + 5.3 * s, cx = x + 0.6 * s;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { box(cx + dx * 1.1 * s, top, z + dz * 1.1 * s, dx ? 2 * s : 0.6 * s, 0.25 * s, dz ? 2 * s : 0.6 * s, 0x4f9a52); box(cx + dx * 2.1 * s, top - 0.35 * s, z + dz * 2.1 * s, dx ? 0.9 * s : 0.5 * s, 0.25 * s, dz ? 0.9 * s : 0.5 * s, 0x3f8246); }
      solid(x, y + 2.5 * s, z, 0.5 * s, 5 * s, 0.5 * s);
    },
    bush(x, z, color = 0x7a6a44) {
      const y = ground(x, z), s = 0.5 + rand() * 0.6;
      box(x, y + s * 0.4, z, s * 1.4, s * 0.8, s * 1.2, shade(color, (rand() - 0.5) * 0.3));
    },
    // slab = low and wide, made to be driven over
    boulder(x, z, s, color = 0x777a84, slab = false) {
      const y = ground(x, z), c = shade(color, (rand() - 0.5) * 0.25), h = slab ? 0.25 + rand() * 0.17 : s * (0.5 + rand() * 0.5);
      block(x, y + h / 2 - 0.12, z, s, h, s * (0.8 + rand() * 0.4), c);
    },
    tent(x, z, color) {
      const y = ground(x, z);
      for (let i = 0; i < 4; i++) box(x, y + 0.25 + i * 0.5, z, 3 - i * 0.75, 0.5, 3.4, shade(color, i * 0.05));
      solid(x, y + 1, z, 2.4, 2, 3.4);
    },
    cabin(x, z, w = 6, d = 5, roof = 0x2c2a33, wall = 0x7a4e30) {
      const y = Math.min(ground(x - w / 2, z - d / 2), ground(x + w / 2, z + d / 2), ground(x, z));
      box(x, y + 0.1, z, w + 0.4, 0.6, d + 0.4, 0x5f5a55);
      for (let r = 0; r < 6; r++) box(x, y + 0.4 + 0.4 * (r + 0.5), z, w, 0.4, d, shade(wall, (r % 2 ? -0.08 : 0.04) + (rand() - 0.5) * 0.08));
      box(x + w / 2 + 0.02, y + 1.8, z + d * 0.2, 0.08, 0.7, 0.7, 0xffc060, true);
      box(x - w * 0.2, y + 1.8, z + d / 2 + 0.02, 0.7, 0.7, 0.08, 0xffc060, true);
      box(x + w * 0.2, y + 1.35, z + d / 2 + 0.02, 0.9, 1.9, 0.08, 0xffb050, true);
      const steps = Math.ceil((w + 1) / 2 / 0.5);
      for (let i = 0; i < steps; i++) { const rw = w + 1 - i; if (rw <= 0.2) break; box(x, y + 3 + i * 0.4, z, rw, 0.4, d + 1, shade(roof, (i % 2) * 0.12)); }
      const top = y + 2.8 + steps * 0.4 + 0.5;
      box(x - w * 0.25, top - 0.7, z - d * 0.2, 0.6, 1.6, 0.6, 0x5f5a55);
      chimneys.push({ x: x - w * 0.25, y: top + 0.2, z: z - d * 0.2 });
      solid(x, y + 1.6, z, w, 3.2, d);
      lanterns.push({ x: x + w * 0.2, y: y + 1.6, z: z + d / 2 + 0.6 });
    },
    tower(x, z, height = 14, stone = 0x6f6a64) {
      const y = ground(x, z);
      for (let i = 0; i < height / 2; i++) box(x, y + 1 + i * 2, z, 3.2 - i * 0.12, 2, 3.2 - i * 0.12, shade(stone, (i % 2) * 0.07));
      box(x, y + height + 0.25, z, 4, 0.5, 4, 0x4a443c);
      box(x, y + height + 1.2, z, 1.6, 1.4, 1.6, GLOW, true);
      box(x, y + height + 2.15, z, 4.2, 0.5, 4.2, 0x2c2a33);
      solid(x, y + height / 2, z, 3.2, height, 3.2);
      lanterns.push({ x, y: y + 3, z });
    },
    // a lattice radio mast with a red light on top
    mast(x, z, height = 18) {
      const y = ground(x, z);
      for (let i = 0; i < height; i += 2) { box(x, y + i + 1, z, 0.3, 2, 0.3, 0x8d8f96); box(x, y + i + 1, z, 1.2 - i * 0.05, 0.12, 1.2 - i * 0.05, 0xc8452c); }
      box(x, y + height + 0.3, z, 0.4, 0.4, 0.4, 0xff3a2a, true);
      solid(x, y + height / 2, z, 0.5, height, 0.5);
    },
    person(x, z, coat = 0x35506b) {
      const y = ground(x, z);
      box(x - 0.11, y + 0.35, z, 0.16, 0.7, 0.2, 0x2f2a26); box(x + 0.11, y + 0.35, z, 0.16, 0.7, 0.2, 0x2f2a26);
      box(x, y + 1.0, z, 0.46, 0.62, 0.28, coat); box(x, y + 1.5, z, 0.3, 0.3, 0.3, 0xd9b08c); box(x, y + 1.7, z, 0.4, 0.1, 0.4, shade(coat, -0.3));
      solid(x, y + 0.9, z, 0.4, 1.8, 0.3);
    },
    crate(x, z, size = 0.9) { dynamics.push({ x, y: ground(x, z) + size / 2 + 0.02, z, sx: size, sy: size, sz: size, color: shade(0xa67844, (rand() - 0.5) * 0.25), kind: 'crate' }); },
    barrel(x, z) { dynamics.push({ x, y: ground(x, z) + 0.52, z, sx: 0.7, sy: 1.0, sz: 0.7, color: 0x7c4a2c, kind: 'barrel' }); },

    // ---- rally furniture ----
    // An arch over the road at point i of a line (start and finish gates).
    arch(line, i, color = 0xc8452c, halfWidth = 6.2) {
      const [x, z] = line[i], [nx, nz] = line[Math.min(line.length - 1, i + 1)], [px, pz] = line[Math.max(0, i - 1)];
      const a = Math.atan2(nx - px, nz - pz), sx = Math.cos(a), sz = -Math.sin(a); // across the road
      const y = ground(x, z);
      for (const side of [-1, 1]) { const bx = x + sx * side * halfWidth, bz = z + sz * side * halfWidth; box(bx, y + 2.4, bz, 0.4, 4.8, 0.4, 0xe9e4d8); solid(bx, y + 2.4, bz, 0.4, 4.8, 0.4); }
      for (let k = -4; k <= 4; k++) box(x + sx * k * (halfWidth / 4.5), y + 4.6, z + sz * k * (halfWidth / 4.5), 1.1, 0.7, 1.1, k % 2 ? 0xe9e4d8 : color);
    },
    // Red and white boards on the outside of the tighter corners, and marker posts along the stage.
    stageFurniture(road, notes) {
      const { line, dist } = road, at = (d) => { let i = 0; while (i < line.length - 1 && dist[i] < d) i++; return i; };
      for (const n of notes) {
        if (n.sev === 0 || n.sev > 3) continue;
        for (const d of [n.at + 4, (n.at + n.end) / 2, n.end - 4]) {
          const i = at(d), [x, z] = line[i], [nx, nz] = line[Math.min(line.length - 1, i + 1)];
          const a = Math.atan2(nx - x, nz - z), ox = Math.cos(a) * -n.dir, oz = -Math.sin(a) * -n.dir; // outside of the bend
          const bx = x + ox * (road.width + 2.2), bz = z + oz * (road.width + 2.2), y = ground(bx, bz);
          box(bx, y + 0.9, bz, 0.9, 0.9, 0.9, 0xe9e4d8); box(bx, y + 0.9, bz, 0.5, 0.92, 0.92, 0xc8452c); box(bx, y + 0.25, bz, 0.14, 0.5, 0.14, 0x3a2a1e);
          solid(bx, y + 0.7, bz, 0.9, 1.4, 0.9);
        }
      }
      for (let i = 12; i < line.length - 6; i += 14) {
        const [x, z] = line[i], [nx, nz] = line[i + 1], a = Math.atan2(nx - x, nz - z);
        for (const side of [-1, 1]) { const bx = x + Math.cos(a) * side * (road.width + 1.2), bz = z - Math.sin(a) * side * (road.width + 1.2); box(bx, ground(bx, bz) + 0.45, bz, 0.14, 0.9, 0.14, side > 0 ? 0xc8452c : 0xe9e4d8); }
      }
    },
    // A lantern beside the road at point i: set back square to the road, and only if that spot is clear of every part of it.
    roadLantern(road, i, back = 7) {
      const line = road.line, [x, z] = line[i], [nx, nz] = line[Math.min(line.length - 1, i + 1)], a = Math.atan2(nx - x, nz - z);
      for (const side of [1, -1]) {
        const lx = x + Math.cos(a) * side * back, lz = z - Math.sin(a) * side * back;
        if (road.distance(lx, lz) > back - 1.5 && ground(lx, lz) > 0.4) { kit.lantern(lx, lz); return; }
      }
    },
    // Try `tries` random spots; `place(x, z)` returns true if it put something there. Stops after `count`.
    scatter(count, place, tries = count * 12) {
      let done = 0;
      for (let i = 0; i < tries && done < count; i++) { const x = (rand() * 2 - 1) * (half - 8), z = (rand() * 2 - 1) * (half - 8); if (place(x, z)) done++; }
    },
    result: () => ({ boxes, colliders, dynamics, lanterns, chimneys }),
  };
  return kit;
}
