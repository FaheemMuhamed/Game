// Starts everything and runs the game loop.
//
// `G` is the shared game object: every part of the game (camera, map, sound,
// game modes...) gets handed G and can read or change what is on it.
// Parts that need to run regularly add themselves to G.systems with any of:
//   step(dt)     called every physics step (120 times a second)
//   update(dt)   called every drawn frame
//   onKey(code)  called on a key press; return true to say "handled, stop here"

import '@fontsource-variable/outfit';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import GUI from 'lil-gui';

import { makeTerrain, PLACES, MAP_SIZE, MAP } from './world/world.js';
import { generateProps } from './world/props.js';
import { buildTerrainMesh } from './world/terrainMesh.js';
import { buildWater } from './world/water.js';
import { buildProps } from './world/propMeshes.js';
import { physicsTuning, env } from './world/surfaces.js';
import { createPhysicsWorld, PHYSICS_DT } from './physics/physicsWorld.js';
import { createCar } from './physics/car.js';
import { createBike } from './physics/bike.js';
import { createBuggy, createTruck, createTrials } from './physics/garage.js';
import { createTrailer } from './physics/trailer.js';
import { createGrime } from './game/grime.js';
import { createCamera } from './render/camera.js';
import { createLighting } from './render/lighting.js';
import { createPost } from './render/post.js';
import { createEffects } from './render/effects.js';
import { buildCarModel, buildBikeModel, buildBuggyModel, buildTruckModel, buildTrialsModel, buildTrailerModel, syncVehicleModel } from './render/vehicleModels.js';
import { createHud } from './ui/hud.js';
import { createMinimap } from './ui/minimap.js';
import { createHints } from './ui/hints.js';
import { readDriving, takePresses, createKeymap, keyName, isHeld } from './input.js';
import { createMarkers } from './render/markers.js';
import { createObjective } from './ui/objective.js';
import { createBeacons } from './game/beacons.js';
import { createModes } from './game/modes.js';
import { createMenus } from './ui/menus.js';
import { createGamepad } from './controls/gamepad.js';
import { createTouch } from './controls/touch.js';
import { createPhotoMode } from './ui/photo.js';
import { createWinch } from './game/winch.js';
import { createSurvival } from './game/survival.js';
import { createGauges } from './ui/gauges.js';
import { createWeather } from './render/weather.js';
import { createThumbs } from './ui/thumbs.js';
import { createAmbient } from './render/ambient.js';
import { createTraffic } from './game/traffic.js';
import { createMusic } from './audio/music.js';
import { createDaily } from './game/daily.js';
import { createCustom } from './game/custom.js';
import { createStyle } from './game/style.js';
import { createShowroom, createPaint } from './ui/showroom.js';
import { RUNS, DELIVERIES, RESCUES } from './game/modes.js';
import { loadSave } from './game/save.js';
import { recover } from './game/recover.js';
import { createAudio } from './audio/audio.js';

