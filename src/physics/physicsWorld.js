// Sets up the Rapier physics world: the ground, solid props, and loose crates.

export const PHYSICS_DT = 1 / 120; // the physics always advances in steps of this size

export function createPhysicsWorld(RAPIER, terrain, props = null) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = PHYSICS_DT;

  // Ground. Rapier wants the heights stored column by column, so re-order our grid.
  const n = terrain.n;
  const hf = new Float32Array((n + 1) * (n + 1));
  for (let iz = 0; iz <= n; iz++) {
    for (let ix = 0; ix <= n; ix++) {
      hf[ix * (n + 1) + iz] = terrain.heights[iz * (n + 1) + ix];
    }
  }
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const terrainCollider = world.createCollider(
    RAPIER.ColliderDesc.heightfield(n, n, hf, { x: terrain.size, y: 1, z: terrain.size }).setFriction(0.7),
    ground,
  );

  // Solid things that never move: tree trunks, huts, docks, boulders, the bridge.
  const dynamics = [];
  if (props) {
    for (const c of props.colliders) {
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(c.hx, c.hy, c.hz).setTranslation(c.x, c.y, c.z).setFriction(0.7),
        ground,
      );
    }
    // Loose things you can knock around: crates and barrels.
    for (const d of props.dynamics) {
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(d.x, d.y, d.z).setLinearDamping(0.2).setAngularDamping(0.6),
      );
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(d.sx / 2, d.sy / 2, d.sz / 2).setDensity(90).setFriction(0.8),
        body,
      );
      dynamics.push({ body, spec: d });
    }
  }

  world.step(); // one step so ray casts can see everything straight away

  return { RAPIER, world, terrain, terrainHandle: terrainCollider.handle, dynamics };
}
