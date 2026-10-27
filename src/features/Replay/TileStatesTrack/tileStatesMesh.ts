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
 * Rect edges in px from tile-local ms split into hi + lo float32s, measured
 * from an anchor on the global pixel grid in that split form before converting
 * to px, which stays well under a pixel of error at any zoom (a single float32
 * tile-local ms is only good to ~0.5us over an 8s tile). The anchor only moves
 * when the view travels far, and the view offset is a whole number of px, so
 * scrolling doesn't change any edge's position relative to the pixel grid.
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

// Left/right edges in px from the anchor
vec2 rectEdgesFromAnchor() {
  return vec2(
    ((instanceEdges.x - uAnchorHi) + (instanceEdges.y - uAnchorLo)) / uMsPerPx,
    ((instanceEdges.z - uAnchorHi) + (instanceEdges.w - uAnchorLo)) / uMsPerPx
  );
}

// Quad corner for left/right edges in px from the view's left edge
vec4 rectClipPosition(float x0, float x1) {
  // Not positioned yet (no visible range): draw nothing.
  if (uMsPerPx <= 0.0) return vec4(2.0, 2.0, 0.0, 1.0);

  float worldY = position.y * instanceRect.w + instanceRect.y + instanceRect.w * 0.5;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(0.0, worldY, 0.0, 1.0);
  // Orthographic, so clip.w == 1 and clip.x is NDC.
  clip.x = (position.x < 0.0 ? x0 : x1) / uViewWidthPx * 2.0 - 1.0;
  return clip;
}
`;

/**
 * Fill pass. Previously each state was drawn as a whole-px rect at least 1px
 * wide at 50% alpha, so when zoomed out many sub-pixel states stacked into the
 * same column. Which ones landed in which column changed with every 1px pan or
 * zoom step, giving a high-contrast pixel-scale pattern that read as flicker /
 * shimmer (confirmed: blurring the canvas by ~1px made it disappear).
 *
 * Instead, each state now adds its exact fractional coverage of every column
 * it touches into a float render target (additive blending, see
 * createFillMaterial). After all states are drawn a column holds
 * sum(color * weight) in rgb and sum(weight) in alpha, i.e. the time-weighted
 * average of everything in it, which changes smoothly as the view moves.
 * createResolveMaterial then turns that into the final color.
 *
 * Panning is still an exact whole-px translation (uOffsetPx is whole px and
 * the anchor is on the pixel grid), so columns don't re-mix while panning.
 */
const fillVertexShader = /* glsl */ `
${rectPositionGlsl}
varying vec3 vColor;
varying vec2 vEdges;

void main() {
  // Exact (sub-pixel) edges in px from the view's left edge
  vec2 edges = rectEdgesFromAnchor() + uOffsetPx;
  // Rasterize every column the state touches, even partially (floor/ceil, at
  // least 1px); the fragment shader works out how much of each it covers
  float x0 = floor(edges.x);
  gl_Position = rectClipPosition(x0, max(ceil(edges.y), x0 + 1.0));
  vColor = instanceColor;
  vEdges = edges;
}
`;

const fillFragmentShader = /* glsl */ `
precision highp float;
uniform float uMinWeightPx;
uniform float uTimeOnly; // 1 while drawing into the time-coverage target (no min weight)
varying vec3 vColor;
varying vec2 vEdges;

void main() {
  // Fraction of this px column [column, column + 1) inside the state's edges
  float column = floor(gl_FragCoord.x);
  float coverage = clamp(min(vEdges.y, column + 1.0) - max(vEdges.x, column), 0.0, 1.0);
  if (coverage <= 0.0) discard;
  // Color pass: a state narrower than uMinWeightPx is scaled up as if it were
  // that wide, so short frequent states still tint the column. The scale-up is
  // spread proportionally over the columns it touches.
  // Time pass: plain coverage, so alpha sums to the column's busy fraction.
  float weight = uTimeOnly > 0.5
    ? coverage
    : coverage * max(1.0, uMinWeightPx / max(vEdges.y - vEdges.x, 1e-6));
  gl_FragColor = vec4(vColor * weight, weight);
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
  // Outlines keep the old whole-px rounding (they're drawn straight to the
  // canvas, not accumulated): at least 1px apart so sub-pixel txns show
  vec2 edges = rectEdgesFromAnchor();
  float x0 = floor(edges.x + 0.5);
  float x1 = max(floor(edges.y + 0.5), x0 + 1.0);
  gl_Position = rectClipPosition(uOffsetPx + x0, uOffsetPx + x1);
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

export function createFillMaterial(
  minWeightPx: number,
  timeOnly: THREE.IUniform<number>,
): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    vertexShader: fillVertexShader,
    fragmentShader: fillFragmentShader,
    side: THREE.FrontSide,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    // Pure additive (src + dst) for color and alpha so every state in a column
    // sums into the float target; no depth since overlap order doesn't matter
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
    uniforms: {
      ...viewUniforms(),
      uMinWeightPx: { value: minWeightPx },
      uTimeOnly: timeOnly,
    },
  });
}

/**
 * Resolve pass: one fullscreen quad that turns the two accumulated targets into
 * the canvas pixels.
 *
 * - Color = accum.rgb / accum.a, the count-weighted average color of the column.
 * - Opacity = the column's plain time coverage (fraction of the column's time
 *   that has any state), from the time target. This is linear in the data, so
 *   the overall brightness of a region stays the same at every zoom level. We
 *   tried non-linear opacity (capping, ramps, using the min-weighted alpha) and
 *   they all made brightness visibly cycle darker/lighter while zooming,
 *   because how states fall into columns changes with the scale.
 * - Both are smoothed [1/4 1/2 1/4] across neighboring columns, which takes the
 *   remaining column-to-column noise out of dense areas at a cost of ~1px of
 *   horizontal sharpness.
 *
 * Output is premultiplied (rgb * alpha), matching the canvas' default
 * premultipliedAlpha compositing.
 */
export function createResolveMaterial(
  accum: THREE.Texture,
  time: THREE.Texture,
): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    vertexShader: /* glsl */ `
      attribute vec2 position;
      varying vec2 vUv;
      void main() {
        vUv = position * 0.5 + 0.5;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uAccum;
      uniform sampler2D uTime;
      uniform float uTexelX; // 1 / buffer width, i.e. one column in uv
      varying vec2 vUv;
      vec4 smoothed(sampler2D tex) {
        return 0.5 * texture2D(tex, vUv) +
          0.25 * texture2D(tex, vUv - vec2(uTexelX, 0.0)) +
          0.25 * texture2D(tex, vUv + vec2(uTexelX, 0.0));
      }
      void main() {
        vec4 accum = smoothed(uAccum);
        if (accum.a <= 0.0) discard;
        float time = min(smoothed(uTime).a, 1.0);
        gl_FragColor = vec4(accum.rgb / accum.a * time, time);
      }
    `,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uAccum: { value: accum },
      uTime: { value: time },
      uTexelX: { value: 1 },
    },
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