// ---------- loading screen ----------
// Building the world takes a second or two. Between each stage we update the
// progress bar and give the browser a moment to draw it.
const TIPS = [
  'One wheel spinning and going nowhere? Lock the diffs.',
  'Low range trades speed for pulling power. Use it on steep climbs.',
  'Stuck in deep water? Face a tree on the bank and use the winch.',
  'Soft tyres grip sand and rock better, but cost you speed.',
  'The ford and the log bridge are the only easy ways across the river.',
  'Hard knocks damage the engine. The village workshop repairs and refuels.',
];
document.getElementById('load-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
async function stage(label, fraction) {
  document.getElementById('load-step').textContent = label;
  document.getElementById('load-fill').style.width = `${Math.round(fraction * 100)}%`;
  await new Promise((r) => setTimeout(r, 30));
}

await stage('Starting the physics', 0.05);
await RAPIER.init();

const G = {
  RAPIER, PLACES, MAP,
  save: loadSave(),
  systems: [],
  markers: [], // dots on the minimap: { x, z, color, big }
  input: { throttle: 0, steer: 0, handbrake: false },
  inputOverride: null, // debug helpers and cut-scenes can take the wheel
  controlLocked: false, // true during countdowns and menus
  paused: false,
  lightsOn: true,
  stats: { fps: 0, frameMs: 0 },
};
G.keymap = createKeymap(G.save);

// ---------- world ----------
await stage('Shaping the land', 0.15);
G.terrain = makeTerrain();
await stage('Planting trees and lighting lanterns', 0.4);
G.props = generateProps(G.terrain);
await stage('Making the ground solid', 0.5);
G.phys = createPhysicsWorld(RAPIER, G.terrain, G.props);
await stage('Building the landscape', 0.6);

// ---------- graphics ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
document.body.prepend(renderer.domElement);
G.renderer = renderer;

const scene = new THREE.Scene();
G.scene = scene;
G.terrainMesh = buildTerrainMesh(G.terrain);
scene.add(G.terrainMesh);
G.water = buildWater(G.terrain);
scene.add(G.water);
const propMeshes = buildProps(G.props, G.phys.dynamics);
scene.add(propMeshes.group);

G.cam = createCamera();
G.lighting = createLighting(scene, G.props.lanterns);
G.post = createPost(renderer, scene, G.cam.camera);
G.effects = createEffects(scene);
G.hud = createHud(G);
G.toast = G.hud.toast;

// ---------- vehicles ----------
await stage('Rolling out the vehicles', 0.82);
G.car = createCar(G.phys);
G.bike = createBike(G.phys);
G.buggy = createBuggy(G.phys);
G.truck = createTruck(G.phys);
G.trials = createTrials(G.phys);
G.vehicles = [G.car, G.bike, G.buggy, G.truck, G.trials];
G.models = new Map([
  [G.car, buildCarModel(G.car.cfg)], [G.bike, buildBikeModel(G.bike.cfg)], [G.buggy, buildBuggyModel(G.buggy.cfg)],
  [G.truck, buildTruckModel(G.truck.cfg)], [G.trials, buildTrialsModel(G.trials.cfg)],
]);
for (const m of G.models.values()) scene.add(m.group);
G.active = G.car;

// The trailer: press the hitch key behind... well, anywhere, and it couples on behind the 4x4 or the truck.
G.trailer = createTrailer(G.phys);
G.trailerModel = buildTrailerModel(G.trailer.vehicle.cfg);
G.trailerModel.group.visible = false;
scene.add(G.trailerModel.group);
G.systems.push({
  step: (dt) => G.trailer.step(dt),
  update: () => {
    G.trailerModel.group.visible = G.trailer.vehicle.enabled;
    if (G.trailer.vehicle.enabled) syncVehicleModel(G.trailerModel, G.trailer.vehicle, 1, false);
  },
  onKey(code, action) {
    if (action !== 'hitch' || G.paused) return false;
    const v = G.active;
    if (G.trailer.hitched) { G.trailer.unhitch(); G.toast('TRAILER UNHITCHED'); }
    else if (!v.cfg.winch?.rearHook) G.toast('THIS VEHICLE CANNOT TOW');
    else if (G.vehicleLocked) G.toast('NO TRAILER DURING AN EVENT');
    else { G.trailer.hitch(v); G.toast('TRAILER HITCHED'); }
    return true;
  },
});

function park(vehicle) {
  vehicle.setEnabled(false);
  vehicle.body.setTranslation({ x: 0, y: -200, z: 0 }, false);
  G.models.get(vehicle).group.visible = false;
}
// Put `vehicle` in the world at a spot and make it the one being driven.
G.activate = (vehicle, x, z, yaw) => {
  G.trailer?.unhitch();
  for (const v of G.vehicles) if (v !== vehicle && v.enabled) park(v);
  vehicle.setEnabled(true);
  vehicle.place(x, z, yaw);
  G.models.get(vehicle).group.visible = true;
  G.active = vehicle;
};
for (const v of G.vehicles) park(v);
G.activate(G.car, PLACES.spawn.x, PLACES.spawn.z, PLACES.spawn.yaw);
G.cam.snapTo(G.car.body.translation());

G.switchVehicle = (to) => {
  const from = G.active;
  to ??= G.vehicles[(G.vehicles.indexOf(from) + 1) % G.vehicles.length];
  if (to === from) return;
  const p = from.body.translation(), v = from.body.linvel(), yaw = from.yaw();
  G.winch?.release('');
  G.activate(to, p.x, p.z, yaw);
  to.body.setLinvel({ x: v.x, y: 0, z: v.z }, true);
  G.toast(to.cfg.name.toUpperCase());
};

// ---------- extra systems ----------
G.audio = createAudio(G);
{ // every pop-up message gets a soft blip
  const plain = G.hud.toast;
  G.toast = (text) => { if (!text) return; plain(text); G.audio.blip(); };
}
G.hints = createHints(G);
G.minimap = createMinimap(G);
G.world3d = createMarkers(G);
G.objectiveUi = createObjective(G);
G.beacons = createBeacons(G);
G.modes = createModes(G);
G.menus = createMenus(G);
// The garage: what you can choose to drive, with rough ratings out of 10.
G.garage = [
  { id: 'car', vehicle: G.car, blurb: 'The all-rounder. Four-wheel drive, low range, two locking diffs and a roof rack.', stats: { Speed: 6, Climbing: 8, Agility: 5, Load: 7 } },
  { id: 'bike', vehicle: G.bike, blurb: 'Light and quick. Threads between trees, but hates deep mud and water. Lean back to wheelie.', stats: { Speed: 8, Climbing: 6, Agility: 9, Load: 1 } },
  { id: 'buggy', vehicle: G.buggy, blurb: 'Featherweight and fast with long, soft suspension. Rear-wheel drive only, no winch.', stats: { Speed: 10, Climbing: 4, Agility: 8, Load: 1 } },
  { id: 'truck', vehicle: G.truck, blurb: 'Nearly four tonnes. Slow, thirsty and unstoppable, with a cargo bed and the strongest winch.', stats: { Speed: 3, Climbing: 9, Agility: 2, Load: 10 } },
  { id: 'trials', vehicle: G.trials, blurb: 'A light bike geared very low for picking over rocks and ledges at walking pace.', stats: { Speed: 4, Climbing: 9, Agility: 10, Load: 1 } },
];
G.grime = createGrime(G);
G.systems.push(G.grime);
G.winch = createWinch(G);
G.survival = createSurvival(G);
G.winchHint = 'Properly stuck. Face a tree and press the winch key to pull yourself out, or recover.';
G.ambient = createAmbient(G);
G.traffic = MAP.id === 'valley' ? createTraffic(G) : {}; // only the valley has a ranger on patrol
G.gauges = createGauges(G);
G.weather = createWeather(G);
G.gamepad = createGamepad(G);
G.touch = createTouch(G);
G.photoMode = createPhotoMode(G);
G.settingsExtra = [{ key: 'manualGears', label: 'Manual gears', note: 'you change gear yourself' }, { key: 'realism', label: 'Damage and fuel', note: 'crashes hurt, fuel runs out, the workshop fixes both' }];
G.settingsHooks = [(s) => { for (const v of G.vehicles) v.drive.manual = s.manualGears; }];
// Keyboard, controller and touch are all read; whichever is being used wins.
G.readInput = () => {
  const k = readDriving(G.keymap), p = G.gamepad.state, t = G.touch.state;
  const pick = (a, b, c) => [a, b, c].reduce((best, v) => (Math.abs(v) > Math.abs(best) ? v : best), 0);
  return { throttle: pick(k.throttle, p.throttle, t.throttle), steer: pick(k.steer, p.steer, t.steer), handbrake: k.handbrake || p.handbrake || t.handbrake };
};
G.custom = createCustom(G);
G.style = createStyle(G);
G.systems.push(G.style);
G.music = createMusic(G);
G.daily = createDaily(G);
G.homeExtra = () => [G.daily.tile()];
G.systems.push(G.music, G.weather, G.ambient, G.traffic, G.gauges, G.photoMode, G.gamepad, G.minimap, G.menus, G.winch, G.survival, G.audio, G.hints, G.world3d, G.beacons, G.modes, G.objectiveUi);

// Apply what is chosen in Settings.
G.applySettings = () => {
  const s = G.save.settings;
  G.audio.setVolume(s.volume);
  G.cam.setFollow(s.followCam);
  const q = { low: [1, false, 0], medium: [1.25, true, 2.0], high: [1.5, true, 2.4] }[s.quality] ?? [1.5, true, 2.4];
  G.pixelRatioCap = q[0];
  G.lighting.moon.castShadow = q[1];
  for (const m of G.models.values()) if (m.lights[0].shadow) m.lights[0].castShadow = q[1] && m.shadowLight;
  G.post.settings.blur = q[2];
  G.resize?.();
  for (const f of G.settingsHooks ?? []) f(s);
};

// ---------- one-off key presses ----------
// Each key press is first offered to every system (menus, map, game modes...).
// If none of them wants it, it is a driving control.
function handleKey(code) {
  const action = G.keymap.actionOf(code);
  for (const s of G.systems) if (s.onKey?.(code, action)) return;
  if (G.paused || !action) { if (code === 'Backquote' && !G.paused) gui.show(gui._hidden); return; }
  const d = G.active.drive, isCar = d.cfg.axles.length > 1;
  switch (action) {
    case 'fourWD': if (isCar) { d.fourWD = !d.fourWD; G.toast(d.fourWD ? '4WD' : '2WD (REAR)'); } break;
    case 'lowRange': if (isCar && d.cfg.lowRatio > 1) { d.lowRange = !d.lowRange; G.toast(d.lowRange ? 'LOW RANGE' : 'HIGH RANGE'); } break;
    case 'lockF': if (isCar && d.cfg.canLock !== false) { d.locked[0] = !d.locked[0]; G.toast(`FRONT DIFF ${d.locked[0] ? 'LOCKED' : 'OPEN'}`); } break;
    case 'lockR': if (isCar && d.cfg.canLock !== false) { d.locked[1] = !d.locked[1]; G.toast(`REAR DIFF ${d.locked[1] ? 'LOCKED' : 'OPEN'}`); } break;
    case 'switch': if (!G.vehicleLocked) G.switchVehicle(); else G.toast('NO SWAPPING DURING AN EVENT'); break;
    case 'recover': {
      G.winch.release('');
      if (G.survival.towIfDead()) { G.onRecover?.(99, true); break; }
      const moved = recover(G);
      G.trailer.snapBehind(); // bring the trailer along if one is hitched
      G.toast(moved > 1 ? 'RECOVERED TO FIRM GROUND' : 'RESET');
      G.onRecover?.(moved);
      break;
    }
    case 'camLeft': case 'camRight': if (G.cam.follow) G.toast('CAMERA IS IN FOLLOW MODE'); break; // otherwise: hold to turn (see draw)
    case 'camMode':
      G.save.settings.followCam = !G.cam.follow; G.save.commit();
      G.cam.setFollow(!G.cam.follow);
      G.toast(G.cam.follow ? 'CAMERA: FOLLOW' : 'CAMERA: FIXED');
      break;
    case 'lights': G.lightsOn = !G.lightsOn; break;
    case 'gearUp': case 'gearDown':
      if (d.manual) d.shift(action === 'gearUp' ? 1 : -1, Math.abs(G.active.speed)); else G.toast('TURN ON MANUAL GEARS IN SETTINGS');
      break;
    case 'help': G.hud.toggleHelp(); break;
  }
}
// The controls list on screen is built from the current key bindings.
G.renderHelp = () => {
  const skip = new Set(['brake', 'left', 'right']);
  const rows = G.keymap.actions.filter((x) => !skip.has(x.id)).map((x) => {
    const k = x.id === 'throttle' ? ['throttle', 'left', 'brake', 'right'].map((i) => G.keymap.label(i)).join(' ') : G.keymap.label(x.id);
    return `<div><kbd>${k}</kbd>${x.id === 'throttle' ? 'drive / steer' : x.label.toLowerCase()}</div>`;
  });
  rows.push('<div><kbd>Scroll</kbd>zoom</div>', '<div><kbd>Esc</kbd>pause / menu</div>', `<div><kbd>${keyName('Backquote')}</kbd>tuning panel</div>`);
  document.getElementById('help-list').innerHTML = rows.join('');
};
G.keymap.onChange = G.renderHelp;
G.renderHelp();
G.handleKey = handleKey;
window.addEventListener('wheel', (e) => G.cam.zoomBy(e.deltaY > 0 ? 1.1 : 1 / 1.1), { passive: true });

// ---------- physics step ----------
const NO_INPUT = { throttle: 0, steer: 0, handbrake: true };
function stepPhysics() {
  const input = G.inputOverride ?? (G.controlLocked ? NO_INPUT : G.readInput ? G.readInput() : readDriving(G.keymap));
  G.input = input;
  // bikes: the rider can shift their weight
  if (G.active.cfg.canLean) {
    G.active.shift = G.controlLocked ? 0 : Math.max(-1, Math.min(1, (G.keymap.down('leanBack') ? 1 : 0) - (G.keymap.down('leanFwd') ? 1 : 0) + G.gamepad.state.lean));
  }
  G.active.step(PHYSICS_DT, input);
  for (const s of G.systems) s.step?.(PHYSICS_DT);
  G.phys.world.step();
  G.effects.emitFromVehicle(G.active, PHYSICS_DT);

  // Safety nets: fell off the world, or the bike has been lying down for a while.
  const p = G.active.body.translation();
  if (p.y < -30 || Math.abs(p.x) > MAP_SIZE / 2 + 5 || Math.abs(p.z) > MAP_SIZE / 2 + 5) {
    G.active.place(PLACES.spawn.x, PLACES.spawn.z, PLACES.spawn.yaw);
  }
  if (G.active.crashed) { G.active.reset(); G.toast('CRASHED'); G.onCrash?.(); }
}

// ---------- tuning panel (press ` to show) ----------
const gui = new GUI({ title: 'Tuning' });
gui.hide();
G.gui = gui;
{
  const p = gui.addFolder('Physics');
  p.add(physicsTuning, 'gripScale', 0.3, 1.6, 0.05).name('grip');
  p.add(G.car, 'suspensionScale', 0.4, 2.5, 0.05).name('car spring stiffness');
  p.add(G.car, 'dampingScale', 0.2, 2.5, 0.05).name('car damping');
  p.add(G.car.drive, 'torqueScale', 0.4, 2.5, 0.05).name('car engine power');
  p.add(G.bike.drive, 'torqueScale', 0.4, 2.5, 0.05).name('bike engine power');
  const l = gui.addFolder('Look');
  l.add(G.post.settings, 'bloom', 0, 2, 0.05);
  l.add(G.post.settings, 'blur', 0, 6, 0.1).name('tilt-shift blur');
  l.add(G.post.settings, 'vignette', 0, 1, 0.05);
  l.add(G.lighting.settings, 'moonPower', 0, 4, 0.05).name('moonlight');
  l.add(G.lighting.settings, 'lanternPower', 0, 200, 1).name('lanterns');
  l.add(renderer, 'toneMappingExposure', 0.3, 3, 0.05).name('exposure');
}

// ---------- resize ----------
G.pixelRatioCap = 1.5;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const pr = Math.min(window.devicePixelRatio, G.pixelRatioCap);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h);
  G.post.resize(w, h, pr);
  G.cam.resize(w, h);
}
G.resize = resize;
window.addEventListener('resize', resize);
resize();

