// Someone else on the trails: a ranger's pickup that drives a slow loop
// between the village and the north bank. It is solid, so give it room.
// It waits if you are in its way.

import * as THREE from 'three';

const ROUTE = [[20, -18], [35, -30], [55, 20], [55, 34], [55, 53], [55, 70], [20, 85], [-40, 80]];
const SPEED = 4.5;
const CUBE = new THREE.BoxGeometry(1, 1, 1);

export function createTraffic(G) {
  const { RAPIER, world } = G.phys;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(ROUTE[0][0], 10, ROUTE[0][1]));
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.85, 0.6, 2.0).setFriction(0.6), body);

  // a simple pickup, ranger green with an amber roof lamp
  const g = new THREE.Group();
  const part = (x, y, z, w, h, d, c, glow) => {
    const mat = glow ? new THREE.MeshBasicMaterial({ color: c, toneMapped: false }) : new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
    if (glow) mat.color.multiplyScalar(2.2);
    const b = new THREE.Mesh(CUBE, mat); b.position.set(x, y, z); b.scale.set(w, h, d); b.castShadow = !glow; g.add(b);
  };
  part(0, -0.1, 0, 1.7, 0.5, 4.0, 0x3d6b52); part(0, 0.45, 0.4, 1.6, 0.65, 1.5, 0x3d6b52); part(0, 0.5, 1.16, 1.4, 0.4, 0.05, 0x1a2a33);
  part(0, 0.2, -1.2, 1.6, 0.3, 1.5, 0x2b2d31); part(0, 0.86, 0.4, 0.5, 0.14, 0.2, 0xffb040, true);
  for (const sx of [-0.55, 0.55]) { part(sx, 0, 2.02, 0.3, 0.2, 0.05, 0xffe6b8, true); part(sx, 0, -2.02, 0.24, 0.14, 0.05, 0xff2a1a, true); }
  for (const [sx, sz] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) part(sx, -0.35, sz, 0.3, 0.8, 0.8, 0x1c1c1f);
  G.scene.add(g);

  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  let seg = 0, dir = 1, x = ROUTE[0][0], z = ROUTE[0][1], y = 10, yaw = 0, honk = 0;

  function step(dt) {
    const a = ROUTE[seg + dir], dx = a[0] - x, dz = a[1] - z, d = Math.hypot(dx, dz);
    if (d < 0.6) {
      seg += dir;
      if (seg + dir < 0 || seg + dir >= ROUTE.length) dir = -dir; // turn round at each end
      return;
    }
    const want = Math.atan2(dx, dz);
    yaw += Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw)) * Math.min(1, dt * 2.5);
    // wait for the player if they are close and in front
    const p = G.active.body.translation(), px = p.x - x, pz = p.z - z, pd = Math.hypot(px, pz);
    const ahead = (px * Math.sin(yaw) + pz * Math.cos(yaw)) / Math.max(pd, 0.01);
    honk -= dt;
    let speed = SPEED;
    if (pd < 11 && ahead > 0.5) { speed = 0; if (honk <= 0 && pd < 7) { honk = 4; G.audio.beep(false); } }
    x += Math.sin(yaw) * speed * dt; z += Math.cos(yaw) * speed * dt;
    // find the surface under it (ground, or the bridge deck), ignoring itself and the player
    ray.origin = { x, y: y + 4, z };
    const hit = world.castRay(ray, 14, true, undefined, undefined, undefined, body, (c) => c.parent() !== G.active.body);
    const target = (hit ? y + 4 - hit.timeOfImpact : G.terrain.heightAt(x, z)) + 0.75;
    y += (target - y) * Math.min(1, dt * 6);
    body.setNextKinematicTranslation({ x, y, z });
    body.setNextKinematicRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
  }

  function update() {
    g.position.set(x, y, z);
    g.rotation.y = yaw;
  }

  return { step, update };
}
