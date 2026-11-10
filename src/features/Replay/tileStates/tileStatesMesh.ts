import * as THREE from "three";
import {
  BAR_HEIGHT_RATIO,
  ERROR_STATES_ALPHA,
  ERROR_STATES_BORDER_PX,
} from "./consts.ts";
import { slotHighlightGlsl, type SlotHighlight } from "../slotHighlight.ts";
import { getBarScales, type BarLayout, type Rects } from "./tileStatesRects.ts";

type VertexMode = "tileStates" | "slotCoverage" | "errorStates";

const sharesGlsl = /* glsl */ `
  in float instanceRow;       // top-down
  in vec4 instanceSharesLo;   // each coverage state's share of the rect's time
  in vec2 instanceSharesHi;
`;

const tileStatesGlsl = /* glsl */ `
  uniform float uStateCount;
  ${sharesGlsl}

  flat out vec4 vSharesLo;
  flat out vec2 vSharesHi;

  // Spans its row's texel rows, one per coverage state
  float setRowY() {
    vSharesLo = instanceSharesLo;
    vSharesHi = instanceSharesHi;
    return (uRowCount - 1.0 - instanceRow + position.y + 0.5) / uRowCount;
  }
`;

const slotCoverageGlsl = /* glsl */ `
  ${sharesGlsl}
  ${slotHighlightGlsl}

  out float vWeight;      // fraction of its time span the states cover
  out vec4 vSlotFlags;    // in the focus slot, its group, the hovered other slot, its group

  // A texel row per row (tile)
  float setRowY() {
    vWeight = dot(instanceSharesLo, vec4(1.0)) + dot(instanceSharesHi, vec2(1.0));
    vSlotFlags = vec4(0.0);
    if (instanceSlot > NO_SLOT) {
      vSlotFlags = vec4(
        float(isSameSlot(instanceSlot, uFocusSlot)),
        float(isSameGroup(instanceSlot, uFocusSlot)),
        float(isSameSlot(instanceSlot, uHoveredOtherSlot)),
        float(isSameGroup(instanceSlot, uHoveredOtherSlot))
      );
    }
    return (uRowCount - 1.0 - instanceRow + position.y + 0.5) / uRowCount;
  }
`;

const createErrorStatesGlsl = (colorCount: number) => /* glsl */ `
  uniform vec3 uColors[${colorCount}];
  uniform float uViewHeightPx;
  uniform float uBarRatio; // bar height / row height
  ${slotHighlightGlsl}

  in vec2 instanceBar;    // row top-down, uColors index

  out vec3 vColor;
  out float vLocalY;      // unit quad y in [-0.5, 0.5]
  out float vBarHeightPx;

  // bars sit at the bottom of their rows, y in [0, 1] view space
  float setRowY() {
    vColor = highlightSlot(uColors[int(instanceBar.y + 0.5)], instanceSlot);
    vLocalY = position.y;
    vBarHeightPx = uBarRatio / uRowCount * uViewHeightPx;
    float row = uRowCount - 1.0 - instanceBar.x;
    return (row + (position.y + 0.5) * uBarRatio) / uRowCount;
  }
`;

const createVertexShader = (mode: VertexMode, colorCount = 0) => /* glsl */ `
  uniform mat4 modelViewMatrix; // the anchor as hi + lo
  uniform float uMsPerPx;       // ms per device px of the view
  uniform float uViewWidthPx;
  uniform float uOffsetPx;      // anchor's offset from the view's left edge
  uniform float uRowCount;

  in vec2 position;      // unit quad in [-0.5, 0.5]
  in vec4 instanceEdges; // start and end ms as hi + lo
  in float instanceSlot; // relative slot, NO_SLOT if none

  out vec2 vEdgesPx;     // left and right edges from the view's left edge

  ${
    mode === "tileStates"
      ? tileStatesGlsl
      : mode === "slotCoverage"
        ? slotCoverageGlsl
        : createErrorStatesGlsl(colorCount)
  }

  void main() {
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

    float y = setRowY();
    gl_Position = vec4(px / uViewWidthPx * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
  }
`;

/** Exact fraction of this px's width the rect covers. */
const xCoverageGlsl = /* glsl */ `
in vec2 vEdgesPx;

float xCoverage() {
  float px = gl_FragCoord.x;
  return clamp(min(px + 0.5, vEdgesPx.y) - max(px - 0.5, vEdgesPx.x), 0.0, 1.0);
}
`;