// ---------- game loop ----------
// Physics runs in fixed steps (120 per second) no matter how fast the screen
// refreshes; drawing blends between the last two steps so motion looks smooth.
let last = performance.now(), accumulator = 0;
const vehView = new THREE.Vector3();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  G.stats.frameMs += (dt * 1000 - G.stats.frameMs) * 0.05;
  G.stats.fps = 1000 / Math.max(G.stats.frameMs, 0.001);

  for (const code of takePresses()) handleKey(code);
  if (!G.paused) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= PHYSICS_DT && steps < 12) { stepPhysics(); accumulator -= PHYSICS_DT; steps++; }
    if (steps === 12) accumulator = 0;
  }
  draw(G.paused ? 1 : accumulator / PHYSICS_DT, dt);
}

function draw(alpha, dt) {
  const model = G.models.get(G.active);
  syncVehicleModel(model, G.active, alpha, G.lightsOn);
  propMeshes.update();
  G.terrainMesh.syncRuts();
  G.water.tick(G.paused ? 0 : dt, env.waterLevel);
  // hold the camera keys to swing the view round smoothly
  if (!G.paused && !G.cam.follow) G.cam.quarter += ((G.keymap.down('camRight') ? 1 : 0) - (G.keymap.down('camLeft') ? 1 : 0)) * dt * 1.15;
  if (!G.paused) G.effects.update(dt);
  const focus = G.cam.free ?? model.group.position;
  G.cam.update(dt, focus, G.cam.free ? { x: 0, y: 0, z: 0 } : G.active.body.linvel(), G.active.yaw());
  // Tell the prop shader where the vehicle is on screen, so it can open a window to it.
  vehView.copy(model.group.position).applyMatrix4(G.cam.camera.matrixWorldInverse);
  propMeshes.reveal.uVeh.value.copy(vehView);
  G.lighting.update(dt, G.cam.focus);
  G.hud.update(dt, G.active, G.active.drive.cfg.axles.length > 1);
  for (const s of G.systems) s.update?.(dt);
  G.post.render();
}
G.draw = draw;

