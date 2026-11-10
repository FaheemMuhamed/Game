// All sound is made on the fly with the Web Audio API: no sound files.
//   engine   three humming tones whose pitch follows engine revs
//   tyres    filtered hiss that changes with the surface and speed
//   skid     harsher hiss when tyres slide or spin
//   world    wind, river and crickets
//   one-offs suspension thumps, splashes, interface blips and chimes
// Browsers only allow sound after a key press or click, so it starts on the first one.

import { ROCK, MUD, SAND, GRASS, WOOD } from '../world/surfaces.js';
import { riverZ } from '../world/heightmap.js';

const TYRE_TONE = { [ROCK]: 950, [MUD]: 240, [SAND]: 340, [GRASS]: 420, [WOOD]: 700 };

export function createAudio(G) {
  let ctx = null, master, engine, tyre, skid, wind, river;
  let cricketTimer = 1, thumpCooldown = 0;
  const wasWet = new WeakMap();
  const prevComp = new WeakMap();

  function noiseSource() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    src.start();
    return src;
  }
  let noiseBuffer;

  // A looping hiss through a filter, with its own volume knob.
  function noiseVoice(type, freq, q) {
    const filter = ctx.createBiquadFilter();
    filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    noiseSource().connect(filter).connect(gain).connect(master);
    return { filter, gain };
  }

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = G.save.settings.volume;
    const squash = ctx.createDynamicsCompressor(); // stops loud moments from distorting
    master.connect(squash).connect(ctx.destination);

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // engine
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 400; filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    filter.connect(gain).connect(master);
    const voices = [['sawtooth', 1, 0.5], ['square', 0.5, 0.35], ['triangle', 2, 0.25]].map(([type, mult, level]) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(filter);
      osc.start();
      return { osc, mult };
    });
    engine = { voices, filter, gain };

    tyre = noiseVoice('bandpass', 500, 0.8);
    skid = noiseVoice('bandpass', 1900, 1.6);
    wind = noiseVoice('lowpass', 380, 0.3);
    river = noiseVoice('bandpass', 1100, 0.5);
  }
  window.addEventListener('keydown', start);
  window.addEventListener('pointerdown', start);

  const set = (param, value, time = 0.05) => param.setTargetAtTime(value, ctx.currentTime, time);

  // ---- one-off sounds ----
  function tone(freq, length, level, type = 'sine', slideTo = null) {
    if (!ctx) return;
    const osc = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + length);
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }
  function burst(freq, length, level) {
    if (!ctx) return;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime;
    src.buffer = noiseBuffer;
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.7;
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random());
    src.stop(t + length + 0.02);
  }
  const api = {
    thump: (strength) => { tone(70, 0.16, 0.5 * strength, 'sine', 38); burst(220, 0.08, 0.25 * strength); },
    splash: (strength = 1) => burst(1400, 0.45, 0.3 * strength),
    blip: () => tone(660, 0.07, 0.12, 'triangle'),
    click: () => { tone(520, 0.06, 0.09, 'sine'); tone(780, 0.09, 0.05, 'sine'); },
    tick: () => tone(1500, 0.025, 0.025, 'sine'),
    chime: () => { tone(880, 0.35, 0.2, 'sine'); setTimeout(() => tone(1320, 0.5, 0.18, 'sine'), 90); },
    fanfare: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.45, 0.2, 'triangle'), i * 130)),
    fail: () => tone(220, 0.5, 0.2, 'sawtooth', 110),
    beep: (high) => tone(high ? 880 : 440, high ? 0.5 : 0.18, 0.22, 'square'),
    setVolume(v) { G.save.settings.volume = v; G.save.commit(); if (ctx) set(master.gain, v); },
    get running() { return !!ctx && ctx.state === 'running'; },
    get ctx() { return ctx; },
    get out() { return master; },
  };

  api.update = (dt) => {
    if (!ctx) return;
    const v = G.active, d = v.drive;
    const quiet = G.paused ? 0 : 1;
    const isBike = d.cfg.axles.length === 1;

    // Engine: pitch from revs, louder and brighter with throttle.
    const revs = d.rpm / d.cfg.redline;
    const base = isBike ? d.rpm / 55 : d.rpm / 30;
    for (const { osc, mult } of engine.voices) set(osc.frequency, base * mult, 0.03);
    const dead = v.engineDead ? 0 : 1;
    set(engine.filter.frequency, 260 + revs * 1700 + d.throttle * 1300);
    set(engine.gain.gain, quiet * dead * (0.07 + 0.1 * revs + 0.16 * d.throttle));

    // Tyres.
    const w = v.wheels.find((x) => x.grounded);
    const speed = Math.abs(v.speed);
    let slide = 0;
    for (const x of v.wheels) if (x.grounded) slide = Math.max(slide, Math.abs(x.slip), Math.abs(x.vLat));
    if (w) set(tyre.filter.frequency, w.wet > 0.05 ? 520 : TYRE_TONE[w.surface] ?? 600, 0.2);
    set(tyre.gain.gain, quiet * (w ? Math.min(1, speed / 22) * 0.22 : 0), 0.1);
    set(skid.gain.gain, quiet * (w ? Math.min(1, Math.max(0, slide - 1.2) / 7) * 0.2 : 0), 0.08);
    set(skid.filter.frequency, w && w.surface === MUD ? 700 : 1900, 0.2);

    // World.
    const p = v.body.translation();
    const toRiver = G.MAP.id === 'valley' ? Math.abs(p.z - riverZ(p.x)) : 1e9;
    set(river.gain.gain, quiet * 0.11 * Math.max(0, 1 - toRiver / 45), 0.5);
    set(wind.gain.gain, quiet * (0.035 + Math.min(1, speed / 30) * 0.12 + (G.weather?.rain ?? 0) * 0.12), 0.4);
    set(wind.filter.frequency, 380 + speed * 25 + (G.weather?.rain ?? 0) * 2500, 0.4);
    cricketTimer -= dt;
    if (cricketTimer <= 0 && quiet && !(G.weather?.rain > 0.3) && !(G.weather?.daylight > 0.5)) {
      cricketTimer = 0.6 + Math.random() * 2.2;
      const f = 3900 + Math.random() * 900;
      for (let i = 0; i < 3; i++) setTimeout(() => tone(f, 0.05, 0.022, 'sine'), i * 70);
    }

    // Thumps when the suspension is hit hard; splashes when a wheel enters water.
    thumpCooldown -= dt;
    for (const x of v.wheels) {
      const rate = (x.compression - (prevComp.get(x) ?? x.compression)) / Math.max(dt, 0.001);
      prevComp.set(x, x.compression);
      if (rate > 1.6 && thumpCooldown <= 0 && quiet) { api.thump(Math.min(1, rate / 4)); thumpCooldown = 0.14; }
      const wet = x.grounded && x.wet > 0.08;
      if (wet && !wasWet.get(x) && speed > 2 && quiet) api.splash(Math.min(1, speed / 10));
      wasWet.set(x, wet);
    }
  };
  return api;
}
