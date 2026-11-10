// Keyboard. Held keys become driving input; single presses become actions.
// Every action has a default key that the player can change in Settings.

export const ACTIONS = [
  { id: 'throttle', label: 'Accelerate', key: 'KeyW' },
  { id: 'brake', label: 'Brake / reverse', key: 'KeyS' },
  { id: 'left', label: 'Steer left', key: 'KeyA' },
  { id: 'right', label: 'Steer right', key: 'KeyD' },
  { id: 'gentle', label: 'Gentle throttle (hold)', key: 'ShiftLeft' },
  { id: 'handbrake', label: 'Handbrake', key: 'Space' },
  { id: 'fourWD', label: '2WD / 4WD', key: 'KeyF' },
  { id: 'lowRange', label: 'Low range', key: 'KeyL' },
  { id: 'lockF', label: 'Front diff lock', key: 'Digit1' },
  { id: 'lockR', label: 'Rear diff lock', key: 'Digit2' },
  { id: 'switch', label: 'Switch vehicle', key: 'KeyV' },
  { id: 'recover', label: 'Recover to firm ground', key: 'KeyR' },
  { id: 'camLeft', label: 'Rotate camera left', key: 'KeyQ' },
  { id: 'camRight', label: 'Rotate camera right', key: 'KeyE' },
  { id: 'camMode', label: 'Camera: fixed / follow', key: 'KeyC' },
  { id: 'map', label: 'Big map', key: 'KeyM' },
  { id: 'lights', label: 'Headlights', key: 'KeyH' },
  { id: 'winch', label: 'Winch: hook / release', key: 'KeyG' },
  { id: 'tyres', label: 'Tyre pressure: air down / up', key: 'KeyT' },
  { id: 'time', label: 'Change time of day', key: 'KeyB' },
  { id: 'weather', label: 'Rain on / off', key: 'KeyN' },
  { id: 'leanBack', label: 'Bike: lean back (wheelie)', key: 'KeyK' },
  { id: 'leanFwd', label: 'Bike: lean forward', key: 'KeyI' },
  { id: 'hitch', label: 'Trailer: hitch / unhitch', key: 'KeyJ' },
  { id: 'gearUp', label: 'Gear up (manual gears)', key: 'KeyX' },
  { id: 'gearDown', label: 'Gear down (manual gears)', key: 'KeyZ' },
  { id: 'photo', label: 'Photo mode', key: 'KeyP' },
  { id: 'help', label: 'Show / hide controls', key: 'Slash' },
];

const held = new Set();
const pressed = []; // keys pressed since the last time actions were read

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (!e.repeat) pressed.push(e.code);
  held.add(e.code);
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => held.clear());

export const isHeld = (code) => held.has(code);

// Turn a key code into something readable: "KeyW" -> "W", "Digit1" -> "1".
export function keyName(code) {
  if (!code) return '—';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Shift').replace('ShiftRight', 'R-Shift')
    .replace('Backquote', '`').replace('Slash', '/').replace('Arrow', '').replace('Comma', ',').replace('Period', '.');
}

export function createKeymap(save) {
  const map = {};
  const load = () => { for (const a of ACTIONS) map[a.id] = save.keys[a.id] ?? a.key; };
  load();
  const km = {
    actions: ACTIONS,
    waiting: null, // action id we are waiting for a new key for
    code: (id) => map[id],
    label: (id) => keyName(map[id]),
    actionOf: (code) => ACTIONS.find((a) => map[a.id] === code)?.id ?? null,
    down: (id) => held.has(map[id]),
    capture(code) {
      const id = km.waiting;
      km.waiting = null;
      if (code === 'Escape') return;
      // if another action already uses this key, swap them
      const other = ACTIONS.find((a) => a.id !== id && map[a.id] === code);
      if (other) { map[other.id] = map[id]; save.keys[other.id] = map[id]; }
      map[id] = code; save.keys[id] = code; save.commit();
      km.onChange?.();
    },
    reset() { save.keys = {}; save.commit(); load(); km.onChange?.(); },
    refresh: load,
  };
  return km;
}

// What the driver is asking for right now.
export function readDriving(km) {
  const gentle = km.down('gentle') || held.has('ShiftRight') ? 0.4 : 1; // hold for a light foot
  const throttle = ((km.down('throttle') || held.has('ArrowUp') ? 1 : 0) - (km.down('brake') || held.has('ArrowDown') ? 1 : 0)) * gentle;
  const steer = (km.down('left') || held.has('ArrowLeft') ? 1 : 0) - (km.down('right') || held.has('ArrowRight') ? 1 : 0); // + is left
  return { throttle, steer, handbrake: km.down('handbrake') };
}

// One-off key presses (toggle 4WD, switch vehicle...). Returns and clears the list.
export function takePresses() {
  return pressed.splice(0, pressed.length);
}