// The controls list tucks itself away after a while.
if (!G.save.settings.showHelp) G.hud.toggleHelp(false);
else setTimeout(() => { G.hud.toggleHelp(false); G.save.settings.showHelp = false; G.save.commit(); }, 90000);

G.applySettings();
await stage('Taking pictures for the garage', 0.94);
G.reveal = propMeshes.reveal;
G.paint = createPaint(G);
G.showroom = createShowroom(G);
G.systems.push(G.showroom);
G.thumbs = createThumbs(G);
// Photograph the world for the menu cards: [name, x, z, metres shown, corner to look from]
G.thumbs.shootAll([
  ...(MAP.shots ? Object.entries(MAP.shots).map(([id, s]) => [id, ...s]) : [['free', 2, -4, 44, 0], ['guide', -22, -6, 30, 1], ['runs', -30, 2, 34, 0], ['deliveries', 9, 15, 28, 3], ['rescues', -65, -55, 34, 0]]),
  ...RUNS.map((e) => { const p = e.checkpoints[e.checkpoints.length - 1]; return [e.id, p[0], p[1], e.shotZoom ?? 34, e.shotQuarter ?? 0]; }),
  ...DELIVERIES.map((e) => [e.id, e.to[0], e.to[1], 30, 0]),
  ...RESCUES.map((e) => [e.id, e.at[0], e.at[1], 30, 0]),
  ...(G.extraShots ?? []),
]);
G.menus.show('title');

