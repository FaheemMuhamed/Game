// The other vehicles: a light buggy, a heavy truck and a trials bike.
// They use exactly the same physics as the 4x4 and the dirt bike; only the
// numbers differ. Compare with car.js and bike.js to see what each number does.

import { Vehicle } from './vehicle.js';
import { Bike, BIKE_CONFIG } from './bike.js';

const fourWheels = (make, x, z) => [make(x, z, true), make(-x, z, true), make(x, -z, false), make(-x, -z, false)];

// ---- Buggy: 650 kg, rear-wheel drive, long soft suspension, quick ----
const buggyWheel = (x, z, front) => ({
  pos: { x, y: -0.05, z }, radius: 0.36, maxLen: 0.45, k: 8900, cBump: 850, cRebound: 1300, inertia: 1.1,
  brake: front ? 950 : 700, steer: front, handbrake: !front,
});
export const BUGGY_CONFIG = {
  name: 'Buggy',
  mass: 650,
  inertia: { x: 720, y: 820, z: 270 },
  chassis: { hx: 0.7, hy: 0.3, hz: 1.5, y: 0.12 },
  rideHeight: 0.68,
  wheelbase: 2.3,
  track: 1.6,
  wheels: fourWheels(buggyWheel, 0.8, 1.15),
  antiRoll: [{ a: 0, b: 1, k: 3000 }, { a: 2, b: 3, k: 2200 }],
  rollCentre: 0.2,
  slipAnglePeak: 0.17,
  dragArea: 1.2,
  steering: { maxAngle: 0.6, fadeSpeed: 30, rate: 2.8 },
  drivetrain: {
    axles: [{ wheels: [2, 3] }], // rear wheels only
    canLock: false,
    torque: 150, rpmPeak: 4200, idle: 1000, redline: 6800, shiftUp: 5800, shiftDown: 2400,
    gears: [3.2, 2.0, 1.4, 1.05, 0.85], reverse: 3.2, final: 4.2, lowRatio: 1,
  },
};

// ---- Truck: 3.8 tonnes, 4WD with low range and lockers, cargo bed, big winch. Slow and thirsty ----
const truckWheel = (x, z, front) => ({
  pos: { x, y: -0.1, z }, radius: 0.55, maxLen: 0.45, k: 51800, cBump: 5000, cRebound: 7700, inertia: 5,
  brake: front ? 6200 : 4600, steer: front, handbrake: !front,
});
export const TRUCK_CONFIG = {
  name: 'Truck',
  mass: 3800,
  inertia: { x: 9500, y: 10500, z: 2700 },
  chassis: { hx: 1.0, hy: 0.45, hz: 2.9, y: 0.25 },
  // cargo bed behind the cab: a floor and tall sides
  extraColliders: [
    { hx: 0.95, hy: 0.03, hz: 1.45, x: 0, y: 0.75, z: -1.35 },
    { hx: 0.03, hy: 0.3, hz: 1.45, x: 0.98, y: 1.05, z: -1.35 }, { hx: 0.03, hy: 0.3, hz: 1.45, x: -0.98, y: 1.05, z: -1.35 },
    { hx: 0.95, hy: 0.3, hz: 0.03, x: 0, y: 1.05, z: 0.12 }, { hx: 0.95, hy: 0.3, hz: 0.03, x: 0, y: 1.05, z: -2.82 },
  ],
  rack: { slots: [[-0.45, 1.1, -2.0], [0.45, 1.1, -2.0], [0, 1.1, -0.8]], bounds: [1.3, -3.3, 0.5, 0.5, 2.6] },
  winch: { hook: { x: 0, y: -0.2, z: 3.0 }, rearHook: { x: 0, y: -0.2, z: -3.0 }, force: 22000 },
  thirst: 1.7, // burns fuel this many times faster than the 4x4
  rideHeight: 0.92,
  wheelbase: 3.6,
  track: 2.0,
  wheels: fourWheels(truckWheel, 1.0, 1.8),
  antiRoll: [{ a: 0, b: 1, k: 16000 }, { a: 2, b: 3, k: 12000 }],
  rollCentre: 0.3,
  slipAnglePeak: 0.15,
  dragArea: 3.4,
  steering: { maxAngle: 0.56, fadeSpeed: 20, rate: 1.6 },
  drivetrain: {
    axles: [{ wheels: [0, 1] }, { wheels: [2, 3] }],
    startIn4WD: false,
    torque: 620, rpmPeak: 1800, idle: 700, redline: 3600, shiftUp: 3000, shiftDown: 1300,
    gears: [5.5, 3.2, 2.0, 1.35, 1.0], reverse: 5.2, final: 5.2, lowRatio: 2.4,
  },
};

// ---- Trials bike: light, very low gearing, made for picking over obstacles slowly ----
export const TRIALS_CONFIG = {
  ...structuredClone(BIKE_CONFIG),
  name: 'Trials bike',
  mass: 135,
  inertia: { x: 32, y: 25, z: 11 },
  maxLean: 0.48,
  dragArea: 1.0,
  drivetrain: {
    ...BIKE_CONFIG.drivetrain,
    torque: 34, rpmPeak: 4500, idle: 1300, redline: 7500, shiftUp: 6400, shiftDown: 2800,
    gears: [3.4, 2.4, 1.7, 1.25], reverse: 3.4, final: 8.5,
  },
};

export const createBuggy = (phys) => new Vehicle(phys, structuredClone(BUGGY_CONFIG));
export const createTruck = (phys) => new Vehicle(phys, structuredClone(TRUCK_CONFIG));
export const createTrials = (phys) => new Bike(phys, structuredClone(TRIALS_CONFIG));
