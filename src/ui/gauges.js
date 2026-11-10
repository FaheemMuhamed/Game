// The picture part of the dashboard, drawn on a canvas:
//   left    the vehicle from above. Each wheel is coloured by how hard its
//           tyre is working (green = gripping, amber = near the limit, red =
//           spinning or sliding, hollow = in the air), with a bar beside it
//           for how squashed its suspension is. Lines show where engine power
//           is going; a filled diamond is a locked diff.
//   right   two tilt dials: nose up/down and lean left/right.

const AMBER = '#f4f4f2', DIM = 'rgba(255,255,255,0.28)', RED = '#ff5a4a', GREEN = '#7ddc8a', BLAZE = '#ff7a1a';

export function createGauges(G) {
  const canvas = document.getElementById('gauges');
  const ctx = canvas.getContext('2d');
  const W = 300, H = 120;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr; canvas.height = H * dpr;

  function wheelColour(w) {
    if (!w.grounded) return null;
    const limit = Math.max(1, w.mu * w.Fz);
    const use = Math.hypot(w.Fx, w.Fy) / limit;
    if (Math.abs(w.slip) > 2 || use > 0.97) return RED;
    return use > 0.7 ? BLAZE : GREEN;
  }

  function dial(cx, cy, r, angle, label, drawBody) {
    const danger = Math.abs(angle) > 0.52; // about 30 degrees
    ctx.strokeStyle = DIM; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx - r + 5, cy); ctx.moveTo(cx + r, cy); ctx.lineTo(cx + r - 5, cy); ctx.stroke();
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(angle);
    ctx.fillStyle = danger ? RED : AMBER; ctx.strokeStyle = danger ? RED : AMBER; ctx.lineWidth = 2;
    drawBody(r);
    ctx.restore();
    ctx.fillStyle = danger ? RED : AMBER; ctx.font = "500 13px 'Outfit Variable', sans-serif"; ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(Math.abs(angle) * 57.3)}°`, cx, cy + r + 15);
    ctx.fillStyle = DIM; ctx.font = "400 11px 'Outfit Variable', sans-serif";
    ctx.fillText(label, cx, cy - r - 6);
  }

  function update() {
    const v = G.active, d = v.drive, wheels = v.wheels;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // ---- vehicle from above ----
    const ox = 62, oy = 60, isBike = wheels.length === 2;
    const zs = wheels.map((w) => w.cfg.pos.z), zMax = Math.max(...zs), zMin = Math.min(...zs);
    const sy = 62 / (zMax - zMin), sx = isBike ? 0 : 22;
    const at = (w) => [ox - Math.sign(w.cfg.pos.x) * sx, oy - (w.cfg.pos.z - (zMax + zMin) / 2) * sy];
    const driven = new Set(d.drivenAxles().flatMap((ai) => d.cfg.axles[ai].wheels));
    const power = Math.min(1, Math.abs(d.throttle));

    // drive lines
    ctx.lineCap = 'round';
    d.cfg.axles.forEach((axle, ai) => {
      const on = driven.has(axle.wheels[0]);
      ctx.strokeStyle = on ? AMBER : DIM;
      ctx.lineWidth = on ? 1.5 + power * 2.5 : 1;
      if (axle.wheels.length === 2) {
        const [a, b] = axle.wheels.map((i) => at(wheels[i]));
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        // diff: diamond, filled when locked
        ctx.save(); ctx.translate(ox, a[1]); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = d.locked[ai] ? BLAZE : '#1a1d20'; ctx.strokeStyle = d.locked[ai] ? BLAZE : on ? AMBER : DIM; ctx.lineWidth = 1.5;
        ctx.fillRect(-4.5, -4.5, 9, 9); ctx.strokeRect(-4.5, -4.5, 9, 9);
        ctx.restore();
      }
    });
    // prop shaft between the axles
    if (!isBike) {
      const both = d.fourWD;
      ctx.strokeStyle = both ? AMBER : DIM; ctx.lineWidth = both ? 1.5 + power * 2.5 : 1;
      ctx.setLineDash(both ? [] : [3, 3]);
      ctx.beginPath(); ctx.moveTo(ox, at(wheels[0])[1] + 7); ctx.lineTo(ox, at(wheels[wheels.length - 1])[1] - 7); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = DIM; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ox, at(wheels[0])[1]); ctx.lineTo(ox, at(wheels[1])[1]); ctx.stroke();
    }
    // wheels + suspension bars
    wheels.forEach((w, i) => {
      const [x, y] = at(w), c = wheelColour(w);
      ctx.save(); ctx.translate(x, y); ctx.rotate(-w.steer);
      ctx.lineWidth = 1.5; ctx.strokeStyle = c ?? DIM; ctx.fillStyle = c ?? 'transparent';
      ctx.beginPath(); ctx.roundRect(-5, -10, 10, 20, 2);
      if (c) ctx.fill();
      ctx.stroke();
      ctx.restore();
      const side = isBike ? (i === 0 ? 1 : 1) : -Math.sign(w.cfg.pos.x);
      const bx = x + side * 13, squash = Math.max(0, Math.min(1, w.compression / w.cfg.maxLen));
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(bx - 2, y - 10, 4, 20);
      ctx.fillStyle = squash > 0.92 ? RED : AMBER; ctx.fillRect(bx - 2, y + 10 - 20 * squash, 4, 20 * squash);
    });
    ctx.fillStyle = DIM; ctx.font = "400 11px 'Outfit Variable', sans-serif"; ctx.textAlign = 'center';
    ctx.fillText('front', ox, 10);

    // ---- tilt dials ----
    const q = v.body.rotation();
    const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (q.y * q.z - q.w * q.x))));
    const roll = Math.asin(Math.max(-1, Math.min(1, 2 * (q.x * q.y + q.w * q.z))));
    dial(170, 58, 30, -pitch, 'pitch', (r) => { // side view: a wedge pointing right (forwards)
      ctx.beginPath(); ctx.moveTo(-r * 0.7, 4); ctx.lineTo(r * 0.7, 4); ctx.lineTo(r * 0.45, -5); ctx.lineTo(-r * 0.6, -7); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(-r * 0.42, 6, 4, 0, 7); ctx.arc(r * 0.42, 6, 4, 0, 7); ctx.fill();
    });
    dial(250, 58, 30, -roll, 'roll', (r) => { // rear view: a box on two wheels
      ctx.fillRect(-r * 0.45, -8, r * 0.9, 13);
      ctx.fillRect(-r * 0.6, 3, 6, 9); ctx.fillRect(r * 0.6 - 6, 3, 6, 9);
    });
  }

  return { update };
}
