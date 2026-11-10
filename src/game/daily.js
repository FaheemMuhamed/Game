// The daily challenge: one trail run a day, the same for everyone, with a
// twist (weather, time of day, and which vehicle you must use). The date is
// turned into a number, and that number picks the run and the twist.

import { RUNS } from './modes.js';
import { formatTime } from '../ui/objective.js';

function numberFromDate(text) {
  let h = 2166136261;
  for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function createDaily(G) {
  const today = new Date().toISOString().slice(0, 10);
  const n = numberFromDate(today);
  const runs = RUNS.filter((r) => !r.scoring && !r.night);
  const run = runs[n % runs.length];
  const twists = [
    { text: 'in the rain', rain: true }, { text: 'at night', time: 1 }, { text: 'in broad daylight', time: 3 }, { text: 'at dawn', time: 2 }, { text: 'at night in the rain', time: 1, rain: true },
  ];
  const twist = twists[(n >>> 8) % twists.length];
  const entry = G.garage[(n >>> 16) % G.garage.length];
  const saved = () => (G.save.daily?.date === today ? G.save.daily : null);
  const describe = () => `${run.name} ${twist.text}, in the ${entry.vehicle.cfg.name}`;

  return {
    today, run, describe,
    get best() { return saved()?.time ?? null; },
    start() { G.modes.startRun(run.id, { vehicle: entry.vehicle, rain: twist.rain, time: twist.time, daily: true }); },
    // called when a daily run finishes; returns the text to share
    finish(time) {
      if (!saved() || time < saved().time) { G.save.daily = { date: today, time }; G.save.commit(); }
      return `Dusk Trails daily ${today}: ${describe()}. ${formatTime(time)}`;
    },
    tile: () => ({ act: 'daily', img: run.id, title: 'Daily challenge', sub: `${describe()}.`, stats: [['Today', saved() ? formatTime(saved().time) : 'Not driven'], ['Resets', 'Midnight UTC']] }),
  };
}
