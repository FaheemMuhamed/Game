// Pictures for the menus, all taken from the game itself at start-up:
//   place pictures     the real 3D world, photographed at a spot (sharp at any size)
//   vehicle pictures   small stills from the garage's 3D view
//   route outlines     a route drawn as a crisp line (SVG), to lay over a picture

export function createThumbs(G) {
  const W = 1200, H = 800;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d');
  const gl = G.renderer.domElement;
  const places = new Map();

  // Photograph the world at (x, z). `zoom` is metres of world top to bottom; `quarter` is which corner we look from.
  function shoot(id, x, z, zoom = 30, quarter = 0) {
    const cam = G.cam, y = Math.max(G.terrain.heightAt(x, z), 0);
    cam.focus.set(x, y, z);
    cam.azimuth = Math.PI / 4 + quarter * (Math.PI / 2);
    cam.quarter = quarter;
    cam.zoom = cam.zoomTarget = zoom;
    cam.update(0, { x, y, z }, { x: 0, y: 0, z: 0 });
    G.lighting.update(1, cam.focus);
    G.reveal.uVeh.value.set(0, 0, 1e6); // no see-through window in photos
    G.post.render();
    ctx.drawImage(gl, 0, 0, W, H);
    places.set(id, out.toDataURL('image/jpeg', 0.9));
  }

  // Take every picture in one go, at a fixed size, then put the screen back how it was.
  function shootAll(list) {
    const keep = { quarter: G.cam.quarter, zoom: G.cam.zoomTarget, az: G.cam.azimuth };
    const hidden = [];
    for (const m of G.models.values()) if (m.group.visible) { m.group.visible = false; hidden.push(m.group); }
    G.renderer.setPixelRatio(1);
    G.renderer.setSize(W, H, false);
    G.post.resize(W, H, 1);
    G.cam.resize(W, H);
    for (const s of list) shoot(...s);
    for (const g of hidden) g.visible = true;
    Object.assign(G.cam, { quarter: keep.quarter, zoomTarget: keep.zoom, zoom: keep.zoom, azimuth: keep.az });
    G.cam.snapTo(G.active.body.translation());
    G.resize();
  }

  // A route as an SVG outline, like the circuit map on a race card.
  function outline(points) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of points) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const s = 80 / Math.max(x1 - x0, z1 - z0, 1), ox = (100 - (x1 - x0) * s) / 2, oz = (100 - (z1 - z0) * s) / 2;
    const p = points.map(([x, z]) => [(x - x0) * s + ox, (z - z0) * s + oz]);
    const d = p.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const end = p[p.length - 1];
    return `<svg class="outline" viewBox="0 0 100 100" aria-hidden="true"><path d="${d}" fill="none" stroke="#fff" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${p[0][0]}" cy="${p[0][1]}" r="4.2" fill="#fff"/><circle cx="${end[0]}" cy="${end[1]}" r="4.6" fill="#ff7a1a" stroke="#fff" stroke-width="1.6"/></svg>`;
  }

  const vehicle = {};
  for (const g of G.garage) vehicle[g.id] = G.showroom.snapshot(g);

  return { vehicle, places, place: (id) => places.get(id) ?? '', shootAll, outline, refreshVehicle(g) { vehicle[g.id] = G.showroom.snapshot(g); } };
}
