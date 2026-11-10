// Frost Pass: a snowbound mountain valley with a frozen lake in the middle
// and a rally stage that winds through the hills around it.

import { fbm, valueNoise, blob, rim, lerp } from '../noise.js';
import { spline, makeRoad, paceNotes, reversed, checkpointsAlong } from '../rally.js';
import { SNOW, PACKED, ICE, ROCK } from '../surfaces.js';

const SIZE = 360;
const LAKE = { x: 45, z: 15, r: 46 };
const CAMP = { x: -128, z: -122 };

function land(x, z) {
  let h = 5 + 24 * Math.pow(fbm(x / 85, z / 85, 201, 4), 1.5) + 2.2 * Math.abs(valueNoise(x / 16, z / 16, 202) - 0.5);
  h = lerp(h, 2, blob(x, z, LAKE, LAKE.r, LAKE.r + 30)); // the lake basin
  h = lerp(h, 7, blob(x, z, CAMP, 16, 30)); // level ground for the camp
  return h;
}

// The stage, as a few points to be joined into a smooth road.
const STAGE_POINTS = [[-118, -112], [-92, -98], [-58, -108], [-28, -86], [-36, -52], [-72, -30], [-88, 6], [-62, 44], [-24, 66], [-8, 104], [34, 118], [78, 104], [108, 74], [124, 32], [116, -14], [132, -52], [108, -92], [70, -112], [36, -96]];
const stageLine = spline(STAGE_POINTS);
const stage = makeRoad(stageLine, land, { crests: [{ at: 190, height: 1.3 }, { at: 520, height: 1.5 }, { at: 880, height: 1.2 }] });
const lakeSpur = makeRoad(spline([[-28, -86], [-6, -52], [8, -22]]), land, { width: 2.6, blend: 6 });
const roads = [stage, lakeSpur];

function height(x, z) {
  let h = land(x, z);
  // Side roads first, the stage last: where they meet, the stage keeps its own smooth height
  // and the side road ramps up to it. (The other way round leaves a step across the stage.)
  for (const r of roads.slice().reverse()) h = r.apply(x, z, h);
  return h + rim(x, z, SIZE, 20);
}
function surface(x, z, h, slope) {
  if (Math.min(stage.distance(x, z), lakeSpur.distance(x, z) + 0.8) < 3.3) return PACKED;
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 4 && h < 2.25) return ICE;
  if (slope > 0.85) return ROCK;
  return SNOW;
}

const notes = paceNotes(stage);
const backLine = reversed(stageLine), back = makeRoad(backLine, land), backNotes = paceNotes({ ...back, profile: stage.profile.slice().reverse() });
const circle = (cx, cz, r, n, a0 = 0) => Array.from({ length: n }, (_, i) => [cx + Math.cos(a0 + (i / n) * 6.283) * r, cz + Math.sin(a0 + (i / n) * 6.283) * r]);

