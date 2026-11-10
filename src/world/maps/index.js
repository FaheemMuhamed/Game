// Which map is being played. The choice is remembered by the browser and
// read once, right at the start, because the whole world is built from it.

import frost from './frost.js';
import canyon from './canyon.js';
import island from './island.js';

const KEY = 'dusk-trails-map';
// The valley is the original map; its land and scenery live in heightmap.js and props.js.
const valley = { id: 'valley', name: 'Dusk Valley', blurb: 'River, mud, rock field and a mountain road, lit by lanterns. The original map, with the guided first drive.', size: 360, time: 0, hasWater: true, tutorial: true };

export const MAPS = [valley, frost, canyon, island];

function savedId() {
  try { return localStorage.getItem(KEY); } catch { return null; } // no browser storage (tests): fall back to the valley
}
export const MAP = MAPS.find((m) => m.id === savedId()) ?? valley;

// Switch map: remember the choice and start again.
export function chooseMap(id) {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  location.reload();
}
