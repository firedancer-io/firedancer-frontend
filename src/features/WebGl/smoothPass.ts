import * as THREE from "three";
import { createUnitQuad, fullscreenVertexShader } from "./webglUtils";

// [1 2 1] / 4 across neighboring columns, on premultiplied colors
const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uScene;

  out vec4 fragColor;

  void main() {
    ivec2 px = ivec2(gl_FragCoord.xy);
    int maxX = textureSize(uScene, 0).x - 1;
    vec4 left = texelFetch(uScene, ivec2(max(px.x - 1, 0), px.y), 0);
    vec4 center = texelFetch(uScene, px, 0);
    vec4 right = texelFetch(uScene, ivec2(min(px.x + 1, maxX), px.y), 0);
    fragColor = 0.25 * left + 0.5 * center + 0.25 * right;
  }
`;

// smooths a scene across columns, so sub-px detail doesn't shimmer as it moves
export function createSmoothPass() {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    samples: 4,
    depthBuffer: false,
  });
  const geometry = createUnitQuad();
  const material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: fullscreenVertexShader,
    fragmentShader,
    uniforms: { uScene: { value: target.texture } },
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const passScene = new THREE.Scene();
  passScene.add(mesh);
  const passCamera = new THREE.Camera();

  return {
    // draws the last renderToTarget scene smoothed
    output: { scene: passScene, camera: passCamera },
    renderToTarget(
      renderer: THREE.WebGLRenderer,
      scene: THREE.Scene,
      camera: THREE.Camera,
    ) {
      const { width, height } = renderer.domElement;
      if (!width || !height) return;
      if (target.width !== width || target.height !== height) {
        target.setSize(width, height);
      }
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
    },
    dispose() {
      target.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
