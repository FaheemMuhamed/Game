// The 4x4. All the numbers that make it feel the way it does live here.
// Units: metres, kilograms, seconds, newtons. Forward is +Z, left is +X, up is +Y.

import { Vehicle } from './vehicle.js';

const RADIUS = 0.42;

function wheel(x, z, front) {
  return {
    pos: { x, y: -0.09, z }, // where the suspension bolts to the chassis
    radius: RADIUS,
    maxLen: 0.4, // suspension travel
    k: 27600, // spring stiffness, N per metre. Lower = softer, more body movement
    cBump: 2500, // damping while compressing
    cRebound: 3900, // damping while extending
    inertia: 2.0, // how hard the wheel is to spin up
    brake: front ? 2600 : 1700, // max brake torque, Nm
    steer: front,
    handbrake: !front,
  };
}

export const CAR_CONFIG = {
  name: '4x4',
  mass: 1800,
  inertia: { x: 2800, y: 3100, z: 750 },
  chassis: { hx: 0.85, hy: 0.4, hz: 2.1, y: 0.1 }, // collision box (half sizes) and its height offset
  // Roof rack: a floor and low rails that loose crates can sit on (used by deliveries).
  extraColliders: [
    { hx: 0.75, hy: 0.03, hz: 1.0, x: 0, y: 0.93, z: -0.5 },
    { hx: 0.03, hy: 0.18, hz: 1.0, x: 0.78, y: 1.12, z: -0.5 }, { hx: 0.03, hy: 0.18, hz: 1.0, x: -0.78, y: 1.12, z: -0.5 },
    { hx: 0.75, hy: 0.18, hz: 0.03, x: 0, y: 1.12, z: 0.53 }, { hx: 0.75, hy: 0.18, hz: 0.03, x: 0, y: 1.12, z: -1.53 },
  ],
  rack: {
    slots: [[-0.36, 1.25, -1.1], [0.36, 1.25, -1.1], [0, 1.25, -0.3]], // where crates start
    bounds: [1.1, -2.0, 1.0, 0.6, 2.4], // |x|, z min, z max, y min, y max: outside this a crate counts as lost
  },
  winch: { hook: { x: 0, y: -0.2, z: 2.2 }, rearHook: { x: 0, y: -0.2, z: -2.2 }, force: 13000 }, // pulling force in newtons
  rideHeight: 0.75, // height of the body's centre above flat ground at rest
  wheelbase: 2.7,
  track: 1.7,
  // order: front-left, front-right, rear-left, rear-right
  wheels: [wheel(0.85, 1.35, true), wheel(-0.85, 1.35, true), wheel(0.85, -1.35, false), wheel(-0.85, -1.35, false)],
  antiRoll: [{ a: 0, b: 1, k: 9000 }, { a: 2, b: 3, k: 6000 }],
  rollCentre: 0.22,
  slipAnglePeak: 0.16, // radians of slip at which the tyre grips hardest
  dragArea: 1.9,
  steering: { maxAngle: 0.62, fadeSpeed: 24, rate: 2.2 },
  drivetrain: {
    axles: [{ wheels: [0, 1] }, { wheels: [2, 3] }],
    startIn4WD: false,
    torque: 330, // peak engine torque, Nm
    rpmPeak: 2600,
    idle: 850,
    redline: 5200,
    shiftUp: 4300,
    shiftDown: 1700,
    gears: [3.8, 2.2, 1.45, 1.0, 0.8],
    reverse: 3.6,
    final: 4.1,
    lowRatio: 2.6, // low range multiplies torque (and divides speed) by this
  },
};

export function createCar(phys) {
  return new Vehicle(phys, structuredClone(CAR_CONFIG));
}
