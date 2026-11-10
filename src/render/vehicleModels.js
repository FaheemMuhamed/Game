// Voxel models of the 4x4 and the bike, built from boxes, plus the code that
// moves them to match the physics every frame.

import * as THREE from 'three';

const CUBE = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...opts }));
  return mats.get(key);
}
// The body colour of one vehicle. Its own material, so paint and dirt can change it without touching anything else.
const paintOf = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 });
function glow(color, power = 3) {
  const m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  m.color.multiplyScalar(power);
  return m;
}
function box(parent, x, y, z, sx, sy, sz, material) {
  const m = new THREE.Mesh(CUBE, typeof material === 'number' ? mat(material) : material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// A chunky wheel. Outer group steers and moves with the suspension; inner group spins.
function makeWheel(radius, width) {
  const outer = new THREE.Group(), inner = new THREE.Group();
  outer.add(inner);
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 12), mat(0x1c1c1f, { roughness: 0.95, flatShading: true }));
  tyre.rotation.z = Math.PI / 2;
  tyre.castShadow = true;
  inner.add(tyre);
  // hub and spokes so you can see it turning
  box(inner, 0, 0, 0, width + 0.04, radius * 0.7, radius * 0.7, 0x8d8f96);
  box(inner, 0, 0, 0, width + 0.02, radius * 1.5, 0.09, 0x55575e);
  box(inner, 0, 0, 0, width + 0.02, 0.09, radius * 1.5, 0x55575e);
  return { outer, inner };
}

function headlight(group, x, y, z) {
  const light = new THREE.SpotLight(0xffe2b0, 0, 60, 0.5, 0.8, 1.1);
  light.position.set(x, y, z);
  light.target.position.set(x * 0.5, y - 0.5, z + 14);
  group.add(light, light.target);
  return light;
}

export function buildCarModel(cfg) {
  const group = new THREE.Group();
  const body = paintOf(0xd9a03c), dark = 0x2b2d31, trim = 0x3b3f45;
  // lower body, bonnet, cabin
  box(group, 0, -0.12, 0, 1.72, 0.5, 4.1, body);
  box(group, 0, 0.2, 1.35, 1.6, 0.22, 1.3, body); // bonnet
  box(group, 0, 0.5, -0.45, 1.62, 0.72, 2.3, body); // cabin
  box(group, 0, 0.56, 0.72, 1.5, 0.5, 0.06, 0x1a2a33, ); // windscreen
  box(group, 0.82, 0.58, -0.45, 0.04, 0.42, 1.9, 0x1a2a33);
  box(group, -0.82, 0.58, -0.45, 0.04, 0.42, 1.9, 0x1a2a33);
  box(group, 0, 0.58, -1.61, 1.4, 0.42, 0.04, 0x1a2a33);
  // roof rack with luggage
  box(group, 0, 0.9, -0.5, 1.5, 0.08, 2.0, dark);
  for (const sx of [-0.78, 0.78]) box(group, sx, 1.12, -0.5, 0.06, 0.36, 2.06, dark);
  for (const sz of [0.53, -1.53]) box(group, 0, 1.12, sz, 1.56, 0.36, 0.06, dark);
  const luggage = [box(group, -0.3, 1.14, -0.9, 0.7, 0.36, 0.7, 0xa67844), box(group, 0.35, 1.08, -0.2, 0.55, 0.24, 0.8, 0x54707a)];
  // bumpers, sills, arches
  box(group, 0, -0.3, 2.12, 1.8, 0.26, 0.2, dark);
  box(group, 0, -0.3, -2.12, 1.8, 0.26, 0.2, dark);
  for (const sx of [-1, 1]) {
    box(group, sx * 0.88, -0.36, 0, 0.1, 0.12, 1.4, trim);
    box(group, sx * 0.9, 0.12, 1.35, 0.14, 0.12, 1.1, trim);
    box(group, sx * 0.9, 0.12, -1.35, 0.14, 0.12, 1.1, trim);
  }
  box(group, 0, 0.3, -2.2, 0.75, 0.75, 0.22, 0x1c1c1f); // spare wheel
  // small details: mirrors, grille, door seams, snorkel, mud flaps, roof lamps, tow hitch
  for (const sx of [-1, 1]) {
    box(group, sx * 0.93, 0.5, 0.62, 0.16, 0.14, 0.1, dark);
    box(group, sx * 0.865, 0.1, -0.45, 0.02, 0.5, 0.04, trim);
    box(group, sx * 0.865, 0.1, 0.5, 0.02, 0.5, 0.04, trim);
    box(group, sx * 0.84, -0.42, -1.85, 0.3, 0.3, 0.04, 0x1c1c1f);
    box(group, sx * 0.84, -0.42, 0.85, 0.3, 0.3, 0.04, 0x1c1c1f);
  }
  for (let i = 0; i < 4; i++) box(group, -0.33 + i * 0.22, 0.02, 2.07, 0.12, 0.2, 0.04, dark);
  box(group, 0.78, 0.55, 1.0, 0.1, 0.9, 0.1, dark); box(group, 0.78, 1.0, 0.95, 0.14, 0.12, 0.2, dark); // snorkel
  for (const sx of [-0.45, -0.15, 0.15, 0.45]) box(group, sx, 0.93, 0.62, 0.2, 0.12, 0.08, glow(0xfff0c8, 1.6));
  box(group, 0, -0.32, -2.3, 0.16, 0.1, 0.24, 0x8d8f96);
  // lamps
  for (const sx of [-0.6, 0.6]) {
    box(group, sx, 0.0, 2.07, 0.3, 0.2, 0.06, glow(0xffe6b8, 2.5));
    box(group, sx, 0.0, -2.07, 0.24, 0.14, 0.06, glow(0xff2a1a, 1.6));
  }
  const lights = [headlight(group, 0, 0.1, 2.1)];
  lights[0].castShadow = true;
  lights[0].shadow.mapSize.set(1024, 1024);
  lights[0].shadow.camera.near = 0.5;
  lights[0].shadow.camera.far = 50;
  lights[0].shadow.bias = -0.002;

  const wheels = cfg.wheels.map((w) => {
    const wheel = makeWheel(w.radius, 0.34);
    group.add(wheel.outer);
    return wheel;
  });
  return { group, wheels, lights, luggage, lightPower: 130, shadowLight: true, paint: body };
}

