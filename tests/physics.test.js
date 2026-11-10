// Headless physics checks: no browser, no graphics, just the simulation.
import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { makeTerrain } from '../src/world/heightmap.js';
import { createPhysicsWorld, PHYSICS_DT } from '../src/physics/physicsWorld.js';
import { createCar } from '../src/physics/car.js';
import { createBike } from '../src/physics/bike.js';
import { createBuggy, createTruck, createTrials } from '../src/physics/garage.js';
import { DIRT, ROCK, MUD } from '../src/world/surfaces.js';
import { rotate, Y } from '../src/physics/vec.js';

beforeAll(async () => { await RAPIER.init(); });

function setup(heightFn, surfaceFn = () => DIRT, size = 160) {
  const terrain = makeTerrain({ size, cell: 0.5, heightFn, surfaceFn });
  return createPhysicsWorld(RAPIER, terrain);
}
function run(phys, vehicle, seconds, input) {
  const steps = Math.round(seconds / PHYSICS_DT);
  for (let i = 0; i < steps; i++) {
    vehicle.step(PHYSICS_DT, typeof input === 'function' ? input(i * PHYSICS_DT) : input);
    phys.world.step();
  }
}
const IDLE = { throttle: 0, steer: 0, handbrake: false };
const GO = { throttle: 1, steer: 0, handbrake: false };

describe('terrain collider', () => {
  it('matches the height function (grid is not flipped)', () => {
    const h = (x, z) => 0.05 * x + 0.02 * z + 3;
    const phys = setup(h, undefined, 80);
    for (const [x, z] of [[10, -20], [-25, 5], [30, 30]]) {
      const ray = new RAPIER.Ray({ x, y: 50, z }, { x: 0, y: -1, z: 0 });
      const hit = phys.world.castRay(ray, 100, true);
      expect(50 - hit.timeOfImpact).toBeCloseTo(h(x, z), 1);
    }
  });
});

describe('car', () => {
  it('settles at ride height on flat ground without jitter', () => {
    const phys = setup(() => 0);
    const car = createCar(phys);
    car.place(0, 0, 0);
    run(phys, car, 4, IDLE);
    const y1 = car.body.translation().y;
    run(phys, car, 1, IDLE);
    const y2 = car.body.translation().y;
    expect(y1).toBeGreaterThan(0.65);
    expect(y1).toBeLessThan(0.85);
    expect(Math.abs(y2 - y1)).toBeLessThan(0.002);
    const v = car.body.linvel();
    expect(Math.hypot(v.x, v.z)).toBeLessThan(0.005);
    for (const w of car.wheels) expect(w.grounded).toBe(true);
  });

  it('accelerates, shifts up, and brakes to a stop', () => {
    const phys = setup(() => 0, undefined, 400);
    const car = createCar(phys);
    car.place(0, -150, 0);
    run(phys, car, 1, IDLE);
    run(phys, car, 6, GO);
    expect(car.speed).toBeGreaterThan(12);
    expect(car.drive.gear).toBeGreaterThan(1);
    run(phys, car, 5, { throttle: -1, steer: 0, handbrake: false });
    // it has stopped and begun reversing, or is stopped
    expect(car.speed).toBeLessThan(1);
  });

  it('turns left when steering left', () => {
    const phys = setup(() => 0, undefined, 400);
    const car = createCar(phys);
    car.place(0, 0, 0);
    run(phys, car, 1, IDLE);
    run(phys, car, 4, { throttle: 0.6, steer: 1, handbrake: false });
    expect(car.body.translation().x).toBeGreaterThan(3); // +X is left
    expect(rotate(car.body.rotation(), Y).y).toBeGreaterThan(0.9); // still upright
  });

  it('climbs a 25 degree slope in low range 4WD', () => {
    const slope = Math.tan((25 * Math.PI) / 180);
    const phys = setup((x, z) => Math.max(0, z) * slope, undefined, 200);
    const car = createCar(phys);
    car.place(0, -10, 0);
    car.drive.fourWD = true;
    car.drive.lowRange = true;
    run(phys, car, 1, IDLE);
    run(phys, car, 12, GO);
    expect(car.body.translation().z).toBeGreaterThan(25);
    expect(car.body.translation().y).toBeGreaterThan(10);
  });

  it('is stuck with open diffs on split grip, and drives out with diffs locked', () => {
    // Flat run-up, then a 12 degree hill. Left wheels (x > 0) on ice, right wheels on rock.
    const slope = Math.tan((12 * Math.PI) / 180);
    const ICE = 7;
    const make = (lock) => {
      const phys = setup((x, z) => Math.max(0, z + 5) * slope, (x) => (x > 0 ? ICE : ROCK), 200);
      const car = createCar(phys);
      car.place(0, -12, 0);
      car.drive.fourWD = true;
      car.drive.locked = [lock, lock];
      run(phys, car, 1, IDLE);
      // part throttle, steering to keep pointing straight up the hill (yaw 0)
      const steps = Math.round(10 / PHYSICS_DT);
      for (let i = 0; i < steps; i++) {
        car.step(PHYSICS_DT, { throttle: 0.6, steer: Math.max(-1, Math.min(1, -car.yaw() * 4)), handbrake: false });
        phys.world.step();
      }
      return car.body.translation().z;
    };
    const open = make(false), locked = make(true);
    expect(open).toBeLessThan(2); // rolled up a little on momentum, then slid back
    expect(locked).toBeGreaterThan(10);
  });
});

