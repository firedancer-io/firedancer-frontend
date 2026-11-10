import * as THREE from "three";
import {
  BAR_HEIGHT_RATIO,
  ERROR_STATES_ALPHA,
  ERROR_STATES_BORDER_PX,
} from "./consts.ts";
import { slotHighlightGlsl, type SlotHighlight } from "../slotHighlight.ts";

type VertexMode = "tileStates" | "slotCoverage" | "errorStates";

const errorStatesUniformsGlsl = /* glsl */ `
  uniform float uViewHeightPx;
  uniform float uBarRatio; // bar height / row height
  ${slotHighlightGlsl}
`;
const errorStatesYGlsl = /* glsl */ `
  // bars sit at the bottom of their rows, y in [0, 1] view space
  vBarHeightPx = uBarRatio / uRowCount * uViewHeightPx;
  float y = (row + (position.y + 0.5) * uBarRatio) / uRowCount;
`;

const createTileStatesUniformsGlsl = (colorCount: number) => /* glsl */ `
  uniform int uStateIdxs[${colorCount}]; // index in the drawn states, -1 if not drawn
  uniform float uStateCount;
`;
const tileStatesYGlsl = /* glsl */ `
  // A texel row per row (tile) and state.
  // Rows of states that aren't written collapse off target.
  int stateIdx = uStateIdxs[int(instanceBar.y + 0.5)];
  float texelRow = row * uStateCount + float(stateIdx) + position.y + 0.5;
  float y = stateIdx < 0 ? -1.0 : texelRow / (uRowCount * uStateCount);
`;
const slotCoverageYGlsl = /* glsl */ `
  // A texel row per row (tile). States that aren't drawn collapse off target.
  int stateIdx = uStateIdxs[int(instanceBar.y + 0.5)];
  float y = stateIdx < 0 ? -1.0 : (row + position.y + 0.5) / uRowCount;
  vSlotFlags = vec4(0.0);
  if (instanceSlot > NO_SLOT) {
    vSlotFlags = vec4(
      float(isSameSlot(instanceSlot, uFocusSlot)),
      float(isSameGroup(instanceSlot, uFocusSlot)),
      float(isSameSlot(instanceSlot, uHoveredOtherSlot)),
      float(isSameGroup(instanceSlot, uHoveredOtherSlot))
    );
  }
`;

const uniformsGlsl = (colorCount: number, mode: VertexMode) => {
  switch (mode) {
    case "tileStates":
      return createTileStatesUniformsGlsl(colorCount);
    case "slotCoverage":
      return createTileStatesUniformsGlsl(colorCount) + slotHighlightGlsl;
    case "errorStates":
      return errorStatesUniformsGlsl;
  }
};

const yGlsl: Record<VertexMode, string> = {
  tileStates: tileStatesYGlsl,
  slotCoverage: slotCoverageYGlsl,
  errorStates: errorStatesYGlsl,
};

