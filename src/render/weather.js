// Time of day and rain.
//   Time moves through dusk -> night -> dawn -> day, blending the light.
//   Rain makes dirt and grass greasy, slowly raises the river, and darkens the ground.

import * as THREE from 'three';
import { env } from '../world/surfaces.js';

// The look of each part of the day.
const TIMES = [
  { name: 'DUSK', sky: 0x6f8fbf, ground: 0x2a2018, hemi: 0.9, sun: 0x9db4e0, sunPower: 1.6, bg: 0x0a1216, lantern: 55, exposure: 1.3, bloom: 0.75, daylight: 0 },
  { name: 'NIGHT', sky: 0x34486e, ground: 0x15120f, hemi: 0.5, sun: 0x6f86c0, sunPower: 0.8, bg: 0x04070a, lantern: 75, exposure: 1.3, bloom: 0.9, daylight: 0 },
  { name: 'DAWN', sky: 0xd9a7a0, ground: 0x3a2a20, hemi: 0.9, sun: 0xffc9a0, sunPower: 1.9, bg: 0x2a2630, lantern: 25, exposure: 1.15, bloom: 0.5, daylight: 0.5 },
  { name: 'DAY', sky: 0xbfd8ff, ground: 0x6a5a40, hemi: 1.2, sun: 0xfff1d6, sunPower: 2.6, bg: 0x4f7896, lantern: 0, exposure: 0.95, bloom: 0.25, daylight: 1 },
];
const PHASE_SECONDS = 200; // how long each part of the day lasts when time runs by itself
const DROPS = 900;

export function createWeather(G) {
  const { lighting, scene } = G;
  const start = G.MAP.time ?? 0, snow = G.MAP.precip === 'snow';
  const state = { index: start, blend: 1, from: TIMES[start], clock: 0, rain: 0, raining: false, rainClock: 240 + Math.random() * 180, daylight: 0, auto: true };
  scene.background = new THREE.Color(TIMES[start].bg);

  // rain drops: thin streaks that fall around the camera and wrap round
  const drops = new THREE.InstancedMesh(snow ? new THREE.BoxGeometry(0.09, 0.09, 0.09) : new THREE.BoxGeometry(0.035, 1.1, 0.035), new THREE.MeshBasicMaterial({ color: snow ? 0xffffff : 0x9fc4d8, transparent: true, opacity: snow ? 0.9 : 0.55 }), DROPS);
  drops.frustumCulled = false;
  drops.visible = false;
  scene.add(drops);
  const dropPos = Array.from({ length: DROPS }, () => [Math.random() * 60 - 30, Math.random() * 30, Math.random() * 60 - 30]);
  const m = new THREE.Matrix4();

  const a = new THREE.Color(), b = new THREE.Color();
  const mix = (x, y, t) => x + (y - x) * t;
  const mixColor = (target, x, y, t) => target.copy(a.setHex(x)).lerp(b.setHex(y), t);

  function setTime(i) {
    state.from = currentLook();
    state.index = ((i % TIMES.length) + TIMES.length) % TIMES.length;
    state.blend = 0;
    state.clock = 0;
    G.toast(TIMES[state.index].name);
  }
  // the look right now, frozen, so a new blend can start from it
  function currentLook() {
    const f = state.from, t = TIMES[state.index], k = state.blend, out = {};
    for (const key of ['hemi', 'sunPower', 'lantern', 'exposure', 'bloom', 'daylight']) out[key] = mix(f[key], t[key], k);
    for (const key of ['sky', 'ground', 'sun', 'bg']) out[key] = a.setHex(f[key]).lerp(b.setHex(t[key]), k).getHex();
    return out;
  }

  function update(dt) {
    if (G.paused && !G.photo) return;
    // ---- time of day ----
    if (state.auto && G.modes.kind === 'free') {
      state.clock += dt;
      if (state.clock > PHASE_SECONDS) setTime(state.index + 1);
    }
    if (snow && state.rainClock > 60 && !state.snowStarted) { state.snowStarted = true; state.raining = true; state.rainClock = 200; // it is usually snowing up here
    }
    state.blend = Math.min(1, state.blend + dt / 5);
    const f = state.from, t = TIMES[state.index], k = state.blend;
    const dim = 1 - 0.35 * state.rain; // clouds
    mixColor(lighting.sky.color, f.sky, t.sky, k);
    mixColor(lighting.sky.groundColor, f.ground, t.ground, k);
    lighting.sky.intensity = mix(f.hemi, t.hemi, k) * dim;
    mixColor(lighting.moon.color, f.sun, t.sun, k);
    lighting.settings.moonPower = mix(f.sunPower, t.sunPower, k) * dim;
    lighting.settings.lanternPower = mix(f.lantern, t.lantern, k);
    mixColor(scene.background, f.bg, t.bg, k).multiplyScalar(dim);
    if (!G.photo) {
      G.renderer.toneMappingExposure = mix(f.exposure, t.exposure, k);
      G.post.settings.bloom = mix(f.bloom, t.bloom, k);
    }
    state.daylight = mix(f.daylight, t.daylight, k);

    // ---- rain ----
    if (state.auto && G.modes.kind === 'free') {
      state.rainClock -= dt;
      if (state.rainClock <= 0) { state.raining = !state.raining; state.rainClock = state.raining ? 70 + Math.random() * 50 : 240 + Math.random() * 240; G.toast(state.raining ? (snow ? 'SNOW' : 'RAIN') : snow ? 'THE SNOW STOPS' : 'THE RAIN EASES'); }
    }
    state.rain += ((state.raining ? 1 : 0) - state.rain) * (1 - Math.exp(-dt * 0.5));
    if (!snow) env.wetness += ((state.raining ? 1 : 0) - env.wetness) * (1 - Math.exp(-dt * (state.raining ? 0.06 : 0.02))); // ground soaks slowly, dries slower
    if (!snow) env.waterLevel += ((state.raining ? 0.3 : 0) - env.waterLevel) * (1 - Math.exp(-dt * 0.012)); // the river rises over a few minutes
    G.terrainMesh.material.color.setScalar(1 - 0.28 * env.wetness); // wet ground is darker

    drops.visible = state.rain > 0.03;
    if (drops.visible) {
      const c = G.cam.focus, count = Math.floor(DROPS * state.rain);
      drops.count = count;
      for (let i = 0; i < count; i++) {
        const p = dropPos[i];
        p[1] -= (snow ? 4.5 : 26) * dt;
        if (snow) p[0] += Math.sin(p[1] * 0.7 + i) * dt * 1.2;
        if (p[1] < -2) { p[1] += 30; p[0] = Math.random() * 60 - 30; p[2] = Math.random() * 60 - 30; }
        m.makeTranslation(c.x + p[0], c.y + p[1], c.z + p[2]);
        drops.setMatrixAt(i, m);
      }
      drops.instanceMatrix.needsUpdate = true;
    }
  }

  return {
    update, setTime, state,
    get rain() { return state.rain; },
    get daylight() { return state.daylight; },
    get timeName() { return TIMES[state.index].name; },
    setRain(on) { state.raining = on; state.rainClock = on ? 90 : 300; G.toast(on ? (snow ? 'SNOW' : 'RAIN') : snow ? 'THE SNOW STOPS' : 'THE RAIN EASES'); },
    onKey(code, action) {
      if (G.paused) return false;
      if (action === 'time') { setTime(state.index + 1); return true; }
      if (action === 'weather') { this.setRain(!state.raining); return true; }
      return false;
    },
  };
}