export function buildBikeModel(cfg, colour = 0xc23a2a) {
  const group = new THREE.Group();
  const red = paintOf(colour), dark = 0x26272b;
  // frame, tank, seat, engine
  box(group, 0, 0.0, 0.0, 0.22, 0.34, 0.9, dark);
  box(group, 0, 0.3, 0.2, 0.3, 0.26, 0.55, red);
  box(group, 0, 0.3, -0.35, 0.26, 0.14, 0.6, 0x1c1c1f);
  box(group, 0, 0.26, -0.75, 0.2, 0.08, 0.4, red); // rear mudguard
  box(group, 0, -0.12, -0.35, 0.1, 0.1, 0.8, 0x777980); // swing arm
  box(group, 0.16, 0.0, -0.45, 0.1, 0.12, 0.7, 0x8d8f96); // exhaust
  // rider
  box(group, 0, 0.72, -0.2, 0.42, 0.62, 0.3, 0x35506b); // torso
  box(group, 0, 1.18, -0.12, 0.3, 0.3, 0.32, 0xe8e2d2); // helmet
  box(group, 0, 1.16, 0.05, 0.24, 0.1, 0.04, 0x1a2a33); // visor
  for (const sx of [-1, 1]) {
    box(group, sx * 0.24, 0.74, 0.12, 0.12, 0.14, 0.6, 0x35506b); // arms
    box(group, sx * 0.2, 0.3, 0.0, 0.14, 0.5, 0.2, 0x3a3a3f); // legs
    box(group, sx * 0.2, 0.02, 0.05, 0.14, 0.1, 0.3, 0x1c1c1f); // boots
  }
  // fork + bars turn with the steering
  const fork = new THREE.Group();
  fork.position.set(0, 0.35, 0.62);
  group.add(fork);
  box(fork, 0, -0.2, 0.08, 0.22, 0.8, 0.1, 0x8d8f96);
  box(fork, 0, 0.26, 0, 0.7, 0.06, 0.06, dark);
  box(fork, 0, 0.12, 0.14, 0.2, 0.2, 0.08, glow(0xffe6b8, 2.5));
  box(fork, 0, -0.1, 0.2, 0.2, 0.06, 0.5, red); // front mudguard
  box(group, 0, 0.2, -0.96, 0.12, 0.08, 0.04, glow(0xff2a1a, 1.6));
  const lights = [headlight(fork, 0, 0.12, 0.2)];

  const wheels = cfg.wheels.map((w) => {
    const wheel = makeWheel(w.radius, 0.14);
    group.add(wheel.outer);
    return wheel;
  });
  return { group, wheels, lights, fork, lightPower: 90, paint: red };
}

