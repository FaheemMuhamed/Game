// The "what am I doing" readout at the top of the screen: a title, a line of
// detail, a clock, and an arrow that points across the screen to the target.
// Game modes fill in G.objective; this just draws it.

export function createObjective(G) {
  const box = document.getElementById('objective');
  const el = {
    title: document.getElementById('obj-title'), detail: document.getElementById('obj-detail'),
    time: document.getElementById('obj-time'), arrow: document.getElementById('obj-arrow'), dist: document.getElementById('obj-dist'),
    big: document.getElementById('bigtext'),
  };

  const prompt = document.getElementById('keyprompt');
  const note = document.getElementById('pacenote');
  let shownKeys = '';

  function update() {
    const o = G.objective;
    box.classList.toggle('show', !!o && !G.photo);
    if (!o?.note) note.classList.remove('show');
    prompt.classList.toggle('show', !!o?.keys?.length && !G.paused && !G.photo);
    if (!o) return;
    el.title.textContent = o.title ?? '';
    el.detail.innerHTML = o.detail ?? '';
    el.time.textContent = o.time ?? '';
    el.time.style.display = o.time ? '' : 'none';
    // big key caps for the keys this step wants pressed; each lights up while held
    const keys = o.keys ?? [];
    const sig = keys.join();
    if (sig !== shownKeys) { shownKeys = sig; prompt.innerHTML = keys.map((k) => `<span class="cap" data-k="${k}">${G.keymap.label(k)}</span>`).join(''); }
    for (const c of prompt.children) c.classList.toggle('held', G.keymap.down(c.dataset.k));
    // rally pace note: an arrow for the direction, a number for how tight, and the call in words
    const n = o.note;
    note.classList.toggle('show', !!n && !G.paused);
    if (n) {
      note.dataset.dir = n.dir > 0 ? 'left' : n.dir < 0 ? 'right' : 'crest';
      note.querySelector('.n-sev').textContent = n.sev || '';
      note.querySelector('.n-text').textContent = n.text;
      note.querySelector('.n-in').textContent = n.in > 0 ? `in ${n.in} m` : 'now';
    }
    const t = o.target;
    el.arrow.parentElement.style.display = t ? '' : 'none';
    if (t) {
      const p = G.active.body.translation();
      const dx = t.x - p.x, dz = t.z - p.z, az = G.cam.azimuth;
      // same turn as the minimap: world direction -> direction on screen
      const sx = dx * Math.cos(az) - dz * Math.sin(az), sy = dx * Math.sin(az) + dz * Math.cos(az);
      el.arrow.style.transform = `rotate(${Math.atan2(sy, sx)}rad)`;
      el.dist.textContent = `${Math.round(Math.hypot(dx, dz))} m`;
    }
  }

  // Large text in the middle of the screen (countdown, GO!, FINISH).
  let bigTimer = null;
  function big(text, ms = 900) {
    el.big.textContent = text.length > 2 ? text.charAt(0) + text.slice(1).toLowerCase() : text;
    el.big.classList.add('show');
    clearTimeout(bigTimer);
    bigTimer = setTimeout(() => el.big.classList.remove('show'), ms);
  }

  return { update, big };
}

export function formatTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}
