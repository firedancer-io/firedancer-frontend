import * as THREE from "three";
import {
  BAR_HEIGHT_PX,
  ERROR_STATES_ALPHA,
  ERROR_STATES_BORDER_PX,
} from "./consts.ts";

const createVertexShader = (colorCount: number) => /* glsl */ `
uniform mat4 modelViewMatrix; // the anchor as hi + lo
uniform float uMsPerPx;       // ms per device px of the view
uniform float uViewWidthPx;
uniform float uOffsetPx;      // anchor's offset from the view's left edge
uniform vec3 uColors[${colorCount}];

attribute vec2 position;      // unit quad in [-0.5, 0.5]
attribute vec4 instanceEdges; // start and end ms as hi + lo
attribute vec3 instanceBar;   // bottom y and height in [0, 1], uColors index

varying vec3 vColor;
varying float vLocalY;  // unit quad y in [-0.5, 0.5]
varying vec2 vEdgesPx;  // left and right edges from the view's left edge

void main() {
  vColor = uColors[int(instanceBar.z + 0.5)];
  vLocalY = position.y;
  // Subtract from the anchor hi and lo before converting to px, so edges in
  // view stay exact and don't jitter while zooming
  float anchorHi = modelViewMatrix[3][0];
  float anchorLo = modelViewMatrix[3][1];
  vEdgesPx =
    vec2(
      (instanceEdges.x - anchorHi) + (instanceEdges.y - anchorLo),
      (instanceEdges.z - anchorHi) + (instanceEdges.w - anchorLo)
    ) / uMsPerPx +
    uOffsetPx;
  // The fragment shader only runs for px whose centers fall inside the quad,
  // so pad by 1px to include every partly covered px
  float px = position.x < 0.0 ? vEdgesPx.x - 1.0 : vEdgesPx.y + 1.0;

  // y is in [0, 1] view space
  float y = instanceBar.x + (position.y + 0.5) * instanceBar.y;
  gl_Position = vec4(px / uViewWidthPx * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** Exact fraction of this px's width the rect covers. */
const xCoverageGlsl = /* glsl */ `
varying vec2 vEdgesPx;

float xCoverage() {
  float px = gl_FragCoord.x;
  return clamp(min(px + 0.5, vEdgesPx.y) - max(px - 0.5, vEdgesPx.x), 0.0, 1.0);
}
`;

/**
 * Adds each state's share of the px.
 */
const tileStatesFragmentShader = /* glsl */ `
precision highp float;
${xCoverageGlsl}
varying vec3 vColor;

void main() {
  float coverage = xCoverage();
  if (coverage <= 0.0) discard;
  gl_FragColor = vec4(vColor * coverage, coverage);
}
`;

const errorStatesFragmentShader = /* glsl */ `
precision highp float;
${xCoverageGlsl}
uniform float uBorderPx;
uniform float uBarHeightPx;
uniform float uOpacity;

varying vec3 vColor;
varying float vLocalY;