const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();

// Move a model to match its physics vehicle. `alpha` blends the last two physics steps.
export function syncVehicleModel(model, vehicle, alpha, lightsOn) {
  const p0 = vehicle.prevPos, p1 = vehicle.body.translation();
  const r0 = vehicle.prevRot, r1 = vehicle.body.rotation();
  model.group.position.set(p0.x + (p1.x - p0.x) * alpha, p0.y + (p1.y - p0.y) * alpha, p0.z + (p1.z - p0.z) * alpha);
  qa.set(r0.x, r0.y, r0.z, r0.w);
  qb.set(r1.x, r1.y, r1.z, r1.w);
  model.group.quaternion.slerpQuaternions(qa, qb, alpha);

  vehicle.wheels.forEach((w, i) => {
    const m = model.wheels[i], c = w.cfg;
    // The wheel hangs below its mount by the current suspension length.
    m.outer.position.set(c.pos.x, c.pos.y - Math.max(w.length, 0), c.pos.z);
    m.outer.rotation.y = w.steer;
    m.inner.rotation.x = w.spin;
  });
  if (model.fork) model.fork.rotation.y = vehicle.steer;
  for (const l of model.lights) l.intensity = lightsOn ? model.lightPower : 0;
}

export function buildBuggyModel(cfg) {
  const group = new THREE.Group();
  const body = paintOf(0x3f8fb8), dark = 0x24272c;
  box(group, 0, 0.0, 0, 1.3, 0.3, 2.9, body); // floor pan
  box(group, 0, 0.2, 1.15, 1.1, 0.25, 0.9, body); // nose
  box(group, 0, 0.3, -1.0, 1.2, 0.5, 0.8, dark); // engine
  box(group, 0, 0.35, -0.1, 0.5, 0.5, 0.5, 0x35506b); // driver
  box(group, 0, 0.75, -0.08, 0.3, 0.3, 0.3, 0xe8e2d2); // helmet
  // roll cage
  for (const sx of [-0.62, 0.62]) {
    box(group, sx, 0.6, 0.45, 0.07, 1.0, 0.07, dark);
    box(group, sx, 0.6, -0.6, 0.07, 1.0, 0.07, dark);
    box(group, sx, 1.1, -0.08, 0.07, 0.07, 1.13, dark);
  }
  box(group, 0, 1.1, 0.45, 1.3, 0.07, 0.07, dark);
  box(group, 0, 1.1, -0.6, 1.3, 0.07, 0.07, dark);
  for (const sx of [-0.4, 0.4]) {
    box(group, sx, 1.2, 0.48, 0.2, 0.14, 0.06, glow(0xffe6b8, 2.5));
    box(group, sx, 0.25, -1.42, 0.2, 0.12, 0.06, glow(0xff2a1a, 1.6));
  }
  const lights = [headlight(group, 0, 1.1, 0.5)];
  const wheels = cfg.wheels.map((w) => { const wheel = makeWheel(w.radius, 0.26); group.add(wheel.outer); return wheel; });
  return { group, wheels, lights, lightPower: 120, paint: body };
}

