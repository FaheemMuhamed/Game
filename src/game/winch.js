// The winch: a cable from the front of the vehicle to a tree, post or another
// vehicle. It reels in slowly and pulls hard, which gets you out of places
// the wheels cannot. Press the winch key facing something solid to hook on.

import * as THREE from 'three';
import { Z, add, sub, scale, dot, len, rotate } from '../physics/vec.js';

const REACH = 30; // metres of cable
const REEL_SPEED = 1.1; // metres per second
const STIFFNESS = 30000; // how hard the cable pulls per metre of stretch
const DAMPING = 6000;

export function createWinch(G) {
  let rope = null; // { point | body, length }
  G.winchTargets = []; // other vehicles that can be hooked: [{ body, name }]

  const line = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.6 }));
  line.visible = false;
  G.scene.add(line);

  const farEnd = () => (rope.body ? add(rope.body.translation(), { x: 0, y: 0.2, z: 0 }) : rope.point);
  // The cable leaves from the front winch. When towing another vehicle it can
  // also run from the rear tow hitch, whichever end is nearer to what is being towed.
  function hookPoint(v) {
    const p = v.body.translation(), q = v.body.rotation();
    const front = add(p, rotate(q, v.cfg.winch.hook));
    if (!rope?.body || !v.cfg.winch.rearHook) return front;
    const rear = add(p, rotate(q, v.cfg.winch.rearHook)), far = farEnd();
    return len(sub(far, rear)) < len(sub(far, front)) ? rear : front;
  }

  function findAnchor(v) {
    const from = hookPoint(v), fwd = rotate(v.body.rotation(), Z);
    let best = null, bestD = Infinity;
    // another vehicle (a recovery job) wins over scenery, from any direction
    for (const t of G.winchTargets) {
      const d = len(sub(t.body.translation(), from));
      if (d < REACH && d < bestD) { best = { body: t.body, name: t.name }; bestD = d; }
    }
    if (best) return best;
    // otherwise the nearest tall solid thing roughly ahead: tree, post, hut
    for (const c of G.props.colliders) {
      if (c.hy < 0.9) continue;
      const p = { x: c.x, y: c.y - c.hy + 1.0, z: c.z };
      const to = sub(p, from), d = len(to);
      if (d > REACH || d < 5 || dot(to, fwd) / d < 0.3) continue;
      if (d < bestD) { best = { point: p }; bestD = d; }
    }
    return best;
  }

  function release(msg = 'WINCH RELEASED') {
    if (!rope) return;
    rope = null;
    line.visible = false;
    G.toast(msg);
  }

  function toggle() {
    const v = G.active;
    if (rope) return release();
    if (!v.cfg.winch) return G.toast('THIS VEHICLE HAS NO WINCH');
    const a = findAnchor(v);
    if (!a) return G.toast('NOTHING TO HOOK: FACE A TREE OR POST WITHIN 30 M');
    rope = { ...a, length: 0 };
    rope.length = len(sub(farEnd(), hookPoint(v)));
    G.toast(a.body ? `WINCH HOOKED TO ${a.name.toUpperCase()}` : 'WINCH HOOKED');
    G.audio.click();
  }

  function step(dt) {
    // Pulling yourself to a tree: brakes off so the winch can move you.
    // Pulling another vehicle: brakes stay on (when you are not driving) so IT comes to YOU.
    for (const x of G.vehicles) x.drive.noHold = !!rope && !rope.body && x === G.active;
    if (!rope) return;
    const v = G.active;
    if (!v.cfg.winch) return release();
    const a = hookPoint(v), b = farEnd();
    const to = sub(b, a), d = len(to), dir = scale(to, 1 / Math.max(d, 0.01));
    if (!rope.body && d < 4.2) return release('WINCHED IN');
    if (d > REACH + 8) return release('CABLE SNAPPED FREE');

    // reel in: scenery pulls you all the way, a towed vehicle stops 5 m away
    const minLength = rope.body ? 6 : 3;
    if (rope.length > minLength) rope.length = Math.max(minLength, rope.length - REEL_SPEED * dt);

    const stretch = d - rope.length;
    if (stretch <= 0) { rope.tension = 0; return; }
    const lv = v.body.linvel();
    const ov = rope.body ? rope.body.linvel() : { x: 0, y: 0, z: 0 };
    const separating = dot(sub(ov, lv), dir); // + when the two ends are moving apart
    const T = Math.min(v.cfg.winch.force, Math.max(0, STIFFNESS * stretch + DAMPING * separating));
    rope.tension = T;
    v.body.applyImpulseAtPoint(scale(dir, T * dt), a, true);
    if (rope.body) rope.body.applyImpulse(scale(dir, -T * dt), true);
  }

  const mid = new THREE.Vector3(), end = new THREE.Vector3();
  function update() {
    line.visible = !!rope;
    if (!rope) return;
    const a = hookPoint(G.active), b = farEnd();
    mid.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    end.set(b.x, b.y, b.z);
    line.position.copy(mid);
    line.lookAt(end);
    line.scale.set(0.05, 0.05, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }

  return {
    step, update, toggle, release,
    get attached() { return !!rope; },
    get towing() { return rope?.body ?? null; },
    onKey(code, action) { if (action === 'winch' && !G.paused) { toggle(); return true; } return false; },
  };
}
