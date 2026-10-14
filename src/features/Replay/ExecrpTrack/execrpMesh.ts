import * as THREE from "three";

/**
 * SDF outline material for the execrp track. It reuses the shared instanced-rect
 * attribute layout (`instanceRect` vec4, `instanceColor` vec3) so it can be built
 * with the shared `createRectMesh(resources, capacity, outlineMaterial)` and share
 * the shared rect helpers (ensureRectCapacity / addRectangleToMesh /
 * updateRectMeshCounts). Instead of filling each instance it draws a
 * constant-pixel-width frame, used for the per-txn success/error border.
 */

const outlineVertexShader = /* glsl */ `
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform vec2 uResolution;     // drawing-buffer size in px

attribute vec2 position;
attribute vec4 instanceRect;  // x, y, w, h in world space
attribute vec3 instanceColor;

varying vec3 vColor;
varying vec2 vLocal;          // unit-quad local coord in [-0.5, 0.5]
varying vec2 vRectPx;         // instance size in screen px

void main() {
  vec2 world = position * instanceRect.zw + instanceRect.xy + instanceRect.zw * 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 0.0, 1.0);
  vColor = instanceColor;
  vLocal = position;

  // Orthographic, axis-aligned: NDC-per-world = projectionMatrix diagonal.
  // px = ndcSize * 0.5 * resolution. modelViewMatrix only translates (no scale).
  vRectPx = abs(vec2(
    instanceRect.z * projectionMatrix[0][0],
    instanceRect.w * projectionMatrix[1][1]
  )) * 0.5 * uResolution;
}
`;

const outlineFragmentShader = /* glsl */ `
precision highp float;

uniform float uBorderPx;
uniform float uOpacity;

varying vec3 vColor;
varying vec2 vLocal;
varying vec2 vRectPx;

void main() {
  // Distance to the nearest edge, in screen px, along each axis.
  vec2 distPx = (0.5 - abs(vLocal)) * vRectPx;
  float d = min(distPx.x, distPx.y);

  // Keep the outer uBorderPx pixels, fade over ~1px, discard the interior.
  float coverage = 1.0 - smoothstep(uBorderPx - 0.5, uBorderPx + 0.5, d);
  if (coverage <= 0.0) discard;

  gl_FragColor = vec4(vColor, uOpacity * coverage);
}
`;

export function createOutlineMaterial(
  borderPx: number,
  opacity: number,
): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    vertexShader: outlineVertexShader,
    fragmentShader: outlineFragmentShader,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uBorderPx: { value: borderPx },
      uOpacity: { value: opacity },
      uResolution: { value: new THREE.Vector2(1, 1) },
    },
  });
}

export function disposeOutlineMaterial(
  material: THREE.RawShaderMaterial,
): void {
  material.dispose();
}

const tmpSize = new THREE.Vector2();
/** Refresh the outline's border width (CSS px) and resolution; call per draw. */
export function updateOutlineUniforms(
  material: THREE.RawShaderMaterial,
  renderer: THREE.WebGLRenderer,
  borderPx: number,
): void {
  renderer.getDrawingBufferSize(tmpSize);
  material.uniforms.uBorderPx.value = borderPx * renderer.getPixelRatio();
  (material.uniforms.uResolution.value as THREE.Vector2).set(
    tmpSize.x,
    tmpSize.y,
  );
}
