// Ember Island: a volcanic island in a warm sea. Beaches all the way round,
// jungle inland, a shallow lagoon, and a coast road that ends by climbing
// the volcano to the rim of its glowing crater. There is no wall at the edge
// of this map: the sea is the edge.

import { fbm, valueNoise, blob, lerp, smoothstep } from '../noise.js';
import { spline, makeRoad, paceNotes, reversed, checkpointsAlong } from '../rally.js';
import { GRASS, MUD, SAND, ROCK, RIVERBED, GRAVEL, LAVAROCK } from '../surfaces.js';

const SIZE = 360;
const VOLCANO = { x: 30, z: -48, r: 70, height: 34, crater: 12 };
const VILLAGE = { x: -96, z: -36 };
const LAGOON = { x: -58, z: 62, r: 20 };

function land(x, z) {
  // an island: high in the middle, falling to the sea bed towards the edge, with a wobbly coastline
  const edge = Math.hypot(x, z) / 150 + 0.2 * (fbm(x / 60, z / 60, 401, 3) - 0.5);
  let h = 1.4 + 7 * Math.pow(fbm(x / 55, z / 55, 402, 4), 1.3);
  // the volcano: a cone with the top scooped out
  const d = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
  if (d < VOLCANO.r) {
    h += VOLCANO.height * Math.pow(1 - d / VOLCANO.r, 1.6);
    if (d < VOLCANO.crater + 4) h = lerp(h, 17, 1 - smoothstep(VOLCANO.crater - 3, VOLCANO.crater + 4, d)); // the crater floor
  }
  h = lerp(h, -0.45, blob(x, z, LAGOON, LAGOON.r * 0.6, LAGOON.r)); // lagoon: wading depth
  h = lerp(h, 2.4, blob(x, z, VILLAGE, 14, 26));
  return lerp(h, -3, smoothstep(0.7, 1.0, edge)); // down to the sea
}

const STAGE_POINTS = [[-86, -30], [-82, 6], [-84, 40], [-56, 86], [-18, 92], [16, 84], [50, 70], [80, 40], [90, 4], [82, -30], [70, -56], [56, -82], [28, -90], [2, -74], [-4, -46], [12, -24], [38, -22], [52, -40], [46, -56]];
const stageLine = spline(STAGE_POINTS);
const stage = makeRoad(stageLine, land, { smooth: 8, crests: [{ at: 150, height: 1.3 }, { at: 430, height: 1.4 }] });
const pierRoad = makeRoad(spline([[-86, -30], [-96, -36], [-112, -38]]), land, { width: 2.6, blend: 6 });
const roads = [stage, pierRoad];

function height(x, z) {
  let h = land(x, z);
  // Side roads first, the stage last: where they meet, the stage keeps its own smooth height
  // and the side road ramps up to it. (The other way round leaves a step across the stage.)
  for (const r of roads.slice().reverse()) h = r.apply(x, z, h);
  return Math.max(h, -3);
}
function surface(x, z, h, slope) {
  if (h < 0.1) return RIVERBED;
  if (Math.min(stage.distance(x, z), pierRoad.distance(x, z) + 0.8) < 3.3) return GRAVEL;
  if (h < 1.25) return SAND;
  const d = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
  if (d < VOLCANO.r && h > 10) return LAVAROCK;
  if (slope > 0.8) return ROCK;
  if (h < 3.4 && valueNoise(x / 10, z / 10, 403) > 0.72) return MUD; // boggy patches in the low jungle
  return GRASS;
}

const notes = paceNotes(stage);
const backLine = reversed(stageLine), back = makeRoad(backLine, land), backNotes = paceNotes({ ...back, profile: stage.profile.slice().reverse() });

