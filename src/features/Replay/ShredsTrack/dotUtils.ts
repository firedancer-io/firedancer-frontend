import * as THREE from "three";
import {
  createRectMesh,
  createUnitQuad,
  fragmentShader,
  type RectMesh,
  type RectResources,
} from "../../WebGl/webglUtils";

/** Device-independent px width */
export const DEFAULT_DOT_PX = 1;

/**
 * Vertex shader for fixed-pixel-width dots anchored at an instance's left edge.
 * The x-width is derived from uniforms so the mark stays a constant pixel width
 * regardless of camera zoom.
 *
 * Only instanceRect.x (left edge) and instanceRect.w (world-space height) are
 * read. instanceRect.z (world width) is ignored.
 */
const dotVertexShader = /* glsl */ `
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform float uWorldPerPixelX;  // world x units per screen pixel
uniform float uDotPx;           // mark width in device-independent pixels

attribute vec2 position;
attribute vec4 instanceRect;  // x, y, w(unused), h in world space
attribute vec3 instanceColor;

varying vec3 vColor;

void main() {
  // constant pixel width in world space
  float worldWidth = uWorldPerPixelX * uDotPx;
  vec2 size = vec2(worldWidth, instanceRect.w);
  vec2 origin = vec2(instanceRect.x, instanceRect.y);
  // anchor at the left edge: position is a centered unit quad, so shift by size * 0.5
  vec2 world = position * size + origin + size * 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 0.0, 1.0);
  vColor = instanceColor;
}
`;

function createDotMaterial(opacity: number) {
  return new THREE.RawShaderMaterial({
    vertexShader: dotVertexShader,
    fragmentShader,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uOpacity: { value: opacity },
      uWorldPerPixelX: { value: 1 },
      uDotPx: { value: DEFAULT_DOT_PX },
    },
  });
}

export function createDotResources(opacity = 1): RectResources {
  return {
    unitQuad: createUnitQuad(),
    rectMaterial: createDotMaterial(opacity),
  };
}

export function disposeDotResources(resources: RectResources) {
  resources.unitQuad.dispose();
  resources.rectMaterial.dispose();
}

/**
 * Update the dot material so marks stay a constant pixel width at the current zoom.
 * worldPerPixelX = (camera.right - camera.left) / viewportWidthPx.
 */
export function updateDotWorldPerPixel(
  material: THREE.RawShaderMaterial,
  worldPerPixelX: number,
  dotPx = DEFAULT_DOT_PX,
) {
  material.uniforms.uWorldPerPixelX.value = worldPerPixelX;
  material.uniforms.uDotPx.value = dotPx;
}

export function createDotMesh(
  resources: RectResources,
  initialCapacity = 700,
): RectMesh {
  return createRectMesh(resources, initialCapacity);
}
