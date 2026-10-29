import * as THREE from "three";
import { tileBusyGreenColor, tileBusyRedColor } from "../../../colors";
import { convertToWebGlColor, glslFloat } from "../../WebGl/webglUtils";
import { MAX_UTILIZATION, rowGapPx, rowHeightPx, rowPaddingPx } from "./const";

/**
 * Single channel float texture where a texel (col, row) = (bucket, display row)
 */
const MAX_BUCKETS = 2048;
/**
 * Buckets at index 0 and n+1 hold the neighbors of the first and last
 * drawn buckets for reference.
 */
export const MAX_DRAWN_BUCKETS = MAX_BUCKETS - 2;
/** Server limits number of tiles requested in one query */
const MAX_ROWS = 256;
export const EMPTY_UTILIZATION = -1;

/**
 * One instance per texel referencing the previous bucket for that row
 */
const vertexShader = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform sampler2D uData;
uniform int uBucketCount;
uniform float uStartXMs;
uniform float uBucketMs;
uniform vec2 uResolution;
uniform float uHalfWidth;

in vec2 position;
out float vUtil;

const float EMPTY = ${glslFloat(EMPTY_UTILIZATION)};
const float MAX_UTIL = ${glslFloat(MAX_UTILIZATION)};
const float ROW_STRIDE = ${glslFloat(rowHeightPx + rowGapPx)};
const float ROW_PAD = ${glslFloat(rowPaddingPx)};
const float PLOT_HEIGHT = ${glslFloat(rowHeightPx - 2 * rowPaddingPx)};

float readUtil(int row, int bucketOffset) {
  return texelFetch(uData, ivec2(bucketOffset + 1, row), 0).r;
}

float toWorldY(int row, float util) {
  return -(float(row) * ROW_STRIDE + ROW_PAD + PLOT_HEIGHT * (1.0 - util / MAX_UTIL));
}

void main() {
  int row = gl_InstanceID / uBucketCount;
  int bucketOffset = gl_InstanceID - row * uBucketCount;

  float util = readUtil(row, bucketOffset);
  float prevUtil = readUtil(row, bucketOffset - 1);
  float nextUtil = readUtil(row, bucketOffset + 1);

  if (util == EMPTY || (prevUtil == EMPTY && nextUtil != EMPTY)) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    vUtil = 0.0;
    return;
  }

  float x = uStartXMs + (float(bucketOffset) + 0.5) * uBucketMs;
  float y = toWorldY(row, util);
  bool isLone = prevUtil == EMPTY;
  // span a lone point across its bucket so it is visible
  vec2 start = isLone ? vec2(x - 0.5 * uBucketMs, y) : vec2(x - uBucketMs, toWorldY(row, prevUtil));
  vec2 end = isLone ? vec2(x + 0.5 * uBucketMs, y) : vec2(x, y);
  float startUtil = isLone ? util : prevUtil;

  float t = position.x + 0.5;
  float side = position.y * 2.0;

  vec4 clip0 = projectionMatrix * modelViewMatrix * vec4(start, 0.0, 1.0);
  vec4 clip1 = projectionMatrix * modelViewMatrix * vec4(end, 0.0, 1.0);

  // offset in px for a constant stroke width
  vec2 halfResolution = 0.5 * uResolution;
  vec2 px0 = clip0.xy * halfResolution;
  vec2 px1 = clip1.xy * halfResolution;

  vec2 delta = px1 - px0;
  float len = length(delta);
  vec2 dir = len > 0.0 ? delta / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);

  // square caps to fill gaps at joints
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
  const data = new Float32Array(MAX_BUCKETS * MAX_ROWS).fill(EMPTY_UTILIZATION);
  const texture = new THREE.DataTexture(
    data,
    MAX_BUCKETS,
    MAX_ROWS,
    THREE.RedFormat,
    THREE.FloatType,
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { data, texture };
}

export function writeLineData(
  {
    material,
    texture,
    data,
  }: {
    material: THREE.RawShaderMaterial;
    texture: THREE.DataTexture;
    data: Float32Array;
  },
  rowCount: number,
  bucketCount: number,
  bucketMs: number,
  startXMs: number,
  getUtilization: (row: number, bucketOffset: number) => number,
) {
  const columnCount = bucketCount + 2;
  for (let col = 0; col < columnCount; col++) {
    for (let row = 0; row < rowCount; row++) {
      data[row * MAX_BUCKETS + col] = getUtilization(row, col - 1);
    }
  }

  // only upload the filled columns. three assumes 4 components per texel for
  // update ranges, so scale by 4 for this single channel texture
  texture.clearUpdateRanges();
  for (let row = 0; row < rowCount; row++) {
    texture.addUpdateRange(row * MAX_BUCKETS * 4, columnCount * 4);
  }
  texture.needsUpdate = true;

  const { uniforms } = material;
  uniforms.uBucketCount.value = bucketCount;
  uniforms.uBucketMs.value = bucketMs;
  uniforms.uStartXMs.value = startXMs;
  return rowCount * bucketCount;
}
