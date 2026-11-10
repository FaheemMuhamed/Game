// What you are doing right now: free roam, a timed trail run, a delivery, or
// the guided first drive. One of these is always the current "mode".

import * as THREE from 'three';
import { formatTime } from '../ui/objective.js';
import { rotate } from '../physics/vec.js';
import { MOUNTAIN_ROAD } from '../world/heightmap.js';
import { MAP } from '../world/maps/index.js';

// Timed runs: drive through the checkpoints in order. Medal times are in seconds.
const VALLEY_RUNS = [
  { id: 'river-run', name: 'River Run', blurb: 'Village to the summit by way of the ford.',
    start: [-12, -10], checkpoints: [[-30, -8], [-30, 0.3], [-32, 12], [-50, 40], [-75, 75]], medals: [20, 28, 42] },
  { id: 'mud-and-back', name: 'Mud and Back', blurb: 'Out to the mud pit, through it, and home.',
    start: [-12, -10], checkpoints: [[-35, -30], [-65, -55], [-78, -66], [-65, -55], [-35, -30], [-12, -10]], medals: [22, 30, 45] },
  { id: 'rock-loop', name: 'Rocks and River', blurb: 'Across the rock field, then over the log bridge.',
    start: [22, -22], checkpoints: [[35, -30], [62, -56], [78, -72], [62, -56], [35, -30], [55, 22], [55, 44], [55, 68]], medals: [50, 68, 100] },
  { id: 'mountain-road', name: 'Mountain Road', blurb: 'Wind up the spiral road to the summit. Mind the edge.',
    start: [82, -74], checkpoints: [0, 5, 10, 15, 20, 25, 30].map((i) => MOUNTAIN_ROAD[i]), medals: [45, 60, 90] },
  { id: 'dune-dash', name: 'Dune Dash', blurb: 'Out across the sand ridges to the far camp and back. Soft tyres help.',
    start: [55, 72], checkpoints: [[85, 95], [115, 118], [140, 105], [115, 118], [85, 95], [55, 72]], medals: [40, 55, 80] },
  { id: 'swamp-run', name: 'Swamp Run', blurb: 'Down through the mud pit and on into the swamp. Pools are shallow, mud is not kind.',
    start: [-35, -30], checkpoints: [[-65, -55], [-90, -85], [-118, -115], [-140, -120]], medals: [35, 48, 75] },
  { id: 'hill-climb', name: 'Hill Climb', blurb: 'Straight up the steep north face of the summit. Low range and nerve.',
    start: [-75, 116], checkpoints: [[-75, 101], [-75, 88], [-75, 76]], medals: [12, 17, 28] },
  { id: 'night-crossing', name: 'Night Crossing', blurb: 'Summit to village in the dark, with no map. Follow the lanterns and find the ford.', night: true,
    start: [-75, 75], checkpoints: [[-50, 40], [-32, 12], [-30, 0.3], [-30, -8], [-12, -10]], medals: [22, 30, 46], shotZoom: 30 },
  { id: 'trial', name: 'Proving Ground Trial', blurb: 'Ledges, a side slope, rocks and logs. Scored on faults: every recovery or rollover is one.', scoring: 'faults',
    start: [-37, -72], checkpoints: [[-24, -72], [-14, -79], [-9, -73.5], [-1, -80], [-8, -55], [-25, -56], [-36, -60]], medals: [90, 90, 90], shotZoom: 46 },
];

// Deliveries: carry three crates on the roof rack without shaking them off.
const VALLEY_DELIVERIES = [
  { id: 'summit-supplies', name: 'Summit Supplies', blurb: 'Lantern oil for the hilltop. Ford the river, then climb.', start: [-14, -12, -1.45], to: [-75, 75], par: 75 },
  { id: 'rock-camp', name: 'Rock Camp', blurb: 'Tools for the far side of the rock field. Slow is smooth.', start: [20, -24, 2.2], to: [84, -76], par: 80 },
  { id: 'far-bank', name: 'Far Bank', blurb: 'Over the log bridge and on to the north trail.', start: [26, -18, 0.9], to: [20, 85], par: 70 },
];

