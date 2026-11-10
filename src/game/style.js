// Style points in free roam: hold a slide or get some air and it is scored.
// The running total and your best for each map are shown on the dashboard.

export function createStyle(G) {
  G.save.style ??= {};
  const el = document.getElementById('style');
  let drift = 0, gap = 0, air = 0, total = 0;

  function bank(points, label) {
    if (points < 100) return;
    total += Math.round(points);
    if (total > (G.save.style[G.MAP.id] ?? 0)) { G.save.style[G.MAP.id] = total; G.save.commit(); }
    G.toast(`${label}  +${Math.round(points)}`);
  }

  function step(dt) {
    if (G.modes.kind !== 'free' || G.controlLocked) return;
    const v = G.active, speed = Math.abs(v.speed);
    const grounded = v.wheels.filter((w) => w.grounded);
    // sliding: the rear tyres going sideways while the vehicle is moving
    const rear = v.wheels[v.wheels.length - 1];
    const slide = rear.grounded ? Math.abs(rear.vLat) : 0;
    if (slide > 2.5 && speed > 5) { drift += slide * speed * dt * 1.6; gap = 0; }
    else if (drift > 0) { gap += dt; if (gap > 0.6) { bank(drift, 'Drift'); drift = 0; } }
    // air: all wheels off the ground
    if (!grounded.length && speed > 3) air += dt;
    else if (air > 0) {
      const q = v.body.rotation(), upright = 1 - 2 * (q.x * q.x + q.z * q.z) > 0.6;
      if (air > 0.55 && upright) bank(air * 260, `Air ${air.toFixed(1)} s`);
      air = 0;
    }
  }
  function update() {
    const best = G.save.style[G.MAP.id] ?? 0;
    el.textContent = total || best ? `Style ${total.toLocaleString()}${best > total ? ` (best ${best.toLocaleString()})` : ''}` : '';
  }
  return { step, update };
}