export function buildTruckModel(cfg) {
  const group = new THREE.Group();
  const body = paintOf(0x7a8f5a), dark = 0x26292d, wood = 0x8a5a36;
  box(group, 0, 0.0, 0, 2.0, 0.5, 5.8, dark); // chassis rails
  box(group, 0, 0.75, 1.75, 2.0, 1.3, 2.0, body); // cab
  box(group, 0, 0.45, 2.75, 1.9, 0.7, 0.5, body); // bonnet
  box(group, 0, 1.0, 2.76, 1.7, 0.5, 0.05, 0x1a2a33); // windscreen
  box(group, 1.01, 1.0, 1.75, 0.04, 0.5, 1.4, 0x1a2a33);
  box(group, -1.01, 1.0, 1.75, 0.04, 0.5, 1.4, 0x1a2a33);
  // cargo bed
  box(group, 0, 0.75, -1.35, 1.96, 0.08, 2.96, wood);
  for (const sx of [-0.98, 0.98]) box(group, sx, 1.05, -1.35, 0.07, 0.6, 2.96, wood);
  box(group, 0, 1.05, 0.12, 1.96, 0.6, 0.07, wood);
  box(group, 0, 1.05, -2.82, 1.96, 0.6, 0.07, wood);
  box(group, 0, -0.15, 3.05, 2.1, 0.35, 0.25, dark); // bumper + winch
  box(group, 0, 0.05, 3.1, 0.5, 0.25, 0.2, 0x8d8f96);
  for (const sx of [-0.7, 0.7]) {
    box(group, sx, 0.4, 3.02, 0.34, 0.24, 0.06, glow(0xffe6b8, 2.5));
    box(group, sx, 0.3, -2.92, 0.26, 0.16, 0.06, glow(0xff2a1a, 1.6));
  }
  for (const sx of [-0.5, 0, 0.5]) box(group, sx, 1.48, 1.9, 0.18, 0.1, 0.1, glow(0xffb040, 2)); // roof marker lamps
  // details: mirrors, grille, exhaust stack, steps, mud flaps
  for (const sx of [-1, 1]) {
    box(group, sx * 1.16, 1.0, 2.45, 0.08, 0.5, 0.2, dark);
    box(group, sx * 1.05, -0.2, 1.75, 0.2, 0.1, 0.9, dark);
    box(group, sx * 1.0, -0.45, -2.7, 0.4, 0.5, 0.05, 0x1c1c1f);
  }
  for (let i = 0; i < 5; i++) box(group, -0.5 + i * 0.25, 0.5, 3.01, 0.14, 0.42, 0.04, dark);
  box(group, 0.82, 1.3, 0.62, 0.14, 1.5, 0.14, 0x8d8f96);
  const lights = [headlight(group, 0, 0.4, 3.05)];
  lights[0].castShadow = true;
  lights[0].shadow.mapSize.set(1024, 1024);
  lights[0].shadow.camera.near = 0.5; lights[0].shadow.camera.far = 50; lights[0].shadow.bias = -0.002;
  const wheels = cfg.wheels.map((w) => { const wheel = makeWheel(w.radius, 0.42); group.add(wheel.outer); return wheel; });
  return { group, wheels, lights, lightPower: 170, shadowLight: true, paint: body };
}

// The trials bike is the dirt bike's model in a different colour.
export const buildTrialsModel = (cfg) => buildBikeModel(cfg, 0x2f9f6a);

export function buildTrailerModel(cfg) {
  const group = new THREE.Group();
  const wood = 0x8a5a36, dark = 0x26292d;
  box(group, 0, 0.2, 0, 1.66, 0.08, 2.56, wood);
  for (const sx of [-0.83, 0.83]) box(group, sx, 0.42, 0, 0.07, 0.44, 2.56, wood);
  for (const sz of [-1.28, 1.28]) box(group, 0, 0.42, sz, 1.66, 0.44, 0.07, wood);
  box(group, 0, 0.05, 0, 1.7, 0.2, 2.6, dark); // frame
  box(group, 0, 0.02, 1.9, 0.14, 0.12, 1.3, dark); // draw bar
  box(group, 0, 0.02, 2.5, 0.2, 0.16, 0.2, 0x8d8f96); // coupling
  for (const sx of [-0.6, 0.6]) box(group, sx, 0.1, -1.32, 0.22, 0.14, 0.05, glow(0xff2a1a, 1.6));
  const wheels = cfg.wheels.map((w) => { const wheel = makeWheel(w.radius, 0.24); group.add(wheel.outer); return wheel; });
  return { group, wheels, lights: [], lightPower: 0 };
}
