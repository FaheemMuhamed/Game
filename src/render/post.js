// Post-processing: effects applied to the finished picture.
//   bloom       bright things (lanterns, headlights) glow
//   tilt-shift  top and bottom of the screen blur, like a photo of a miniature
//   grade       darker corners and a slight warm/cool colour tint

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const TiltShift = {
  uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2(1, 0) }, amount: { value: 2.4 }, band: { value: 0.17 } },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 dir; uniform float amount; uniform float band;
    varying vec2 vUv;
    void main() {
      // No blur in a band across the middle, growing towards the top and bottom edges.
      float s = smoothstep(band, 0.5, abs(vUv.y - 0.5)) * amount;
      vec4 c = texture2D(tDiffuse, vUv) * 0.227027;
      c += (texture2D(tDiffuse, vUv + dir * s * 1.0) + texture2D(tDiffuse, vUv - dir * s * 1.0)) * 0.1945946;
      c += (texture2D(tDiffuse, vUv + dir * s * 2.0) + texture2D(tDiffuse, vUv - dir * s * 2.0)) * 0.1216216;
      c += (texture2D(tDiffuse, vUv + dir * s * 3.0) + texture2D(tDiffuse, vUv - dir * s * 3.0)) * 0.054054;
      c += (texture2D(tDiffuse, vUv + dir * s * 4.0) + texture2D(tDiffuse, vUv - dir * s * 4.0)) * 0.016216;
      gl_FragColor = c;
    }
  `,
};

const Grade = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.5 } },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float d = length((vUv - 0.5) * vec2(1.0, 0.85));
      c.rgb *= mix(1.0, 1.0 - vignette, smoothstep(0.3, 0.8, d));
      // cool the shadows, warm the highlights
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb *= mix(vec3(0.92, 1.0, 1.1), vec3(1.08, 1.0, 0.9), smoothstep(0.0, 0.6, l));
      gl_FragColor = c;
    }
  `,
};

export function createPost(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.75, 0.7, 0.95);
  composer.addPass(bloom);

  const tiltH = new ShaderPass(TiltShift), tiltV = new ShaderPass(TiltShift);
  composer.addPass(tiltH);
  composer.addPass(tiltV);

  const grade = new ShaderPass(Grade);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  const settings = { bloom: 0.75, blur: 2.4, vignette: 0.5 };

  function resize(w, h, pixelRatio) {
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);
    tiltH.uniforms.dir.value.set(1 / (w * pixelRatio), 0);
    tiltV.uniforms.dir.value.set(0, 1 / (h * pixelRatio));
  }
  function render() {
    bloom.strength = settings.bloom;
    tiltH.uniforms.amount.value = tiltV.uniforms.amount.value = settings.blur * renderer.getPixelRatio();
    grade.uniforms.vignette.value = settings.vignette;
    composer.render();
  }
  return { render, resize, settings };
}
