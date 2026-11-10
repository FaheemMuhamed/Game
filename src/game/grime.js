// Wear you can see: mud builds up on the paintwork and washes off in water,
// and hard knocks leave the body panels crooked until the workshop fixes them.

import * as THREE from 'three';
import { MUD, DIRT, GRASS, env } from '../world/surfaces.js';

const MUD_COLOUR = new THREE.Color(0x4a3a2b);

export function createGrime(G) {
  for (const v of G.vehicles) v.dirt = 0;
  const bent = new Map(); // model -> the panels that have been knocked out of place

  function update(dt) {
    const v = G.active;
    if (!G.paused) {
      let gain = 0, wash = 0;
      for (const w of v.wheels) {
        if (!w.grounded) continue;
        if (w.wet > 0.15) wash += 0.12;
        else if (w.surface === MUD) gain += 0.012 + Math.min(Math.abs(w.slip), 6) * 0.012;
        else if ((w.surface === DIRT || w.surface === GRASS) && env.wetness > 0.3) gain += 0.004;
      }
      if (v.submerged > 0.2) wash += 0.5;
      if ((G.weather?.rain ?? 0) > 0.5) wash += 0.01;
      const moving = Math.min(1, Math.abs(v.speed) / 2 + (gain > 0.05 ? 1 : 0));
      v.dirt = Math.max(0, Math.min(1, v.dirt + (gain * moving - wash) * dt));
    }
    for (const x of G.vehicles) {
      const m = G.models.get(x);
      if (m.paint) m.paint.color.copy(m.paintColor).lerp(MUD_COLOUR, (x.dirt ?? 0) * 0.82);
    }
  }

  // A crash: push a couple of body panels slightly out of line.
  G.onImpact = (v, hurt) => {
    const m = G.models.get(v);
    if (!m.paint) return;
    const panels = m.group.children.filter((o) => o.isMesh && o.material === m.paint);
    const list = bent.get(m) ?? [];
    for (let i = 0; i < Math.min(3, Math.ceil(hurt / 12)); i++) {
      const p = panels[Math.floor(Math.random() * panels.length)];
      if (!p) break;
      if (!list.some((b) => b.mesh === p)) list.push({ mesh: p, pos: p.position.clone(), rot: p.rotation.clone() });
      const k = Math.min(1, hurt / 40);
      p.rotation.x += (Math.random() - 0.5) * 0.09 * k; p.rotation.z += (Math.random() - 0.5) * 0.09 * k; p.rotation.y += (Math.random() - 0.5) * 0.05 * k;
      p.position.y -= Math.random() * 0.03 * k;
    }
    bent.set(m, list);
  };
  // The workshop straightens everything out and washes the vehicle.
  G.onRepair = (v) => {
    const m = G.models.get(v);
    for (const b of bent.get(m) ?? []) { b.mesh.position.copy(b.pos); b.mesh.rotation.copy(b.rot); }
    bent.delete(m);
    v.dirt = 0;
  };

  return { update };
}