void main() {
  // Distance to the nearest top/bottom edge in device px.
  float d = (0.5 - abs(vLocalY)) * uBarHeightPx;

  float coverage =
    (1.0 - smoothstep(uBorderPx - 0.5, uBorderPx + 0.5, d)) * xCoverage();
  if (coverage <= 0.0) discard;

  gl_FragColor = vec4(vColor, uOpacity * coverage);
}
`;

function createMaterial(
  fragmentShader: string,
  colors: THREE.Vector3[],
  uniforms: Record<string, THREE.IUniform>,
  params: THREE.ShaderMaterialParameters = {},
) {
  return new THREE.RawShaderMaterial({
    vertexShader: createVertexShader(colors.length),
    fragmentShader,
    transparent: true,
    depthTest: false,
    uniforms: {
      uMsPerPx: { value: 1 },
      uViewWidthPx: { value: 1 },
      uOffsetPx: { value: 0 },
      uColors: { value: colors },
      ...uniforms,
    },
    ...params,
  });
}

/** Sums each px's time-weighted state colors and busy fraction. */
export function createTileStatesMaterial(colors: THREE.Vector3[]) {
  return createMaterial(
    tileStatesFragmentShader,
    colors,
    {},
    {
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    },
  );
}

export function createErrorStatesMaterial(
  pixelRatio: number,
  colors: THREE.Vector3[],
) {
  const material = createMaterial(errorStatesFragmentShader, colors, {
    uBorderPx: { value: 0 },
    uBarHeightPx: { value: 0 },
    uOpacity: { value: ERROR_STATES_ALPHA },
  });
  setErrorStatesPixelRatio(material, pixelRatio);
  return material;
}

export function setErrorStatesPixelRatio(
  material: THREE.RawShaderMaterial,
  pixelRatio: number,
) {
  material.uniforms.uBorderPx.value = ERROR_STATES_BORDER_PX * pixelRatio;
  material.uniforms.uBarHeightPx.value = BAR_HEIGHT_PX * pixelRatio;
}

export interface StatesMesh {
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.RawShaderMaterial>;
  edges: Float32Array; // [startHi, startLo, endHi, endLo] per rect in ms from referenceX
  edgesAttr: THREE.InstancedBufferAttribute;
  bar: Float32Array; // [bottomY, height, colorIndex] per rect
  barAttr: THREE.InstancedBufferAttribute;
  capacity: number;
  count: number;
  referenceX: number; // The data tile's start in ms
}

const INITIAL_CAPACITY = 2 ** 10;

function setInstanceAttrs(statesMesh: StatesMesh, capacity: number) {
  const edges = new Float32Array(capacity * 4);
  const bar = new Float32Array(capacity * 3);
  edges.set(statesMesh.edges);
  bar.set(statesMesh.bar);
  statesMesh.edges = edges;
  statesMesh.bar = bar;
  statesMesh.edgesAttr = new THREE.InstancedBufferAttribute(edges, 4);
  statesMesh.barAttr = new THREE.InstancedBufferAttribute(bar, 3);
  statesMesh.edgesAttr.setUsage(THREE.DynamicDrawUsage);
  statesMesh.barAttr.setUsage(THREE.DynamicDrawUsage);
  statesMesh.capacity = capacity;

  const { geometry } = statesMesh.mesh;
  geometry.setAttribute("instanceEdges", statesMesh.edgesAttr);
  geometry.setAttribute("instanceBar", statesMesh.barAttr);
  // @ts-expect-error private field
  geometry._maxInstanceCount = undefined;
}

export function createStatesMesh(
  unitQuad: THREE.BufferGeometry,
  material: THREE.RawShaderMaterial,
): StatesMesh {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = unitQuad.index;
  geometry.setAttribute("position", unitQuad.getAttribute("position"));
  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  const statesMesh: StatesMesh = {
    mesh,
    edges: new Float32Array(0),
    edgesAttr: new THREE.InstancedBufferAttribute(new Float32Array(0), 4),
    bar: new Float32Array(0),
    barAttr: new THREE.InstancedBufferAttribute(new Float32Array(0), 3),
    capacity: 0,
    count: 0,
    referenceX: 0,
  };
  setInstanceAttrs(statesMesh, INITIAL_CAPACITY);
  return statesMesh;
}

export function ensureStatesCapacity(statesMesh: StatesMesh, needed: number) {
  if (needed <= statesMesh.capacity) return;
  let capacity = statesMesh.capacity;
  while (capacity < needed) capacity *= 2;
  setInstanceAttrs(statesMesh, capacity);
}

export function setStatesCount(
  statesMesh: StatesMesh,
  count: number,
  uploadFrom = 0,
) {
  statesMesh.count = count;
  statesMesh.mesh.geometry.instanceCount = count;
  const uploadCount = count - uploadFrom;
  if (uploadCount <= 0) return;
  for (const attr of [statesMesh.edgesAttr, statesMesh.barAttr]) {
    attr.addUpdateRange(
      uploadFrom * attr.itemSize,
      uploadCount * attr.itemSize,
    );
    attr.needsUpdate = true;
  }
}