/** Adds each px's coverage to its texel */
const tileStatesFragmentShader = /* glsl */ `
precision highp float;
${xCoverageGlsl}
uniform float uStateCount;

flat in vec4 vSharesLo;
flat in vec2 vSharesHi;

out vec4 outCoverage;

void main() {
  int stateIdx = int(gl_FragCoord.y) % int(uStateCount);
  float share =
    dot(vSharesLo, vec4(equal(ivec4(stateIdx), ivec4(0, 1, 2, 3)))) +
    dot(vSharesHi, vec2(equal(ivec2(stateIdx), ivec2(4, 5))));
  float coverage = xCoverage() * share;
  if (coverage <= 0.0) discard;
  outCoverage = vec4(coverage, 0.0, 0.0, 0.0);
}
`;

/** Adds each px's coverage to its row's texel, per highlighted slot and group */
const slotCoverageFragmentShader = /* glsl */ `
precision highp float;
${xCoverageGlsl}
in float vWeight;
in vec4 vSlotFlags;

out vec4 outSlotCoverage;

void main() {
  float coverage = xCoverage() * vWeight;
  if (coverage <= 0.0 || vSlotFlags == vec4(0.0)) discard;
  outSlotCoverage = vSlotFlags * coverage;
}
`;

const errorStatesFragmentShader = /* glsl */ `
precision highp float;
${xCoverageGlsl}
uniform float uBorderPx;
uniform float uOpacity;

in vec3 vColor;
in float vLocalY;
in float vBarHeightPx;

out vec4 fragColor;

void main() {
  // Distance to the nearest top/bottom edge in device px.
  float d = (0.5 - abs(vLocalY)) * vBarHeightPx;

  float coverage =
    (1.0 - smoothstep(uBorderPx - 0.5, uBorderPx + 0.5, d)) * xCoverage();
  if (coverage <= 0.0) discard;

  fragColor = vec4(vColor, uOpacity * coverage);
}
`;

function createMaterial(
  vertexShader: string,
  fragmentShader: string,
  uniforms: Record<string, THREE.IUniform>,
  params: THREE.ShaderMaterialParameters = {},
) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    uniforms: {
      uMsPerPx: { value: 1 },
      uViewWidthPx: { value: 1 },
      uOffsetPx: { value: 0 },
      uRowCount: { value: 1 },
      ...uniforms,
    },
    ...params,
  });
}

const additiveBlending: THREE.ShaderMaterialParameters = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneFactor,
};

export function createTileStatesMaterial(stateCount: number) {
  return createMaterial(
    createVertexShader("tileStates"),
    tileStatesFragmentShader,
    { uStateCount: { value: stateCount } },
    additiveBlending,
  );
}

/**
 * Draws the tile states material's rects into the slot coverage target. Shares
 * its uniforms, so the rects stay positioned the same.
 */
export function createSlotCoverageMaterial(
  tileStatesMaterial: THREE.RawShaderMaterial,
  highlight: SlotHighlight,
) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: createVertexShader("slotCoverage"),
    fragmentShader: slotCoverageFragmentShader,
    transparent: true,
    depthTest: false,
    uniforms: { ...tileStatesMaterial.uniforms, ...highlight.uniforms },
    ...additiveBlending,
  });
}

export function createErrorStatesMaterial(
  colors: THREE.Vector3[],
  highlight: SlotHighlight,
) {
  return createMaterial(
    createVertexShader("errorStates", colors.length),
    errorStatesFragmentShader,
    {
      uColors: { value: colors },
      uViewHeightPx: { value: 1 },
      uBarRatio: { value: BAR_HEIGHT_RATIO },
      uBorderPx: { value: 0 },
      uOpacity: { value: ERROR_STATES_ALPHA },
      ...highlight.uniforms,
    },
  );
}

export function setErrorStatesSize(
  material: THREE.RawShaderMaterial,
  pixelRatio: number,
  viewHeightPx: number,
) {
  material.uniforms.uBorderPx.value = ERROR_STATES_BORDER_PX * pixelRatio;
  material.uniforms.uViewHeightPx.value = viewHeightPx;
}

export interface StatesMesh extends Rects {
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.RawShaderMaterial>;
  edgesAttr: THREE.InstancedBufferAttribute;
  barBuffer: THREE.InstancedInterleavedBuffer;
  barLayout: BarLayout;
  slotAttr: THREE.InstancedBufferAttribute;
  capacity: number;
  count: number;
}

const INITIAL_CAPACITY = 2 ** 10;

function setInstanceAttrs(statesMesh: StatesMesh, capacity: number) {
  const edges = new Float32Array(capacity * 4);
  const bar = new Uint16Array(capacity * statesMesh.barScales.length);
  const slot = new Float32Array(capacity);
  edges.set(statesMesh.edges.subarray(0, edges.length));
  bar.set(statesMesh.bar.subarray(0, bar.length));
  slot.set(statesMesh.slot.subarray(0, slot.length));
  setArrays(statesMesh, edges, bar, slot, capacity);
}

