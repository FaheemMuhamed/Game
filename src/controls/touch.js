// On-screen buttons for phones and tablets. Only shown on touch devices.

export function createTouch(G) {
  const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const state = { throttle: 0, steer: 0, handbrake: false, active: false };
  if (!isTouch) return { state, enabled: false };

  document.body.classList.add('touch');
  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `
    <div class="t-left"><button data-hold="left">◀</button><button data-hold="right">▶</button></div>
    <div class="t-right"><button data-hold="brake" class="t-brake">BRAKE</button><button data-hold="gas" class="t-gas">GAS</button></div>
    <div class="t-top">
      <button data-tap="Escape">II</button><button data-act="recover">RESET</button><button data-act="switch">SWAP</button>
      <button data-act="fourWD">4WD</button><button data-act="lowRange">LOW</button><button data-act="lockR">R-LOCK</button><button data-act="lockF">F-LOCK</button>
      <button data-act="camMode">CAM</button><button data-hold="handbrake">HAND</button>
    </div>`;
  document.body.append(root);

  const holding = new Set();
  const refresh = () => {
    state.steer = (holding.has('left') ? 1 : 0) - (holding.has('right') ? 1 : 0);
    state.throttle = (holding.has('gas') ? 1 : 0) - (holding.has('brake') ? 1 : 0);
    state.handbrake = holding.has('handbrake');
    state.active = true;
  };
  root.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    e.preventDefault();
    b.setPointerCapture?.(e.pointerId);
    if (b.dataset.hold) { holding.add(b.dataset.hold); b.classList.add('down'); refresh(); }
    else if (b.dataset.tap) G.handleKey(b.dataset.tap);
    else if (b.dataset.act) G.handleKey(G.keymap.code(b.dataset.act));
  });
  const release = (e) => {
    const b = e.target.closest('button');
    if (b?.dataset.hold) { holding.delete(b.dataset.hold); b.classList.remove('down'); refresh(); }
  };
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', release);
  // pinch-free zoom: two quick buttons would clutter, so use a slow auto zoom with speed (already built in)

  return { state, enabled: true };
}
