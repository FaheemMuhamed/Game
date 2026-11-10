// Game controller support (standard layout: Xbox / PlayStation style pads).
// Triggers give smooth throttle and brake, which makes crawling much easier
// than on/off keys.

// Which pad button does what. Numbers are the standard button positions.
const BUTTON_ACTIONS = {
  2: 'fourWD', // X / square
  3: 'lowRange', // Y / triangle
  4: 'lockF', // left bumper
  5: 'lockR', // right bumper
  1: 'recover', // B / circle
  8: 'switch', // back / share
  12: 'lights', // d-pad up
  13: 'camMode', // d-pad down
  14: 'camLeft', // d-pad left
  15: 'camRight', // d-pad right
  11: 'map', // right stick click
  10: 'winch', // left stick click
};
const dead = (v, zone = 0.12) => (Math.abs(v) < zone ? 0 : (v - Math.sign(v) * zone) / (1 - zone));

export function createGamepad(G) {
  let prev = [];
  let connected = false;
  const state = { throttle: 0, steer: 0, handbrake: false, active: false, lean: 0 };

  window.addEventListener('gamepadconnected', () => { connected = true; G.toast('CONTROLLER CONNECTED'); });
  window.addEventListener('gamepaddisconnected', () => { connected = false; state.active = false; });

  function poll() {
    if (!connected || !navigator.getGamepads) return;
    const pad = [...navigator.getGamepads()].find((p) => p && p.connected);
    if (!pad) return;
    const b = pad.buttons.map((x) => x.value), was = (i) => (prev[i] ?? 0) > 0.5, now = (i) => (b[i] ?? 0) > 0.5;
    const hit = (i) => now(i) && !was(i);

    // driving
    const steer = dead(pad.axes[0] ?? 0);
    state.steer = -Math.sign(steer) * steer * steer; // squared: finer control near the centre
    state.throttle = (b[7] ?? 0) - (b[6] ?? 0);
    state.handbrake = now(0);
    state.lean = -dead(pad.axes[3] ?? 0, 0.25);
    if (Math.abs(state.throttle) > 0.05 || Math.abs(state.steer) > 0.05) state.active = true;

    if (G.menus.open) {
      // menus: d-pad moves, A chooses, B goes back
      const items = [...document.querySelectorAll('#menu button, #menu input, #menu select')];
      const at = items.indexOf(document.activeElement);
      if (hit(12)) items[Math.max(0, at - 1)]?.focus();
      if (hit(13)) items[Math.min(items.length - 1, at + 1)]?.focus();
      if (hit(0)) document.activeElement?.click();
      if (hit(1) || hit(9)) G.handleKey('Escape');
    } else {
      if (hit(9)) G.handleKey('Escape');
      for (const [i, action] of Object.entries(BUTTON_ACTIONS)) if (hit(+i)) G.handleKey(G.keymap.code(action));
      const zoom = dead(pad.axes[3] ?? 0, 0.3);
      if (zoom && !G.active.cfg.canLean) G.cam.zoomBy(1 + zoom * 0.02);
    }
    prev = b;
  }

  return { update: poll, state };
}
