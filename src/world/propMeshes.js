// Draws the prop data from props.js. All the still boxes are drawn in one go
// ("instancing": the same cube stamped thousands of times), which is fast.

import * as THREE from 'three';

const CUBE = new THREE.BoxGeometry(1, 1, 1);

function instanced(boxes, material) {
  const mesh = new THREE.InstancedMesh(CUBE, material, boxes.length);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  boxes.forEach((b, i) => {
    m.makeScale(b.sx, b.sy, b.sz).setPosition(b.x, b.y, b.z);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.setHex(b.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

export function buildProps(props, physDynamics) {
  const group = new THREE.Group();

  // Anything standing between the camera and the vehicle gets a see-through
  // "window" punched in it, so trees and huts never hide what you are driving.
  const reveal = { uVeh: { value: new THREE.Vector3(0, 0, 1e6) }, uRadius: { value: 3.4 } };
  const stillMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  stillMat.onBeforeCompile = (shader) => {
    shader.uniforms.uVeh = reveal.uVeh;
    shader.uniforms.uRadius = reveal.uRadius;
    shader.fragmentShader = 'uniform vec3 uVeh; uniform float uRadius;\n' + shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      {
        vec3 vp = -vViewPosition; // this pixel's position as the camera sees it
        if (vp.z > uVeh.z + 1.0) { // nearer the camera than the vehicle
          float d = length(vp.xy - uVeh.xy) / uRadius;
          float keep = mix(0.08, 1.0, smoothstep(0.45, 1.0, d));
          float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (n > keep) discard; // dotted fade instead of a hard hole
        }
      }`,
    );
  };
  const still = instanced(props.boxes.filter((b) => !b.glow), stillMat);
  still.castShadow = true;
  still.receiveShadow = true;
  group.add(still);

  // Glowing boxes (lanterns, windows): brighter than white so the bloom effect picks them up.
  const glowMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  glowMat.color.setScalar(2.4);
  group.add(instanced(props.boxes.filter((b) => b.glow), glowMat));

  // Loose crates and barrels: one mesh each, moved every frame to follow the physics.
  const loose = physDynamics.map(({ body, spec }) => {
    const mesh = new THREE.Mesh(CUBE, new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.85 }));
    mesh.scale.set(spec.sx, spec.sy, spec.sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (spec.kind === 'crate') {
      // darker edge frame so it reads as a crate
      const band = new THREE.Mesh(CUBE, new THREE.MeshStandardMaterial({ color: 0x5a3c22, roughness: 0.9 }));
      band.scale.set(1.04, 0.16, 1.04);
      mesh.add(band);
    } else {
      for (const y of [-0.3, 0.3]) {
        const hoop = new THREE.Mesh(CUBE, new THREE.MeshStandardMaterial({ color: 0x2f2f33, roughness: 0.6 }));
        hoop.scale.set(1.06, 0.08, 1.06);
        hoop.position.y = y;
        mesh.add(hoop);
      }
    }
    group.add(mesh);
    return { mesh, body };
  });

  function update() {
    for (const { mesh, body } of loose) {
      const p = body.translation(), q = body.rotation();
      mesh.position.set(p.x, p.y, p.z);
      mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
  }
  update();
  return { group, update, reveal };
}
