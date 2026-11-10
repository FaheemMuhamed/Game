// Glowing markers in the world: a tall beam of light with a slowly turning
// ring of blocks at its foot. Used for checkpoints, drop-off points and goals.

import * as THREE from 'three';

const CUBE = new THREE.BoxGeometry(1, 1, 1);

export function createMarkers(G) {
  const group = new THREE.Group();
  G.scene.add(group);
  const pool = [];

  function make() {
    const g = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const beam = new THREE.Mesh(CUBE, beamMat);
    beam.scale.set(0.5, 36, 0.5);
    beam.position.y = 18;
    g.add(beam);
    const ringMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    const ring = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const b = new THREE.Mesh(CUBE, ringMat);
      b.scale.setScalar(0.32);
      ring.add(b);
    }
    g.add(ring);
    group.add(g);
    return { g, beam, beamMat, ring, ringMat };
  }

  let shown = [];
  // list: [{ x, z, radius, color (hex), dim }]
  function set(list) {
    shown = list;
    while (pool.length < list.length) pool.push(make());
    pool.forEach((m, i) => {
      const spec = list[i];
      m.g.visible = !!spec;
      if (!spec) return;
      const y = Math.max(G.terrain.heightAt(spec.x, spec.z), 0.1);
      m.g.position.set(spec.x, y, spec.z);
      const c = new THREE.Color(spec.color ?? 0xff7a1a);
      m.beamMat.color.copy(c);
      m.beamMat.opacity = spec.dim ? 0.1 : 0.3;
      m.ringMat.color.copy(c).multiplyScalar(spec.dim ? 0.6 : 2.2);
      m.ring.children.forEach((b, k) => {
        const a = (k / m.ring.children.length) * Math.PI * 2, r = spec.radius ?? 5;
        const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
        b.position.set(bx, Math.max(G.terrain.heightAt(spec.x + bx, spec.z + bz), 0.1) - y + 0.35, bz);
      });
    });
  }

  function update(dt) {
    const t = performance.now() / 1000;
    pool.forEach((m, i) => {
      if (!m.g.visible) return;
      m.beam.scale.x = m.beam.scale.z = 0.45 + 0.1 * Math.sin(t * 3 + i);
      m.ring.children.forEach((b, k) => { b.rotation.y = t + k; b.position.y += Math.sin(t * 2 + k) * 0.002; });
    });
  }

  return { set, clear: () => set([]), update, get shown() { return shown; } };
}
