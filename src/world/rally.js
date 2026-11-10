// Building roads and rally stages.
//   spline      turns a handful of hand-placed points into a smooth line
//   makeRoad    cuts that line into the land as a graded road (cut and fill,
//               so it climbs steadily instead of following every bump)
//   paceNotes   reads the corners off the line the way a co-driver would:
//               "Left 3", "Hairpin right", "Crest"

import { clamp, lerp, smoothstep } from './noise.js';

// Catmull-Rom spline: a smooth curve through every control point, sampled every `step` metres.
export function spline(points, step = 4) {
  const out = [];
  const P = (i) => points[clamp(i, 0, points.length - 1)];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const n = Math.max(2, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - 3 * c + d - a) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// A road along `line`, graded smooth. `land(x, z)` is the natural ground.
// crests: [{ at: metres along, height }] adds humps you can get air over.
export function makeRoad(line, land, { width = 3.4, blend = 9, smooth = 7, crests = [] } = {}) {
  const n = line.length;
  const dist = [0];
  for (let i = 1; i < n; i++) dist.push(dist[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  // height profile: the land under the line, averaged over a stretch either side so it rises and falls gently
  const raw = line.map(([x, z]) => land(x, z));
  const profile = raw.map((_, i) => {
    let sum = 0, count = 0;
    for (let k = -smooth; k <= smooth; k++) { const j = clamp(i + k, 0, n - 1); sum += raw[j]; count++; }
    return sum / count;
  });
  for (const c of crests) for (let i = 0; i < n; i++) profile[i] += c.height * Math.exp(-((dist[i] - c.at) ** 2) / (2 * 7 * 7));

  // To find the nearest bit of road quickly, sort the samples into a coarse grid of 16 m squares.
  const CELL = 16, grid = new Map();
  const key = (cx, cz) => cx * 4096 + cz;
  line.forEach(([x, z], i) => {
    const k = key(Math.floor(x / CELL), Math.floor(z / CELL));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  // Distance to the road centre line and the road's height there. Returns null when nowhere near.
  function at(x, z) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = Infinity, bi = -1;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const list = grid.get(key(cx + dx, cz + dz));
      if (!list) continue;
      for (const i of list) { const d = (line[i][0] - x) ** 2 + (line[i][1] - z) ** 2; if (d < best) { best = d; bi = i; } }
    }
    if (bi < 0) return null;
    // refine against the two segments that meet at the nearest sample
    let d = Math.sqrt(best), h = profile[bi];
    for (const j of [bi - 1, bi]) {
      if (j < 0 || j + 1 >= n) continue;
      const ax = line[j][0], az = line[j][1], sx = line[j + 1][0] - ax, sz = line[j + 1][1] - az;
      const t = clamp(((x - ax) * sx + (z - az) * sz) / (sx * sx + sz * sz), 0, 1);
      const dd = Math.hypot(x - ax - sx * t, z - az - sz * t);
      if (dd <= d) { d = dd; h = lerp(profile[j], profile[j + 1], t); }
    }
    return { d, h };
  }
  // Lay the road into a land height: flat across the road, blending back to the land beyond the verge.
  const apply = (x, z, h) => { const r = at(x, z); return r && r.d < width + blend ? lerp(r.h, h, smoothstep(width, width + blend, r.d)) : h; };
  const distance = (x, z) => at(x, z)?.d ?? Infinity;
  return { line, dist, profile, length: dist[n - 1], width, apply, distance };
}

// Pace notes for a line: where each corner starts, which way it goes and how tight it is.
// Severity runs 1 (hairpin) to 6 (barely a bend), the way rally co-drivers call it.
export function paceNotes(road) {
  const { line, dist, profile } = road, n = line.length;
  const heading = line.map((p, i) => { const a = line[Math.max(0, i - 1)], b = line[Math.min(n - 1, i + 1)]; return Math.atan2(b[0] - a[0], b[1] - a[1]); });
  const turn = heading.map((h, i) => { // radians per metre, + is left
    const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
    return Math.atan2(Math.sin(heading[b] - heading[a]), Math.cos(heading[b] - heading[a])) / Math.max(1, dist[b] - dist[a]);
  });
  const notes = [];
  let i = 0;
  while (i < n) {
    if (Math.abs(turn[i]) < 1 / 140) { i++; continue; }
    const dir = Math.sign(turn[i]);
    let j = i, tightest = 0, total = 0;
    while (j < n && Math.sign(turn[j]) === dir && Math.abs(turn[j]) >= 1 / 180) { tightest = Math.max(tightest, Math.abs(turn[j])); total += Math.abs(turn[j]) * (dist[Math.min(n - 1, j + 1)] - dist[j]); j++; }
    const radius = 1 / tightest, len = dist[Math.min(n - 1, j)] - dist[i];
    if (total > 0.3) { // ignore wiggles that turn less than about 17 degrees in all
      const sev = radius < 11 ? 1 : radius < 18 ? 2 : radius < 28 ? 3 : radius < 44 ? 4 : radius < 70 ? 5 : 6;
      const side = dir > 0 ? 'left' : 'right';
      const text = sev === 1 ? `Hairpin ${side}` : `${side[0].toUpperCase()}${side.slice(1)} ${sev}${len > 60 && sev > 2 ? ' long' : ''}`;
      notes.push({ at: dist[i], end: dist[Math.min(n - 1, j)], dir, sev, text });
    }
    i = j + 1;
  }
  // crests: places where the road goes over a hump
  for (let k = 3; k < n - 3; k++) {
    const hump = profile[k] - (profile[k - 3] + profile[k + 3]) / 2;
    if (hump > 0.42 && profile[k] >= profile[k - 1] && profile[k] >= profile[k + 1]) { notes.push({ at: dist[k] - 4, end: dist[k] + 8, dir: 0, sev: 0, text: 'Crest' }); k += 6; }
  }
  notes.sort((a, b) => a.at - b.at);
  return notes;
}

// The same line driven the other way.
export const reversed = (line) => line.slice().reverse();
// Checkpoints every `gap` metres along a line, always including the far end.
export function checkpointsAlong(line, gap = 70) {
  const out = [];
  let travelled = 0;
  for (let i = 1; i < line.length; i++) {
    travelled += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    if (travelled >= gap && i < line.length - 6) { out.push(line[i]); travelled = 0; }
  }
  out.push(line[line.length - 1]);
  return out;
}
