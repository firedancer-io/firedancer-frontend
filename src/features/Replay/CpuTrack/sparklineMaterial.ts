import * as THREE from "three";
import { tileBusyGreenColor, tileBusyRedColor } from "../../../colors";
import { convertToWebGlColor, glslFloat } from "../../WebGl/webglUtils";
import { MAX_UTILIZATION, rowGapPx, rowHeightPx, rowPaddingPx } from "./const";

/**
 * Single channel float texture where texel (col, row) holds the value of point
 * col in display row row. x comes from the column, y from the value.
 */
const MAX_COLUMNS = 2048;
/**
 * Column 0 holds the point before the first drawn point so the line reaches the
 * left edge
 */
export const MAX_DRAWN_POINTS = MAX_COLUMNS - 1;
/** Server limits number of tiles requested in one query */
const MAX_ROWS = 256;
export const EMPTY_UTILIZATION = -1;

const vertexShader = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform sampler2D uData;
uniform int uPointCount;
uniform float uStartXMs;
uniform float uPointSpacingMs;
uniform vec2 uResolution;
uniform float uHalfWidth;

in vec2 position;
out float vUtil;

const float EMPTY = ${glslFloat(EMPTY_UTILIZATION)};
const float MAX_UTIL = ${glslFloat(MAX_UTILIZATION)};
const float ROW_STRIDE = ${glslFloat(rowHeightPx + rowGapPx)};
const float ROW_PAD = ${glslFloat(rowPaddingPx)};
const float PLOT_HEIGHT = ${glslFloat(rowHeightPx - 2 * rowPaddingPx)};

float readUtil(int row, int pointIdx) {
  return texelFetch(uData, ivec2(pointIdx + 1, row), 0).r;
}

float toWorldY(int row, float util) {
  return -(float(row) * ROW_STRIDE + ROW_PAD + PLOT_HEIGHT * (1.0 - util / MAX_UTIL));
}

void main() {
  int row = gl_InstanceID / uPointCount;
  int pointIdx = gl_InstanceID - row * uPointCount;

  float util = readUtil(row, pointIdx);
  float prevUtil = readUtil(row, pointIdx - 1);
  float nextUtil = pointIdx + 1 < uPointCount ? readUtil(row, pointIdx + 1) : EMPTY;

  if (util == EMPTY || (prevUtil == EMPTY && nextUtil != EMPTY)) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    vUtil = 0.0;
    return;
  }

  float x = uStartXMs + (float(pointIdx) + 0.5) * uPointSpacingMs;
  float y = toWorldY(row, util);
  bool isLone = prevUtil == EMPTY;
  // span a lone point across its spacing so it is visible
  vec2 start = isLone ? vec2(x - 0.5 * uPointSpacingMs, y) : vec2(x - uPointSpacingMs, toWorldY(row, prevUtil));
  vec2 end = isLone ? vec2(x + 0.5 * uPointSpacingMs, y) : vec2(x, y);
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

export function createSparklineMaterial(
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
      uPointCount: { value: 1 },
      uStartXMs: { value: 0 },
      uPointSpacingMs: { value: 1 },
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
  const data = new Float32Array(MAX_COLUMNS * MAX_ROWS).fill(EMPTY_UTILIZATION);
  const texture = new THREE.DataTexture(
    data,
    MAX_COLUMNS,
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

export function writeSparklineData(
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
  pointCount: number,
  pointSpacingMs: number,
  startXMs: number,
  getUtilization: (row: number, pointIdx: number) => number,
) {
  const columnCount = pointCount + 1;
  for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col < columnCount; col++) {
      data[row * MAX_COLUMNS + col] = getUtilization(row, col - 1);
    }
  }

  // three.js reads update ranges as offsets into the data array and
  // assumes RGBA (4 values per pixel), so scale them by 4 for this
  // single channel texture.
  texture.clearUpdateRanges();
  for (let row = 0; row < rowCount; row++) {
    texture.addUpdateRange(row * MAX_COLUMNS * 4, columnCount * 4);
  }
  texture.needsUpdate = true;

  const { uniforms } = material;
  uniforms.uPointCount.value = pointCount;
  uniforms.uPointSpacingMs.value = pointSpacingMs;
  uniforms.uStartXMs.value = startXMs;
  return rowCount * pointCount;
}