const createVertexShader = (
  colorCount: number,
  mode: VertexMode,
) => /* glsl */ `
  uniform mat4 modelViewMatrix; // the anchor as hi + lo
  uniform float uMsPerPx;       // ms per device px of the view
  uniform float uViewWidthPx;
  uniform float uOffsetPx;      // anchor's offset from the view's left edge
  uniform float uRowCount;
  uniform vec3 uColors[${colorCount}];
  ${uniformsGlsl(colorCount, mode)}

  in vec2 position;      // unit quad in [-0.5, 0.5]
  in vec4 instanceEdges; // start and end ms as hi + lo
  in vec3 instanceBar;   // row top-down, uColors index, weight
  in float instanceSlot; // relative slot, NO_SLOT if none

  out vec3 vColor;
  out float vWeight;      // fraction of its time span the state covers
  out float vLocalY;      // unit quad y in [-0.5, 0.5]
  out float vBarHeightPx;
  out vec2 vEdgesPx;      // left and right edges from the view's left edge
  out vec4 vSlotFlags;    // in the focus slot, its group, the hovered other slot, its group

  void main() {
    vColor = uColors[int(instanceBar.y + 0.5)];
    ${mode === "errorStates" ? "vColor = highlightSlot(vColor, instanceSlot);" : ""}
    vWeight = instanceBar.z;
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

    // rows bottom-up
    float row = uRowCount - 1.0 - instanceBar.x;
    ${yGlsl[mode]}
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
in float vWeight;

out vec4 outCoverage;

void main() {
  float coverage = xCoverage() * vWeight;
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
  fragmentShader: string,
  colors: THREE.Vector3[],
  mode: VertexMode,
  uniforms: Record<string, THREE.IUniform>,
  params: THREE.ShaderMaterialParameters = {},
) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: createVertexShader(colors.length, mode),
    fragmentShader,
    transparent: true,
    depthTest: false,
    uniforms: {
      uMsPerPx: { value: 1 },
      uViewWidthPx: { value: 1 },
      uOffsetPx: { value: 0 },
      uRowCount: { value: 1 },
      uColors: { value: colors },
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

export function createTileStatesMaterial(
  colors: THREE.Vector3[],
  stateIdxs: number[],
  stateCount: number,
) {
  return createMaterial(
    tileStatesFragmentShader,
    colors,
    "tileStates",
    {
      uStateIdxs: { value: stateIdxs },
      uStateCount: { value: stateCount },
    },
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
  const colors = tileStatesMaterial.uniforms.uColors.value as THREE.Vector3[];
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: createVertexShader(colors.length, "slotCoverage"),
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
  return createMaterial(errorStatesFragmentShader, colors, "errorStates", {
    uViewHeightPx: { value: 1 },
    uBarRatio: { value: BAR_HEIGHT_RATIO },
    uBorderPx: { value: 0 },
    uOpacity: { value: ERROR_STATES_ALPHA },
    ...highlight.uniforms,
  });
}

export function setErrorStatesSize(
  material: THREE.RawShaderMaterial,
  pixelRatio: number,
  viewHeightPx: number,
) {
  material.uniforms.uBorderPx.value = ERROR_STATES_BORDER_PX * pixelRatio;
  material.uniforms.uViewHeightPx.value = viewHeightPx;
}

export interface StatesMesh {
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.RawShaderMaterial>;
  edges: Float32Array; // [startHi, startLo, endHi, endLo] per rect in ms from referenceX
  edgesAttr: THREE.InstancedBufferAttribute;
  bar: Float32Array; // [row, colorIndex, weight] per rect
  barAttr: THREE.InstancedBufferAttribute;
  slot: Float32Array; // relative slot per rect, NO_SLOT if none
  slotAttr: THREE.InstancedBufferAttribute;
  capacity: number;
  count: number;
  referenceX: number; // The data tile's start in ms
}

const INITIAL_CAPACITY = 2 ** 10;

function setInstanceAttrs(statesMesh: StatesMesh, capacity: number) {
  const edges = new Float32Array(capacity * 4);
  const bar = new Float32Array(capacity * 3);
  const slot = new Float32Array(capacity);
  edges.set(statesMesh.edges);
  bar.set(statesMesh.bar);
  slot.set(statesMesh.slot);
  statesMesh.edges = edges;
  statesMesh.bar = bar;
  statesMesh.slot = slot;
  statesMesh.edgesAttr = new THREE.InstancedBufferAttribute(edges, 4);
  statesMesh.barAttr = new THREE.InstancedBufferAttribute(bar, 3);
  statesMesh.slotAttr = new THREE.InstancedBufferAttribute(slot, 1);
  statesMesh.edgesAttr.setUsage(THREE.DynamicDrawUsage);
  statesMesh.barAttr.setUsage(THREE.DynamicDrawUsage);
  statesMesh.slotAttr.setUsage(THREE.DynamicDrawUsage);
  statesMesh.capacity = capacity;

  const { geometry } = statesMesh.mesh;
  geometry.setAttribute("instanceEdges", statesMesh.edgesAttr);
  geometry.setAttribute("instanceBar", statesMesh.barAttr);
  geometry.setAttribute("instanceSlot", statesMesh.slotAttr);
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
  for (const attr of [
    statesMesh.edgesAttr,
    statesMesh.barAttr,
    statesMesh.slotAttr,
  ]) {
    attr.addUpdateRange(
      uploadFrom * attr.itemSize,
      uploadCount * attr.itemSize,
    );
    attr.needsUpdate = true;
  }
}
