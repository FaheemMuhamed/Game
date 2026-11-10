// Small signs of life around the vehicle: fireflies after dark, a flock of
// birds by day, smoke from the hut chimneys, and sheep that scatter when you
// drive at them. None of it affects the driving.

import * as THREE from 'three';
import { env } from '../world/surfaces.js';

const CUBE = new THREE.BoxGeometry(1, 1, 1);

export function createAmbient(G) {
  const { scene, terrain } = G;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p3 = new THREE.Vector3(), s3 = new THREE.Vector3();

  // ---------- fireflies ----------
  const FLIES = 70;
  const flyMat = new THREE.MeshBasicMaterial({ color: 0xd8ff7a, toneMapped: false });
  flyMat.color.multiplyScalar(2.6);
  const flies = new THREE.InstancedMesh(CUBE, flyMat, FLIES);
  flies.frustumCulled = false;
  scene.add(flies);
  const fly = Array.from({ length: FLIES }, () => ({ x: 0, z: 0, h: 1, phase: Math.random() * 20, speed: 0.4 + Math.random() * 0.8, placed: false }));

  // ---------- birds ----------
  const BIRDS = 9;
  const birds = new THREE.InstancedMesh(CUBE, new THREE.MeshBasicMaterial({ color: 0x1b1e22 }), BIRDS * 2);
  birds.frustumCulled = false;
  scene.add(birds);
  const flock = { angle: 0, cx: 0, cz: 0 };

  // ---------- sheep ----------
  const wool = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 1 }), face = new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 1 });
  const sheep = [];
  for (const [cx, cz, n] of G.MAP.herds ?? [[36, 4, 7], [-40, 70, 6], [70, 30, 5]]) {
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const part = (x, y, z, w, h, d, mat) => { const b = new THREE.Mesh(CUBE, mat); b.position.set(x, y, z); b.scale.set(w, h, d); b.castShadow = true; g.add(b); };
      part(0, 0.55, 0, 0.6, 0.5, 0.9, wool); part(0, 0.7, 0.55, 0.32, 0.32, 0.34, face);
      for (const [lx, lz] of [[-0.2, 0.3], [0.2, 0.3], [-0.2, -0.3], [0.2, -0.3]]) part(lx, 0.15, lz, 0.1, 0.3, 0.1, face);
      scene.add(g);
      sheep.push({ g, x: cx + (Math.random() - 0.5) * 16, z: cz + (Math.random() - 0.5) * 16, yaw: Math.random() * 6.28, homeX: cx, homeZ: cz, speed: 0, think: Math.random() * 4, hop: 0 });
    }
  }

  let smokeTimer = 0;

  function update(dt) {
    if (G.paused) return;
    const t = performance.now() / 1000, focus = G.cam.focus;
    const dark = 1 - (G.weather?.daylight ?? 0), rain = G.weather?.rain ?? 0;

    // fireflies: drift near the ground around the camera; gone in daylight and rain
    const showFlies = dark > 0.6 && rain < 0.2;
    flies.visible = showFlies;
    if (showFlies) {
      fly.forEach((f, i) => {
        if (!f.placed || Math.hypot(f.x - focus.x, f.z - focus.z) > 38) {
          const a = Math.random() * 6.28, r = 6 + Math.random() * 30;
          f.x = focus.x + Math.cos(a) * r; f.z = focus.z + Math.sin(a) * r; f.h = 0.5 + Math.random() * 2.2; f.placed = true;
        }
        const x = f.x + Math.sin(t * f.speed + f.phase) * 1.4, z = f.z + Math.cos(t * f.speed * 0.8 + f.phase) * 1.4;
        const y = Math.max(terrain.heightAt(x, z), env.waterLevel) + f.h + Math.sin(t * 1.3 + f.phase) * 0.3;
        const blink = Math.max(0, Math.sin(t * 2.2 * f.speed + f.phase * 3)) > 0.35 ? 0.09 : 0.0001;
        m.makeScale(blink, blink, blink).setPosition(x, y, z);
        flies.setMatrixAt(i, m);
      });
      flies.instanceMatrix.needsUpdate = true;
    }

    // birds: a loose V circling high overhead in the daytime
    const showBirds = dark < 0.6 && rain < 0.4;
    birds.visible = showBirds;
    if (showBirds) {
      flock.angle += dt * 0.12;
      flock.cx += (focus.x - flock.cx) * dt * 0.2; flock.cz += (focus.z - flock.cz) * dt * 0.2;
      const hx = Math.cos(flock.angle), hz = Math.sin(flock.angle);
      for (let i = 0; i < BIRDS; i++) {
        const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
        const bx = flock.cx + hx * 55 - hz * 2 * row * 1 - (-hz * side * row * 1.6) - hz * row * 0, bz = flock.cz + hz * 55 + hx * side * row * 1.6;
        const x = bx + hz * row * 2.2, z = bz - hx * row * 2.2, y = 30 + Math.sin(t * 0.6 + i) * 0.6;
        const flap = Math.sin(t * 7 + i) * 0.5;
        for (const wing of [0, 1]) {
          q.setFromAxisAngle(up, -flock.angle + (wing ? 0.5 : -0.5));
          p3.set(x + (wing ? -hx : hx) * 0.3, y + flap * 0.15, z + (wing ? -hz : hz) * 0.3);
          s3.set(0.75, 0.07, 0.22);
          birds.setMatrixAt(i * 2 + wing, m.compose(p3, q, s3));
        }
      }
      birds.instanceMatrix.needsUpdate = true;
    }

    // chimney smoke from nearby huts
    smokeTimer -= dt;
    if (smokeTimer <= 0) {
      smokeTimer = 0.35;
      for (const h of G.props.chimneys ?? []) {
        if (Math.hypot(h.x - focus.x, h.z - focus.z) < 70) G.effects.spawn(h.x, h.y, h.z, 0.25 + (Math.random() - 0.5) * 0.2, 0.7, (Math.random() - 0.5) * 0.2, 0x8a8f96, 0.22 + Math.random() * 0.14, 3.2, 0);
      }
    }

    // sheep: graze, wander back towards home, and run from the vehicle
    const v = G.active.body.translation();
    for (const s of sheep) {
      const dx = s.x - v.x, dz = s.z - v.z, d = Math.hypot(dx, dz);
      s.think -= dt;
      if (d < 11) { s.yaw = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.4; s.speed = 5.5; s.think = 1.2; }
      else if (s.think <= 0) {
        s.think = 2 + Math.random() * 5;
        const far = Math.hypot(s.x - s.homeX, s.z - s.homeZ) > 14;
        s.yaw = far ? Math.atan2(s.homeX - s.x, s.homeZ - s.z) : Math.random() * 6.28;
        s.speed = Math.random() < 0.55 ? 0 : 0.8;
      }
      const nx = s.x + Math.sin(s.yaw) * s.speed * dt, nz = s.z + Math.cos(s.yaw) * s.speed * dt;
      if (terrain.heightAt(nx, nz) > env.waterLevel + 0.3) { s.x = nx; s.z = nz; } else s.yaw += Math.PI; // do not walk into the river
      s.hop = s.speed > 2 ? Math.abs(Math.sin(t * 14 + s.homeX)) * 0.18 : 0;
      s.g.position.set(s.x, terrain.heightAt(s.x, s.z) + s.hop, s.z);
      s.g.rotation.y = s.yaw;
    }
  }

  return { update };
}
