// Vehicle set-up: tyres, suspension and bolt-on extras. Every choice changes
// how the vehicle actually drives, and each vehicle remembers its own set-up.

import * as THREE from 'three';

export const TYRES = [
  { id: 'road', name: 'Road', note: 'Quick and grippy on hard ground. Poor in mud, sand and snow.', grip: { hard: 1.08, soft: 0.82, cold: 0.8 }, drag: -0.005 },
  { id: 'all', name: 'All-terrain', note: 'A fair grip everywhere. The standard fit.', grip: { hard: 1, soft: 1, cold: 1 }, drag: 0 },
  { id: 'mud', name: 'Mud', note: 'Deep tread that bites into mud, sand and snow. Slower on hard ground.', grip: { hard: 0.95, soft: 1.18, cold: 1.1 }, drag: 0.008 },
  { id: 'winter', name: 'Winter', note: 'Studded. Far more grip on snow and ice, a little vague elsewhere.', grip: { hard: 0.94, soft: 1, cold: 1.4 }, drag: 0.004 },
];
export const SUSPENSION = [
  { id: 'soft', name: 'Soft', note: 'Soaks up rough ground and keeps the wheels down. Leans in corners.', spring: 0.75, damper: 0.8 },
  { id: 'std', name: 'Standard', note: 'The all-round setting.', spring: 1, damper: 1 },
  { id: 'firm', name: 'Firm', note: 'Flat and sharp on a fast stage. Skips over bumps.', spring: 1.4, damper: 1.35 },
];
export const EXTRAS = [
  { id: 'lift', name: 'Lift kit', note: 'Rides 10 cm higher: clears more, but rolls more.' },
  { id: 'bar', name: 'Bull bar', note: 'Crashes do 40% less damage.' },
  { id: 'lights', name: 'Light bar', note: 'Much brighter headlights.' },
  { id: 'snorkel', name: 'Snorkel', note: 'Deep water no longer harms the engine.' },
];
const DEFAULTS = { tyres: 'all', susp: 'std', lift: false, bar: false, lights: false, snorkel: false };
const CUBE = new THREE.BoxGeometry(1, 1, 1);

export function createCustom(G) {
  G.save.custom ??= {};
  const dark = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.6 });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff0c8, toneMapped: false });
  lamp.color.multiplyScalar(2);

  // Bolt-on parts are built once per vehicle, sized from its body, and shown or hidden as chosen.
  for (const g of G.garage) {
    const v = g.vehicle, m = G.models.get(v), four = v.wheels.length === 4;
    v.baseRide = v.cfg.rideHeight;
    for (const w of v.cfg.wheels) w.baseY = w.pos.y;
    m.baseLight = m.lightPower;
    m.extras = {};
    if (!four) continue;
    const { hx, hz } = v.cfg.chassis;
    const top = new THREE.Box3().setFromObject(m.group).max.y - m.group.position.y; // roof height above the body's centre
    const part = (group, x, y, z, w, h, d, mat = dark) => { const b = new THREE.Mesh(CUBE, mat); b.position.set(x, y, z); b.scale.set(w, h, d); b.castShadow = true; group.add(b); };
    const make = (build) => { const grp = new THREE.Group(); build(grp); grp.visible = false; m.group.add(grp); return grp; };
    m.extras.bar = make((grp) => { part(grp, 0, 0.0, hz + 0.16, hx * 1.9, 0.1, 0.1); part(grp, 0, 0.3, hz + 0.16, hx * 1.5, 0.1, 0.1); for (const s of [-0.5, 0.5]) part(grp, s * hx, 0.12, hz + 0.16, 0.1, 0.5, 0.1); });
    m.extras.lights = make((grp) => { part(grp, 0, top + 0.1, hz * 0.35, hx * 1.5, 0.1, 0.12); for (let i = -2; i <= 2; i++) part(grp, i * hx * 0.3, top + 0.2, hz * 0.35 + 0.03, hx * 0.24, 0.16, 0.1, lamp); });
    m.extras.snorkel = make((grp) => { part(grp, -hx - 0.06, top * 0.45, hz * 0.4, 0.12, top * 0.9, 0.12); part(grp, -hx - 0.06, top * 0.9, hz * 0.4 - 0.12, 0.16, 0.14, 0.3); });
  }

  const get = (id) => ({ ...DEFAULTS, ...(G.save.custom[id] ?? {}) });

  function apply(g) {
    const c = get(g.id), v = g.vehicle, m = G.models.get(v), four = v.wheels.length === 4;
    const tyre = TYRES.find((t) => t.id === c.tyres) ?? TYRES[1], susp = SUSPENSION.find((s) => s.id === c.susp) ?? SUSPENSION[1];
    v.tyres = tyre; // read by the tyre physics every step
    v.suspensionScale = susp.spring;
    v.dampingScale = susp.damper;
    const lift = four && c.lift ? 0.1 : 0;
    for (const w of v.cfg.wheels) w.pos.y = w.baseY - lift; // wheels sit lower under the body = body rides higher
    v.cfg.rideHeight = v.baseRide + lift;
    v.armour = four && c.bar ? 0.6 : 1;
    v.snorkel = four && c.snorkel;
    m.lightPower = m.baseLight * (four && c.lights ? 1.9 : 1);
    for (const k of ['bar', 'lights', 'snorkel']) if (m.extras[k]) m.extras[k].visible = !!c[k];
  }
  for (const g of G.garage) apply(g);

  return {
    get,
    set(g, key, value) {
      G.save.custom[g.id] = { ...get(g.id), [key]: value };
      G.save.commit();
      apply(g);
    },
    // one line describing the whole set-up, for the garage
    summary(g) {
      const c = get(g.id);
      return [TYRES.find((t) => t.id === c.tyres).name + ' tyres', SUSPENSION.find((s) => s.id === c.susp).name.toLowerCase() + ' suspension', ...EXTRAS.filter((e) => c[e.id]).map((e) => e.name.toLowerCase())].join(', ');
    },
  };
}
