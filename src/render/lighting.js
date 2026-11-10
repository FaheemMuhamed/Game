// Dusk lighting: cool dim moonlight from above, warm lantern light near the ground.

import * as THREE from 'three';

const LANTERN_POOL = 7; // real lights are expensive, so only the nearest few lanterns get one

export function createLighting(scene, lanterns) {
  scene.background = new THREE.Color(0x0a1216);

  const sky = new THREE.HemisphereLight(0x6f8fbf, 0x2a2018, 0.9);
  scene.add(sky);

  const moon = new THREE.DirectionalLight(0x9db4e0, 1.25);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const sc = moon.shadow.camera;
  sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 10; sc.far = 260;
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.06;
  scene.add(moon, moon.target);
  const moonOffset = new THREE.Vector3(-70, 110, 40);

  const pool = [];
  for (let i = 0; i < LANTERN_POOL; i++) {
    const light = new THREE.PointLight(0xff9440, 0, 17, 1.6);
    scene.add(light);
    pool.push(light);
  }

  const settings = { lanternPower: 55, moonPower: 1.6 };
  let timer = 0;

  function update(dt, focus) {
    moon.intensity = settings.moonPower;
    // Keep the shadow area centred on the action (snapped so shadows do not shimmer).
    const fx = Math.round(focus.x / 2) * 2, fz = Math.round(focus.z / 2) * 2;
    moon.target.position.set(fx, 0, fz);
    moon.position.set(fx + moonOffset.x, moonOffset.y, fz + moonOffset.z);

    // A few times a second, move the pooled lights to the lanterns nearest the vehicle.
    timer -= dt;
    if (timer <= 0) {
      timer = 0.25;
      const near = lanterns
        .map((l) => ({ l, d: (l.x - focus.x) ** 2 + (l.z - focus.z) ** 2 }))
        .sort((a, b) => a.d - b.d);
      pool.forEach((light, i) => {
        const n = near[i];
        if (!n) { light.intensity = 0; return; }
        light.position.set(n.l.x, n.l.y + 0.2, n.l.z);
        light.userData.base = settings.lanternPower * (i < LANTERN_POOL - 2 ? 1 : 0.5);
      });
    }
    // gentle flicker
    const t = performance.now() / 1000;
    pool.forEach((light, i) => {
      light.intensity = (light.userData.base ?? 0) * (0.9 + 0.1 * Math.sin(t * 7 + i * 2.3) * Math.sin(t * 3.1 + i));
    });
  }

  return { update, settings, moon, sky };
}