describe('bike', () => {
  it('stays upright standing still and at speed', () => {
    const phys = setup(() => 0, undefined, 400);
    const bike = createBike(phys);
    bike.place(0, -150, 0);
    run(phys, bike, 3, IDLE);
    expect(Math.abs(bike.lean)).toBeLessThan(0.03);
    run(phys, bike, 4, { throttle: 0.7, steer: 0, handbrake: false });
    expect(bike.speed).toBeGreaterThan(8);
    expect(Math.abs(bike.lean)).toBeLessThan(0.05);
  });

  it('keeps its heading under power on slippery mud', () => {
    const phys = setup(() => 0, () => MUD, 400);
    const bike = createBike(phys);
    bike.place(0.1, -150, 0.05);
    run(phys, bike, 1, IDLE);
    run(phys, bike, 6, GO);
    expect(Math.abs(bike.yaw() - 0.05)).toBeLessThan(0.15);
    expect(bike.crashed).toBe(false);
    expect(bike.body.translation().z).toBeGreaterThan(-147); // slow going, but forwards
  });

  it('does not flip over backwards at full throttle on grippy rock', () => {
    const phys = setup(() => 0, () => ROCK, 400);
    const bike = createBike(phys);
    bike.place(0.1, -150, 0);
    run(phys, bike, 1, IDLE);
    let worst = 1;
    for (let i = 0; i < 6 * 120; i++) {
      bike.step(PHYSICS_DT, GO); phys.world.step();
      worst = Math.min(worst, rotate(bike.body.rotation(), Y).y);
    }
    expect(worst).toBeGreaterThan(0.5);
    expect(bike.speed).toBeGreaterThan(10);
  });

  it('leans into a left turn and actually turns left', () => {
    const phys = setup(() => 0, undefined, 400);
    const bike = createBike(phys);
    bike.place(0, 0, 0);
    run(phys, bike, 1, IDLE);
    run(phys, bike, 3, { throttle: 0.6, steer: 0, handbrake: false });
    run(phys, bike, 2, { throttle: 0.4, steer: 1, handbrake: false });
    expect(bike.lean).toBeGreaterThan(0.2); // + lean is left
    expect(bike.body.translation().x).toBeGreaterThan(2);
    expect(bike.crashed).toBe(false);
  });
});

describe('other vehicles', () => {
  for (const [name, make, minSpeed] of [['buggy', createBuggy, 14], ['truck', createTruck, 7], ['trials bike', createTrials, 6]]) {
    it(`${name} settles upright, at its ride height, and drives`, () => {
      const phys = setup(() => 0, undefined, 400);
      const v = make(phys);
      v.place(0.1, -150, 0);
      run(phys, v, 3, IDLE);
      expect(Math.abs(v.body.translation().y - v.cfg.rideHeight)).toBeLessThan(0.08);
      expect(rotate(v.body.rotation(), Y).y).toBeGreaterThan(0.99);
      run(phys, v, 6, GO);
      expect(v.speed).toBeGreaterThan(minSpeed);
      expect(rotate(v.body.rotation(), Y).y).toBeGreaterThan(0.9);
    });
  }

  it('bike lifts its front wheel when the rider leans back', () => {
    const phys = setup(() => 0, undefined, 400);
    const bike = createBike(phys);
    bike.place(0.1, -150, 0);
    run(phys, bike, 1, IDLE);
    bike.shift = 1;
    let lifted = false, worst = 1;
    for (let i = 0; i < 3 * 120; i++) {
      bike.step(PHYSICS_DT, { throttle: 0.8, steer: 0, handbrake: false }); phys.world.step();
      if (!bike.wheels[0].grounded && bike.wheels[1].grounded) lifted = true;
      worst = Math.min(worst, rotate(bike.body.rotation(), Y).y);
    }
    expect(lifted).toBe(true);
    expect(worst).toBeGreaterThan(0.2); // did not go right over
  });
});

describe('trailer', () => {
  it('follows the car without flipping or breaking away', async () => {
    const { createTrailer } = await import('../src/physics/trailer.js');
    const phys = setup(() => 0, undefined, 400);
    const car = createCar(phys);
    car.place(0.1, -150, 0);
    const trailer = createTrailer(phys);
    run(phys, car, 1, IDLE);
    trailer.hitch(car);
    const both = (seconds, input) => {
      for (let i = 0; i < seconds * 120; i++) { car.step(PHYSICS_DT, input); trailer.step(PHYSICS_DT); phys.world.step(); }
    };
    both(2, IDLE);
    both(5, { throttle: 0.8, steer: 0, handbrake: false });
    both(3, { throttle: 0.5, steer: 0.6, handbrake: false });
    both(2, { throttle: -1, steer: 0, handbrake: false });
    const a = car.body.translation(), b = trailer.vehicle.body.translation();
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(6.5);
    expect(rotate(trailer.vehicle.body.rotation(), Y).y).toBeGreaterThan(0.85);
    expect(rotate(car.body.rotation(), Y).y).toBeGreaterThan(0.9);
    expect(Number.isFinite(b.y)).toBe(true);
  });
});
