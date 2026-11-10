// Little voxel puffs of dust, mud and spray thrown up by the wheels, and the
// tyre marks left on soft ground.

import * as THREE from 'three';
import { SURFACES, MUD, SAND, GRASS, DIRT, env } from '../world/surfaces.js';

const CUBE = new THREE.BoxGeometry(1, 1, 1);
const MAX_PARTICLES = 500;
const MAX_TRACKS = 3000;

export function createEffects(scene) {
  // ---- particles ----
  const pMesh = new THREE.InstancedMesh(CUBE, new THREE.MeshStandardMaterial({ roughness: 1 }), MAX_PARTICLES);
  pMesh.frustumCulled = false;
  pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(pMesh);
  const parts = Array.from({ length: MAX_PARTICLES }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.1, gravity: 0 }));
  let next = 0;
  const m = new THREE.Matrix4(), c = new THREE.Color(), hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < MAX_PARTICLES; i++) { pMesh.setMatrixAt(i, hidden); pMesh.setColorAt(i, c.setHex(0xffffff)); }

  function spawn(x, y, z, vx, vy, vz, color, size, life, gravity) {
    const p = parts[next];
    Object.assign(p, { x, y, z, vx, vy, vz, size, life, max: life, gravity });
    pMesh.setColorAt(next, c.setHex(color).multiplyScalar(0.8 + Math.random() * 0.4));
    pMesh.instanceColor.needsUpdate = true;
    next = (next + 1) % MAX_PARTICLES;
  }

  // ---- tyre tracks ----
  const tMesh = new THREE.InstancedMesh(CUBE, new THREE.MeshStandardMaterial({ roughness: 1 }), MAX_TRACKS);
  tMesh.frustumCulled = false;
  tMesh.receiveShadow = true;
  scene.add(tMesh);
  for (let i = 0; i < MAX_TRACKS; i++) { tMesh.setMatrixAt(i, hidden); tMesh.setColorAt(i, c.setHex(0x000000)); }
  let nextTrack = 0;
  const lastTrack = new WeakMap();
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), scl = new THREE.Vector3();

  function track(w, width) {
    const last = lastTrack.get(w);
    const p = w.contact;
    if (last && Math.hypot(p.x - last.x, p.z - last.z) < 0.3) return;
    lastTrack.set(w, { x: p.x, z: p.z });
    q.setFromAxisAngle(up, Math.atan2(w.fwdDir.x, w.fwdDir.z));
    pos.set(p.x, p.y + 0.14, p.z); // sits just proud of the stepped voxel tops
    scl.set(width, 0.03, 0.34);
    tMesh.setMatrixAt(nextTrack, m.compose(pos, q, scl));
    tMesh.setColorAt(nextTrack, c.setHex(SURFACES[w.surface].side).multiplyScalar(0.55));
    tMesh.instanceMatrix.needsUpdate = true;
    tMesh.instanceColor.needsUpdate = true;
    nextTrack = (nextTrack + 1) % MAX_TRACKS;
  }

  // Called once per physics step for the vehicle being driven.
  function emitFromVehicle(vehicle, dt) {
    const tyreWidth = vehicle.cfg.track ? 0.3 : 0.14;
    for (const w of vehicle.wheels) {
      if (!w.grounded) continue;
      const slide = Math.abs(w.slip) + Math.abs(w.vLat);
      const rolling = Math.abs(w.vLong);
      const p = w.contact, s = SURFACES[w.surface];
      const soft = s.sink > 0 || w.surface === GRASS || w.surface === DIRT;
      if (soft && p.y > env.waterLevel && rolling + slide > 0.5) track(w, tyreWidth);

      if (w.wet > 0.05) {
        // spray
        if (Math.random() < Math.min(1, (rolling + slide) * 0.12) * dt * 90) {
          spawn(p.x, env.waterLevel + 0.05, p.z, (Math.random() - 0.5) * 2.5, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2.5, 0xa9d4d6, 0.1 + Math.random() * 0.1, 0.6, 9);
        }
        continue;
      }
      // dust / mud roost, thrown backwards from a spinning wheel
      const rate = Math.min(1, slide * 0.14 + Math.max(0, rolling - 7) * 0.03);
      if (Math.random() < rate * dt * 110) {
        const back = -Math.sign(w.slip || 1) * Math.min(Math.abs(w.slip), 6) * 0.5;
        const heavy = w.surface === MUD;
        spawn(
          p.x + (Math.random() - 0.5) * 0.3, p.y + 0.1, p.z + (Math.random() - 0.5) * 0.3,
          w.fwdDir.x * back + (Math.random() - 0.5) * 1.2, 0.8 + Math.random() * (heavy ? 3 : 1.4), w.fwdDir.z * back + (Math.random() - 0.5) * 1.2,
          s.dust, heavy ? 0.1 + Math.random() * 0.1 : 0.14 + Math.random() * 0.16, heavy ? 0.7 : 0.9, heavy ? 9 : 1.2,
        );
      }
    }
  }

  function update(dt) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = parts[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { pMesh.setMatrixAt(i, hidden); continue; }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = p.gravity > 5 ? p.size : p.size * (0.6 + 1.2 * (1 - p.life / p.max)) * Math.min(1, p.life / p.max * 3);
      m.makeScale(k, k, k).setPosition(p.x, p.y, p.z);
      pMesh.setMatrixAt(i, m);
    }
    pMesh.instanceMatrix.needsUpdate = true;
  }

  // a single drifting puff (engine smoke, exhaust)
  const puff = (x, y, z, color) => spawn(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6, 1.2 + Math.random(), (Math.random() - 0.5) * 0.6, color, 0.2 + Math.random() * 0.15, 1.2, 0);
  return { emitFromVehicle, update, puff, spawn };
}
