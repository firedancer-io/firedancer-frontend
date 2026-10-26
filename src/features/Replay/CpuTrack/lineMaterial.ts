import * as THREE from "three";
import { tileBusyGreenColor, tileBusyRedColor } from "../../../colors";
import { convertToWebGlColor, glslFloat } from "../../WebGl/webglUtils";
import {
  MAX_UTILIZATION,
  rowGapPx,
  rowHeightPx,
  rowPaddingPx,
  topInsetPx,
} from "./const";

/**
 * Utilization values live in a data texture rather than in geometry, so new data
 * only writes a few texels and panning only changes uniforms.
 *
 * Texture layout: one texture row per bucket (a ring buffer indexed by
 * bucketIdx mod RING_SIZE), and 4 display rows per RGBA texel. A bucket's
 * values for all display rows are one contiguous texture row, which keeps
 * partial uploads to one range per bucket.
 * Empty buckets hold EMPTY_UTILIZATION.
 */
export const RING_SIZE = 2048;
export const TEXTURE_ROWS_PER_TEXEL = 4;
export const MAX_TEXTURE_ROWS = 256;
export const TEXTURE_WIDTH = MAX_TEXTURE_ROWS / TEXTURE_ROWS_PER_TEXEL;
export const EMPTY_UTILIZATION = -1;

/**
 * One instance per display row and drawn bucket, with no instance attributes:
 * the row and bucket come from gl_InstanceID. Each instance draws the segment
 * from the previous bucket to its bucket, or a flat segment across its bucket
 * if it has no defined neighbors, or nothing.
 * Segments are expanded into quads in px so the stroke has a constant width.
 */
const vertexShader = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform sampler2D uData;
uniform int uStartCol;      // ring column of the first drawn bucket
uniform int uBucketCount;   // drawn buckets per row
uniform float uStartXMs;    // left edge of the first drawn bucket, camera-relative
uniform float uBucketMs;
uniform vec2 uResolution;   // css px
uniform float uHalfWidth;   // css px

// shared unit quad: x, y in [-0.5, 0.5]
in vec2 position;
out float vUtil;

const int RING_SIZE = ${RING_SIZE};
const float EMPTY = ${glslFloat(EMPTY_UTILIZATION)};
const float MAX_UTIL = ${glslFloat(MAX_UTILIZATION)};
const float TOP_INSET = ${glslFloat(topInsetPx)};
const float ROW_STRIDE = ${glslFloat(rowHeightPx + rowGapPx)};
const float ROW_PAD = ${glslFloat(rowPaddingPx)};
const float PLOT_HEIGHT = ${glslFloat(rowHeightPx - 2 * rowPaddingPx)};

float readUtil(int row, int bucketOffset) {
  int col = (uStartCol + bucketOffset + RING_SIZE) % RING_SIZE;
  vec4 texel = texelFetch(uData, ivec2(row / 4, col), 0);
  int channel = row - (row / 4) * 4;
  return channel == 0 ? texel.r : channel == 1 ? texel.g : channel == 2 ? texel.b : texel.a;
}

// world y is the negative px offset from the track top
float toWorldY(int row, float util) {
  return -(TOP_INSET + float(row) * ROW_STRIDE + ROW_PAD + PLOT_HEIGHT * (1.0 - util / MAX_UTIL));
}

void main() {
  int row = gl_InstanceID / uBucketCount;
  int bucketOffset = gl_InstanceID - row * uBucketCount;

  float util = readUtil(row, bucketOffset);
  float prevUtil = readUtil(row, bucketOffset - 1);
  float nextUtil = readUtil(row, bucketOffset + 1);

  // empty, or the next bucket's segment starts here: draw nothing
  if (util == EMPTY || (prevUtil == EMPTY && nextUtil != EMPTY)) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    vUtil = 0.0;
    return;
  }

  // plot at bucket center
  float x = uStartXMs + (float(bucketOffset) + 0.5) * uBucketMs;
  float y = toWorldY(row, util);
  bool isLone = prevUtil == EMPTY;
  // a lone point would be invisible, so span its bucket width
  vec2 start = isLone ? vec2(x - 0.5 * uBucketMs, y) : vec2(x - uBucketMs, toWorldY(row, prevUtil));
  vec2 end = isLone ? vec2(x + 0.5 * uBucketMs, y) : vec2(x, y);
  float startUtil = isLone ? util : prevUtil;

  float t = position.x + 0.5;     // 0 at segment start, 1 at end
  float side = position.y * 2.0;  // -1 / 1 for either side of the line

  vec4 clip0 = projectionMatrix * modelViewMatrix * vec4(start, 0.0, 1.0);
  vec4 clip1 = projectionMatrix * modelViewMatrix * vec4(end, 0.0, 1.0);

  // orthographic, so w is 1. Convert to px to offset by a px width
  vec2 halfResolution = 0.5 * uResolution;
  vec2 px0 = clip0.xy * halfResolution;
  vec2 px1 = clip1.xy * halfResolution;

  vec2 delta = px1 - px0;
  float len = length(delta);
  vec2 dir = len > 0.0 ? delta / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);

  // extend past both ends by the half width (square caps) to fill gaps at joints
  vec2 px = mix(px0, px1, t)
    + normal * side * uHalfWidth
    + dir * (t * 2.0 - 1.0) * uHalfWidth;

  gl_Position = vec4(px / halfResolution, 0.0, 1.0);
  vUtil = mix(startUtil, util, t) / MAX_UTIL;
}
`;

const fragmentShader = /* glsl */ `
precision mediump float;

uniform vec3 uIdleColor;
uniform vec3 uBusyColor;
in float vUtil;
out vec4 fragColor;

void main() {
  fragColor = vec4(mix(uIdleColor, uBusyColor, clamp(vUtil, 0.0, 1.0)), 1.0);
}
`;

export function createLineMaterial(
  dataTexture: THREE.DataTexture,
  strokeWidthPx: number,
) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      uData: { value: dataTexture },
      uStartCol: { value: 0 },
      uBucketCount: { value: 1 },
      uStartXMs: { value: 0 },
      uBucketMs: { value: 1 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uHalfWidth: { value: strokeWidthPx / 2 },
      uIdleColor: {
        value: new THREE.Vector3(...convertToWebGlColor(tileBusyGreenColor)),
      },
      uBusyColor: {
        value: new THREE.Vector3(...convertToWebGlColor(tileBusyRedColor)),
      },
    },
  });
}

export function createDataTexture() {
  const data = new Float32Array(
    RING_SIZE * TEXTURE_WIDTH * TEXTURE_ROWS_PER_TEXEL,
  ).fill(EMPTY_UTILIZATION);
  const texture = new THREE.DataTexture(
    data,
    TEXTURE_WIDTH,
    RING_SIZE,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { data, texture };
}
