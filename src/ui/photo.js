// Photo mode: freezes the game, hides the interface and lets you fly the
// camera around, adjust the look, and save a picture.

import { isHeld } from '../input.js';

export function createPhotoMode(G) {
  const bar = document.createElement('div');
  bar.id = 'photo-bar';
  bar.className = 'panel';
  bar.innerHTML = `
    <b>PHOTO MODE</b>
    <label>Blur<input type="range" min="0" max="6" step="0.1" data-k="blur"></label>
    <label>Glow<input type="range" min="0" max="2" step="0.05" data-k="bloom"></label>
    <label>Corners<input type="range" min="0" max="1" step="0.05" data-k="vignette"></label>
    <label>Brightness<input type="range" min="0.4" max="3" step="0.05" data-k="exposure"></label>
    <span class="photo-help">WASD move · Q/E turn · scroll zoom</span>
    <button data-p="save">Save picture</button><button data-p="exit">Exit (Esc)</button>`;
  document.body.append(bar);
  let before = null;

  const get = (k) => (k === 'exposure' ? G.renderer.toneMappingExposure : G.post.settings[k]);
  const set = (k, v) => { if (k === 'exposure') G.renderer.toneMappingExposure = v; else G.post.settings[k] = v; };

  function enter() {
    before = { blur: get('blur'), bloom: get('bloom'), vignette: get('vignette'), exposure: get('exposure'), follow: G.cam.follow, zoom: G.cam.zoomTarget };
    G.cam.setFollow(false);
    const p = G.active.body.translation();
    G.cam.free = { x: p.x, y: p.y, z: p.z };
    G.photo = true;
    G.paused = true;
    document.body.classList.add('photo');
    for (const i of bar.querySelectorAll('input')) i.value = get(i.dataset.k);
  }
  function exit() {
    for (const k of ['blur', 'bloom', 'vignette', 'exposure']) set(k, before[k]);
    G.cam.setFollow(before.follow);
    G.cam.zoomTarget = before.zoom;
    G.cam.free = null;
    G.photo = false;
    G.paused = false;
    document.body.classList.remove('photo');
  }
  function savePicture() {
    G.post.render(); // draw, then grab the picture before the browser clears it
    G.renderer.domElement.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `dusk-trails-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  }

  bar.addEventListener('input', (e) => set(e.target.dataset.k, +e.target.value));
  bar.addEventListener('click', (e) => {
    const p = e.target.dataset.p;
    if (p === 'save') savePicture();
    if (p === 'exit') exit();
  });

  function update(dt) {
    if (!G.photo) return;
    // move across the ground relative to where the camera is looking
    const f = (isHeld('KeyW') || isHeld('ArrowUp') ? 1 : 0) - (isHeld('KeyS') || isHeld('ArrowDown') ? 1 : 0);
    const r = (isHeld('KeyD') || isHeld('ArrowRight') ? 1 : 0) - (isHeld('KeyA') || isHeld('ArrowLeft') ? 1 : 0);
    const az = G.cam.azimuth, speed = G.cam.zoom * 0.7 * dt;
    G.cam.free.x += (-Math.sin(az) * f + Math.cos(az) * r) * speed;
    G.cam.free.z += (-Math.cos(az) * f - Math.sin(az) * r) * speed;
    G.cam.free.y = Math.max(G.terrain.heightAt(G.cam.free.x, G.cam.free.z), 0);
  }

  return {
    enter, exit, update,
    onKey(code, action) {
      if (!G.photo) { if (action === 'photo' && !G.paused) { enter(); return true; } return false; }
      if (code === 'Escape' || action === 'photo') exit();
      else if (code === 'KeyQ') G.cam.rotate(-1);
      else if (code === 'KeyE') G.cam.rotate(1);
      return true; // swallow every other key while in photo mode
    },
  };
}
