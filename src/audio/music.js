// Background music, composed as it plays: a slow wash of chords with the odd
// plucked note over the top. It swells a little when you are moving fast or
// in an event, and sits back when you are pottering about.

const CHORDS = [ // four chords, low notes in Hz
  [110.0, 130.81, 164.81], // A minor
  [87.31, 130.81, 174.61], // F
  [130.81, 164.81, 196.0], // C
  [98.0, 123.47, 146.83], // G
];
const NOTES = [220, 261.63, 293.66, 329.63, 392, 440, 523.25]; // notes that always sound good over those chords
const CHORD_SECONDS = 9;

export function createMusic(G) {
  let built = false, pad, filter, out, echoIn, chordAt = 0, chordClock = 0, pluckClock = 2, energy = 0.2;

  function build(ctx, master) {
    out = ctx.createGain();
    out.gain.value = 0;
    out.connect(master);
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 500; filter.Q.value = 0.4;
    filter.connect(out);
    // each chord note is two slightly out-of-tune tones, which makes it shimmer
    pad = CHORDS[0].map((f) => [-4, 5].map((cents) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = f; osc.detune.value = cents;
      g.gain.value = 0.16;
      osc.connect(g).connect(filter);
      osc.start();
      return osc;
    }));
    // a soft echo for the plucked notes
    const delay = ctx.createDelay(1), feedback = ctx.createGain();
    delay.delayTime.value = 0.36; feedback.gain.value = 0.34;
    echoIn = ctx.createGain();
    echoIn.connect(out);
    echoIn.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(out);
    built = true;
  }

  function pluck(ctx) {
    const f = NOTES[Math.floor(Math.random() * NOTES.length)] * (Math.random() < 0.25 ? 2 : 1);
    const osc = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    osc.type = 'sine'; osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    osc.connect(g).connect(echoIn);
    osc.start(t); osc.stop(t + 1.7);
  }

  function update(dt) {
    const ctx = G.audio.ctx;
    if (!ctx) return;
    if (!built) build(ctx, G.audio.out);
    const on = G.save.settings.music;
    const t = ctx.currentTime;
    // how lively: speed, plus a lift during events; calm in menus
    const want = G.menus.open ? 0.25 : Math.min(1, Math.abs(G.active.speed) / 20) * 0.6 + (G.modes.kind !== 'free' ? 0.4 : 0.1);
    energy += (want - energy) * Math.min(1, dt * 0.4);
    out.gain.setTargetAtTime(on ? 0.22 + energy * 0.16 : 0, t, 0.8);
    filter.frequency.setTargetAtTime(380 + energy * 1500, t, 0.6);
    if (!on) return;

    chordClock += dt;
    if (chordClock > CHORD_SECONDS) {
      chordClock = 0;
      chordAt = (chordAt + 1) % CHORDS.length;
      CHORDS[chordAt].forEach((f, i) => pad[i].forEach((osc) => osc.frequency.setTargetAtTime(f, t, 0.9))); // glide to the next chord
    }
    pluckClock -= dt;
    if (pluckClock <= 0) { pluckClock = 3.6 - energy * 2.6 + Math.random() * 1.5; pluck(ctx); }
  }

  return { update };
}
