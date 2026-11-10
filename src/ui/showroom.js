// The garage's 3D view: a second, small 3D scene showing the chosen vehicle
// on a block of voxel ground. It turns slowly by itself; drag to spin it.
// It shows the game's actual models, so paint changes appear here and in the world.

import * as THREE from 'three';
import { syncVehicleModel } from '../render/vehicleModels.js';

export const PAINTS = ['#d9a03c', '#c8452c', '#e07b2a', '#3f8fb8', '#7a8f5a', '#2f9f6a', '#7c5aa6', '#e9e4d8', '#2c2f33'];

export function createShowroom(G) {
  const canvas = document.createElement('canvas');
  canvas.className = 'stage-canvas';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2420, 1.3));
  const key = new THREE.DirectionalLight(0xffe2c0, 3.4);
  key.position.set(-5, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  key.shadow.bias = -0.002;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff8a3a, 1.8);
  rim.position.set(5, 3, -6);
  scene.add(rim);

  const turntable = new THREE.Group(); // the plinth and the vehicle turn together
  scene.add(turntable);
  const plinth = new THREE.Group();
  turntable.add(plinth);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const earth = [0x8c6b47, 0x7d5f3f, 0x6b5238, 0x7b7d86, 0x52793a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
  function buildPlinth(radius) {
    plinth.clear();
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let x = -radius; x <= radius; x++) for (let z = -radius; z <= radius; z++) {
      const d = Math.hypot(x, z) / radius;
      if (d > 1 - rnd() * 0.18) continue;
      const h = 0.5 + Math.floor((1 - d) * 3 * rnd()) * 0.25;
      const b = new THREE.Mesh(cube, earth[Math.floor(rnd() * (d > 0.75 ? 5 : 3))]);
      b.scale.set(0.5, h, 0.5);
      b.position.set(x * 0.5, -h / 2 - (d > 0.8 ? 0.25 : 0), z * 0.5);
      b.receiveShadow = true;
      plinth.add(b);
    }
  }

  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  let shown = null, copy = null, span = 5, lookY = 1, spin = -0.75, spinSpeed = 0.25, dragging = false, lastX = 0;

  function show(entry) {
    if (shown === entry) return;
    shown = entry;
    if (copy) turntable.remove(copy);
    const model = G.models.get(entry.vehicle);
    if (entry.vehicle !== G.active) syncVehicleModel(model, entry.vehicle, 1, false); // puts the wheels where they belong
    copy = model.group.clone(true); // shares materials with the real model, so paint changes show here too
    copy.visible = true;
    copy.position.set(0, 0, 0);
    copy.quaternion.identity();
    copy.traverse((o) => { if (o.isLight) o.intensity = 0; });
    const box = new THREE.Box3().setFromObject(copy);
    copy.position.y -= box.min.y;
    const size = box.getSize(new THREE.Vector3());
    span = Math.max(size.x, size.z) * 0.9 + size.y * 0.5;
    lookY = size.y * 0.42;
    buildPlinth(Math.ceil(Math.max(size.x, size.z) * 1.25));
    turntable.add(copy);
  }

  function frame(w, h) {
    const hh = span * 0.62, hw = hh * (w / h);
    // keep the whole vehicle in view on tall, narrow stages too
    const fit = Math.max(1, (span * 0.95) / hw);
    cam.left = -hw * fit; cam.right = hw * fit; cam.top = hh * fit; cam.bottom = -hh * fit;
    cam.position.set(9, 6.5, 9);
    cam.lookAt(0, lookY, 0);
    cam.updateProjectionMatrix();
  }

  // Small still pictures for the vehicle list and the home screen.
  function snapshot(entry) {
    const keep = shown;
    show(entry);
    turntable.rotation.y = -0.75;
    renderer.setPixelRatio(1);
    renderer.setSize(420, 280, false);
    frame(420, 280);
    renderer.render(scene, cam);
    const url = canvas.toDataURL('image/png');
    if (keep) show(keep);
    return url;
  }

  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (dragging) { spin += (e.clientX - lastX) * 0.01; lastX = e.clientX; } });
  canvas.addEventListener('pointerup', () => { dragging = false; });

  function update(dt) {
    if (!canvas.isConnected || !shown) return; // only draw while the garage is on screen
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const pr = Math.min(window.devicePixelRatio, 2);
    if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr)) { renderer.setPixelRatio(pr); renderer.setSize(w, h, false); }
    frame(w, h);
    if (!dragging) spin += spinSpeed * dt;
    turntable.rotation.y = spin;
    renderer.render(scene, cam);
  }

  return { canvas, show, update, snapshot, refresh() { const e = shown; shown = null; if (e) show(e); } };
}

// Paint: change a vehicle's body colour and remember it.
export function createPaint(G) {
  G.save.paint ??= {};
  const base = new Map();
  for (const g of G.garage) {
    const m = G.models.get(g.vehicle);
    base.set(g.id, `#${m.paint.color.getHexString()}`);
    m.paintColor = new THREE.Color(G.save.paint[g.id] ?? base.get(g.id));
    m.paint.color.copy(m.paintColor);
  }
  return {
    of: (id) => G.save.paint[id] ?? base.get(id),
    set(id, hex) {
      const m = G.models.get(G.garage.find((g) => g.id === id).vehicle);
      G.save.paint[id] = hex; G.save.commit();
      m.paintColor.set(hex);
      m.paint.color.copy(m.paintColor);
    },
  };
}