export default {
  id: 'frost', name: 'Frost Pass', blurb: 'Deep snow, a frozen lake to slide about on, and a fast rally stage through the hills.',
  size: SIZE, height, surface,
  places: { spawn: { x: CAMP.x, z: CAMP.z + 8, yaw: 0.9 } },
  trails: roads.map((r) => r.line),
  time: 2, precip: 'snow', hasWater: false,
  workshop: { x: CAMP.x + 6, z: CAMP.z + 2 },
  labels: [{ ...CAMP, name: 'Camp' }, { ...LAKE, name: 'Frozen lake' }, { x: 140, z: 138, name: 'Radio mast' }, { x: stageLine[0][0], z: stageLine[0][1], name: 'Stage start' }],
  beacons: [[-150, 20], [-40, 150], [150, 150], [150, -150], [10, -150], [-150, -60], [0, 60], [90, -40]],
  shots: { free: [LAKE.x - 20, LAKE.z, 60, 0], runs: [-36, -52, 40, 0], deliveries: [CAMP.x, CAMP.z, 34, 0], rescues: [-110, 60, 34, 0] },
  herds: [],
  runs: [
    { id: 'frost-stage', name: 'Frost Pass Stage', blurb: `${Math.round(stage.length)} metres of packed snow, three crests and a hairpin or two. Read the pace notes.`,
      start: stageLine[1], checkpoints: checkpointsAlong(stageLine), rally: { road: stage, notes }, medals: [stage.length / 13.5, stage.length / 11, stage.length / 8.5].map(Math.round) },
    { id: 'frost-stage-back', name: 'Frost Pass Reversed', blurb: 'The same road the other way. Every corner you learned is now backwards.',
      start: backLine[1], checkpoints: checkpointsAlong(backLine), rally: { road: back, notes: backNotes }, medals: [stage.length / 13.5, stage.length / 11, stage.length / 8.5].map(Math.round) },
    { id: 'ice-circuit', name: 'Ice Circuit', blurb: 'Two laps round the frozen lake. Almost no grip: steer early and be gentle.',
      start: [LAKE.x + 30, LAKE.z - 6], checkpoints: [...circle(LAKE.x, LAKE.z, 30, 8, 0.3), ...circle(LAKE.x, LAKE.z, 30, 8, 0.3), [LAKE.x + 30, LAKE.z]], medals: [48, 62, 90] },
  ],
  deliveries: [{ id: 'frost-mast', name: 'Mast Supplies', blurb: 'Spares for the radio mast in the far corner. A long haul through deep snow.', start: [CAMP.x + 4, CAMP.z + 12, 0.8], to: [132, 132], par: 110 }],
  rescues: [{ id: 'frost-rescue', name: 'Snowdrift Rescue', blurb: 'A buggy has left the road and buried itself. Winch it back to the packed snow.', start: [-92, -98], at: [-112, 58], to: [-86, 10], medals: [80, 110, 160] }],

  // Dress the world. `kit` is the box of ready-made things in propkit.js.
  props(kit) {
    const { rand } = kit;
    kit.scatter(520, (x, z) => { // snowy pines, away from the roads and the lake
      if (Math.min(stage.distance(x, z), lakeSpur.distance(x, z)) < 7 || Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 8 || Math.hypot(x - CAMP.x, z - CAMP.z) < 20) return false;
      const s = kit.ground(x + 1.5, z) - kit.ground(x - 1.5, z);
      if (Math.abs(s) > 2.2) return false;
      kit.pine(x, z, 0.9 + rand() * 0.9, true);
      return true;
    });
    kit.scatter(110, (x, z) => { if (stage.distance(x, z) < 6 || Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r) return false; kit.boulder(x, z, 0.7 + rand() * 1.4, 0x8e949c); return true; });
    // the camp
    kit.cabin(CAMP.x - 6, CAMP.z - 6, 6, 5, 0xdfe7ec); kit.cabin(CAMP.x + 9, CAMP.z - 8, 5, 6, 0xdfe7ec);
    for (const [dx, dz] of [[0, 0], [-10, 4], [10, 2], [2, 12]]) kit.lantern(CAMP.x + dx, CAMP.z + dz);
    kit.person(CAMP.x - 2, CAMP.z - 2, 0xc8452c); kit.person(CAMP.x + 5, CAMP.z - 3, 0x35506b);
    kit.crate(CAMP.x + 3, CAMP.z + 4); kit.crate(CAMP.x + 4, CAMP.z + 4.2); kit.barrel(CAMP.x - 4, CAMP.z + 3);
    // ice-fishing huts and lights on the lake, a mast, a tower
    for (const [dx, dz] of [[-8, 12], [14, -18]]) { kit.tent(LAKE.x + dx, LAKE.z + dz, 0xc8452c); kit.lantern(LAKE.x + dx + 3, LAKE.z + dz); }
    for (const [x, z] of circle(LAKE.x, LAKE.z, LAKE.r + 2, 8)) kit.lantern(x, z);
    kit.mast(140, 138, 20); kit.cabin(132, 138, 5, 5, 0xdfe7ec); kit.tower(-150, 150, 14, 0x8a9199);
    // the stage
    kit.arch(stageLine, 3); kit.arch(stageLine, stageLine.length - 3, 0x3f8fb8);
    kit.stageFurniture(stage, notes);
    for (let i = 20; i < stageLine.length; i += 46) kit.roadLantern(stage, i);
  },
};
