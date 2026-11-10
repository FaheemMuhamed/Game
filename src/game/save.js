// Saved progress and settings, kept in the browser's localStorage.

const KEY = 'dusk-trails-save-v1';

const DEFAULTS = {
  settings: { volume: 0.7, quality: 'high', followCam: false, manualGears: false, realism: true, showHelp: true, music: true },
  best: {}, // event id -> { time, medal }
  ghosts: {}, // event id -> recorded run
  beacons: [], // ids of lanterns found
  fog: '', // which parts of the map have been seen
  tutorialDone: false,
  vehicle: 'car',
  keys: {}, // custom key bindings
};

export function loadSave() {
  let data = {};
  try { data = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* corrupt save: start fresh */ }
  const save = { ...structuredClone(DEFAULTS), ...data };
  save.settings = { ...DEFAULTS.settings, ...(data.settings || {}) };
  let timer = null;
  // Call after changing anything. Writes are bundled so we do not hit the disk every frame.
  save.commit = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const { commit, reset, ...plain } = save;
      try { localStorage.setItem(KEY, JSON.stringify(plain)); } catch { /* storage full or blocked */ }
    }, 400);
  };
  save.reset = () => { localStorage.removeItem(KEY); location.reload(); };
  return save;
}
