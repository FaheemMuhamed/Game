// Red Canyon: desert flats, flat-topped mesas with sheer sides, a dune sea,
// one small oasis, and a hardpack rally stage threading between the rocks.

import { fbm, valueNoise, blob, rim, lerp, smoothstep } from '../noise.js';
import { spline, makeRoad, paceNotes, reversed, checkpointsAlong } from '../rally.js';
import { DESERT, HARDPACK, SANDSTONE, RIVERBED } from '../surfaces.js';

const SIZE = 360;
const OASIS = { x: -40, z: 30, r: 13 };
const CAMP = { x: 120, z: 124 };
const DUNES = { x: -112, z: -108, r: 62 };

function land(x, z) {
  // flats with a gentle roll
  let h = 2.6 + 2.2 * fbm(x / 70, z / 70, 301, 3);
  // mesas: where the big noise is high, the ground jumps up in flat steps (the rock layers)
  const m = fbm(x / 95, z / 95, 302, 3) + 0.12 * valueNoise(x / 22, z / 22, 303);
  const rise = smoothstep(0.56, 0.6, m) * 6 + smoothstep(0.63, 0.66, m) * 5 + smoothstep(0.7, 0.72, m) * 5;
  h += rise;
  // dune sea
  const dw = blob(x, z, DUNES, DUNES.r * 0.6, DUNES.r);
  if (dw > 0) h = lerp(h, 2.4 + 4.2 * Math.pow(Math.abs(Math.sin((x * 0.75 - z * 0.6) / 10 + valueNoise(x / 30, z / 30, 304) * 3)), 1.4), dw);
  // oasis: a small pool in a hollow
  h = lerp(h, -0.7, blob(x, z, OASIS, OASIS.r * 0.5, OASIS.r));
  h = lerp(h, 0.5, blob(x, z, OASIS, OASIS.r, OASIS.r + 12) * (1 - blob(x, z, OASIS, OASIS.r * 0.5, OASIS.r)));
  h = lerp(h, 3.2, blob(x, z, CAMP, 16, 30));
  return h;
}

const STAGE_POINTS = [[112, 112], [84, 96], [64, 62], [88, 30], [70, -6], [34, -22], [26, -60], [58, -92], [40, -128], [-4, -120], [-30, -90], [-22, -52], [-58, -32], [-92, -44], [-110, -10], [-84, 24], [-96, 62], [-66, 92], [-28, 82], [4, 108], [44, 130]];
const stageLine = spline(STAGE_POINTS);
const stage = makeRoad(stageLine, land, { smooth: 9, crests: [{ at: 240, height: 1.4 }, { at: 610, height: 1.6 }, { at: 1010, height: 1.3 }] });
const oasisSpur = makeRoad(spline([[-58, -32], [-50, 0], [-44, 18]]), land, { width: 2.6, blend: 6 });
const roads = [stage, oasisSpur];

function height(x, z) {
  let h = land(x, z);
  // Side roads first, the stage last: where they meet, the stage keeps its own smooth height
  // and the side road ramps up to it. (The other way round leaves a step across the stage.)
  for (const r of roads.slice().reverse()) h = r.apply(x, z, h);
  return Math.max(h, -0.7) + rim(x, z, SIZE, 22);
}
function surface(x, z, h, slope) {
  if (h < 0.1) return RIVERBED;
  if (Math.min(stage.distance(x, z), oasisSpur.distance(x, z) + 0.8) < 3.3) return HARDPACK;
  if (slope > 0.7 || h > 8.5) return SANDSTONE;
  return DESERT;
}

const notes = paceNotes(stage);
const backLine = reversed(stageLine), back = makeRoad(backLine, land), backNotes = paceNotes({ ...back, profile: stage.profile.slice().reverse() });

