// Watches how the drive is going and offers a tip when you look stuck.
// This is how the game teaches 4WD, low range and diff locks.

export function createHints(G) {
  const el = document.getElementById('hint');
  let spinTime = 0, showTime = 0, cooldown = 0, lastText = '';

  function show(text, seconds = 5) {
    if (text === lastText && cooldown > 0) return;
    el.innerHTML = text;
    el.classList.add('show');
    showTime = seconds;
    cooldown = seconds + 6;
    lastText = text;
  }
  const key = (id) => `<kbd>${G.keymap.label({ F: 'fourWD', L: 'lowRange', R: 'recover', 1: 'lockF', 2: 'lockR' }[id] ?? id)}</kbd>`;

  function update(dt) {
    if (showTime > 0) { showTime -= dt; if (showTime <= 0) el.classList.remove('show'); }
    cooldown -= dt;
    if (G.controlLocked || G.paused) return;

    const v = G.active, d = v.drive, isCar = d.cfg.axles.length > 1;
    const pushing = Math.abs(G.input.throttle) > 0.3;
    const slipping = v.wheels.some((w) => w.grounded && Math.abs(w.slip) > 2.5) || v.wheels.filter((w) => !w.grounded).length >= 1;
    const crawling = Math.abs(v.speed) < 0.7;

    // In deep water?
    if (v.submerged > 0.45 && cooldown <= 0) {
      show(`Deep water. Tyres float and lose grip. ${isCar ? `Use 4WD ${key('F')} and low range ${key('L')}, or ` : ''}press ${key('R')} to be pulled out. Cross at the ford or the bridge.`, 7);
      return;
    }

    // Throttle down but going nowhere?
    spinTime = pushing && crawling ? spinTime + dt : 0;
    if (spinTime > 2 && cooldown <= 0) {
      if (!isCar) show(`Stuck? Press ${key('R')} to recover to firm ground.`);
      else if (slipping && !d.fourWD) show(`Rear wheels spinning. Press ${key('F')} to drive all four wheels.`);
      else if (!d.lowRange && !slipping) show(`Not enough pull. Press ${key('L')} for low range: slower, but much stronger.`);
      else if (slipping && !d.locked[1]) show(`One wheel is spinning and wasting the power. Press ${key('2')} to lock the rear diff.`);
      else if (slipping && !d.locked[0]) show(`Still spinning. Press ${key('1')} to lock the front diff too.`);
      else if (!d.lowRange) show(`Try low range ${key('L')}.`);
      else show(G.winchHint ?? `Properly stuck. Press ${key('R')} to recover to firm ground.`);
      spinTime = 0;
    }
  }

  return { update, show };
}
