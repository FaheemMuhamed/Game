// The river: one big flat sheet at water level. The ground pokes up through
// it everywhere except the river bed, so only the river shows.
//
// The water knows how deep it is at every point (from a small picture of the
// terrain heights), which lets it be clear in the shallows, dark where deep,
// and foamy along the banks. Ripples drift along it over time.

import * as THREE from 'three';
import { WATER_LEVEL } from './surfaces.js';

export function buildWater(terrain) {
  const { size, half } = terrain;

  // Terrain heights from -2 m to +2 m packed into a 0..255 picture (that range is all the water cares about).
  const N = 512, data = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const h = terrain.heightAt((i / (N - 1)) * size - half, (j / (N - 1)) * size - half);
    data[j * N + i] = Math.max(0, Math.min(255, ((h + 2) / 4) * 255));
  }
  const heightTex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;

  const uniforms = { uHeights: { value: heightTex }, uTime: { value: 0 }, uLevel: { value: WATER_LEVEL }, uSize: { value: size } };
  const material = new THREE.MeshStandardMaterial({ color: 0x1c4a4c, transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.35 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec2 vWorld;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWorld = (modelMatrix * vec4(position, 1.0)).xz;');
    shader.fragmentShader = `
      varying vec2 vWorld; uniform sampler2D uHeights; uniform float uTime, uLevel, uSize;
      float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y); }
    ` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        float ground = texture2D(uHeights, vWorld / uSize + 0.5).r * 4.0 - 2.0;
        float depth = uLevel - ground;                         // metres of water above the bed
        // blocky ripples: sample noise on a half-metre grid so the water matches the voxel world
        vec2 cell = floor(vWorld * 2.0) / 2.0;
        float ripple = noise2(cell * 0.55 + vec2(uTime * 0.35, uTime * 0.12)) * noise2(cell * 1.3 - vec2(uTime * 0.2, 0.0));
        vec3 shallow = vec3(0.24, 0.52, 0.50), deep = vec3(0.035, 0.12, 0.16);
        diffuseColor.rgb = mix(shallow, deep, smoothstep(0.05, 1.1, depth));
        diffuseColor.rgb += smoothstep(0.42, 0.75, ripple) * 0.10;                 // moving glints
        float foam = (1.0 - smoothstep(0.0, 0.16, depth)) * step(0.35, noise2(cell * 1.7 + uTime * 0.5));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.90, 0.88), foam * 0.75); // foam at the bank
        diffuseColor.a = mix(0.5, 0.9, smoothstep(0.0, 0.8, depth)) + foam * 0.2;  // see the bed in the shallows
        if (depth < -0.02) discard;
      }`);
  };

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = WATER_LEVEL;
  mesh.receiveShadow = true;
  // call every frame: moves the ripples and follows the water level as rain raises it
  mesh.tick = (dt, level) => { uniforms.uTime.value += dt; uniforms.uLevel.value = level; mesh.position.y = level; };
  return mesh;
}