function setArrays(
  statesMesh: StatesMesh,
  edges: Float32Array,
  bar: Uint16Array,
  slot: Float32Array,
  capacity: number,
) {
  const barStride = statesMesh.barScales.length;
  statesMesh.edges = edges;
  statesMesh.bar = bar;
  statesMesh.slot = slot;
  statesMesh.edgesAttr = new THREE.InstancedBufferAttribute(edges, 4);
  statesMesh.barBuffer = new THREE.InstancedInterleavedBuffer(bar, barStride);
  statesMesh.slotAttr = new THREE.InstancedBufferAttribute(slot, 1);
  statesMesh.edgesAttr.setUsage(THREE.DynamicDrawUsage);
  statesMesh.barBuffer.setUsage(THREE.DynamicDrawUsage);
  statesMesh.slotAttr.setUsage(THREE.DynamicDrawUsage);
  statesMesh.capacity = capacity;

  const { geometry } = statesMesh.mesh;
  geometry.setAttribute("instanceEdges", statesMesh.edgesAttr);
  geometry.setAttribute("instanceSlot", statesMesh.slotAttr);
  let offset = 0;
  for (const [name, itemSize, normalized] of statesMesh.barLayout) {
    geometry.setAttribute(
      name,
      new THREE.InterleavedBufferAttribute(
        statesMesh.barBuffer,
        itemSize,
        offset,
        normalized,
      ),
    );
    offset += itemSize;
  }
  // @ts-expect-error private field
  geometry._maxInstanceCount = undefined;
}

export function createStatesMesh(
  unitQuad: THREE.BufferGeometry,
  material: THREE.RawShaderMaterial,
  barLayout: BarLayout,
): StatesMesh {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = unitQuad.index;
  geometry.setAttribute("position", unitQuad.getAttribute("position"));
  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  const barScales = getBarScales(barLayout);
  const statesMesh: StatesMesh = {
    mesh,
    edges: new Float32Array(0),
    edgesAttr: new THREE.InstancedBufferAttribute(new Float32Array(0), 4),
    bar: new Uint16Array(0),
    barBuffer: new THREE.InstancedInterleavedBuffer(
      new Uint16Array(0),
      barScales.length,
    ),
    barLayout,
    barScales,
    slot: new Float32Array(0),
    slotAttr: new THREE.InstancedBufferAttribute(new Float32Array(0), 1),
    capacity: 0,
    count: 0,
    referenceX: 0,
  };
  setInstanceAttrs(statesMesh, INITIAL_CAPACITY);
  return statesMesh;
}

export function ensureStatesCapacity(statesMesh: StatesMesh, needed: number) {
  if (needed <= statesMesh.capacity) return;
  let capacity = Math.max(statesMesh.capacity, INITIAL_CAPACITY);
  while (capacity < needed) capacity *= 2;
  setInstanceAttrs(statesMesh, capacity);
}

/** Empties the mesh and frees its rects */
export function clearStates(statesMesh: StatesMesh) {
  setInstanceAttrs(statesMesh, INITIAL_CAPACITY);
  setStatesCount(statesMesh, 0);
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
  for (const attr of [statesMesh.edgesAttr, statesMesh.slotAttr]) {
    attr.addUpdateRange(
      uploadFrom * attr.itemSize,
      uploadCount * attr.itemSize,
    );
    attr.needsUpdate = true;
  }
  const { barBuffer } = statesMesh;
  barBuffer.addUpdateRange(
    uploadFrom * barBuffer.stride,
    uploadCount * barBuffer.stride,
  );
  barBuffer.needsUpdate = true;
}

// shows arrays the mesh doesn't own
export function wrapStates(
  statesMesh: StatesMesh,
  edges: Float32Array,
  bar: Uint16Array,
  slot: Float32Array,
  count: number,
) {
  setArrays(statesMesh, edges, bar, slot, 0);
  setStatesCount(statesMesh, count);
}

/** Copies rects after the mesh's own */
export function appendStates(
  statesMesh: StatesMesh,
  edges: Float32Array,
  bar: Uint16Array,
  slot: Float32Array,
  count: number,
) {
  const start = statesMesh.count;
  const barStride = statesMesh.barScales.length;
  ensureStatesCapacity(statesMesh, start + count);
  statesMesh.edges.set(edges.subarray(0, count * 4), start * 4);
  statesMesh.bar.set(bar.subarray(0, count * barStride), start * barStride);
  statesMesh.slot.set(slot.subarray(0, count), start);
  setStatesCount(statesMesh, start + count, start);
}
