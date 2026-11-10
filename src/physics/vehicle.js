// A vehicle = one rigid body (the chassis) + wheels that are not physical objects.
// Each wheel is a ray pointing down from the chassis. Where the ray hits the
// ground we work out spring and tyre forces and push the chassis with them.
// The car and the bike both use this; they only differ in their numbers.

import { X, Y, Z, add, sub, scale, addScaled, dot, cross, norm, len, rotate, clamp, moveToward, quatFromYaw } from './vec.js';
import { makeWheel, suspensionForce, solveSpin, equalizeAxle, lateralForce } from './wheel.js';
import { Drivetrain } from './drivetrain.js';
import { SURFACES, WOOD, env, physicsTuning } from '../world/surfaces.js';

const RAY_LIFT = 0.35; // rays start this far above the suspension mount
const GRAVITY = 9.81;

export class Vehicle {
  constructor(phys, cfg) {
    const { RAPIER, world } = phys;
    this.phys = phys;
    this.cfg = cfg;

    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 50, 0)
      .setCanSleep(false)
      .setAngularDamping(cfg.angularDamping ?? 0.05)
      // Mass and how hard it is to spin the body around each axis (x pitch, y yaw, z roll).
      .setAdditionalMassProperties(cfg.mass, { x: 0, y: 0, z: 0 }, cfg.inertia, { x: 0, y: 0, z: 0, w: 1 });
    this.body = world.createRigidBody(desc);
    const ch = cfg.chassis;
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(ch.hx, ch.hy, ch.hz).setTranslation(0, ch.y, 0).setDensity(0).setFriction(0.35).setRestitution(0.05),
      this.body,
    );

    for (const e of cfg.extraColliders ?? []) {
      world.createCollider(RAPIER.ColliderDesc.cuboid(e.hx, e.hy, e.hz).setTranslation(e.x, e.y, e.z).setDensity(0).setFriction(1.3).setRestitution(0), this.body);
    }

    this.wheels = cfg.wheels.map(makeWheel);
    this.drive = new Drivetrain(cfg.drivetrain);
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this.steer = 0; // current steering angle (radians, + is left)
    this.speed = 0; // forward speed, m/s
    this.enabled = true;
    this.suspensionScale = 1;
    this.dampingScale = 1;
    // For smooth drawing between physics steps.
    this.prevPos = { x: 0, y: 50, z: 0 };
    this.prevRot = { x: 0, y: 0, z: 0, w: 1 };
  }

  // Put the vehicle on the ground at (x, z) facing `yaw`, standing still.
  place(x, z, yaw, lift = 0.25) {
    const y = Math.max(this.phys.terrain.heightAt(x, z), env.waterLevel - 1.2) + this.cfg.rideHeight + lift;
    const rot = quatFromYaw(yaw);
    this.body.setTranslation({ x, y, z }, true);
    this.body.setRotation(rot, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (const w of this.wheels) { w.omega = 0; w.compression = 0; w.length = w.cfg.maxLen; }
    this.steer = 0;
    this.prevPos = { x, y, z };
    this.prevRot = rot;
    this.justPlaced = true; // tells the damage system this was a teleport, not a crash
  }

  // Flip back onto the wheels where it is now.
  reset() {
    const p = this.body.translation();
    const f = rotate(this.body.rotation(), Z);
    this.place(p.x, p.z, Math.atan2(f.x, f.z), 0.6);
  }

  setEnabled(on) {
    this.enabled = on;
    this.body.setEnabled(on);
  }

  yaw() {
    const f = rotate(this.body.rotation(), Z);
    return Math.atan2(f.x, f.z);
  }

  // Car steering: turn the wheel less at speed, and move it smoothly.
  updateSteering(dt, steerInput, speed) {
    const s = this.cfg.steering;
    const max = s.maxAngle * (1 - 0.72 * clamp(Math.abs(speed) / s.fadeSpeed, 0, 1));
    this.steer = moveToward(this.steer, steerInput * max, s.rate * dt);
    const wb = this.cfg.wheelbase, track = this.cfg.track;
    for (const w of this.wheels) {
      if (!w.cfg.steer) { w.steer = 0; continue; }
      if (Math.abs(this.steer) < 1e-4 || !track) { w.steer = this.steer; continue; }
      // Ackermann: the inside wheel follows a tighter circle, so it turns more.
      const R = wb / Math.tan(this.steer); // + when turning left
      w.steer = Math.atan(wb / (R - w.cfg.pos.x));
    }
  }

  // Advance this vehicle by one physics step. Call just before world.step().
  // input: { throttle: -1..1, steer: -1..1 (+ left), handbrake: bool }
  step(dt, input) {
    if (!this.enabled) return;
    const b = this.body, world = this.phys.world;
    const pos = b.translation(), rot = b.rotation(), lv = b.linvel(), av = b.angvel();
    this.prevPos = { x: pos.x, y: pos.y, z: pos.z };
    this.prevRot = { x: rot.x, y: rot.y, z: rot.z, w: rot.w };

    const up = rotate(rot, Y), fwd = rotate(rot, Z), left = rotate(rot, X);
    const speed = dot(lv, fwd);
    this.speed = speed;
    this.updateSteering(dt, input.steer, speed);

    // ---- 1. Suspension: where is each wheel, and how hard is it pressed down? ----
    const down = scale(up, -1);
    for (const w of this.wheels) {
      const c = w.cfg, r = c.radius;
      const mount = add(pos, rotate(rot, c.pos));
      const heading = add(scale(fwd, Math.cos(w.steer)), scale(left, Math.sin(w.steer)));

      // Five rays fanned across the tyre (front to back) so the wheel rolls up and over
      // rocks and steps instead of only feeling the ground directly below the hub.
      let best = Infinity, bestHit = null, bestPoint = null;
      for (const off of [0, 0.55 * r, -0.55 * r, 0.9 * r, -0.9 * r]) {
        const origin = add(addScaled(mount, up, RAY_LIFT), scale(heading, off));
        this.ray.origin = origin;
        this.ray.dir = down;
        const reach = RAY_LIFT + c.maxLen + r;
        let hit = world.castRayAndGetNormal(this.ray, reach, true, undefined, undefined, undefined, b);
        if (!hit) {
          // A ray can slip through the hairline seam between two ground triangles.
          // Fall back to asking the height grid directly.
          const gap = (origin.y - this.phys.terrain.heightAt(origin.x, origin.z)) / Math.max(0.3, up.y);
          if (gap < 0 || gap > reach) continue;
          hit = { timeOfImpact: gap, normal: Y, collider: { handle: this.phys.terrainHandle } };
        }
        const L = hit.timeOfImpact - RAY_LIFT - Math.sqrt(r * r - off * off);
        if (L < best) { best = L; bestHit = hit; bestPoint = addScaled(origin, down, hit.timeOfImpact); }
      }

      if (!bestHit || best > c.maxLen) {
        // Wheel is hanging in the air.
        w.grounded = false; w.length = c.maxLen; w.compression = 0; w.Fz = 0; w.mu = 0; w.wet = 0;
        continue;
      }
      // Soft ground: the wheel sits down into whatever rut is already there.
      const onTerrain = bestHit.collider.handle === this.phys.terrainHandle;
      const terrain = this.phys.terrain;
      w.surface = onTerrain ? terrain.surfaceAt(bestPoint.x, bestPoint.z) : WOOD;
      const s = SURFACES[w.surface];
      w.rut = onTerrain && s.sink > 0 && terrain.rutAt ? terrain.rutAt(bestPoint.x, bestPoint.z) : 0;
      best += w.rut;
      if (best > c.maxLen) { w.grounded = false; w.length = c.maxLen; w.compression = 0; w.Fz = 0; w.mu = 0; w.wet = 0; continue; }
      w.grounded = true;
      w.length = Math.max(best, -0.05);
      const savedK = c.k, savedB = c.cBump, savedR = c.cRebound;
      c.k *= this.suspensionScale; c.cBump *= this.dampingScale; c.cRebound *= this.dampingScale;
      w.Fz = suspensionForce(w, c.maxLen - best, dt);
      c.k = savedK; c.cBump = savedB; c.cRebound = savedR;

      let n = bestHit.normal;
      if (dot(n, up) < 0.5) n = up; // ignore near-vertical faces (side of a rock)
      w.normal = n;
      w.contact = bestPoint;
      // Rolling direction and sideways direction, both lying flat on the ground.
      w.fwdDir = norm(addScaled(heading, n, -dot(heading, n)));
      w.sideDir = cross(n, w.fwdDir);
      const vC = add(lv, cross(av, sub(bestPoint, pos))); // speed of the chassis at this wheel
      w.vLong = dot(vC, w.fwdDir);
      w.vLat = dot(vC, w.sideDir);

      // Dig the rut deeper: weight and wheelspin both chew into soft ground.
      if (onTerrain && s.sink > 0 && terrain.digRut && bestPoint.y > env.waterLevel) {
        const churn = 0.012 + Math.min(Math.abs(w.slip), 5) * 0.03 + Math.min(Math.abs(w.vLong), 6) * 0.004;
        terrain.digRut(bestPoint.x, bestPoint.z, churn * dt * Math.min(2, w.Fz / 4000), s.sink * 1.7);
      }
      w.wet = Math.max(0, env.waterLevel - bestPoint.y);
      w.mu = s.mu * physicsTuning.gripScale * (w.wet > 0.05 ? 0.85 : 1);
      w.crr = s.crr + Math.min(w.wet, 0.7) * 0.22 + w.rut * 0.5;
      if (this.tyres) {
        // The fitted tyres suit some ground better than others: hard, soft (anything you sink into) or cold (snow, ice).
        const kind = s.kind ?? (s.sink > 0 ? 'soft' : 'hard');
        w.mu *= this.tyres.grip[kind];
        w.crr = Math.max(0.008, w.crr + this.tyres.drag);
      }
      if (this.airedDown) {
        // Soft tyres spread out: a bigger footprint grips loose ground and rock better,
        // but they drag more, so top speed drops.
        w.mu *= s.airGain ?? 1.04;
        w.crr = w.crr * 0.8 + 0.022;
      }
      // Rain makes dirt and grass greasy.
      w.mu *= 1 - env.wetness * (s.rainLoss ?? 0);
    }

    // Anti-roll bars: link left and right so the body leans less in corners.
    for (const bar of this.cfg.antiRoll ?? []) {
      const a = this.wheels[bar.a], c = this.wheels[bar.b];
      if (!a.grounded && !c.grounded) continue;
      const f = bar.k * (a.compression - c.compression);
      if (a.grounded) a.Fz = Math.max(0, a.Fz + f);
      if (c.grounded) c.Fz = Math.max(0, c.Fz - f);
    }
    for (const w of this.wheels) w.Fz = Math.min(w.Fz, this.cfg.mass * GRAVITY * 3);

    // ---- 2. Engine, gearbox, diffs and brakes decide the torque on each wheel ----
    this.drive.update(dt, input, this.wheels, speed);

    // ---- 3. Spin each wheel and get its drive/brake force ----
    for (const w of this.wheels) solveSpin(w, dt);
    this.drive.cfg.axles.forEach((axle, i) => {
      if (this.drive.locked[i] && axle.wheels.length === 2) {
        equalizeAxle(this.wheels[axle.wheels[0]], this.wheels[axle.wheels[1]]);
      }
    });

    // ---- 4. Push the chassis with every wheel's forces ----
    const rollLift = this.cfg.rollCentre ?? 0;
    const invRot = { x: -rot.x, y: -rot.y, z: -rot.z, w: rot.w };
    const I = this.cfg.inertia;
    const nGrounded = this.wheels.filter((w) => w.grounded).length;
    // Parked = nothing pressed and barely moving. Then tyres grip like glue (static friction).
    const parked = input.throttle === 0 && Math.abs(speed) < 0.6 && !this.drive.noHold;
    const anchorK = (this.cfg.mass * GRAVITY) / this.wheels.length / 0.03;
    for (const w of this.wheels) {
      w.spin += w.omega * dt;
      if (!w.grounded) { w.anchor = null; continue; }
      const sidePoint = addScaled(w.contact, up, rollLift);
      // How heavy the chassis feels to a sideways shove at this wheel (it can slide AND rotate).
      const t = rotate(invRot, cross(sub(sidePoint, pos), w.sideDir));
      const effMass = 1 / (1 / this.cfg.mass + (t.x * t.x) / I.x + (t.y * t.y) / I.y + (t.z * t.z) / I.z) / nGrounded;
      w.Fy = lateralForce(w, dt, this.cfg.slipAnglePeak, effMass);

      if (parked && Math.abs(w.vLat) < 0.6) {
        if (!w.anchor) w.anchor = w.contact;
        const off = sub(w.anchor, w.contact);
        if (len(off) > 0.12) w.anchor = null; // dragged too far: let go and re-grip
        else {
          const Fmax = w.mu * w.Fz;
          w.Fy = clamp(w.Fy + anchorK * dot(off, w.sideDir), -Fmax, Fmax);
          w.Fx = clamp(w.Fx + anchorK * dot(off, w.fwdDir), -Fmax, Fmax);
        }
      } else w.anchor = null;

      const rolling = -w.crr * w.Fz * clamp(w.vLong / 0.5, -1, 1);
      // Up from the spring, forward/back from drive, brakes and rolling drag.
      const F = add(scale(w.normal, w.Fz), scale(w.fwdDir, w.Fx + rolling));
      b.applyImpulseAtPoint(scale(F, dt), w.contact, true);
      // Sideways grip, applied a little above the ground to keep body roll sensible.
      b.applyImpulseAtPoint(scale(w.sideDir, w.Fy * dt), sidePoint, true);
    }

    // ---- 5. Air drag and water ----
    const v = len(lv);
    if (v > 0.1) b.applyImpulse(scale(lv, -0.6 * this.cfg.dragArea * v * dt), true);
    const depth = env.waterLevel - (pos.y - this.cfg.chassis.hy + this.cfg.chassis.y);
    this.submerged = clamp(depth / 0.9, 0, 1);
    if (this.submerged > 0) {
      // Water pushes up (so tyres lose grip in deep water) and slows everything down.
      const lift = this.submerged * 0.55 * this.cfg.mass * GRAVITY;
      b.applyImpulse({ x: 0, y: lift * dt, z: 0 }, true);
      b.applyImpulse(scale(lv, -this.submerged * 1.6 * this.cfg.mass * dt), true);
      b.applyTorqueImpulse(scale(av, -this.submerged * 1.5 * this.cfg.inertia.y * dt), true);
    }

    this.extraForces(dt, { pos, rot, up, fwd, left, lv, av });
  }

  // Hook for vehicle-specific forces (the bike's balance).
  extraForces() {}

  // Where things are for drawing. `alpha` (0..1) blends between the last two physics steps.
  renderState(alpha) {
    const p = this.body.translation(), q = this.body.rotation();
    return { prevPos: this.prevPos, prevRot: this.prevRot, pos: p, rot: q, alpha };
  }

  get anyGrounded() {
    return this.wheels.some((w) => w.grounded);
  }
}
