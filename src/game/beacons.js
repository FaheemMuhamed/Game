// Exploration: ten old lanterns hidden away from the trails. Drive up to one
// to light it. Found lanterns stay lit and are remembered between sessions.

import * as THREE from 'three';
import { findSafeSpot } from './recover.js';

import { MAP } from '../world/maps/index.js';
const SPOTS = MAP.beacons ?? [[-92, 18], [-22, -92], [42, -100], [150, -40], [88, 48], [24, 58], [-18, 120], [-150, 40], [150, 140], [-148, -140], [-150, 150], [30, -150]];
const CUBE = new THREE.BoxGeometry(1, 1, 1);

export function createBeacons(G) {
  const stone = new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 1 });
  const litMat = new THREE.MeshBasicMaterial({ color: 0x4aa8ff, toneMapped: false });
  litMat.color.multiplyScalar(2.6);
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1b2329, roughness: 0.6 });

  const beacons = SPOTS.map(([sx, sz], i) => {
    const id = MAP.id === 'valley' ? i : `${MAP.id}-${i}`; // each map keeps its own found list
    const { x, z } = findSafeSpot(G, { x: sx, z: sz });
    const y = G.terrain.heightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const add = (px, py, pz, w, h, d, m) => { const b = new THREE.Mesh(CUBE, m); b.position.set(px, py, pz); b.scale.set(w, h, d); b.castShadow = true; g.add(b); return b; };
    add(0, 0.2, 0, 1.3, 0.5, 1.3, stone);
    add(0, 0.9, 0, 0.5, 1.4, 0.5, stone);
    const lamp = add(0, 1.9, 0, 0.6, 0.6, 0.6, darkMat);
    add(0, 2.3, 0, 0.8, 0.14, 0.8, stone);
    G.scene.add(g);
    const b = { id, x, y, z, lamp, found: false };
    return b;
  });

  function light(b, quiet) {
    b.found = true;
    b.lamp.material = litMat;
    G.props.lanterns.push({ x: b.x, y: b.y + 1.9, z: b.z }); // joins the pool of real lights
    G.markers.push({ x: b.x, z: b.z, color: '#4aa8ff', beacon: true });
    if (quiet) return;
    G.save.beacons.push(b.id);
    G.save.commit();
    const n = beacons.filter((x) => x.found).length;
    G.audio.chime();
    G.toast(n === beacons.length ? 'ALL THE OLD LANTERNS ARE LIT!' : `OLD LANTERN LIT  ${n}/${beacons.length}`);
    if (n === beacons.length) G.audio.fanfare();
  }
  for (const b of beacons) if (G.save.beacons.includes(b.id)) light(b, true);

  let timer = 0;
  function update(dt) {
    timer -= dt;
    if (timer > 0) return;
    timer = 0.2;
    const p = G.active.body.translation();
    for (const b of beacons) if (!b.found && Math.hypot(p.x - b.x, p.z - b.z) < 4.5) light(b);
  }

  return { update, beacons, get found() { return beacons.filter((b) => b.found).length; }, total: beacons.length };
}
