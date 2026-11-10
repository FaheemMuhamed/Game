// One wheel: its suspension spring, how fast it spins, and the grip
// forces the tyre makes against the ground.

import { clamp, moveToward } from './vec.js';

// How much the tyre has to slip (m/s) before it reaches full grip. Smaller = sharper.
const SLIP_REF = 0.2;

export function makeWheel(cfg) {
  return {
    cfg,
    // suspension
    length: cfg.maxLen, // current suspension length (maxLen = fully extended)
    compression: 0, // how far the spring is squashed (metres)
    grounded: false,
    Fz: 0, // load pressing the tyre into the ground (newtons)
    // contact with the ground, filled in by the vehicle each step
    contact: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
    fwdDir: { x: 0, y: 0, z: 1 },
    sideDir: { x: 1, y: 0, z: 0 },
    vLong: 0, // ground speed along the wheel's rolling direction
    vLat: 0, // ground speed sideways across the wheel
    surface: 0,
    mu: 0, // grip available right now
    crr: 0, // rolling resistance right now
    wet: 0, // water depth at the contact point
    // spin
    omega: 0, // spin speed, radians per second
    spin: 0, // spin angle, for drawing
    steer: 0, // steering angle, radians
    driveTorque: 0, // set by the drivetrain
    brakeTorque: 0, // set by the drivetrain
    Ieff: cfg.inertia,
    Fx: 0, // drive / brake force along the ground
    Fy: 0, // cornering force
    slip: 0, // how fast the tyre surface is sliding over the ground (for dust)
    anchor: null, // spot the tyre is 'stuck' to while parked (static friction)
  };
}

// Spring + damper. Returns the force pushing the wheel into the ground.
//   spring:  the more it is squashed, the harder it pushes back   (k * x)
//   damper:  resists movement, so the car does not bounce forever (c * speed)
export function suspensionForce(w, newCompression, dt) {
  const c = w.cfg;
  const speed = clamp((newCompression - w.compression) / dt, -8, 8);
  w.compression = newCompression;
  let F = c.k * newCompression + (speed > 0 ? c.cBump : c.cRebound) * speed;
  // Bump stop: a very stiff rubber block once the travel runs out.
  if (newCompression > c.maxLen) F += c.k * 6 * (newCompression - c.maxLen);
  return Math.max(0, F);
}

// Work out the new spin speed of the wheel and the drive/brake force (Fx).
//
// The tyre force depends on slip: (speed of tyre surface) - (speed of ground).
//   Fx = K * (omega * r - vLong), limited to mu * Fz (the grip available)
// and the wheel's spin changes by:  I * d(omega)/dt = driveTorque - r * Fx
// These two feed each other very strongly, so we solve them together
// ("implicitly") instead of one after the other, which would shake itself apart.
export function solveSpin(w, dt) {
  const { radius: r, inertia: I } = w.cfg;
  const T = w.driveTorque;

  if (!w.grounded) {
    w.omega += (T / I) * dt;
    w.omega = moveToward(w.omega, 0, (w.brakeTorque / I) * dt);
    w.omega *= 1 - 0.3 * dt; // bearing friction
    w.Ieff = I;
    w.Fx = 0;
    w.slip = 0;
    return;
  }

  const Fmax = w.mu * w.Fz;
  const K = Fmax / SLIP_REF;
  const Ieff = I + dt * r * r * K;
  let omega = (I * w.omega + dt * (T + r * K * w.vLong)) / Ieff;
  omega = moveToward(omega, 0, (w.brakeTorque * dt) / Ieff);
  let Fx = K * (omega * r - w.vLong);
  w.Ieff = Ieff;

  if (Math.abs(Fx) > Fmax) {
    // Tyre is past its grip limit: it slides, and the wheel is free to spin up or lock.
    Fx = Math.sign(Fx) * Fmax;
    omega = w.omega + (dt / I) * (T - r * Fx);
    omega = moveToward(omega, 0, (w.brakeTorque * dt) / I);
    w.Ieff = I;
  }
  w.omega = omega;
  w.Fx = Fx;
  w.slip = omega * r - w.vLong;
}

// A locked differential forces both wheels on an axle to turn at the same speed.
export function equalizeAxle(a, b) {
  const omega = (a.Ieff * a.omega + b.Ieff * b.omega) / (a.Ieff + b.Ieff);
  for (const w of [a, b]) {
    w.omega = omega;
    if (!w.grounded) continue;
    const Fmax = w.mu * w.Fz;
    w.Fx = clamp((Fmax / SLIP_REF) * (omega * w.cfg.radius - w.vLong), -Fmax, Fmax);
    w.slip = omega * w.cfg.radius - w.vLong;
  }
}

// Cornering force: pushes back against the wheel sliding sideways.
// `effMass` is how heavy the chassis feels when pushed sideways at this wheel.
export function lateralForce(w, dt, peakAngle, effMass) {
  const Fmax = w.mu * w.Fz;
  if (Fmax <= 0) return 0;
  // Slip angle: the angle between where the wheel points and where it is actually going.
  const angle = Math.atan2(w.vLat, Math.abs(w.vLong) + 0.5);
  const use = Math.sin((Math.PI / 2) * clamp(angle / peakAngle, -1, 1));
  // "Friction circle": grip used for driving/braking is not available for cornering.
  const left = Math.sqrt(Math.max(0.12, 1 - (w.Fx / Fmax) ** 2));
  let Fy = -use * Fmax * left;
  // Never push so hard it would reverse the sideways motion within one step.
  const limit = effMass * Math.abs(w.vLat) / dt * 0.8;
  return clamp(Fy, -limit, limit);
}
