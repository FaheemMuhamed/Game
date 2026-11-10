// The dirt bike. Same wheel and suspension model as the car, with two wheels
// in a line, plus a balance controller that stands in for the rider.

import { Vehicle } from './vehicle.js';
import { Y, Z, scale, dot, cross, norm, rotate, clamp, moveToward } from './vec.js';

const GRAVITY = 9.81;

function wheel(z, front) {
  return {
    pos: { x: 0, y: -0.1, z },
    radius: 0.33,
    maxLen: 0.3,
    k: 8000,
    cBump: 600,
    cRebound: 950,
    inertia: 0.6,
    brake: front ? 520 : 360,
    steer: front,
    handbrake: !front,
  };
}

export const BIKE_CONFIG = {
  name: 'Dirt bike',
  mass: 180, // bike + rider
  inertia: { x: 42, y: 32, z: 14 },
  chassis: { hx: 0.14, hy: 0.3, hz: 0.6, y: 0.12 },
  rideHeight: 0.62,
  wheelbase: 1.45,
  track: 0,
  wheels: [wheel(0.75, true), wheel(-0.7, false)], // front, rear
  rollCentre: 0,
  slipAnglePeak: 0.2,
  dragArea: 0.9,
  canLean: true,
  angularDamping: 0.3,
  steering: { maxAngle: 0.55, rate: 2.6 },
  maxLean: 0.52, // radians (about 30 degrees)
  // inertia here is the bike tipping about the tyre contact line (heavier than about its centre)
  balance: { kp: 90, kd: 17, inertia: 80 },
  drivetrain: {
    axles: [{ wheels: [1] }], // rear wheel drive
    torque: 50,
    rpmPeak: 6500,
    idle: 1500,
    redline: 9500,
    shiftUp: 8200,
    shiftDown: 3800,
    gears: [2.8, 2.0, 1.5, 1.2, 1.0],
    reverse: 2.8,
    final: 6.0,
    lowRatio: 1,
  },
};

export class Bike extends Vehicle {
  constructor(phys, cfg = structuredClone(BIKE_CONFIG)) {
    super(phys, cfg);
    this.shift = 0; // rider weight: +1 leaning back, -1 leaning forward
    this.lean = 0;
    this.downTime = 0; // how long the bike has been lying on its side
    this.crashed = false;
  }

  place(...args) {
    super.place(...args);
    this.downTime = 0;
    this.crashed = false;
  }

  step(dt, input) {
    // Rider instinct: roll off the throttle as the front wheel comes up, so it does not flip over backwards.
    const fwd = rotate(this.body.rotation(), Z);
    const noseUp = Math.asin(clamp(fwd.y, -1, 1));
    // (leaning back on purpose tells the rider you want the wheelie, so it allows much more)
    const limit = this.shift > 0.3 ? 1.0 : 0.45;
    const ease = clamp(1 - (noseUp - limit) / 0.3, 0, 1);
    super.step(dt, input.throttle > 0 && this.drive.gear > 0 ? { ...input, throttle: input.throttle * ease } : input);
  }

  // A bike turns by leaning, and can only lean so far. So the faster you go,
  // the less the bars are allowed to turn.
  updateSteering(dt, steerInput, speed) {
    const s = this.cfg.steering, wb = this.cfg.wheelbase;
    // Tightest curve the lean limit allows:  curvature = g * tan(maxLean) / speed^2
    const curvature = (GRAVITY * Math.tan(this.cfg.maxLean)) / Math.max(speed * speed, 1);
    const max = Math.min(s.maxAngle, Math.atan(curvature * wb));
    this.steer = moveToward(this.steer, steerInput * max, s.rate * dt);
    this.wheels[0].steer = this.steer;
    this.wheels[1].steer = 0;
  }

  // The rider's balance. Works out how far the bike should lean for this
  // speed and steering angle, then twists the bike towards that lean with a
  // spring (kp) and a damper (kd) so it gets there without wobbling.
  extraForces(dt, { up, fwd, left, av }) {
    const flatFwd = norm({ x: fwd.x, y: 0, z: fwd.z });
    const flatLeft = cross(Y, flatFwd);
    const lean = Math.asin(clamp(dot(up, flatLeft), -1, 1)); // + means leaning left
    this.lean = lean;

    // Lying on its side for a while = crashed.
    if (up.y < 0.35) this.downTime += dt; else this.downTime = 0;
    this.crashed = this.downTime > 1.2;
    if (up.y < 0.2) return; // too far gone to save

    // Lean needed to balance the turn:  tan(lean) = speed^2 * curvature / g
    const curvature = Math.tan(this.steer) / this.cfg.wheelbase;
    const target = clamp(Math.atan((this.speed * this.speed * curvature) / GRAVITY), -this.cfg.maxLean, this.cfg.maxLean);

    const { kp, kd, inertia } = this.cfg.balance;
    const rollRate = dot(av, fwd); // + roll rate tips the bike to the right
    const leanAccel = kp * (target - lean) + kd * rollRate;
    const strength = this.anyGrounded ? 1 : 0.4; // less control in the air
    const torque = clamp(-inertia * leanAccel, -4000, 4000) * strength;
    this.body.applyTorqueImpulse(scale(fwd, torque * dt), true);

    const I = this.cfg.inertia;
    // Rider shifting their weight: back lifts the front wheel, forward pushes it down.
    // On the ground that means wheelies and hopping up ledges; in the air it tilts the bike.
    const tilt = Math.asin(clamp(fwd.y, -1, 1)); // + is nose up
    if (this.shift) {
      // the push fades out as the bike nears the balance point, so a held wheelie hovers instead of flipping
      const room = this.shift > 0 ? clamp(1 - (tilt - 0.55) / 0.35, 0, 1) : clamp(1 + (tilt + 0.3) / 0.35, 0, 1);
      this.body.applyTorqueImpulse(scale(left, -I.x * 11 * this.shift * room * dt), true);
    }
    // past the balance point the rider throws their weight forward to save it
    if (tilt > 0.95) this.body.applyTorqueImpulse(scale(left, I.x * (30 * (tilt - 0.95) - 5 * dot(av, left)) * dt), true);
    if (this.anyGrounded) {
      // Keep the bike pointing where the bars say it should, so a spinning rear
      // wheel on mud or wet stones does not swap ends. (Stands in for the rider's corrections.)
      const wantYawRate = this.speed * curvature;
      const yawTorque = clamp(I.y * 6 * (wantYawRate - dot(av, up)), -700, 700);
      this.body.applyTorqueImpulse(scale(up, yawTorque * dt), true);
    } else {
      // In the air the rider levels the bike out for the landing.
      const noseUp = Math.asin(clamp(fwd.y, -1, 1));
      const pitchTorque = this.shift ? 0 : clamp(I.x * (10 * noseUp - 4 * dot(av, left)), -500, 500);
      this.body.applyTorqueImpulse(scale(left, pitchTorque * dt), true);
    }
  }
}

export function createBike(phys) {
  return new Bike(phys);
}
