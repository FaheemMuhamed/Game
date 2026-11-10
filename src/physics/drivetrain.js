// Engine -> gearbox -> high/low range -> 2WD/4WD -> differentials -> wheels.
// Also decides the brakes, and whether "back" means brake or reverse.

import { clamp, lerp } from './vec.js';

const RAD_TO_RPM = 60 / (2 * Math.PI);

export class Drivetrain {
  // cfg.axles: [{ wheels: [index, index] }, ...] front first, rear last.
  constructor(cfg) {
    this.cfg = cfg;
    this.gear = 1; // 1..n forward, -1 reverse
    this.lowRange = false;
    this.fourWD = cfg.axles.length > 1 ? cfg.startIn4WD ?? false : false;
    this.locked = cfg.axles.map(() => false); // diff lock per axle
    this.rpm = cfg.idle;
    this.throttle = 0;
    this.brake = 0;
    this.shiftTimer = 0;
    this.torqueScale = 1;
    this.manual = false; // true = the driver changes gear
  }

  // Manual gear change. dir is +1 (up) or -1 (down). From 1st, down selects reverse.
  shift(dir, speed) {
    const n = this.cfg.gears.length;
    if (dir > 0) this.gear = this.gear < 0 ? 1 : Math.min(n, this.gear + 1);
    else if (this.gear > 1) this.gear--;
    else if (this.gear === 1 && speed < 1.5) this.gear = -1;
    this.shiftTimer = 0.35;
  }

  get ratio() {
    const g = this.gear > 0 ? this.cfg.gears[this.gear - 1] : this.cfg.reverse;
    return g * this.cfg.final * (this.lowRange ? this.cfg.lowRatio : 1);
  }

  // Which axles get engine power right now.
  drivenAxles() {
    const a = this.cfg.axles;
    if (a.length === 1) return [0];
    return this.fourWD ? a.map((_, i) => i) : [a.length - 1];
  }

  // Engine torque (Nm) at a given rpm, at full throttle: a simple hump shape.
  curve(rpm) {
    const c = this.cfg;
    const x = (rpm - c.rpmPeak) / (c.redline - c.idle);
    const t = c.torque * Math.max(0.45, 1 - 1.6 * x * x);
    const limiter = clamp((c.redline - rpm) / 250, 0, 1); // cuts power at the red line
    return t * limiter;
  }

  // input.throttle is -1..1 (forward / back), input.handbrake true/false.
  update(dt, input, wheels, speed) {
    const c = this.cfg;
    let throttle = 0, brake = 0;
    const ax = input.throttle;

    if (this.manual) {
      // Manual gears: forward is always throttle, back is always brake.
      if (ax > 0) throttle = ax; else if (ax < 0) brake = -ax;
    } else if (this.gear > 0) {
      // Pressing "back" while rolling forward brakes; once stopped it selects reverse.
      if (ax > 0) throttle = ax;
      else if (ax < 0) {
        if (speed > 1) brake = -ax;
        else { this.gear = -1; throttle = -ax; }
      }
    } else {
      if (ax < 0) throttle = -ax;
      else if (ax > 0) {
        if (speed < -1) brake = ax;
        else { this.gear = 1; throttle = ax; }
      }
    }
    // Hold the vehicle still when nothing is pressed and it has all but stopped.
    if (ax === 0 && Math.abs(speed) < 0.6 && !this.noHold) brake = 1; // (the winch sets noHold so it can pull you)
    this.throttle = throttle;
    this.brake = brake;

    // Engine speed follows the driven wheels (never below idle).
    const driven = this.drivenAxles();
    let omega = 0, count = 0;
    for (const ai of driven) for (const wi of c.axles[ai].wheels) { omega += wheels[wi].omega; count++; }
    omega /= count;
    const coupled = Math.abs(omega) * this.ratio * RAD_TO_RPM;
    this.rpm = lerp(this.rpm, Math.max(c.idle, coupled), 1 - Math.exp(-dt * 18));

    // Automatic gear changes. Only shift up if the vehicle itself (not just a
    // spinning wheel) is going fast enough.
    const groundRpm = (Math.abs(speed) / wheels[c.axles[driven[0]].wheels[0]].cfg.radius) * this.ratio * RAD_TO_RPM;
    this.shiftTimer -= dt;
    if (!this.manual && this.gear > 0 && this.shiftTimer <= 0) {
      if (coupled > c.shiftUp && groundRpm > c.shiftUp * 0.75 && this.gear < c.gears.length && throttle > 0.1) { this.gear++; this.shiftTimer = 0.45; }
      else if (coupled < c.shiftDown && this.gear > 1) { this.gear--; this.shiftTimer = 0.45; }
    }

    // Torque coming out of the gearbox, at the wheels.
    let engine = throttle * this.curve(Math.max(c.idle, coupled)) * this.torqueScale * (this.powerScale ?? 1);
    if (throttle < 0.05 && coupled > c.idle * 1.2) engine -= c.torque * 0.1 * (coupled / c.redline); // engine braking
    if (this.shiftTimer > 0.3) engine *= 0.3; // brief lift during a gear change
    const total = engine * this.ratio * (this.gear > 0 ? 1 : -1);
    const mag = Math.abs(total), sign = Math.sign(total);

    // An OPEN differential can only send as much torque to each side as the wheel with
    // the LEAST grip can push back with. So one wheel in the air (or on ice) means
    // almost nothing reaches the wheel that does have grip. Locking the diff removes the limit.
    const capOf = (ai) => {
      const ws = c.axles[ai].wheels;
      if (ws.length < 2 || this.locked[ai]) return Infinity;
      const weakest = Math.min(...ws.map((wi) => wheels[wi].mu * wheels[wi].Fz * wheels[wi].cfg.radius));
      const spinUp = Math.max(60, 0.12 * mag / ws.length / driven.length);
      return ws.length * (weakest + spinUp);
    };
    const share = c.axles.map(() => 0);
    if (driven.length === 2) {
      // 4WD: front and rear are locked together, so torque one axle cannot use goes to the other.
      const [f, r] = driven;
      const capF = capOf(f), capR = capOf(r);
      share[f] = Math.min(mag / 2, capF);
      share[r] = Math.min(mag - share[f], capR);
      share[f] = Math.min(mag - share[r], capF);
    } else {
      share[driven[0]] = Math.min(mag, capOf(driven[0]));
    }

    for (const w of wheels) { w.driveTorque = 0; }
    c.axles.forEach((axle, ai) => {
      for (const wi of axle.wheels) wheels[wi].driveTorque = (sign * share[ai]) / axle.wheels.length;
    });

    // Brakes. Foot brake eases off just before the wheel would lock (like ABS);
    // the handbrake locks its wheels outright.
    for (const w of wheels) {
      const grip = w.mu * w.Fz * w.cfg.radius;
      let t = Math.min(brake * w.cfg.brake, grip * 0.98 + 40);
      if (input.handbrake && w.cfg.handbrake) t = Math.max(t, w.cfg.brake * 2.5);
      w.brakeTorque = t;
    }
  }
}
