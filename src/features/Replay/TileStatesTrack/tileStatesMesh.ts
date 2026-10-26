import * as THREE from "three";

/**
 * Materials for the tile states track. Both reuse the shared instanced-rect
 * attribute layout (`instanceRect` vec4, `instanceColor` vec3) so they work with
 * the shared `createRectMesh(resources, capacity, material)` and rect helpers
 * (ensureRectCapacity / addRectangleToMesh / updateRectMeshCounts).
 *
 * Each tile mesh owns its materials so it can carry its own view position
 * uniforms (see `setViewUniforms`).
 */

/**
 * Positions a rect's left/right edges in whole device pixels; y comes from the
 * camera as usual. Positions are tile-local ms split into hi + lo float32s,
 * measured from an anchor on the global pixel grid in that split form before
 * converting to px, which stays well under a pixel of error at any zoom (a
 * single float32 tile-local ms is only good to ~0.5us over an 8s tile). The
 * anchor only moves when the view travels far, so while scrolling every input
 * to the rounding is constant and the view offset is a whole number of px:
 * edges never flip between pixels. Edges are at least 1px apart so sub-pixel
 * states are always drawn.
 */
const rectPositionGlsl = /* glsl */ `
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform float uMsPerPx;     // device px
uniform float uViewWidthPx; // drawing-buffer width
uniform float uAnchorHi;    // anchor in tile-local ms, as hi + lo floats
uniform float uAnchorLo;
uniform float uOffsetPx;    // whole px from the view's left edge to the anchor

attribute vec2 position;
attribute vec4 instanceRect;  // x, y, w, h; only y and h are used (x comes from instanceEdges)
attribute vec3 instanceColor;
attribute vec4 instanceEdges; // tile-local start and end ms, each as hi + lo floats

vec4 rectClipPosition() {
  // Not positioned yet (no visible range): draw nothing.
  if (uMsPerPx <= 0.0) return vec4(2.0, 2.0, 0.0, 1.0);

  float worldY = position.y * instanceRect.w + instanceRect.y + instanceRect.w * 0.5;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(0.0, worldY, 0.0, 1.0);

  float x0 = ((instanceEdges.x - uAnchorHi) + (instanceEdges.y - uAnchorLo)) / uMsPerPx;
  float x1 = ((instanceEdges.z - uAnchorHi) + (instanceEdges.w - uAnchorLo)) / uMsPerPx;
  x0 = floor(x0 + 0.5);
  x1 = max(floor(x1 + 0.5), x0 + 1.0);
  float px = uOffsetPx + (position.x < 0.0 ? x0 : x1);
  // Orthographic, so clip.w == 1 and clip.x is NDC.
  clip.x = px / uViewWidthPx * 2.0 - 1.0;
  return clip;
}
`;

const fillVertexShader = /* glsl */ `
${rectPositionGlsl}
varying vec3 vColor;

void main() {
  gl_Position = rectClipPosition();
  vColor = instanceColor;
}
`;

const fillFragmentShader = /* glsl */ `
precision mediump float;
uniform float uOpacity;
varying vec3 vColor;

void main() {
  gl_FragColor = vec4(vColor, uOpacity);
}
`;

/**
 * Instead of filling each instance it draws constant-pixel-width top and
 * bottom borders, used for the per-txn success/error state.
 */
const outlineVertexShader = /* glsl */ `
${rectPositionGlsl}
uniform vec2 uResolution;     // drawing-buffer size in px

varying vec3 vColor;
varying vec2 vLocal;          // unit-quad local coord in [-0.5, 0.5]
varying float vRectHeightPx;

void main() {
  gl_Position = rectClipPosition();
  vColor = instanceColor;
  vLocal = position;

  // Orthographic, axis-aligned: NDC-per-world = projectionMatrix diagonal.
  vRectHeightPx = abs(instanceRect.w * projectionMatrix[1][1]) * 0.5 * uResolution.y;
}
`;

const outlineFragmentShader = /* glsl */ `
precision highp float;

uniform float uBorderPx;
uniform float uOpacity;

varying vec3 vColor;
varying vec2 vLocal;
varying float vRectHeightPx;

void main() {
  // Distance to the nearest top/bottom edge, in screen px.
  float d = (0.5 - abs(vLocal.y)) * vRectHeightPx;

  // Keep the outer uBorderPx pixels, fade over ~1px, discard the interior.
  float coverage = 1.0 - smoothstep(uBorderPx - 0.5, uBorderPx + 0.5, d);
  if (coverage <= 0.0) discard;

  gl_FragColor = vec4(vColor, uOpacity * coverage);
}
`;

function viewUniforms() {
  return {
    uMsPerPx: { value: 0 },
    uViewWidthPx: { value: 1 },
    uAnchorHi: { value: 0 },
    uAnchorLo: { value: 0 },
    uOffsetPx: { value: 0 },
  };
}

export function createFillMaterial(opacity: number): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    vertexShader: fillVertexShader,
    fragmentShader: fillFragmentShader,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    uniforms: { ...viewUniforms(), uOpacity: { value: opacity } },
  });
}

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
      ...viewUniforms(),
      uBorderPx: { value: borderPx },
      uOpacity: { value: opacity },
      uResolution: { value: new THREE.Vector2(1, 1) },
    },
  });
}

export interface ViewState {
  msPerPx: number;
  viewWidthPx: number;
  /** Anchor in tile-local ms. */
  anchorMs: number;
  /** Whole px from the view's left edge to the anchor. */
  offsetPx: number;
}

export function setViewUniforms(
  material: THREE.RawShaderMaterial,
  { msPerPx, viewWidthPx, anchorMs, offsetPx }: ViewState,
): void {
  const u = material.uniforms;
  const anchorHi = Math.fround(anchorMs);
  u.uMsPerPx.value = msPerPx;
  u.uViewWidthPx.value = viewWidthPx;
  u.uAnchorHi.value = anchorHi;
  u.uAnchorLo.value = anchorMs - anchorHi;
  u.uOffsetPx.value = offsetPx;
}

const tmpSize = new THREE.Vector2();
/** Refresh the outline's border width (CSS px) and resolution after size changes. */
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