export default {
  id: 'island', name: 'Ember Island', blurb: 'Beaches, jungle and a lagoon, with a coast road that climbs to the rim of a glowing crater.',
  ground: 'Sand, jungle, lava rock',
  size: SIZE, height, surface,
  places: { spawn: { x: VILLAGE.x + 4, z: VILLAGE.z + 4, yaw: 0.4 } },
  trails: roads.map((r) => r.line),
  time: 0, hasWater: true,
  workshop: { x: VILLAGE.x + 8, z: VILLAGE.z - 4 },
  labels: [{ ...VILLAGE, name: 'Village' }, { ...VOLCANO, name: 'Volcano' }, { ...LAGOON, name: 'Lagoon' }, { x: 4, z: 106, name: 'Lighthouse' }, { x: -20, z: -112, name: 'Wreck' }],
  beacons: [[-110, 20], [-30, 112], [70, 88], [112, -10], [60, -108], [-50, -96], [-20, 20], [-70, -80]],
  shots: { free: [VOLCANO.x - 10, VOLCANO.z + 16, 86, 0], runs: [46, -56, 44, 0], deliveries: [VILLAGE.x, VILLAGE.z, 34, 0], rescues: [LAGOON.x, LAGOON.z, 38, 0] },
  herds: [],
  runs: [
    { id: 'island-stage', name: 'Coast to Crater', blurb: `${Math.round(stage.length)} metres: round the coast on gravel, then up the volcano to the crater rim.`,
      start: stageLine[1], checkpoints: checkpointsAlong(stageLine), rally: { road: stage, notes }, medals: [stage.length / 14.5, stage.length / 11.5, stage.length / 8.8].map(Math.round) },
    { id: 'island-stage-back', name: 'Crater Descent', blurb: 'The same road from the top. Downhill hairpins first, then the fast coast run home.',
      start: backLine[1], checkpoints: checkpointsAlong(backLine), rally: { road: back, notes: backNotes }, medals: [stage.length / 14.5, stage.length / 11.5, stage.length / 8.8].map(Math.round) },
    { id: 'beach-sprint', name: 'Beach Sprint', blurb: 'Flat out along the western sand, through the lagoon shallows and back. Soft tyres help.',
      start: [-112, -8], checkpoints: [[-112, 24], [-96, 58], [-58, 62], [-34, 96], [-58, 62], [-96, 58], [-112, 24], [-112, -8]], medals: [44, 58, 84] },
  ],
  deliveries: [{ id: 'island-light', name: 'Lamp Oil', blurb: 'Oil for the lighthouse on the north shore. The coast road goes most of the way.', start: [VILLAGE.x + 2, VILLAGE.z + 10, 0.2], to: [4, 96], par: 80 }],
  rescues: [{ id: 'island-rescue', name: 'Lagoon Rescue', blurb: 'A buggy tried the lagoon and stopped in the middle. Wade in, hook on, and pull it to the road.', start: [-82, 6], at: [LAGOON.x, LAGOON.z], to: [-80, 36], medals: [70, 95, 140] },
  ],

  props(kit) {
    const { rand } = kit;
    const clear = (x, z, gap = 7) => Math.min(stage.distance(x, z), pierRoad.distance(x, z)) > gap && Math.hypot(x - VILLAGE.x, z - VILLAGE.z) > 18;
    kit.scatter(430, (x, z) => { // jungle on the higher ground
      const h = kit.ground(x, z);
      if (h < 2.2 || h > 12 || !clear(x, z) || Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < 44) return false;
      kit.jungle(x, z, 0.9 + rand() * 0.8);
      return true;
    });
    kit.scatter(130, (x, z) => { // palms along the back of the beach
      const h = kit.ground(x, z);
      if (h < 0.9 || h > 2.4 || !clear(x, z, 5)) return false;
      kit.palm(x, z, 0.75 + rand() * 0.5);
      return true;
    });
    kit.scatter(220, (x, z) => { const h = kit.ground(x, z); if (h < 1.6 || h > 9 || !clear(x, z, 4)) return false; kit.bush(x, z, rand() < 0.6 ? 0x3f7a3a : 0x5a8a3a); return true; });
    kit.scatter(90, (x, z) => { if (kit.ground(x, z) < 0.6 || !clear(x, z, 6)) return false; kit.boulder(x, z, 0.7 + rand() * 1.4, Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < 70 ? 0x3a3436 : 0x777a84); return true; });
    // village: huts, torches, people, cargo
    kit.cabin(VILLAGE.x - 6, VILLAGE.z - 8, 6, 5, 0x8a6a3a, 0x9a7446); kit.cabin(VILLAGE.x + 8, VILLAGE.z - 10, 5, 5, 0x8a6a3a, 0x9a7446); kit.cabin(VILLAGE.x - 8, VILLAGE.z + 8, 5, 6, 0x8a6a3a, 0x9a7446);
    for (const [dx, dz] of [[0, 0], [-12, 0], [10, 2], [2, 12], [-2, -14]]) kit.lantern(VILLAGE.x + dx, VILLAGE.z + dz);
    kit.person(VILLAGE.x - 2, VILLAGE.z - 3, 0xc8452c); kit.person(VILLAGE.x + 4, VILLAGE.z - 4, 0x35506b); kit.person(VILLAGE.x - 5, VILLAGE.z + 3, 0x7a6a3a);
    kit.crate(VILLAGE.x + 3, VILLAGE.z + 3); kit.crate(VILLAGE.x + 4, VILLAGE.z + 3.2); kit.barrel(VILLAGE.x - 3, VILLAGE.z + 6);
    // a pier out over the water
    for (let x = -112; x > -146; x -= 2) { kit.block(x, 0.75, -38, 2, 0.3, 4, kit.shade(0x8a5a36, (rand() - 0.5) * 0.2)); if (Math.round(x) % 8 === 0) for (const s of [-1.8, 1.8]) kit.box(x, -1, -38 + s, 0.35, 3.6, 0.35, 0x4a3020); }
    kit.lantern(-144, -38); kit.person(-140, -37, 0x556b3a);
    // lighthouse on the north shore, wreck on the south beach
    kit.tower(4, 106, 18, 0xe9e4d8);
    { const y = kit.ground(-20, -112);
      kit.block(-20, y + 0.9, -112, 9, 1.8, 3.2, 0x5a3c26); kit.block(-23.5, y + 2.3, -112, 2, 1.2, 3.0, 0x6a4a30); kit.box(-17, y + 3.4, -112, 0.4, 5, 0.4, 0x3a2a1e); kit.box(-16.2, y + 4.4, -112, 2.2, 1.6, 0.1, 0xd9cdb2); }
    // the crater: lava
    for (let i = 0; i < 46; i++) {
      const a = rand() * 6.283, r = Math.sqrt(rand()) * (VOLCANO.crater - 3), x = VOLCANO.x + Math.cos(a) * r, z = VOLCANO.z + Math.sin(a) * r;
      kit.box(x, 17.05, z, 1 + rand() * 1.6, 0.14, 1 + rand() * 1.6, rand() < 0.5 ? 0xff5a1a : 0xff9a2a, true);
    }
    for (const [dx, dz] of [[0, 0], [5, 4], [-5, -3]]) kit.lanterns.push({ x: VOLCANO.x + dx, y: 18.5, z: VOLCANO.z + dz }); // the lava lights up the rim
    // the stage
    kit.arch(stageLine, 3); kit.arch(stageLine, stageLine.length - 3, 0xff7a1a);
    kit.stageFurniture(stage, notes);
    for (let i = 20; i < stageLine.length; i += 40) kit.roadLantern(stage, i);
  },
};
