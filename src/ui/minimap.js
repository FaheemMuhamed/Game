// The map in the corner. Turns with the camera so "up" on the map is "up" on
// screen. Parts you have not driven near yet stay dark.

import { SURFACES } from '../world/surfaces.js';
import { PLACES, TRAILS, riverZ, MAP } from '../world/world.js';

const FOG_N = 48; // the "seen it" grid is 48 x 48 squares
const REVEAL_RADIUS = 30; // metres

export function createMinimap(G) {
  const { terrain, save } = G;
  const canvas = document.getElementById('minimap');
  const wrap = document.getElementById('minimap-wrap');
  const ctx = canvas.getContext('2d');
  const size = terrain.size;

  // ---- Paint the whole map once into a hidden picture ----
  const N = 240;
  const base = document.createElement('canvas');
  base.width = base.height = N;
  {
    const b = base.getContext('2d');
    const img = b.createImageData(N, N);
    const step = terrain.n / N;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const ix = Math.floor(i * step), iz = Math.floor(j * step);
        const s = SURFACES[terrain.surfaces[iz * terrain.n + ix]];
        const x = ix * terrain.cell - terrain.half, z = iz * terrain.cell - terrain.half;
        const h = terrain.heightAt(x, z);
        // light from the top-left makes hills readable
        const shade = 0.75 + Math.max(-0.35, Math.min(0.35, (h - terrain.heightAt(x + 2, z + 2)) * 0.25));
        const wet = MAP.hasWater !== false && h < 0.05;
        const c = wet ? 0x2a6a72 : s.color;
        const o = (j * N + i) * 4;
        img.data[o] = ((c >> 16) & 255) * shade; img.data[o + 1] = ((c >> 8) & 255) * shade; img.data[o + 2] = (c & 255) * shade; img.data[o + 3] = 255;
      }
    }
    b.putImageData(img, 0, 0);
  }

  // ---- Fog: which squares have been seen ----
  const seen = new Uint8Array(FOG_N * FOG_N);
  // each map remembers its own explored area
  save.fogs ??= {};
  if (MAP.id === 'valley' && save.fog && !save.fogs.valley) save.fogs.valley = save.fog;
  const stored = save.fogs[MAP.id];
  if (stored && stored.length === seen.length) for (let i = 0; i < seen.length; i++) seen[i] = stored[i] === '1' ? 1 : 0;
  const fog = document.createElement('canvas');
  fog.width = fog.height = FOG_N;
  const fctx = fog.getContext('2d');
  function paintFog() {
    const img = fctx.createImageData(FOG_N, FOG_N);
    for (let i = 0; i < seen.length; i++) { img.data[i * 4 + 3] = seen[i] ? 0 : 215; img.data[i * 4] = 16; img.data[i * 4 + 1] = 18; img.data[i * 4 + 2] = 20; }
    fctx.putImageData(img, 0, 0);
  }
  paintFog();
  function reveal(x, z) {
    const c = size / FOG_N, r = Math.ceil(REVEAL_RADIUS / c);
    const cx = Math.floor((x + size / 2) / c), cz = Math.floor((z + size / 2) / c);
    let changed = false;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const ix = cx + dx, iz = cz + dz;
      if (ix < 0 || iz < 0 || ix >= FOG_N || iz >= FOG_N || dx * dx + dz * dz > r * r) continue;
      if (!seen[iz * FOG_N + ix]) { seen[iz * FOG_N + ix] = 1; changed = true; }
    }
    if (changed) { paintFog(); save.fogs[MAP.id] = Array.from(seen).join(''); save.commit(); }
  }
  const isSeen = (x, z) => {
    const c = size / FOG_N;
    const ix = Math.floor((x + size / 2) / c), iz = Math.floor((z + size / 2) / c);
    return ix >= 0 && iz >= 0 && ix < FOG_N && iz < FOG_N && seen[iz * FOG_N + ix] === 1;
  };

  const LABELS = MAP.labels ?? [
    { ...PLACES.village, name: 'Village' },
    { x: PLACES.ford.x, z: riverZ(PLACES.ford.x), name: 'Ford' },
    { x: PLACES.bridge.x, z: riverZ(PLACES.bridge.x), name: 'Bridge' },
    { ...PLACES.mud, name: 'Mud pit' },
    { ...PLACES.rocks, name: 'Rock field' },
    { ...PLACES.hill, name: 'Summit' },
    { ...PLACES.park, name: 'Proving ground' }, { ...PLACES.mountain, name: 'Mountain' }, { ...PLACES.dunes, name: 'Dunes' }, { ...PLACES.swamp, name: 'Swamp' }, { ...PLACES.forest, name: 'Deep forest' },
  ];

  let big = false, revealTimer = 0;
  function toggleBig() { big = !big; wrap.classList.toggle('big', big); }

  function draw(dt) {
    const p = G.active.body.translation();
    revealTimer -= dt;
    if (revealTimer <= 0) { revealTimer = 0.5; reveal(p.x, p.z); }

    const css = wrap.clientWidth, dpr = Math.min(window.devicePixelRatio, 2);
    if (canvas.width !== Math.round(css * dpr)) canvas.width = canvas.height = Math.round(css * dpr);
    const S = canvas.width;
    const az = G.cam.azimuth, cos = Math.cos(az), sin = Math.sin(az);
    // The small map zooms in around the vehicle; the big one shows everything.
    const scale = big ? (S / size) * 0.7 : (S / size) * 2.2;
    const ox = big ? 0 : p.x, oz = big ? 0 : p.z;
    const toMap = (x, z) => {
      const dx = (x - ox) * scale, dz = (z - oz) * scale;
      return [S / 2 + dx * cos - dz * sin, S / 2 + dx * sin + dz * cos];
    };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#101214';
    ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    ctx.rotate(az);
    ctx.translate(-ox * scale, -oz * scale);
    ctx.imageSmoothingEnabled = false;
    const full = size * scale;
    ctx.drawImage(base, -full / 2, -full / 2, full, full);
    // trails
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = Math.max(1, S / 180);
    ctx.setLineDash([S / 60, S / 60]);
    for (const t of TRAILS) {
      ctx.beginPath();
      t.forEach(([x, z], i) => (i ? ctx.lineTo(x * scale, z * scale) : ctx.moveTo(x * scale, z * scale)));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fog, -full / 2, -full / 2, full, full);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // place names (big map only, and only once seen)
    if (big) {
      ctx.font = `500 ${Math.round(S / 40)}px 'Outfit Variable', sans-serif`;
      ctx.textAlign = 'center';
      for (const l of LABELS) {
        if (!isSeen(l.x, l.z)) continue;
        const [x, y] = toMap(l.x, l.z);
        ctx.fillStyle = 'rgba(16,18,20,0.75)';
        const w = ctx.measureText(l.name).width + 10;
        ctx.fillRect(x - w / 2, y - S / 30, w, S / 28);
        ctx.fillStyle = '#f4f4f2';
        ctx.fillText(l.name, x, y - S / 110);
      }
    }

    // markers from the game modes (checkpoints, deliveries, beacons...)
    for (const m of G.markers) {
      let [x, y] = toMap(m.x, m.z);
      // pin markers that are off the small map to its edge
      const pad = S * 0.06, cx = Math.max(pad, Math.min(S - pad, x)), cy = Math.max(pad, Math.min(S - pad, y));
      const r = (m.big ? S / 34 : S / 55) * (cx !== x || cy !== y ? 0.8 : 1);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = m.color || '#ff7a1a';
      ctx.fill();
      ctx.lineWidth = S / 160;
      ctx.strokeStyle = '#0a1216';
      ctx.stroke();
    }

    // the vehicle: an arrow pointing the way it faces
    const [vx, vy] = toMap(p.x, p.z);
    const yaw = G.active.yaw(), fx = Math.sin(yaw), fz = Math.cos(yaw);
    const ang = Math.atan2(fx * sin + fz * cos, fx * cos - fz * sin);
    ctx.save();
    ctx.translate(vx, vy);
    ctx.rotate(ang);
    const a = S / (big ? 45 : 26);
    ctx.beginPath();
    ctx.moveTo(a, 0); ctx.lineTo(-a * 0.7, a * 0.65); ctx.lineTo(-a * 0.35, 0); ctx.lineTo(-a * 0.7, -a * 0.65);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#101214';
    ctx.lineWidth = S / 120;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  return {
    update: draw,
    onKey(code, action) { if (action === 'map' && !G.paused) { toggleBig(); return true; } if (code === 'Escape' && big) { toggleBig(); return true; } return false; },
    isSeen, base,
    get explored() { let n = 0; for (const v of seen) n += v; return n / seen.length; },
  };
}
