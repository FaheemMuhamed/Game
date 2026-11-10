// Turns the height grid into the voxel landscape you see: one square column
// per grid cell, with its top snapped to steps so it looks built from blocks.

import * as THREE from 'three';
import { SURFACES } from './surfaces.js';

const STEP = 0.25; // column heights snap to multiples of this
const CHUNK = 60; // columns per chunk side (chunks let the GPU skip what is off screen)
const SKIRT = -4; // how far down the outer edge of the map is drawn

function hash(ix, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function buildTerrainMesh(terrain) {
  const { n, cell, half, heights, surfaces } = terrain;

  // Height of each column = average of its four corners, snapped to steps.
  const colH = new Float32Array(n * n);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const i = iz * (n + 1) + ix;
      const avg = (heights[i] + heights[i + 1] + heights[i + n + 1] + heights[i + n + 2]) / 4;
      colH[iz * n + ix] = Math.round(avg / STEP) * STEP;
    }
  }
  const hAt = (ix, iz) => (ix < 0 || iz < 0 || ix >= n || iz >= n ? SKIRT : colH[iz * n + ix]);

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  // For ruts: remember where each column's top face lives so it can be lowered later.
  const topVertex = new Int32Array(n * n), chunkOf = new Uint16Array(n * n), meshes = [];
  const group = new THREE.Group();
  const top = new THREE.Color(), side = new THREE.Color();

  for (let cz = 0; cz < n; cz += CHUNK) {
    for (let cx = 0; cx < n; cx += CHUNK) {
      const pos = [], nor = [], col = [], idx = [];
      const quad = (ax, ay, az, bx, by, bz, cx2, cy, cz2, dx, dy, dz, nx, ny, nz, c) => {
        const v = pos.length / 3;
        pos.push(ax, ay, az, bx, by, bz, cx2, cy, cz2, dx, dy, dz);
        for (let k = 0; k < 4; k++) { nor.push(nx, ny, nz); col.push(c.r * 255, c.g * 255, c.b * 255); }
        idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      };

      for (let iz = cz; iz < Math.min(cz + CHUNK, n); iz++) {
        for (let ix = cx; ix < Math.min(cx + CHUNK, n); ix++) {
          const h = colH[iz * n + ix];
          const s = SURFACES[surfaces[iz * n + ix]];
          const x0 = ix * cell - half, x1 = x0 + cell, z0 = iz * cell - half, z1 = z0 + cell;
          const jitter = 0.86 + hash(ix, iz) * 0.28; // every voxel a slightly different shade
          top.setHex(s.color).multiplyScalar(jitter);
          side.setHex(s.side).multiplyScalar(jitter * 0.85);

          topVertex[iz * n + ix] = pos.length / 3;
          chunkOf[iz * n + ix] = meshes.length;
          quad(x0, h, z0, x0, h, z1, x1, h, z1, x1, h, z0, 0, 127, 0, top);
          // Sides are only needed where the neighbour column is lower.
          let hn = hAt(ix + 1, iz);
          if (hn < h) quad(x1, hn, z0, x1, h, z0, x1, h, z1, x1, hn, z1, 127, 0, 0, side);
          hn = hAt(ix - 1, iz);
          if (hn < h) quad(x0, hn, z1, x0, h, z1, x0, h, z0, x0, hn, z0, -127, 0, 0, side);
          hn = hAt(ix, iz + 1);
          if (hn < h) quad(x1, hn, z1, x1, h, z1, x0, h, z1, x0, hn, z1, 0, 0, 127, side);
          hn = hAt(ix, iz - 1);
          if (hn < h) quad(x0, hn, z0, x0, h, z0, x1, h, z0, x1, hn, z0, 0, 0, -127, side);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(nor), 3, true));
      geo.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(col), 3, true));
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      group.add(mesh);
      meshes.push(mesh);
    }
  }

  // Press the tops of rutted columns down to match how deep the wheels have dug.
  group.syncRuts = () => {
    if (!terrain.dirty.length) return;
    for (const i of terrain.dirty) {
      const attr = meshes[chunkOf[i]].geometry.attributes.position, v = topVertex[i], y = colH[i] - terrain.ruts[i];
      for (let k = 0; k < 4; k++) attr.setY(v + k, y);
      attr.needsUpdate = true;
    }
    terrain.dirty.length = 0;
  };
  group.material = material;
  return group;
}