// Recovery jobs: reach a stranded buggy, hook it with the winch, and tow it to firm ground.
const VALLEY_RESCUES = [
  { id: 'mud-rescue', name: 'Mud Rescue', blurb: 'A buggy is bogged in the mud pit. Winch on and tow it out to the trail.', start: [-12, -10], at: [-65, -55], to: [-42, -36], medals: [60, 85, 130] },
  { id: 'rock-rescue', name: 'Rock Rescue', blurb: 'Someone got hung up in the rock field. Drag them back to the track.', start: [22, -22], at: [72, -66], to: [48, -44], medals: [75, 105, 160] },
];

// Each map brings its own events.
export const RUNS = MAP.id === 'valley' ? VALLEY_RUNS : MAP.runs;
export const DELIVERIES = MAP.id === 'valley' ? VALLEY_DELIVERIES : MAP.deliveries;
export const RESCUES = MAP.id === 'valley' ? VALLEY_RESCUES : MAP.rescues;

const CUBE = new THREE.BoxGeometry(1, 1, 1);
const CP_RADIUS = 6;
const MEDALS = ['gold', 'silver', 'bronze'];

export function createModes(G) {
  let m = { kind: 'free' };
  const sceneSet = { time: false, rain: false }; // weather an event changed, to be put back afterwards
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xb98a52, roughness: 0.85 });
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.28, depthWrite: false });
  const ghost = new THREE.Group();
  for (const [y, w, h, d] of [[0, 1.7, 0.5, 4.0], [0.55, 1.6, 0.6, 2.2]]) {
    const b = new THREE.Mesh(CUBE, ghostMat); b.position.y = y; b.scale.set(w, h, d); ghost.add(b);
  }
  ghost.visible = false;
  G.scene.add(ghost);

  const setMapMarkers = (list) => { G.markers = G.markers.filter((x) => !x.ev).concat(list.map((x) => ({ ...x, ev: true }))); };
  const garageVehicle = () => (G.garage.find((g) => g.id === G.save.vehicle) ?? G.garage[0]).vehicle;
  const pos = () => G.active.body.translation();
  const dist = (t) => { const p = pos(); return Math.hypot(p.x - t[0], p.z - t[1]); };
  const yawTo = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]);

  function clear() {
    if (sceneSet.time) { G.weather.setTime(0); sceneSet.time = false; }
    if (sceneSet.rain) { G.weather.setRain(false); sceneSet.rain = false; }
    document.body.classList.remove('no-map');
    G.winch.release('');
    G.survival.refillAll();
    if (m.crates) for (const c of m.crates) { G.phys.world.removeRigidBody(c.body); G.scene.remove(c.mesh); }
    if (m.stranded) { G.phys.world.removeRigidBody(m.stranded.body); G.scene.remove(m.stranded.mesh); G.winchTargets = []; }
    G.world3d.clear();
    G.objectiveUi.big('', 0);
    setMapMarkers([]);
    G.objective = null;
    G.controlLocked = false;
    G.vehicleLocked = false;
    ghost.visible = false;
    const lug = G.models.get(G.car).luggage;
    if (lug) for (const x of lug) x.visible = true;
  }

  function showCheckpoints() {
    const cps = m.ev.checkpoints, i = m.cp;
    const list = [{ x: cps[i][0], z: cps[i][1], radius: CP_RADIUS, color: i === cps.length - 1 ? 0x7ddc8a : 0xff7a1a }];
    if (cps[i + 1]) list.push({ x: cps[i + 1][0], z: cps[i + 1][1], radius: CP_RADIUS, dim: true });
    G.world3d.set(list);
    setMapMarkers(list.map((c, k) => ({ x: c.x, z: c.z, big: k === 0, color: k === 0 ? '#ff7a1a' : '#8b8e92' })));
  }

  function beginCountdown() {
    m.phase = 'countdown';
    m.count = 3.2;
    m.shown = 4;
    G.controlLocked = true;
  }

  // ---------- starting each mode ----------
  function startFree(atSpawn = true) {
    clear();
    m = { kind: 'free' };
    if (atSpawn) { const s = G.PLACES.spawn; G.activate(garageVehicle(), s.x, s.z, s.yaw); G.cam.snapTo(pos()); }
  }

  // opts (used by the daily challenge): { vehicle, rain, time, daily }
  function startRun(id, opts = {}) {
    clear();
    const ev = RUNS.find((r) => r.id === id);
    // on a rally stage, line up along the road, not towards a checkpoint that may be round a bend
    G.activate(opts.vehicle ?? garageVehicle(), ev.start[0], ev.start[1], yawTo(ev.start, ev.rally ? ev.rally.road.line[6] : ev.checkpoints[0]));
    // set the scene: night runs are dark with the map switched off
    const time = ev.night ? 1 : opts.time;
    if (time !== undefined) { G.weather.setTime(time); sceneSet.time = true; }
    if (opts.rain) { G.weather.setRain(true); G.weather.state.rain = 1; sceneSet.rain = true; }
    if (ev.night) { document.body.classList.add('no-map'); G.lightsOn = true; }
    G.cam.snapTo(pos());
    const saved = G.save.ghosts[id];
    m = { kind: 'run', ev, cp: 0, t: 0, penalty: 0, rec: [], recTimer: 0, ghost: opts.daily ? null : saved ?? null, splits: [], faults: 0, opts, tipped: false };
    G.vehicleLocked = true;
    showCheckpoints();
    beginCountdown();
  }

  function startDelivery(id) {
    clear();
    const ev = DELIVERIES.find((r) => r.id === id);
    const hauler = G.active.cfg.rack ? G.active : G.car;
    G.activate(hauler, ev.start[0], ev.start[1], ev.start[2]);
    G.cam.snapTo(pos());
    const lug = G.models.get(G.car).luggage;
    if (lug) for (const x of lug) x.visible = false;
    // Three loose crates on the roof rack.
    const { RAPIER, world } = G.phys;
    const p = pos(), q = hauler.body.rotation(), rack = hauler.cfg.rack;
    const crates = rack.slots.map((slot) => {
      const w = rotate(q, { x: slot[0], y: slot[1], z: slot[2] });
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x + w.x, p.y + w.y, p.z + w.z).setRotation(q).setCanSleep(false).setAngularDamping(0.5));
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.25, 0.25, 0.25).setDensity(70).setFriction(1.3).setRestitution(0), body);
      const mesh = new THREE.Mesh(CUBE, crateMat);
      mesh.scale.setScalar(0.5);
      mesh.castShadow = true;
      G.scene.add(mesh);
      return { body, mesh, on: true };
    });
    m = { kind: 'delivery', ev, t: 0, crates, lostTime: 0 };
    G.vehicleLocked = true;
    G.world3d.set([{ x: ev.to[0], z: ev.to[1], radius: CP_RADIUS, color: 0x7ddc8a }]);
    setMapMarkers([{ x: ev.to[0], z: ev.to[1], big: true, color: '#7ddc8a' }]);
    beginCountdown();
  }

  function startRescue(id) {
    clear();
    const ev = RESCUES.find((r) => r.id === id);
    const tug = G.active.cfg.winch ? G.active : G.car;
    G.activate(tug, ev.start[0], ev.start[1], yawTo(ev.start, ev.at));
    G.cam.snapTo(pos());
    // the stranded buggy: a plain heavy box as far as the physics cares
    const { RAPIER, world } = G.phys;
    const y = G.terrain.heightAt(ev.at[0], ev.at[1]) + 0.6;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(ev.at[0], y, ev.at[1]).setRotation({ x: 0, y: 0.38, z: 0, w: 0.92 }).setLinearDamping(0.3).setAngularDamping(3).setCanSleep(false));
    world.createCollider(RAPIER.ColliderDesc.roundCuboid(0.55, 0.2, 1.2, 0.2).setDensity(260).setFriction(0.15).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min), body);
    const mesh = new THREE.Group();
    const part = (x, yy, z, w, h, d, c) => { const b = new THREE.Mesh(CUBE, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })); b.position.set(x, yy, z); b.scale.set(w, h, d); b.castShadow = true; mesh.add(b); };
    part(0, 0, 0, 1.5, 0.45, 2.8, 0x3f7fb0); part(0, 0.5, -0.3, 1.3, 0.08, 1.4, 0x22262b); part(0, 0.3, 0.9, 1.3, 0.2, 0.7, 0x3f7fb0);
    for (const [sx, sz] of [[-0.6, 0.4], [0.6, 0.4], [-0.6, -1.0], [0.6, -1.0]]) part(sx, 0.25, sz, 0.07, 0.55, 0.07, 0x22262b);
    for (const [sx, sz] of [[-0.85, 1.0], [0.85, 1.0], [-0.85, -1.0], [0.85, -1.0]]) part(sx, -0.25, sz, 0.3, 0.7, 0.7, 0x1c1c1f);
    G.scene.add(mesh);
    G.winchTargets = [{ body, name: 'the buggy' }];
    m = { kind: 'rescue', ev, t: 0, penalty: 0, stage: 'reach', stranded: { body, mesh } };
    G.vehicleLocked = true;
    G.world3d.set([{ x: ev.at[0], z: ev.at[1], radius: 9, color: 0x4aa8ff }]);
    setMapMarkers([{ x: ev.at[0], z: ev.at[1], big: true, color: '#4aa8ff' }]);
    beginCountdown();
  }

  function finishRescue() {
    const ev = m.ev, time = m.t + m.penalty, mine = m;
    const medalIndex = ev.medals.findIndex((x) => time <= x);
    const old = G.save.best[ev.id], isBest = !old || time < old.time;
    if (isBest) { G.save.best[ev.id] = { time, medal: MEDALS[medalIndex] ?? null }; G.save.commit(); }
    G.winch.release('');
    G.audio.fanfare();
    G.objectiveUi.big('RESCUED', 1400);
    m.phase = 'done';
    G.controlLocked = true;
    setTimeout(() => mine === m && G.menus.show('result', {
      title: ev.name, kind: 'rescue', back: 'rescues', id: ev.id, ok: true, medal: MEDALS[medalIndex] ?? null,
      rows: [['Time', formatTime(time)], ['Best', formatTime(isBest ? time : old.time) + (isBest ? '  NEW' : '')], ['Medal times', ev.medals.map(formatTime).join('  /  ')]],
    }), 1500);
  }

  const key = (k) => `<kbd>${k}</kbd>`;
  const TUTORIAL = [
    { text: `Hold ${key('W')} to drive and steer with ${key('A')} ${key('D')}. Follow the arrow to the light.`, target: [-27, -9], keys: ['throttle', 'left', 'right'] },
    { text: `${key('S')} brakes, then reverses. This is the ford, the one shallow place to cross. Hold ${key('Shift')} for a gentle throttle and drive through.`, target: [-31, 11], keys: ['gentle', 'throttle'] },
    { text: `Slippery or soft ground needs all four wheels pulling. Press ${key('F')} for 4WD.`, until: () => G.car.drive.fourWD, keys: ['fourWD'] },
    { text: `Good. Now follow the trail towards the hill.`, target: [-50, 40] },
    { text: `Steep climbs need low range: less speed, far more pull. Press ${key('L')}.`, until: () => G.car.drive.lowRange, keys: ['lowRange'] },
    { text: `Climb to the summit.`, target: [-75, 75] },
    { text: `If one wheel spins and you stop moving, lock the diffs with ${key('2')} (rear) and ${key('1')} (front). Lock both now.`, until: () => G.car.drive.locked[0] && G.car.drive.locked[1], keys: ['lockF', 'lockR'] },
    { text: `Locked diffs make turning hard, so unlock them on firm ground. Press ${key('1')} and ${key('2')} again.`, until: () => !G.car.drive.locked[0] && !G.car.drive.locked[1], keys: ['lockF', 'lockR'] },
    { text: `Stuck or upside down? ${key('R')} recovers you to firm ground. Press ${key('V')} to swap to the bike.`, until: () => G.active !== G.car, keys: ['switch'] },
    { text: `That is everything. The map ${key('M')} shows the trails. Go and explore.`, wait: 5 },
  ];
  function startTutorial() {
    clear();
    const s = G.PLACES.spawn;
    G.activate(G.car, s.x, s.z, s.yaw);
    Object.assign(G.car.drive, { fourWD: false, lowRange: false, locked: [false, false] });
    G.cam.snapTo(pos());
    m = { kind: 'tutorial', step: -1, wait: 0 };
    nextTutorialStep();
  }
  function nextTutorialStep() {
    m.step++;
    const s = TUTORIAL[m.step];
    if (!s) {
      G.save.tutorialDone = true; G.save.commit();
      G.audio.fanfare();
      startFree(false);
      return;
    }
    if (m.step > 0) G.audio.chime();
    m.wait = s.wait ?? 0;
    G.objective = { title: `First drive, step ${m.step + 1} of ${TUTORIAL.length}`, detail: s.text, target: s.target ? { x: s.target[0], z: s.target[1] } : null, keys: s.keys };
    G.world3d.set(s.target ? [{ x: s.target[0], z: s.target[1], radius: CP_RADIUS }] : []);
    setMapMarkers(s.target ? [{ x: s.target[0], z: s.target[1], big: true }] : []);
  }

  // ---------- finishing ----------
  function finishRun() {
    const time = m.t + m.penalty, id = m.ev.id, faults = m.faults, byFaults = m.ev.scoring === 'faults';
    if (m.opts.daily) return finishDaily(time);
    const medalIndex = byFaults ? [0, 1, 3].findIndex((x) => faults <= x) : m.ev.medals.findIndex((x) => time <= x);
    const old = G.save.best[id];
    const isBest = !old || (byFaults ? faults < (old.faults ?? 99) || (faults === (old.faults ?? 99) && time < old.time) : time < old.time);
    if (isBest) {
      G.save.best[id] = { faults, time, medal: MEDALS[medalIndex] ?? null, splits: m.splits.slice() };
      G.save.ghosts[id] = m.rec.map((x) => +x.toFixed(2));
      G.save.commit();
    }
    G.audio.fanfare();
    G.objectiveUi.big('FINISH', 1400);
    const ev = m.ev, penalty = m.penalty, mine = m;
    // how each checkpoint compared with the previous best run
    const splits = m.splits.map((t, i) => {
      const was = old?.splits?.[i];
      const diff = was === undefined ? '' : ` <span class="${t <= was ? 'up' : 'down'}">${t <= was ? '−' : '+'}${Math.abs(t - was).toFixed(1)}</span>`;
      return [`Checkpoint ${i + 1}`, formatTime(t) + diff];
    });
    const path = m.rec.slice(), ghostPath = m.ghost;
    m.phase = 'done';
    G.controlLocked = true;
    setTimeout(() => mine === m && G.menus.show('result', {
      title: ev.name, kind: 'run', id, ok: true, splits, path, ghostPath,
      rows: [byFaults ? ['Faults', `${faults}`] : null, ['Time', formatTime(time)], penalty ? ['Recovery penalties', `+${penalty} s`] : null, ['Best', formatTime(isBest ? time : old.time) + (isBest ? '  NEW' : '')],
        byFaults ? ['Medals', '0 faults / 1 / up to 3'] : ['Medal times', ev.medals.map(formatTime).join('  /  ')]].filter(Boolean),
      medal: MEDALS[medalIndex] ?? null,
    }), 1500);
  }

  function finishDaily(time) {
    const share = G.daily.finish(time), ev = m.ev, mine = m, path = m.rec.slice();
    G.audio.fanfare();
    G.objectiveUi.big('FINISH', 1400);
    m.phase = 'done';
    G.controlLocked = true;
    setTimeout(() => mine === m && G.menus.show('result', {
      title: `Daily challenge: ${ev.name}`, kind: 'daily', back: 'title', ok: true, path, share,
      rows: [['Time', formatTime(time)], ['Best today', formatTime(G.daily.best)]],
    }), 1500);
  }

  function finishDelivery(failed) {
    const ev = m.ev, n = m.crates.filter((c) => c.on).length, total = m.crates.length, time = m.t;
    let medal = null;
    if (!failed && n > 0) medal = n === total ? (time <= ev.par ? 'gold' : 'silver') : 'bronze';
    const rank = (x) => (x ? 3 - MEDALS.indexOf(x) : 0);
    const old = G.save.best[ev.id];
    if (medal && (!old || rank(medal) > rank(old.medal) || (rank(medal) === rank(old.medal) && time < old.time))) {
      G.save.best[ev.id] = { time, medal }; G.save.commit();
    }
    if (medal) G.audio.fanfare(); else G.audio.fail();
    G.objectiveUi.big(medal ? 'DELIVERED' : 'CARGO LOST', 1400);
    m.phase = 'done';
    G.controlLocked = true;
    const mine = m;
    setTimeout(() => mine === m && G.menus.show('result', {
      title: ev.name, kind: 'delivery', id: ev.id, ok: !!medal, medal,
      rows: [['Crates delivered', `${n} / ${total}`], ['Time', formatTime(time)], ['Gold needs', `all crates in ${formatTime(ev.par)}`]],
    }), 1500);
  }

  // ---------- every physics step ----------
  function step(dt) {
    if (m.phase === 'countdown') {
      m.count -= dt;
      const n = Math.ceil(m.count);
      if (n !== m.shown && n >= 0) {
        m.shown = n;
        if (n > 0 && n <= 3) { G.objectiveUi.big(String(n), 800); G.audio.beep(false); }
        if (n === 0) { G.objectiveUi.big('GO', 800); G.audio.beep(true); m.phase = 'go'; G.controlLocked = false; }
      }
      return;
    }
    if (m.phase === 'done') return;

    if (m.kind === 'run') {
      m.t += dt;
      // a rollover counts as a fault (once, until you are back on your wheels)
      const upY = rotate(G.active.body.rotation(), { x: 0, y: 1, z: 0 }).y;
      if (upY < 0.2 && !m.tipped) { m.tipped = true; m.faults++; if (m.ev.scoring === 'faults') G.toast('ROLLOVER: FAULT'); }
      if (upY > 0.8) m.tipped = false;
      // remember where we were ten times a second, for the ghost of this run
      m.recTimer -= dt;
      if (m.recTimer <= 0 && m.rec.length < 4 * 3000) {
        m.recTimer += 0.1;
        const p = pos();
        m.rec.push(p.x, p.y, p.z, G.active.yaw());
      }
      if (dist(m.ev.checkpoints[m.cp]) < (m.ev.rally ? 9 : CP_RADIUS)) {
        m.cp++;
        m.splits.push(m.t + m.penalty); // time at each checkpoint, for the results screen
        if (m.cp >= m.ev.checkpoints.length) return finishRun();
        G.audio.chime();
        showCheckpoints();
      }
    } else if (m.kind === 'delivery') {
      m.t += dt;
      const v = G.active, p = pos(), q = v.body.rotation(), inv = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
      for (const c of m.crates) {
        if (!c.on) continue;
        const t = c.body.translation();
        const l = rotate(inv, { x: t.x - p.x, y: t.y - p.y, z: t.z - p.z });
        const b = v.cfg.rack.bounds;
        if (Math.abs(l.x) > b[0] || l.z < b[1] || l.z > b[2] || l.y < b[3] || l.y > b[4]) {
          c.on = false;
          G.toast('CRATE LOST');
          G.audio.fail();
        }
      }
      const left = m.crates.filter((c) => c.on).length;
      if (left === 0) { m.lostTime += dt; if (m.lostTime > 1.5) return finishDelivery(true); }
      if (dist(m.ev.to) < CP_RADIUS && Math.abs(v.speed) < 2.5) return finishDelivery(false);
    } else if (m.kind === 'rescue') {
      m.t += dt;
      const b = m.stranded.body.translation();
      if (m.stage === 'reach' && dist(m.ev.at) < 16) {
        m.stage = 'tow';
        G.audio.chime();
        G.world3d.set([{ x: m.ev.to[0], z: m.ev.to[1], radius: 7, color: 0x7ddc8a }]);
        setMapMarkers([{ x: m.ev.to[0], z: m.ev.to[1], big: true, color: '#7ddc8a' }]);
      }
      if (m.stage === 'tow' && Math.hypot(b.x - m.ev.to[0], b.z - m.ev.to[1]) < 7) return finishRescue();
    } else if (m.kind === 'tutorial') {
      const s = TUTORIAL[m.step];
      if (s.target && dist(s.target) < CP_RADIUS) nextTutorialStep();
      else if (s.until && s.until()) nextTutorialStep();
      else if (s.wait) { m.wait -= dt; if (m.wait <= 0) nextTutorialStep(); }
    }
  }

  // Rally stages: how far along the road are we, and which corner is coming up?
  function nextNote() {
    const { road, notes } = m.ev.rally, p = pos(), line = road.line;
    // look for the nearest point of the road, starting from where we were last time
    let best = Infinity, bi = m.roadAt ?? 0;
    for (let i = Math.max(0, (m.roadAt ?? 0) - 6); i < Math.min(line.length, (m.roadAt ?? 0) + 30); i++) {
      const d = (line[i][0] - p.x) ** 2 + (line[i][1] - p.z) ** 2;
      if (d < best) { best = d; bi = i; }
    }
    m.roadAt = bi;
    const here = road.dist[bi], warn = Math.max(34, Math.abs(G.active.speed) * 2.6);
    const n = notes.find((x) => x.end > here && x.at - here < warn);
    return n ? { ...n, in: Math.max(0, Math.round((n.at - here) / 10) * 10) } : null;
  }

  // ---------- every frame ----------
  function update() {
    if (m.crates) for (const c of m.crates) {
      const t = c.body.translation(), q = c.body.rotation();
      c.mesh.position.set(t.x, t.y, t.z);
      c.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
    if (m.kind === 'run') {
      const cps = m.ev.checkpoints, i = Math.min(m.cp, cps.length - 1);
      G.objective = {
        title: m.ev.name, detail: `Checkpoint ${Math.min(m.cp + 1, cps.length)} / ${cps.length}${m.ev.scoring === 'faults' ? `. Faults: <b>${m.faults}</b>` : ''}`,
        time: formatTime(m.t + m.penalty), target: { x: cps[i][0], z: cps[i][1] },
      };
      if (m.ev.rally) G.objective.note = nextNote();
      // the ghost of the best run drives alongside
      const g = m.ghost, k = m.t / 0.1, a = Math.floor(k) * 4;
      ghost.visible = !!g && m.phase === 'go' && a + 7 < g.length;
      if (ghost.visible) {
        const f = k - Math.floor(k);
        ghost.position.set(g[a] + (g[a + 4] - g[a]) * f, g[a + 1] + (g[a + 5] - g[a + 1]) * f, g[a + 2] + (g[a + 6] - g[a + 2]) * f);
        ghost.rotation.y = g[a + 3] + Math.atan2(Math.sin(g[a + 7] - g[a + 3]), Math.cos(g[a + 7] - g[a + 3])) * f;
      }
    } else if (m.kind === 'rescue') {
      const b = m.stranded.body.translation(), q = m.stranded.body.rotation();
      m.stranded.mesh.position.set(b.x, b.y, b.z);
      m.stranded.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      const hooked = G.winch.towing === m.stranded.body;
      G.objective = {
        title: m.ev.name, time: formatTime(m.t + m.penalty),
        detail: m.stage === 'reach' ? 'Find the stranded buggy.' : hooked ? 'Stop on firm ground and the winch drags it to you. Then tow it into the green ring.' : `Hook the buggy: press <kbd>${G.keymap.label('winch')}</kbd> near it.`,
        target: m.stage === 'reach' || !hooked ? { x: b.x, z: b.z } : { x: m.ev.to[0], z: m.ev.to[1] },
      };
    } else if (m.kind === 'delivery') {
      const left = m.crates.filter((c) => c.on).length;
      G.objective = {
        title: m.ev.name, detail: `Crates on the rack: <b>${left} / ${m.crates.length}</b>. Stop inside the green ring.`,
        time: formatTime(m.t), target: { x: m.ev.to[0], z: m.ev.to[1] },
      };
    }
  }

  // Using recovery during a timed run costs time.
  G.onRecover = (moved, towed) => {
    if (m.kind === 'run' && m.ev.scoring === 'faults' && m.phase === 'go') { m.faults++; G.toast('RECOVERY: FAULT'); return; }
    if ((m.kind === 'run' || m.kind === 'rescue') && m.phase === 'go') { m.penalty += towed ? 20 : 5; G.toast(towed ? 'TOWED  +20 s' : 'RECOVERED  +5 s'); }
  };

  return {
    step, update, startFree, startRun, startDelivery, startTutorial, startRescue,
    restart() {
      if (m.kind === 'run') startRun(m.ev.id, m.opts);
      else if (m.kind === 'delivery') startDelivery(m.ev.id);
      else if (m.kind === 'rescue') startRescue(m.ev.id);
      else if (m.kind === 'tutorial') startTutorial();
    },
    quit() { startFree(false); },
    get kind() { return m.kind; },
    get current() { return m; },
  };
}
