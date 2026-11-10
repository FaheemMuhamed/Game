// Isometric camera: an orthographic camera (no perspective, so things do not
// shrink with distance) looking down at an angle, following the vehicle.

import * as THREE from 'three';

const ELEVATION = (40 * Math.PI) / 180; // how steeply it looks down
const DISTANCE = 170;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a)); // keep an angle within -180..180 degrees

export function createCamera() {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 500);
  const state = {
    camera,
    quarter: 0, // which of the four corners we look from (fixed mode)
    follow: false, // follow mode: the camera swings round to stay behind the vehicle
    azimuth: Math.PI / 4,
    zoom: 30, // metres of world visible top to bottom
    zoomTarget: 30,
    focus: new THREE.Vector3(),
    aspect: 1,
    free: null, // photo mode sets this to { x, z } to move the camera by hand
  };

  state.resize = (w, h) => { state.aspect = w / h; };
  state.rotate = (dir) => { state.quarter += dir; };
  state.zoomBy = (factor) => { state.zoomTarget = THREE.MathUtils.clamp(state.zoomTarget * factor, 12, 90); };
  state.snapTo = (p) => { state.focus.set(p.x, p.y, p.z); };
  state.setFollow = (on) => {
    state.follow = on;
    if (!on) state.quarter = (state.azimuth - Math.PI / 4) / (Math.PI / 2); // carry on from wherever the view is now
  };

  const want = new THREE.Vector3();
  state.update = (dt, target, velocity, yaw = 0) => {
    // Look a little ahead of where the vehicle is going.
    want.set(target.x + velocity.x * 0.35, target.y, target.z + velocity.z * 0.35);
    state.focus.lerp(want, 1 - Math.exp(-dt * 5));
    const targetAz = state.follow ? yaw + Math.PI : Math.PI / 4 + state.quarter * (Math.PI / 2);
    if (state.drift) state.azimuth += dt * 0.035; // menus: the view turns very slowly
    else state.azimuth += wrap(targetAz - state.azimuth) * (1 - Math.exp(-dt * (state.follow ? 2.2 : 7)));
    // Pull back a bit at speed.
    const speed = Math.hypot(velocity.x, velocity.z);
    const zoom = state.zoomTarget * (1 + Math.min(speed, 30) * 0.012);
    state.zoom += (zoom - state.zoom) * (1 - Math.exp(-dt * 3));

    const c = Math.cos(ELEVATION);
    camera.position.set(
      state.focus.x + Math.sin(state.azimuth) * c * DISTANCE,
      state.focus.y + Math.sin(ELEVATION) * DISTANCE,
      state.focus.z + Math.cos(state.azimuth) * c * DISTANCE,
    );
    camera.lookAt(state.focus);
    const hh = state.zoom / 2, hw = hh * state.aspect;
    camera.left = -hw; camera.right = hw; camera.top = hh; camera.bottom = -hh;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };
  return state;
}