export default {
  id: 'canyon', name: 'Red Canyon', blurb: 'Desert flats, sheer red mesas, a sea of dunes and a hardpack stage between the rocks.',
  size: SIZE, height, surface,
  places: { spawn: { x: CAMP.x, z: CAMP.z - 8, yaw: -2.4 } },
  trails: roads.map((r) => r.line),
  time: 3, hasWater: true,
  workshop: { x: CAMP.x - 6, z: CAMP.z + 2 },
  labels: [{ ...CAMP, name: 'Camp' }, { ...OASIS, name: 'Oasis' }, { ...DUNES, name: 'Dune sea' }, { x: stageLine[0][0], z: stageLine[0][1], name: 'Stage start' }],
  beacons: [[150, -150], [-150, 150], [-150, -40], [0, 0], [150, 20], [-20, 150], [100, -60], [-70, -150]],
  shots: { free: [20, -40, 70, 0], runs: [64, 62, 42, 0], deliveries: [CAMP.x, CAMP.z, 34, 0], rescues: [DUNES.x, DUNES.z, 40, 0] },
  herds: [],
  runs: [
    { id: 'canyon-stage', name: 'Red Canyon Stage', blurb: `${Math.round(stage.length)} metres of hardpack between the mesas. Fast, with crests that will throw you.`,
      start: stageLine[1], checkpoints: checkpointsAlong(stageLine), rally: { road: stage, notes }, medals: [stage.length / 15, stage.length / 12, stage.length / 9].map(Math.round) },
    { id: 'canyon-stage-back', name: 'Red Canyon Reversed', blurb: 'The stage driven back towards camp.',
      start: backLine[1], checkpoints: checkpointsAlong(backLine), rally: { road: back, notes: backNotes }, medals: [stage.length / 15, stage.length / 12, stage.length / 9].map(Math.round) },
    { id: 'dune-sea', name: 'Dune Sea', blurb: 'No road at all. Checkpoints across the soft dunes: momentum is everything, soft tyres help.',
      start: [-70, -60], checkpoints: [[-95, -85], [-125, -115], [-140, -80], [-112, -108], [-90, -140], [-70, -100], [-70, -60]], medals: [50, 66, 95] },
  ],
  deliveries: [{ id: 'canyon-oasis', name: 'Water Run', blurb: 'Empty drums to the oasis. Take the stage road or cut across the flats.', start: [CAMP.x - 4, CAMP.z - 12, -2.4], to: [-44, 44], par: 95 }],
  rescues: [{ id: 'canyon-rescue', name: 'Dune Rescue', blurb: 'A buggy is bellied out in the dune sea. Drag it back to the hardpack.', start: [-22, -52], at: [-104, -96], to: [-78, -44], medals: [85, 115, 165] }],

  props(kit) {
    const { rand } = kit;
    kit.scatter(170, (x, z) => { // cacti on the flats
      if (stage.distance(x, z) < 7 || kit.ground(x, z) > 8 || kit.ground(x, z) < 1 || Math.hypot(x - DUNES.x, z - DUNES.z) < DUNES.r * 0.8 || Math.hypot(x - CAMP.x, z - CAMP.z) < 18) return false;
      kit.cactus(x, z, 0.7 + rand() * 0.8);
      return true;
    });
    kit.scatter(260, (x, z) => { if (stage.distance(x, z) < 4 || kit.ground(x, z) < 1) return false; kit.bush(x, z, rand() < 0.5 ? 0x8a7a4a : 0x6a7a4a); return true; });
    kit.scatter(150, (x, z) => { if (stage.distance(x, z) < 6 || kit.ground(x, z) < 1) return false; kit.boulder(x, z, 0.8 + rand() * 1.8, 0xa8553a); return true; });
    // oasis palms
    for (let i = 0; i < 9; i++) { const a = i * 0.7, r = OASIS.r + 1 + rand() * 6; kit.palm(OASIS.x + Math.cos(a) * r, OASIS.z + Math.sin(a) * r, 0.8 + rand() * 0.5); }
    kit.tent(OASIS.x + 4, OASIS.z + 20, 0xe9e4d8); kit.lantern(OASIS.x, OASIS.z + 18); kit.person(OASIS.x + 1, OASIS.z + 17, 0x7a6a3a);
    // camp
    kit.tent(CAMP.x - 7, CAMP.z + 6, 0xc8452c); kit.tent(CAMP.x + 6, CAMP.z + 7, 0x3f8fb8); kit.tent(CAMP.x + 9, CAMP.z - 6, 0xe9e4d8);
    for (const [dx, dz] of [[0, 0], [-10, -2], [10, 0], [0, 12]]) kit.lantern(CAMP.x + dx, CAMP.z + dz);
    kit.person(CAMP.x - 3, CAMP.z + 3, 0x556b3a); kit.person(CAMP.x + 3, CAMP.z + 4, 0x8a4a3a);
    kit.crate(CAMP.x + 2, CAMP.z - 3); kit.barrel(CAMP.x - 5, CAMP.z - 3); kit.barrel(CAMP.x - 5.9, CAMP.z - 3.2);
    kit.mast(-150, 150, 20); kit.tower(150, -150, 14, 0xa8553a);
    // the stage
    kit.arch(stageLine, 3); kit.arch(stageLine, stageLine.length - 3, 0x3f8fb8);
    kit.stageFurniture(stage, notes);
    for (let i = 20; i < stageLine.length; i += 46) kit.roadLantern(stage, i);
  },
};
