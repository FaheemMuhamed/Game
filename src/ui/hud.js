// The on-screen readout: speed, gear, engine revs, drive mode lights.

import { SURFACES } from '../world/surfaces.js';

const $ = (id) => document.getElementById(id);

// "REAR DIFF LOCKED" -> "Rear diff locked". Short all-capital words like 4WD stay as they are.
export function sentence(text) {
  if (text !== text.toUpperCase()) return text;
  const keep = new Set(['4WD', '2WD', 'GO']);
  const out = text.split(' ').map((w) => (keep.has(w) ? w : w.toLowerCase())).join(' ');
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export function createHud(G) {
  const el = {
    speed: $('speed'), gear: $('gear'), rpm: $('rpm-fill'), vehicle: $('vehicle'), surface: $('surface'),
    fourwd: $('ind-4wd'), low: $('ind-low'), flock: $('ind-flock'), rlock: $('ind-rlock'),
    help: $('help'), toast: $('toast'), air: $('ind-air'), winch: $('ind-winch'), manual: $('ind-manual'),
    fuel: $('fuel-fill'), health: $('health-fill'), bars: $('bars'),
  };
  let toastTimer = 0;

  function toast(text) {
    if (!text) return;
    el.toast.textContent = sentence(text);
    el.toast.classList.add('show');
    toastTimer = 1.6;
  }

  function update(dt, vehicle, isCar) {
    const d = vehicle.drive;
    el.speed.textContent = Math.round(Math.abs(vehicle.speed) * 3.6);
    el.gear.textContent = (d.lowRange ? 'L' : '') + (d.gear > 0 ? d.gear : 'R');
    el.rpm.style.width = `${Math.min(100, (d.rpm / d.cfg.redline) * 100)}%`;
    el.rpm.classList.toggle('hot', d.rpm > d.cfg.redline * 0.9);
    el.vehicle.textContent = vehicle.cfg.name;

    el.fourwd.classList.toggle('on', isCar && d.fourWD);
    el.low.classList.toggle('on', isCar && d.lowRange);
    el.flock.classList.toggle('on', isCar && d.locked[0]);
    el.rlock.classList.toggle('on', isCar && d.locked[1]);
    for (const e of [el.fourwd, el.low, el.flock, el.rlock]) e.classList.toggle('na', !isCar);

    const grounded = vehicle.wheels.find((w) => w.grounded);
    el.surface.textContent = grounded ? (grounded.wet > 0.05 ? 'water' : SURFACES[grounded.surface].name.toLowerCase()) : 'air';

    el.air.classList.toggle('on', !!vehicle.airedDown);
    el.winch.classList.toggle('on', !!G?.winch?.attached);
    el.winch.classList.toggle('na', !vehicle.cfg.winch);
    el.manual.classList.toggle('on', d.manual);
    el.manual.classList.toggle('na', !d.manual);
    el.low.classList.toggle('na', !isCar || d.cfg.lowRatio <= 1);
    // fuel and condition
    const real = G?.save.settings.realism;
    el.bars.classList.toggle('off', !real);
    if (real) {
      el.fuel.style.width = `${vehicle.fuel}%`; el.fuel.classList.toggle('low', vehicle.fuel < 15);
      el.health.style.width = `${vehicle.health}%`; el.health.classList.toggle('low', vehicle.health < 30);
    }

    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) el.toast.classList.remove('show');
    }
  }

  function toggleHelp(show) { el.help.classList.toggle('hidden', show === undefined ? undefined : !show); }

  return { update, toast, toggleHelp };
}
