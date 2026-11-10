// A two-wheeled trailer that hooks onto the 4x4 or the truck.
// It is a Vehicle like any other (so it has real suspension and tyres) with
// no engine and no steering, joined to the tow hitch by a ball joint.
// Towing changes how the vehicle brakes and corners, and reversing takes practice.

import { Vehicle } from './vehicle.js';
import { add, rotate } from './vec.js';

const wheel = (x) => ({
  pos: { x, y: -0.05, z: -0.35 }, radius: 0.36, maxLen: 0.25, k: 15700, cBump: 900, cRebound: 1400, inertia: 1,
  brake: 0, steer: false, handbrake: false,
});

export const TRAILER_CONFIG = {
  name: 'Trailer',
  mass: 320,
  inertia: { x: 260, y: 300, z: 160 },
  chassis: { hx: 0.85, hy: 0.1, hz: 1.3, y: 0.05 },
  // the load bed: a floor with sides
  extraColliders: [
    { hx: 0.8, hy: 0.03, hz: 1.25, x: 0, y: 0.2, z: 0 },
    { hx: 0.03, hy: 0.22, hz: 1.25, x: 0.83, y: 0.42, z: 0 }, { hx: 0.03, hy: 0.22, hz: 1.25, x: -0.83, y: 0.42, z: 0 },
    { hx: 0.8, hy: 0.22, hz: 0.03, x: 0, y: 0.42, z: 1.28 }, { hx: 0.8, hy: 0.22, hz: 0.03, x: 0, y: 0.42, z: -1.28 },
  ],
  tongue: { x: 0, y: 0, z: 2.5 }, // the coupling at the front of the draw bar
  rideHeight: 0.56,
  wheelbase: 1,
  track: 1.8,
  wheels: [wheel(0.9), wheel(-0.9)],
  rollCentre: 0.1,
  slipAnglePeak: 0.16,
  dragArea: 0.4,
  steering: { maxAngle: 0, fadeSpeed: 1, rate: 1 },
  drivetrain: { axles: [{ wheels: [0, 1] }], canLock: false, torque: 0, rpmPeak: 1000, idle: 500, redline: 2000, shiftUp: 1e9, shiftDown: 0, gears: [1], reverse: 1, final: 1, lowRatio: 1 },
};

const IDLE = { throttle: 0, steer: 0, handbrake: false };

export function createTrailer(phys) {
  const { RAPIER, world } = phys;
  const trailer = new Vehicle(phys, structuredClone(TRAILER_CONFIG));
  trailer.drive.noHold = true; // it has no brakes of its own
  trailer.setEnabled(false);
  let joint = null, towedBy = null;

  // Where the trailer has to sit to be coupled to `v`.
  function spotBehind(v) {
    const q = v.body.rotation(), hitch = v.cfg.winch.rearHook, t = trailer.cfg.tongue;
    return add(v.body.translation(), rotate(q, { x: hitch.x - t.x, y: hitch.y - t.y + 0.05, z: hitch.z - t.z }));
  }
  function snapBehind() {
    if (!towedBy) return;
    const p = spotBehind(towedBy);
    trailer.body.setTranslation(p, true);
    trailer.body.setRotation(towedBy.body.rotation(), true);
    trailer.body.setLinvel(towedBy.body.linvel(), true);
    trailer.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (const w of trailer.wheels) { w.omega = 0; w.compression = 0; }
    trailer.justPlaced = true;
  }

  return {
    vehicle: trailer,
    get hitched() { return !!joint; },
    get towedBy() { return towedBy; },
    hitch(v) {
      if (joint || !v.cfg.winch?.rearHook) return false;
      trailer.setEnabled(true);
      towedBy = v;
      snapBehind();
      joint = world.createImpulseJoint(RAPIER.JointData.spherical(v.cfg.winch.rearHook, trailer.cfg.tongue), v.body, trailer.body, true);
      // (the trailer and the vehicle can still bump each other, which is what stops a jackknife folding right through)
      return true;
    },
    unhitch() {
      if (!joint) return;
      world.removeImpulseJoint(joint, true);
      joint = null; towedBy = null;
    },
    snapBehind,
    // run every physics step
    step(dt) { if (trailer.enabled) trailer.step(dt, IDLE); },
    // is the loose trailer close enough behind `v` to couple up again?
    near(v) {
      if (!trailer.enabled || !v.cfg.winch?.rearHook) return false;
      const a = spotBehind(v), b = trailer.body.translation();
      return Math.hypot(a.x - b.x, a.z - b.z) < 5;
    },
  };
}
