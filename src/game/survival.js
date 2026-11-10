// Wear and tear: hard knocks damage the vehicle, driving burns fuel, and
// letting air out of the tyres trades speed for grip. The village workshop
// fixes and refuels. All of this can be switched off in Settings ("Realism").

import * as THREE from 'three';
import { Y, rotate } from '../physics/vec.js';

const KNOCK = 1.3; // a change in speed bigger than this (m/s) within one physics step is a crash
import { MAP } from '../world/maps/index.js';
const WORKSHOP = MAP.workshop ?? { x: 6, z: -1 };

export function createSurvival(G) {
  for (const v of G.vehicles) { v.health = 100; v.fuel = 100; v.airedDown = false; }
  const last = new WeakMap();
  let warned = {}, smokeTimer = 0, fixTimer = 0;

  // A green beacon marks the workshop.
  const sign = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3, 0.25), new THREE.MeshStandardMaterial({ color: 0x3a2a1e }));
  post.position.y = 1.5;
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x7ddc8a, toneMapped: false });
  lampMat.color.multiplyScalar(2.2);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.2), lampMat);
  lamp.position.y = 3;
  sign.add(post, lamp);
  sign.position.set(WORKSHOP.x + 3, G.terrain.heightAt(WORKSHOP.x + 3, WORKSHOP.z), WORKSHOP.z);
  G.scene.add(sign);
  G.markers.push({ x: WORKSHOP.x, z: WORKSHOP.z, color: '#7ddc8a' });

  const on = () => G.save.settings.realism;
  function refill(v, wash = true) { v.health = 100; v.fuel = 100; warned = {}; apply(v); if (wash) G.onRepair?.(v); }
  function apply(v) {
    const dead = on() && (v.health <= 0 || v.fuel <= 0);
    v.engineDead = dead;
    v.drive.powerScale = !on() ? 1 : dead ? 0 : v.health < 30 ? 0.55 : v.health < 60 ? 0.8 : 1;
  }

  function step(dt) {
    const v = G.active;
    const lv = v.body.linvel();
    const prev = last.get(v);
    last.set(v, { x: lv.x, y: lv.y, z: lv.z });
    if (!on() || G.controlLocked) { apply(v); return; }
    if (v.justPlaced) { v.justPlaced = false; return; }

    // knocks
    if (prev) {
      const dv = Math.hypot(lv.x - prev.x, lv.y - prev.y, lv.z - prev.z);
      if (dv > KNOCK) {
        const hurt = (dv - KNOCK) * 5 * (v.armour ?? 1); // a bull bar takes some of the knock
        v.health = Math.max(0, v.health - hurt);
        if (hurt > 6) { G.audio.thump(1); G.toast(`IMPACT  −${Math.round(hurt)}%`); G.onImpact?.(v, hurt); }
      }
    }
    // lying upside down, or drowning the engine
    if (rotate(v.body.rotation(), Y).y < 0) v.health = Math.max(0, v.health - 5 * dt);
    if (v.submerged > 0.85 && !v.snorkel) v.health = Math.max(0, v.health - 3 * dt);

    // fuel
    const d = v.drive;
    v.fuel = Math.max(0, v.fuel - (0.015 + 0.2 * d.throttle * (d.rpm / d.cfg.redline)) * dt * (v.cfg.thirst ?? 1));
    apply(v);

    const say = (k, text) => { if (!warned[k]) { warned[k] = true; G.hints.show(text, 6); } };
    if (v.fuel <= 0) say('empty', 'Out of fuel. Press the recover key to be towed back to the village workshop.');
    else if (v.fuel < 15) say('fuel', 'Fuel is low. The workshop in the village (green light, green dot on the map) refuels you.');
    if (v.health <= 0) say('dead', 'The engine has given up. Press the recover key to be towed to the workshop.');
    else if (v.health < 30) say('hurt', 'Badly damaged: the engine is down on power. Stop at the village workshop for repairs.');
  }

  function update(dt) {
    const v = G.active;
    // smoke from a hurt engine
    smokeTimer -= dt;
    if (on() && v.health < 30 && smokeTimer <= 0 && !G.paused) {
      smokeTimer = 0.08;
      const p = v.body.translation();
      G.effects.puff(p.x, p.y + 0.6, p.z, 0x2a2a2a);
    }
    // stopping at the workshop repairs and refuels
    const p = v.body.translation();
    if (on() && Math.hypot(p.x - WORKSHOP.x, p.z - WORKSHOP.z) < 6 && Math.abs(v.speed) < 1.5 && (v.health < 100 || v.fuel < 99)) {
      v.health = Math.min(100, v.health + 30 * dt);
      v.fuel = Math.min(100, v.fuel + 30 * dt);
      fixTimer += dt;
      if (v.health >= 100 && v.fuel >= 99 && fixTimer > 0.5) { fixTimer = 0; warned = {}; G.onRepair?.(v); G.toast('REPAIRED AND REFUELLED'); G.audio.chime(); }
    }
  }

  // Returns true if the vehicle had to be towed (engine dead).
  function towIfDead() {
    const v = G.active;
    if (!v.engineDead) return false;
    v.place(WORKSHOP.x, WORKSHOP.z, v.yaw(), 0.4);
    refill(v);
    G.cam.snapTo(v.body.translation());
    G.toast('TOWED TO THE WORKSHOP');
    return true;
  }

  return {
    step, update, refill, towIfDead, WORKSHOP,
    refillAll() { for (const v of G.vehicles) refill(v); },
    toggleTyres() {
      const v = G.active;
      v.airedDown = !v.airedDown;
      G.toast(v.airedDown ? 'TYRES AIRED DOWN: MORE GRIP, LESS SPEED' : 'TYRES PUMPED UP');
    },
    onKey(code, action) { if (action === 'tyres' && !G.paused) { this.toggleTyres(); return true; } return false; },
  };
}
