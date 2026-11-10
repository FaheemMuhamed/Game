// Main menu, event pickers, garage, settings, pause and results.
// Each screen is a function that returns HTML; buttons carry a data-act
// attribute saying what they do, and one click handler below acts on it.

import { RUNS, DELIVERIES, RESCUES } from '../game/modes.js';
import { formatTime } from './objective.js';
import { PAINTS } from './showroom.js';
import { TYRES, SUSPENSION, EXTRAS } from '../game/custom.js';
import { MAPS, chooseMap } from '../world/maps/index.js';
import { landOf } from '../world/world.js';
import { SURFACES } from '../world/surfaces.js';

const pathLength = (pts) => pts.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
const metres = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`);

export function createMenus(G) {
  const root = document.getElementById('menu'), body = document.getElementById('menu-body');
  let stack = []; // screens we can go "back" through
  let resultData = null;
  let garageTab = 'specs'; // which panel is open under the vehicle: specs, paint or set-up
  let compareId = null; // garage: which vehicle the ratings are being compared against

  const btn = (act, label, cls = '') => `<button class="btn ${cls}" data-act="${act}">${label}</button>`;
  const dot = (m) => `<i class="dot ${m ?? 'none'}"></i>`;
  const stat = (label, value) => `<span class="stat"><small>${label}</small><b>${value}</b></span>`;
  const medalCount = (list) => list.filter((e) => G.save.best[e.id]?.medal).length;
  const current = () => G.garage.find((g) => g.id === G.save.vehicle) ?? G.garage[0];
  const head = (title, sub) => `
    <header class="bar"><button class="back" data-act="back" aria-label="Back">←</button><div><h2>${title}</h2><p>${sub}</p></div></header>`;

  // Garage set-up panel: tyres, suspension and bolt-on extras, each with a line saying what it does.
  function setupPanel(g) {
    const c = G.custom.get(g.id), four = g.vehicle.wheels.length === 4;
    const group = (label, key, list) => `<div class="opt"><small>${label}</small><div>${list.map((o) => `<button class="pill ${c[key] === o.id ? 'sel' : ''}" data-act="tune:${key}=${o.id}">${o.name}</button>`).join('')}</div><p>${list.find((o) => o.id === c[key]).note}</p></div>`;
    return `<div class="setup">${group('Tyres', 'tyres', TYRES)}${group('Suspension', 'susp', SUSPENSION)}
      ${four ? `<div class="opt"><small>Extras</small><div>${EXTRAS.map((e) => `<button class="pill ${c[e.id] ? 'sel' : ''}" data-act="tune:${e.id}" title="${e.note}">${e.name}</button>`).join('')}</div><p>${EXTRAS.filter((e) => c[e.id]).map((e) => e.note).join(' ') || 'Nothing fitted.'}</p></div>` : ''}</div>`;
  }

  // What a vehicle can do, read straight from its physics settings.
  function features(v) {
    const d = v.cfg.drivetrain, four = d.axles.length > 1, bike = v.wheels.length === 2;
    return [
      ['Drive', bike ? 'Rear wheel' : four ? '2WD / 4WD' : 'Rear wheels'],
      ['Low range', d.lowRatio > 1 ? 'Yes' : 'No'],
      ['Diff locks', four && d.canLock !== false ? 'Front + rear' : 'None'],
      ['Winch', v.cfg.winch ? `${Math.round(v.cfg.winch.force / 1000)} kN` : 'None'],
      ['Cargo', v.cfg.rack ? 'Yes' : 'No'],
      ['Weight', `${v.cfg.mass.toLocaleString()} kg`],
    ];
  }

  // One picture card for an event: a photo of where it ends, the route as an outline, and a strip of numbers.
  function eventCard(e, kind) {
    const b = G.save.best[e.id];
    const route = kind === 'run' ? [e.start, ...e.checkpoints] : kind === 'delivery' ? [e.start, e.to] : [e.start, e.at, e.to];
    const gold = kind === 'delivery' ? e.par : e.medals[0];
    return `
      <button class="tile" data-act="${kind}:${e.id}">
        <span class="tile-img" style="background-image:url(${G.thumbs.place(e.id)})">${G.thumbs.outline(route)}</span>
        <span class="tile-body">
          <span class="tile-title">${e.name}</span>
          <span class="tile-sub">${e.blurb}</span>
        </span>
        <span class="tile-foot">
          ${stat('Best', b ? `${dot(b.medal)} ${e.scoring === 'faults' ? `${b.faults} faults` : formatTime(b.time)}` : '—')}
          ${stat(e.scoring === 'faults' ? 'Gold' : 'Gold time', e.scoring === 'faults' ? 'No faults' : formatTime(gold))}
          ${stat(kind === 'run' ? 'Checkpoints' : 'Distance', kind === 'run' ? e.checkpoints.length : metres(pathLength(route)))}
        </span>
      </button>`;
  }

  const modeTile = (m, cls = '') => `
    <button class="tile ${cls}" data-act="${m.act}">
      <span class="tile-img" style="background-image:url(${G.thumbs.place(m.img)})"></span>
      ${m.tag ? `<span class="tag">${m.tag}</span>` : ''}
      <span class="tile-body"><span class="tile-title">${m.title}</span><span class="tile-sub">${m.sub}</span></span>
      <span class="tile-foot">${m.stats.map(([k, v]) => stat(k, v)).join('')}</span>
    </button>`;

  // A bird's-eye picture of any map, drawn from its land shape (so maps that are not loaded can be shown too).
  const previews = new Map();
  function mapPreview(map) {
    if (previews.has(map.id)) return previews.get(map.id);
    const N = 300, c = document.createElement('canvas'), { height, surface } = landOf(map), size = map.size, step = size / N;
    c.width = c.height = N;
    const ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * step - size / 2, z = (j + 0.5) * step - size / 2, h = height(x, z), h2 = height(x + 2, z + 2);
      const col = map.hasWater !== false && h < 0.05 ? 0x2a6a72 : SURFACES[surface(x, z, h, Math.abs(h2 - h) / 2.8)].color;
      const shade = 0.78 + Math.max(-0.4, Math.min(0.4, (h - h2) * 0.22)), o = (j * N + i) * 4;
      img.data[o] = ((col >> 16) & 255) * shade; img.data[o + 1] = ((col >> 8) & 255) * shade; img.data[o + 2] = (col & 255) * shade; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const url = c.toDataURL('image/png');
    previews.set(map.id, url);
    return url;
  }

  // Results: your line through the course (orange) over your previous best (white).
  function routePicture(path, ghost) {
    const pts = (a) => { const out = []; for (let i = 0; i + 3 < a.length; i += 4) out.push([a[i], a[i + 2]]); return out; };
    const mine = pts(path), old = ghost ? pts(ghost) : [];
    if (mine.length < 2) return '';
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of mine.concat(old)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const W = 340, H = 150, s = Math.min((W - 24) / Math.max(x1 - x0, 1), (H - 24) / Math.max(z1 - z0, 1));
    const ox = (W - (x1 - x0) * s) / 2, oz = (H - (z1 - z0) * s) / 2;
    const d = (list) => list.map(([x, z], i) => `${i ? 'L' : 'M'}${((x - x0) * s + ox).toFixed(1)} ${((z - z0) * s + oz).toFixed(1)}`).join(' ');
    return `<svg class="route" viewBox="0 0 ${W} ${H}" role="img" aria-label="Your route compared with your previous best">
      ${old.length > 1 ? `<path d="${d(old)}" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="2" stroke-dasharray="5 5"/>` : ''}
      <path d="${d(mine)}" fill="none" stroke="#ff7a1a" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/></svg>
      <p class="legend"><i class="l-mine"></i>This run${old.length > 1 ? '<i class="l-old"></i>Previous best' : ''}</p>`;
  }

  const screens = {
    // Home: one large card for the thing to do next, and smaller cards for everything else.
    title: () => {
      const g = current();
      const all = [...RUNS, ...DELIVERIES, ...RESCUES];
      const free = { act: 'free', img: 'free', title: 'Free roam', sub: 'No clock and no rules. Explore the whole map, find the old lanterns, and drive what you like.',
        stats: [['Old lanterns', `${G.beacons.found} / ${G.beacons.total}`], ['Map explored', `${Math.round(G.minimap.explored * 100)}%`], ['Medals', `${medalCount(all)} / ${all.length}`]] };
      const guide = { act: 'tutorial', img: 'guide', title: 'First drive', sub: 'A short guided drive that teaches four-wheel drive, low range and diff locks.',
        stats: [['Length', 'About 3 min'], ['Status', G.save.tutorialDone ? 'Done' : 'Not done yet']], tag: G.save.tutorialDone ? '' : 'Start here' };
      const rest = [
        { act: 'runs', img: 'runs', title: G.MAP.runs?.some((r) => r.rally) ? 'Rally stages' : 'Trail runs', sub: G.MAP.runs?.some((r) => r.rally) ? 'A built road, pace notes, and the clock.' : 'Race the clock, and your own ghost.', stats: [['Events', RUNS.length], ['Medals', `${medalCount(RUNS)} / ${RUNS.length}`]] },
        { act: 'deliveries', img: 'deliveries', title: 'Deliveries', sub: 'Loose crates. Lose none.', stats: [['Jobs', DELIVERIES.length], ['Medals', `${medalCount(DELIVERIES)} / ${DELIVERIES.length}`]] },
        { act: 'rescues', img: 'rescues', title: 'Recovery jobs', sub: 'Winch out the stranded.', stats: [['Jobs', RESCUES.length], ['Medals', `${medalCount(RESCUES)} / ${RESCUES.length}`]] },
        ...(G.homeExtra?.() ?? []),
      ];
      // the guided first drive only exists on the valley map
      const teach = G.MAP.tutorial && !G.save.tutorialDone;
      const feature = teach ? guide : free;
      if (teach) rest.push(free); else if (G.MAP.tutorial) rest.push(guide);
      return `
        <header class="bar top">
          <div class="logo"><span class="logo-mark"></span><span class="logo-word">Dusk Trails</span></div>
          <span class="grow"></span>
          <button class="chip-btn" data-act="maps">
            <img src="${mapPreview(G.MAP)}" alt="" class="sq">
            <span class="stat"><small>Map</small><b>${G.MAP.name}</b></span>
            <span class="chev">Change</span>
          </button>
          <button class="chip-btn" data-act="garage">
            <img src="${G.thumbs.vehicle[g.id]}" alt="">
            <span class="stat"><small>Driving</small><b>${g.vehicle.cfg.name}</b></span>
            <span class="chev">Garage</span>
          </button>
        </header>
        <main class="home">
          ${modeTile(feature, 'feature')}
          <div class="home-grid">${rest.map((m) => modeTile(m, 'compact')).join('')}</div>
        </main>
        <footer class="bar foot">${btn('settings', 'Settings')}<span class="grow"></span><span class="tipline">Esc pauses at any time</span></footer>`;
    },

    // Map picker: choosing another map reloads the game with that world.
    maps: () => `${head('Maps', 'Each map is its own world with its own events. Your progress on each is kept.')}
      <main class="tiles maps">${MAPS.map((mp) => `
        <button class="tile ${mp.id === G.MAP.id ? 'current' : ''}" data-act="map:${mp.id}">
          <span class="tile-img map-img" style="background-image:url(${mapPreview(mp)})"></span>
          ${mp.id === G.MAP.id ? '<span class="tag">Playing now</span>' : ''}
          <span class="tile-body"><span class="tile-title">${mp.name}</span><span class="tile-sub">${mp.blurb}</span></span>
          <span class="tile-foot">${stat('Rally stage', mp.runs?.some((r) => r.rally) ? 'Yes' : 'No')}${stat('Ground', mp.ground ?? (mp.id === 'frost' ? 'Snow and ice' : mp.id === 'canyon' ? 'Sand and rock' : 'Mud and grass'))}${stat('Light', ['Dusk', 'Night', 'Dawn', 'Day'][mp.time ?? 0])}</span>
        </button>`).join('')}</main>`,

    runs: () => `${head(G.MAP.runs?.some((r) => r.rally) ? 'Stages and runs' : 'Trail runs', 'Drive through every checkpoint. Using recovery costs 5 seconds.')}<main class="tiles">${RUNS.map((e) => eventCard(e, 'run')).join('')}</main>`,
    deliveries: () => `${head('Deliveries', `Rough driving shakes crates off. Stop inside the green ring. Uses the ${current().vehicle.cfg.rack ? current().vehicle.cfg.name : '4x4'}.`)}<main class="tiles">${DELIVERIES.map((e) => eventCard(e, 'delivery')).join('')}</main>`,
    rescues: () => `${head('Recovery jobs', `Press ${G.keymap.label('winch')} near the buggy to hook it. Uses the ${current().vehicle.cfg.winch ? current().vehicle.cfg.name : '4x4'}.`)}<main class="tiles">${RESCUES.map((e) => eventCard(e, 'rescue')).join('')}</main>`,

    // Garage: list on the left, the chosen vehicle turning in 3D in the middle, what it can do underneath.
    garage: () => {
      const g = current(), other = G.garage.find((x) => x.id === compareId && x.id !== g.id);
      return `${head('Garage', 'Choose what you drive. You can also swap while driving.')}
        <main class="garage">
          <nav class="vlist">
            ${G.garage.map((x) => `
              <button class="vitem ${x.id === g.id ? 'sel' : ''}" data-act="pick:${x.id}">
                <img src="${G.thumbs.vehicle[x.id]}" alt=""><span>${x.vehicle.cfg.name}</span>
              </button>`).join('')}
          </nav>
          <section class="hero">
            <h3>${g.vehicle.cfg.name}</h3>
            <p>${g.blurb}</p>
            <p class="fit">${G.custom.summary(g)}</p>
            <div class="stage" id="stage"><span class="stage-hint">Drag to turn</span></div>
            <div class="tabs" role="tablist">
              ${[['specs', 'Specs'], ['paint', 'Paint'], ['setup', 'Set-up']].map(([id, label]) => `<button class="tab ${garageTab === id ? 'sel' : ''}" data-act="tab:${id}" role="tab">${label}</button>`).join('')}
            </div>
            ${garageTab === 'paint' ? `<div class="paints" role="group" aria-label="Paint colour">
              ${PAINTS.map((c) => `<button class="swatch ${G.paint.of(g.id).toLowerCase() === c ? 'sel' : ''}" style="background:${c}" data-act="paint:${c}" aria-label="Paint ${c}"></button>`).join('')}
            </div>` : garageTab === 'setup' ? setupPanel(g) : `<div class="specs">${features(g.vehicle).map(([k, v]) => `<span class="spec ${v === 'No' || v === 'None' ? 'off' : ''}"><small>${k}</small><b>${v}</b></span>`).join('')}</div>`}
          </section>
          <aside class="rate">
            ${Object.entries(g.stats).map(([k, v]) => `
              <div class="meter"><span>${k}<b>${v}${other ? `<em> vs ${other.stats[k]}</em>` : ''}</b></span>
                <i><u style="width:${v * 10}%"></u></i>${other ? `<i class="cmp"><u style="width:${other.stats[k] * 10}%"></u></i>` : ''}</div>`).join('')}
            <div class="compare"><small>Compare with</small>
              <div>${G.garage.filter((x) => x.id !== g.id).map((x) => `<button class="pill ${other?.id === x.id ? 'sel' : ''}" data-act="compare:${x.id}">${x.vehicle.cfg.name}</button>`).join('')}</div>
            </div>
            ${btn('driveNow', `Drive the ${g.vehicle.cfg.name}`, 'primary wide')}
          </aside>
        </main>`;
    },

    settings: () => {
      const s = G.save.settings;
      const toggle = (key, label, note) => `<label class="row"><span>${label}<small>${note}</small></span><input type="checkbox" data-set="${key}" ${s[key] ? 'checked' : ''}></label>`;
      return `<main class="sheet"><h2>Settings</h2>
        <label class="row"><span>Volume</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-set="volume"></label>
        <label class="row"><span>Graphics<small>lower it if the game stutters</small></span>
          <select data-set="quality">${['low', 'medium', 'high'].map((q) => `<option ${s.quality === q ? 'selected' : ''}>${q}</option>`).join('')}</select></label>
        ${toggle('followCam', 'Follow camera', 'the camera swings round behind the vehicle')}
        ${toggle('music', 'Music', 'quiet background music that follows the driving')}
        ${G.settingsExtra?.map((x) => toggle(x.key, x.label, x.note)).join('') ?? ''}
        <div class="btns">${btn('rebind', 'Change keys')}${btn('resetSave', 'Erase all progress', 'danger')}<span class="grow"></span>${btn('back', 'Done', 'primary')}</div>
      </main>`;
    },

    rebind: () => `<main class="sheet"><h2>Change keys</h2><p class="sub">Click an action, then press the new key. Esc cancels.</p>
      <div class="keys">${G.keymap.actions.map((a) => `<button class="keyrow ${G.keymap.waiting === a.id ? 'wait' : ''}" data-act="key:${a.id}"><span>${a.label}</span><kbd>${G.keymap.waiting === a.id ? 'press a key' : G.keymap.label(a.id)}</kbd></button>`).join('')}</div>
      <div class="btns">${btn('keysDefault', 'Restore defaults')}<span class="grow"></span>${btn('back', 'Done', 'primary')}</div></main>`,

    pause: () => `<main class="sheet narrow"><h2>Paused</h2>
      ${btn('resume', 'Resume', 'primary wide')}
      ${G.modes.kind !== 'free' ? btn('restart', 'Restart', 'wide') : ''}
      ${btn('photo', 'Photo mode', 'wide')}${btn('settings', 'Settings', 'wide')}
      ${btn('quit', 'Main menu', 'wide')}</main>`,

    result: () => {
      const d = resultData;
      const more = d.kind === 'run' ? 'runs' : d.kind === 'delivery' ? 'deliveries' : d.back ?? 'title';
      return `<main class="sheet narrow"><p class="over">${d.title}</p>
        <div class="result ${d.ok ? '' : 'fail'}">${d.medal ? `${dot(`${d.medal} big`)}<b>${d.medal} medal</b>` : `<b>${d.ok ? 'Finished' : 'Not this time'}</b>`}</div>
        ${d.path ? routePicture(d.path, d.ghostPath) : ''}
        <table>${d.rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
        ${d.splits?.length ? `<details class="splits"><summary>Checkpoint times</summary><table>${d.splits.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table></details>` : ''}
        ${btn('restart', 'Try again', 'primary wide')}${d.share ? btn('share', 'Copy result to share', 'wide') : ''}${btn(more, 'More events', 'wide')}${btn('freeHere', 'Free roam from here', 'wide')}${btn('title', 'Main menu', 'wide')}</main>`;
    },
  };

  function render() {
    const name = stack[stack.length - 1];
    body.className = `screen-${name}`;
    body.innerHTML = screens[name]();
    body.querySelector('.primary, .tile, .btn')?.focus({ preventScroll: true });
    // the garage's 3D view is one canvas that gets moved into place each time the screen is drawn
    if (name === 'garage') { document.getElementById('stage').prepend(G.showroom.canvas); G.showroom.show(current()); }
    G.cam.drift = name === 'title';
  }
  function show(name, data) {
    if (name === 'result') resultData = data;
    if (name === 'title' || name === 'pause' || name === 'result') stack = [name]; else stack.push(name);
    root.classList.add('show');
    document.body.classList.add('in-menu');
    G.paused = true;
    render();
  }
  function close() {
    stack = [];
    root.classList.remove('show');
    document.body.classList.remove('in-menu');
    G.paused = false;
    G.cam.drift = false;
  }
  function back() {
    if (stack.length > 1) { stack.pop(); render(); }
    else if (stack[0] === 'pause') close();
  }

  function act(a) {
    G.audio.click();
    const [name, arg] = a.split(':');
    if (!['paint', 'compare', 'pick', 'tab', 'tune'].includes(name)) hoverOk = false;
    switch (name) {
      case 'free': close(); G.modes.startFree(true); break;
      case 'freeHere': close(); G.modes.quit(); break;
      case 'tutorial': close(); G.modes.startTutorial(); break;
      case 'run': close(); G.modes.startRun(arg); break;
      case 'delivery': close(); G.modes.startDelivery(arg); break;
      case 'rescue': close(); G.modes.startRescue(arg); break;
      case 'map': if (arg === G.MAP.id) back(); else { body.innerHTML = '<main class="sheet narrow"><h2>Loading map</h2></main>'; chooseMap(arg); } break;
      case 'pick': G.save.vehicle = arg; G.save.commit(); render(); break;
      case 'paint': G.paint.set(current().id, arg); G.thumbs.refreshVehicle(current()); render(); break;
      case 'compare': compareId = compareId === arg ? null : arg; render(); break;
      case 'tab': garageTab = arg; render(); break;
      case 'tune': {
        const [key, value] = arg.split('='), g = current();
        G.custom.set(g, key, value ?? !G.custom.get(g.id)[key]); // extras toggle; tyres and suspension pick one
        G.showroom.refresh();
        render();
        break;
      }
      case 'driveNow': close(); G.modes.startFree(true); break;
      case 'daily': close(); G.daily.start(); break;
      case 'share': navigator.clipboard?.writeText(resultData.share).then(() => G.toast('Copied. Paste it anywhere.'), () => G.toast(resultData.share)); break;
      case 'resume': close(); break;
      case 'restart': close(); G.modes.restart(); break;
      case 'quit': case 'title': G.modes.quit(); show('title'); break;
      case 'photo': close(); G.photoMode?.enter(); break;
      case 'back': back(); break;
      case 'resetSave': if (confirm('Erase all saved progress, best times and settings?')) G.save.reset(); break;
      case 'key': G.keymap.waiting = arg; render(); break;
      case 'keysDefault': G.keymap.reset(); render(); break;
      default:
        if (screens[name]) show(name);
        else G.menuActions?.[name]?.(arg, { close, show });
    }
  }
  // a soft tick as the pointer moves from one button to the next
  let hoverOk = true, lastHover = null;
  root.addEventListener('pointerover', (e) => {
    const b = e.target.closest('button');
    if (b && b !== lastHover && hoverOk) G.audio.tick?.();
    lastHover = b; hoverOk = true;
  });
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act); });
  root.addEventListener('input', (e) => {
    const k = e.target.dataset.set;
    if (!k) return;
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? +e.target.value : e.target.value;
    G.save.settings[k] = v;
    G.save.commit();
    G.applySettings();
  });

  return {
    show, close, render,
    get open() { return stack.length > 0; },
    get screen() { return stack[stack.length - 1]; },
    onKey(code) {
      if (stack.length && G.keymap?.waiting) { G.keymap.capture(code); render(); return true; }
      if (code === 'Escape') {
        if (G.photo) return false;
        if (!stack.length) show('pause'); else back();
        return true;
      }
      // in the garage, the arrow keys step through the vehicles
      if (stack[stack.length - 1] === 'garage' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        const i = G.garage.indexOf(current()), n = G.garage.length;
        G.save.vehicle = G.garage[(i + (code === 'ArrowUp' || code === 'ArrowLeft' ? n - 1 : 1)) % n].id;
        G.save.commit(); G.audio.click(); render();
        return true;
      }
      return stack.length > 0; // while a menu is open, keys do not reach the game
    },
  };
}