await stage('Ready', 1);
{
  const el = document.getElementById('loading');
  el.classList.add('done'); // fades out
  setTimeout(() => el.remove(), 600);
}
requestAnimationFrame(frame);

// ---------- debug helpers (open the browser console and type `game`) ----------
window.game = Object.assign(G, {
  teleport(x, z, yaw = 0) { G.active.place(x, z, yaw); G.cam.snapTo(G.active.body.translation()); },
  hold(input) { G.inputOverride = input; },
  // Crude self-driving, for testing events: steers at the current target until the event ends.
  auto(maxSecs, thr = 0.85) {
    let t = 0;
    while (t < maxSecs && G.modes.current.phase === 'go') {
      const m = G.modes.current;
      // on a rally stage, aim a little way down the road instead of straight at the next checkpoint
      const road = m.ev.rally?.road, tgt = road ? road.line[Math.min(road.line.length - 1, (m.roadAt ?? 0) + 3)] : m.kind === 'run' ? m.ev.checkpoints[m.cp] : m.ev.to;
      const p = G.active.body.translation();
      let e = Math.atan2(tgt[0] - p.x, tgt[1] - p.z) - G.active.yaw();
      e = Math.atan2(Math.sin(e), Math.cos(e));
      const d = Math.hypot(tgt[0] - p.x, tgt[1] - p.z), v = G.active.speed;
      let th = thr;
      if (m.kind === 'delivery') th = d < 14 ? (v > 2 ? -0.5 : 0.25) : v > 8 ? 0 : thr;
      else if (road) th = v > 9 || (Math.abs(e) > 0.2 && v > 5) ? -0.3 : thr; // on a stage: keep it slow enough to stay on the road
      else if (Math.abs(e) > 0.5 && v > 8) th = 0;
      G.simulate(0.1, { throttle: th, steer: Math.max(-1, Math.min(1, e * 2.5)), handbrake: false });
      t += 0.1;
    }
    const m = G.modes.current, p = G.active.body.translation();
    return { t: +t.toFixed(1), phase: m.phase, cp: m.cp, time: +(m.t ?? 0).toFixed(1), at: [Math.round(p.x), Math.round(p.z)], crates: m.crates?.filter((c) => c.on).length };
  }, // game.hold({throttle: 1, steer: 0, handbrake: false}); game.hold(null) to release
  // Run the physics for a number of seconds straight away with a fixed input, then draw once.
  simulate(seconds, input = { throttle: 0, steer: 0, handbrake: false }) {
    const before = G.inputOverride;
    G.inputOverride = input;
    for (let i = 0; i < Math.round(seconds / PHYSICS_DT); i++) stepPhysics();
    G.inputOverride = before;
    G.cam.snapTo(G.active.body.translation());
    draw(1, 1 / 60);
    const p = G.active.body.translation();
    return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), speed: +G.active.speed.toFixed(2), gear: G.active.drive.gear };
  },
});
