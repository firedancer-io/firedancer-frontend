import * as THREE from "three";
import { getDefaultStore } from "jotai";
import {
  createRenderer,
  createRectResources,
  disposeRectResources,
  type RectResources,
  convertToWebGlColor,
  type RgbColor,
  type TsRange,
} from "../../WebGl/webglUtils.ts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers.ts";
import type { Tile, TileStatesGranularity } from "../../../api/types.ts";
import {
  type TileState,
  TileStatesGranularityEnum,
} from "../../../api/entities.ts";
import {
  itemCount,
  TILE_NS,
  tileStatesCaches,
  type TileStateColumns,
  type TileStatesDataTile,
} from "./tileStatesCache.ts";
import {
  createTileStatesMaterial,
  createErrorStatesMaterial,
  createStatesMesh,
  ensureStatesCapacity,
  setErrorStatesSize,
  setStatesCount,
  type StatesMesh,
} from "./tileStatesMesh.ts";
import {
  BAR_HEIGHT_RATIO,
  ErrorState,
  errorStateColors,
  tileStateColors,
  coverageStates,
  trackStates,
  TileStatesMode,
  type TileKind,
} from "./consts.ts";
import { replayTrackBackgroundColor } from "../../../colors.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import { tilesAtom } from "../../../api/atoms.ts";
import { calcAbsoluteNs, calcRelativeMs } from "../utils.ts";
import {
  createSlotHighlight,
  slotHighlightGlsl,
  updateSlotHighlight,
  type SlotHighlight,
} from "../slotHighlight.ts";

const store = getDefaultStore();

export interface TileRow {
  tileIdx: number;
  label: string;
}

export function getTileRows(
  tiles: Tile[] | undefined,
  trackKind: TileKind,
): TileRow[] {
  const rows: TileRow[] = [];
  tiles?.forEach(({ kind, kind_id }, tileIdx) => {
    if (kind === trackKind) rows.push({ tileIdx, label: `${kind_id}` });
  });
  return rows;
}

export type RowOfTile = Map<number, number>;

export function getRowOfTile(kind: TileKind): RowOfTile {
  const rows = getTileRows(store.get(tilesAtom), kind);
  return new Map(rows.map(({ tileIdx }, row) => [tileIdx, row]));
}

export interface DataTileMeshes {
  tileStates: StatesMesh;
  errorStates?: StatesMesh;
}

export interface RendererObj {
  renderer: THREE.WebGLRenderer;
  camera: THREE.Camera;
  rectResources: RectResources;
  tileStatesScene: THREE.Scene;
  tileStatesMaterial: THREE.RawShaderMaterial;
  tileStatesTarget: THREE.WebGLRenderTarget;
  errorStatesMaterial: THREE.RawShaderMaterial;
  highlight: SlotHighlight;
  errorStatesScene: THREE.Scene;
  laneMaxReducer: LaneMaxReducer;
  compositeScene: THREE.Scene;
  compositeMesh: THREE.Mesh<THREE.BufferGeometry, THREE.RawShaderMaterial>;
  compositeMaterials: Record<CompositeMode, THREE.RawShaderMaterial>;
  compositeUniforms: Record<string, THREE.IUniform>;
  selectedMode: TileStatesMode;
  selectedSeparateLanes: boolean;
  mode: TileStatesMode;
  kind: TileKind;
  dataTileMeshes: Map<string, DataTileMeshes>;
  availableMeshes: DataTileMeshes[];
  liveDataTileKey: string | undefined;
  renderedGranularity: TileStatesGranularity | undefined;
  aggStatesScene: THREE.Scene;
  aggMeshes: DataTileMeshes;
  isAgg: boolean;
  msPerPx: number;
  anchorPx: number;
  viewStartPx: number;
  cleanUp: () => void;
}

function dataTileKey(dataTile: TileStatesDataTile): string {
  return `${dataTile.startNs}:${dataTile.endNs}`;
}

const tmpColor = new THREE.Color();

/**
 * sRGB to linear light.
 * sRGB is gamma-encoded, so a state split over 2 px shows less light than whole.
 * Linear light lets tile state colors be time-weighted and summed accurately.
 */
function toLinear([r, g, b]: RgbColor): RgbColor {
  tmpColor.setRGB(r, g, b, THREE.SRGBColorSpace);
  return [tmpColor.r, tmpColor.g, tmpColor.b];
}

const BACKGROUND_SRGB = convertToWebGlColor(replayTrackBackgroundColor);
const BACKGROUND_LINEAR = toLinear(BACKGROUND_SRGB);

const RGB_HEX_LENGTH = 7;
const RGBA_HEX_LENGTH = 9;
const HEX_RADIX = 16;
const MAX_ALPHA_BYTE = 255;

function convertToOpaqueWebGlColor(hex: string): RgbColor {
  const rgb = convertToWebGlColor(hex.slice(0, RGB_HEX_LENGTH));
  const alpha =
    hex.length === RGBA_HEX_LENGTH
      ? parseInt(hex.slice(RGB_HEX_LENGTH), HEX_RADIX) / MAX_ALPHA_BYTE
      : 1;
  return [
    rgb[0] * alpha + BACKGROUND_SRGB[0] * (1 - alpha),
    rgb[1] * alpha + BACKGROUND_SRGB[1] * (1 - alpha),
    rgb[2] * alpha + BACKGROUND_SRGB[2] * (1 - alpha),
  ];
}

/** sRGB, indexed by TileState */
const TILE_STATE_SRGB_PALETTE = Object.values(tileStateColors).map(
  convertToOpaqueWebGlColor,
);

const TILE_STATE_PALETTE = TILE_STATE_SRGB_PALETTE.map(
  (color) => new THREE.Vector3(...toLinear(color)),
);
const ERROR_STATE_PALETTE = Object.values(errorStateColors).map(
  (color) => new THREE.Vector3(...convertToWebGlColor(color)),
);

const compositeVertexShader = /* glsl */ `
  in vec2 position; // unit quad in [-0.5, 0.5]

  void main() {
    gl_Position = vec4(position * 2.0, 0.0, 1.0);
  }
`;

const SRGB_PALETTE = TILE_STATE_SRGB_PALETTE.map(
  (color) => new THREE.Vector3(...color),
);

/**
 * Shades each px's row bar from its per state time coverage.
 */
const createCompositeFragmentShader = (
  stateCount: number,
  declarations: string,
  shade: string,
) => /* glsl */ `
  precision highp float;

  uniform sampler2D uCoverage;  // a texel row per row and state, rows bottom-up
  uniform vec2 uCanvasSize;     // px in canvas dimensions
  uniform float uRowCount;
  uniform float uBarRatio;      // bar height / row height
  uniform vec3 uBackground;     // srgb
  uniform vec3 uStateColors[${stateCount}]; // srgb
  ${declarations}
  ${slotHighlightGlsl}

  out vec4 fragColor;

  void main() {
    vec2 uv = gl_FragCoord.xy / uCanvasSize;
    float rowH = 1.0 / uRowCount;
    // bars sit at the bottom of their rows
    float barY = mod(uv.y, rowH) / (rowH * uBarRatio);
    vec3 color = uBackground;
    if (barY < 1.0) {
      int firstTexelRow = int(uv.y / rowH) * ${stateCount};
      int x = int(gl_FragCoord.x);
      float coverage[${stateCount}];
      float busy = 0.0;
      for (int i = 0; i < ${stateCount}; i++) {
        coverage[i] = texelFetch(uCoverage, ivec2(x, firstTexelRow + i), 0).r;
        busy += coverage[i];
      }
      ${shade}
      // highlight drawn states by the slot time ranges, not the background
      if (color != uBackground) color = highlightTime(color, gl_FragCoord.x);
    }
    fragColor = vec4(color, 1.0);
  }
`;

/** Lanes top-down, one per lane state */
const createLanesGlsl = (stateCount: number) => /* glsl */ `
  uniform int uLaneStateIdxs[${stateCount}]; // lanes are a subset of the states
  uniform float uLaneCount;
  uniform float uBarHeightPx;
  uniform float uLaneGapPx;

  /**
   * Sets the lane at barY, top-down. Returns the height from the lane's bottom
   * over its drawn height, or -1 in the gap above every lane but the first.
   */
  float laneHeightAt(float barY, out int lane) {
    float lanePos = (1.0 - barY) * uLaneCount;
    float laneIdx = min(floor(lanePos), uLaneCount - 1.0);
    lane = int(laneIdx);
    float gapFrac = laneIdx > 0.0 ? uLaneGapPx * uLaneCount / uBarHeightPx : 0.0;
    float fromTop = lanePos - laneIdx;
    if (fromTop < gapFrac) return -1.0;
    return (1.0 - fromTop) / (1.0 - gapFrac);
  }
`;

const idleWeightGlsl = /* glsl */ `
  uniform float uIdleWeight; // idle time's weight against the busy states
`;

/**
 * Busy state colors mixed by time in linear light over the background
 */
const createHeatmapFragmentShader = (stateCount: number) =>
  createCompositeFragmentShader(
    stateCount,
    /* glsl */ `
      ${idleWeightGlsl}
      uniform vec3 uBackgroundLinear;
      uniform vec3 uStateLinearColors[${stateCount}];

      vec3 linearToSrgb(vec3 c) {
        return mix(
          c * 12.92,
          1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
          step(0.0031308, c)
        );
      }
    `,
    /* glsl */ `
      vec3 busyColor = vec3(0.0);
      for (int i = 0; i < ${stateCount}; i++) {
        busyColor += uStateLinearColors[i] * coverage[i];
      }
      // time without a busy state is idle, shown as weighted background
      float idleWeight = uIdleWeight * max(1.0 - busy, 0.0);
      float total = busy + idleWeight;
      if (total > 0.0) {
        color = linearToSrgb((busyColor + uBackgroundLinear * idleWeight) / total);
      }
    `,
  );

/**
 * Lanes filled wherever their state has any time
 */
const createGanttFragmentShader = (stateCount: number) =>
  createCompositeFragmentShader(
    stateCount,
    createLanesGlsl(stateCount),
    /* glsl */ `
      int lane;
      float laneY = laneHeightAt(barY, lane);
      int stateIdx = uLaneStateIdxs[lane];
      if (laneY >= 0.0 && stateIdx >= 0 && coverage[stateIdx] > 0.0) {
        color = uStateColors[stateIdx];
      }
    `,
  );

/**
 * Lane stacked by their state's share of the bar
 */
const createStackedFragmentShader = (stateCount: number) =>
  createCompositeFragmentShader(
    stateCount,
    createLanesGlsl(stateCount) + idleWeightGlsl,
    /* glsl */ `
      float total = busy + uIdleWeight * max(1.0 - busy, 0.0);
      float top = 0.0;
      for (int lane = int(uLaneCount) - 1; lane >= 0 && total > 0.0; lane--) {
        int stateIdx = uLaneStateIdxs[lane];
        top += coverage[stateIdx] / total;
        if (barY < top) {
          color = uStateColors[stateIdx];
          break;
        }
      }
    `,
  );

/**
 * Lanes scaled to its state's max share of busy time in view
 */
const createStackedLanesFragmentShader = (stateCount: number) =>
  createCompositeFragmentShader(
    stateCount,
    createLanesGlsl(stateCount) +
      /* glsl */ `
        uniform sampler2D uLaneMax; // uCoverage's texel rows, 1px wide
      `,
    /* glsl */ `
      int lane;
      float laneY = laneHeightAt(barY, lane);
      int stateIdx = uLaneStateIdxs[lane];
      if (laneY >= 0.0 && stateIdx >= 0 && busy > 0.0) {
        float laneMax =
          texelFetch(uLaneMax, ivec2(0, firstTexelRow + stateIdx), 0).r;
        if (laneMax > 0.0 && laneY < coverage[stateIdx] / busy / laneMax) {
          color = uStateColors[stateIdx];
        }
      }
    `,
  );

type CompositeMode = "heatmap" | "gantt" | "stacked" | "stackedLanes";

const compositeFragmentShaders: Record<
  CompositeMode,
  (stateCount: number) => string
> = {
  heatmap: createHeatmapFragmentShader,
  gantt: createGanttFragmentShader,
  stacked: createStackedFragmentShader,
  stackedLanes: createStackedLanesFragmentShader,
};

function getCompositeMode(rendererObj: RendererObj): CompositeMode {
  switch (rendererObj.mode) {
    case TileStatesMode.Heatmap:
      return "heatmap";
    case TileStatesMode.Gantt:
      return "gantt";
    case TileStatesMode.Stacked:
      return rendererObj.selectedSeparateLanes ? "stackedLanes" : "stacked";
  }
}

/** Uniforms shared by every mode's composite material, so they're set once */
function createCompositeUniforms(
  tileStatesTarget: THREE.WebGLRenderTarget,
  laneMaxTarget: THREE.WebGLRenderTarget,
  states: TileState[],
  highlight: SlotHighlight,
): Record<string, THREE.IUniform> {
  return {
    ...highlight.uniforms,
    uCoverage: { value: tileStatesTarget.texture },
    uLaneMax: { value: laneMaxTarget.texture },
    uCanvasSize: { value: new THREE.Vector2(1, 1) },
    uRowCount: { value: 1 },
    uBarRatio: { value: BAR_HEIGHT_RATIO },
    uBackground: { value: new THREE.Vector3(...BACKGROUND_SRGB) },
    uBackgroundLinear: { value: new THREE.Vector3(...BACKGROUND_LINEAR) },
    uStateColors: { value: states.map((state) => SRGB_PALETTE[state]) },
    uStateLinearColors: {
      value: states.map((state) => TILE_STATE_PALETTE[state]),
    },
    uIdleWeight: { value: 0 },
    uLaneStateIdxs: { value: new Array<number>(states.length).fill(-1) },
    uLaneCount: { value: 1 },
    uBarHeightPx: { value: 1 },
    uLaneGapPx: { value: 0 },
  };
}

function createCompositeMaterials(
  uniforms: Record<string, THREE.IUniform>,
  stateCount: number,
): Record<CompositeMode, THREE.RawShaderMaterial> {
  const createMaterial = (mode: CompositeMode) =>
    new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: compositeVertexShader,
      fragmentShader: compositeFragmentShaders[mode](stateCount),
      depthTest: false,
      uniforms,
    });
  return {
    heatmap: createMaterial("heatmap"),
    gantt: createMaterial("gantt"),
    stacked: createMaterial("stacked"),
    stackedLanes: createMaterial("stackedLanes"),
  };
}

/**
 * Reads a row and state's texel row across the coverage target, and takes the
 * state's max share of a px's busy time.
 */
const createLaneMaxFragmentShader = (stateCount: number) => /* glsl */ `
  precision highp float;

  uniform sampler2D uCoverage; // a texel row per row and state

  out vec4 outMax;

  void main() {
    int texelRow = int(gl_FragCoord.y);
    int firstTexelRow = texelRow - texelRow % ${stateCount};
    int width = textureSize(uCoverage, 0).x;
    float m = 0.0;
    for (int x = 0; x < width; x++) {
      float busy = 0.0;
      for (int i = 0; i < ${stateCount}; i++) {
        busy += texelFetch(uCoverage, ivec2(x, firstTexelRow + i), 0).r;
      }
      if (busy > 0.0) {
        m = max(m, texelFetch(uCoverage, ivec2(x, texelRow), 0).r / busy);
      }
    }
    outMax = vec4(m, 0.0, 0.0, 0.0);
  }
`;

interface LaneMaxReducer {
  /** 1px wide with the coverage target's texel rows, each its max share in view */
  target: THREE.WebGLRenderTarget;
  reduce: (renderer: THREE.WebGLRenderer) => void;
  dispose: () => void;
}

/** Reduces the coverage target to each row and state's max share of a px */
function createLaneMaxReducer(
  tileStatesTarget: THREE.WebGLRenderTarget,
  unitQuad: THREE.BufferGeometry,
  stateCount: number,
): LaneMaxReducer {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    format: THREE.RedFormat,
    type: tileStatesTarget.texture.type,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
  });

  const material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: compositeVertexShader,
    fragmentShader: createLaneMaxFragmentShader(stateCount),
    depthTest: false,
    blending: THREE.NoBlending,
    uniforms: { uCoverage: { value: tileStatesTarget.texture } },
  });

  const mesh = new THREE.Mesh(unitQuad, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.Camera();

  const reduce: LaneMaxReducer["reduce"] = (renderer) => {
    target.setSize(1, tileStatesTarget.height);
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
  };

  const dispose = () => {
    target.dispose();
    material.dispose();
  };

  return { target, reduce, dispose };
}

export function setUpRenderer(
  kind: TileKind,
  mode: TileStatesMode,
  separateLanes: boolean,
  setUpContextListeners: ContextHelpers["setUpContextListeners"],
  getWasContextLost: ContextHelpers["getWasContextLost"],
): RendererObj | undefined {
  const renderObj = createRenderer(
    setUpContextListeners,
    getWasContextLost,
    false,
  );
  if (!renderObj) return;
  const { renderer, cleanUpRenderer } = renderObj;
  // Manual clearing because we render multiple scenes and clear between rendering each
  renderer.autoClear = false;

  const camera = new THREE.Camera();
  const rectResources = createRectResources();

  const tileStatesScene = new THREE.Scene();
  const errorStatesScene = new THREE.Scene();
  errorStatesScene.visible = false;
  const highlight = createSlotHighlight();
  const errorStatesMaterial = createErrorStatesMaterial(
    ERROR_STATE_PALETTE,
    highlight,
  );

  const canBlendFloat32 =
    renderer.extensions.has("EXT_color_buffer_float") &&
    renderer.extensions.has("EXT_float_blend");
  // Each px's time per row and coverage state. The composite pass shades every
  // mode from it
  const states = coverageStates[kind];
  const tileStatesTarget = new THREE.WebGLRenderTarget(1, 1, {
    format: THREE.RedFormat,
    type: canBlendFloat32 ? THREE.FloatType : THREE.HalfFloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
  });
  const tileStatesMaterial = createTileStatesMaterial(
    TILE_STATE_PALETTE,
    TILE_STATE_PALETTE.map((_, state) => states.indexOf(state)),
    states.length,
  );
  const laneMaxReducer = createLaneMaxReducer(
    tileStatesTarget,
    rectResources.unitQuad,
    states.length,
  );
  const compositeUniforms = createCompositeUniforms(
    tileStatesTarget,
    laneMaxReducer.target,
    states,
    highlight,
  );
  const compositeMaterials = createCompositeMaterials(
    compositeUniforms,
    states.length,
  );
  const compositeMesh = new THREE.Mesh(
    rectResources.unitQuad,
    compositeMaterials.heatmap,
  );
  compositeMesh.frustumCulled = false;
  const compositeScene = new THREE.Scene();
  compositeScene.add(compositeMesh);
  // compile every mode's material up front, so switching modes doesn't hitch
  for (const material of Object.values(compositeMaterials)) {
    compositeMesh.material = material;
    renderer.compile(compositeScene, camera);
  }

  const dataTileMeshes = new Map<string, DataTileMeshes>();
  const availableMeshes: DataTileMeshes[] = [];

  const aggMeshes: DataTileMeshes = {
    tileStates: createStatesMesh(rectResources.unitQuad, tileStatesMaterial),
  };
  const aggStatesScene = new THREE.Scene();
  aggStatesScene.add(aggMeshes.tileStates.mesh);

  const cleanUp = () => {
    // Skip GPU disposal if the context was lost since its objects are already gone.
    if (!getWasContextLost()) {
      for (const meshes of dataTileMeshes.values())
        disposeDataTileMeshes(meshes);
      for (const meshes of availableMeshes) disposeDataTileMeshes(meshes);
      disposeDataTileMeshes(aggMeshes);
      disposeRectResources(rectResources);
      tileStatesMaterial.dispose();
      errorStatesMaterial.dispose();
      tileStatesTarget.dispose();
      laneMaxReducer.dispose();
      for (const material of Object.values(compositeMaterials)) {
        material.dispose();
      }
    }
    cleanUpRenderer();
  };

  const rendererObj: RendererObj = {
    renderer,
    camera,
    tileStatesScene,
    rectResources,
    tileStatesMaterial,
    errorStatesMaterial,
    highlight,
    tileStatesTarget,
    errorStatesScene,
    compositeScene,
    compositeMesh,
    compositeMaterials,
    compositeUniforms,
    laneMaxReducer,
    selectedMode: mode,
    selectedSeparateLanes: separateLanes,
    mode,
    kind,
    dataTileMeshes,
    availableMeshes,
    liveDataTileKey: undefined,
    renderedGranularity: undefined,
    aggStatesScene,
    aggMeshes,
    isAgg: false,
    msPerPx: 0,
    anchorPx: 0,
    viewStartPx: 0,
    cleanUp,
  };

  return rendererObj;
}

export function handleResize(rendererObj: RendererObj) {
  const { renderer, errorStatesMaterial } = rendererObj;
  setErrorStatesSize(
    errorStatesMaterial,
    renderer.getPixelRatio(),
    renderer.domElement.height,
  );
  const visibleRangeMs = store.get(visibleRangeAtom);
  if (visibleRangeMs) setVisibleRange(rendererObj, visibleRangeMs);
  render(rendererObj);
}

export function render(rendererObj: RendererObj) {
  const {
    renderer,
    camera,
    errorStatesScene,
    tileStatesMaterial,
    errorStatesMaterial,
    tileStatesTarget,
    compositeScene,
    compositeMesh,
    compositeMaterials,
    compositeUniforms,
  } = rendererObj;
  const { width, height } = renderer.domElement;
  if (!width || !height) return;
  updateSlotHighlight(rendererObj.highlight, width);
  const rowCount = Math.max(getRowOfTile(rendererObj.kind).size, 1);
  const states = coverageStates[rendererObj.kind];
  const coverageHeight = rowCount * states.length;
  if (
    tileStatesTarget.width !== width ||
    tileStatesTarget.height !== coverageHeight
  ) {
    tileStatesTarget.setSize(width, coverageHeight);
  }
  for (const material of [tileStatesMaterial, errorStatesMaterial]) {
    material.uniforms.uRowCount.value = rowCount;
  }

  const statesScene = rendererObj.isAgg
    ? rendererObj.aggStatesScene
    : rendererObj.tileStatesScene;
  (compositeUniforms.uCanvasSize.value as THREE.Vector2).set(width, height);
  compositeUniforms.uRowCount.value = rowCount;
  const laneStates =
    trackStates[rendererObj.kind][rendererObj.renderedGranularity ?? "agg"];
  const laneStateIdxs = compositeUniforms.uLaneStateIdxs.value as number[];
  for (let i = 0; i < laneStateIdxs.length; i++) {
    laneStateIdxs[i] =
      i < laneStates.length ? states.indexOf(laneStates[i]) : -1;
  }
  compositeUniforms.uLaneCount.value = laneStates.length;
  const compositeMode = getCompositeMode(rendererObj);
  compositeMesh.material = compositeMaterials[compositeMode];

  renderer.setRenderTarget(tileStatesTarget);
  renderer.clear();
  renderer.render(statesScene, camera);
  if (compositeMode === "stackedLanes") {
    rendererObj.laneMaxReducer.reduce(renderer);
  }
  renderer.setRenderTarget(null);
  renderer.render(compositeScene, camera);
  if (
    !rendererObj.isAgg &&
    rendererObj.renderedGranularity === TileStatesGranularityEnum.txn &&
    rendererObj.mode === TileStatesMode.Heatmap
  ) {
    renderer.render(errorStatesScene, camera);
  }
}

// An anchor near the view keeps shader px values small
const ANCHOR_STEP_PX = 2 ** 16;

export function setVisibleRange(
  rendererObj: RendererObj,
  visibleRangeMs: TsRange,
): boolean {
  const { renderer, dataTileMeshes, tileStatesMaterial, errorStatesMaterial } =
    rendererObj;

  const widthPx = Math.max(renderer.domElement.width, 1);
  const prevMsPerPx = rendererObj.msPerPx;
  const msPerPx = Math.fround(
    (visibleRangeMs[1] - visibleRangeMs[0]) / widthPx,
  );
  rendererObj.msPerPx = msPerPx;

  const viewStartPx = Math.round(visibleRangeMs[0] / msPerPx);
  const viewMoved = viewStartPx !== rendererObj.viewStartPx;
  rendererObj.viewStartPx = viewStartPx;
  const anchorPx = Math.floor(viewStartPx / ANCHOR_STEP_PX) * ANCHOR_STEP_PX;
  const anchorMoved = anchorPx !== rendererObj.anchorPx;
  rendererObj.anchorPx = anchorPx;

  for (const material of [tileStatesMaterial, errorStatesMaterial]) {
    material.uniforms.uMsPerPx.value = msPerPx;
    material.uniforms.uViewWidthPx.value = widthPx;
    material.uniforms.uOffsetPx.value = anchorPx - viewStartPx;
  }

  const scaleChanged = msPerPx !== prevMsPerPx;
  if (scaleChanged || anchorMoved) {
    for (const meshes of dataTileMeshes.values())
      updateDataTileMeshPositions(rendererObj, meshes);
    updateDataTileMeshPositions(rendererObj, rendererObj.aggMeshes);
  }

  // Callers can skip rendering if no px value has changed
  return scaleChanged || viewMoved;
}

export function updateDataTileMeshPositions(
  rendererObj: RendererObj,
  meshes: DataTileMeshes,
) {
  const { msPerPx, anchorPx } = rendererObj;
  const anchorMs = anchorPx * msPerPx - meshes.tileStates.referenceX;
  const anchorHi = Math.fround(anchorMs);
  for (const statesMesh of [meshes.tileStates, meshes.errorStates]) {
    if (!statesMesh) continue;
    statesMesh.mesh.position.x = anchorHi;
    statesMesh.mesh.position.y = anchorMs - anchorHi;
  }
}

function createDataTileMeshes(rendererObj: RendererObj): DataTileMeshes {
  const { rectResources, tileStatesMaterial, errorStatesMaterial, kind } =
    rendererObj;
  const tileStates = createStatesMesh(
    rectResources.unitQuad,
    tileStatesMaterial,
  );
  // Top/bottom borders drawn over the tile states.
  const errorStates =
    kind === "execrp"
      ? createStatesMesh(rectResources.unitQuad, errorStatesMaterial)
      : undefined;
  return { tileStates, errorStates };
}

/** Acquires pooled or new meshes for a data tile and adds them to scenes. */
function addDataTileMeshes(
  rendererObj: RendererObj,
  key: string,
): DataTileMeshes {
  const meshes =
    rendererObj.availableMeshes.pop() ?? createDataTileMeshes(rendererObj);
  rendererObj.dataTileMeshes.set(key, meshes);
  rendererObj.tileStatesScene.add(meshes.tileStates.mesh);
  if (meshes.errorStates) {
    rendererObj.errorStatesScene.add(meshes.errorStates.mesh);
  }
  return meshes;
}

function disposeDataTileMeshes(meshes: DataTileMeshes) {
  meshes.tileStates.mesh.geometry.dispose();
  meshes.errorStates?.mesh.geometry.dispose();
}

function buildDataTileMeshes(
  rendererObj: RendererObj,
  meshes: DataTileMeshes,
  dataTile: TileStatesDataTile,
  rowOfTile: RowOfTile,
  appendData?: TileStateColumns,
) {
  if (!appendData) {
    // referenceX is the data tile's start, so rects are stored in small ms from it
    const referenceX = calcRelativeMs(
      store.get(referenceNsAtom) ?? 0n,
      dataTile.startNs,
    );
    meshes.tileStates.referenceX = referenceX;
    if (meshes.errorStates) meshes.errorStates.referenceX = referenceX;
    updateDataTileMeshPositions(rendererObj, meshes);
  }

  const data = appendData ?? dataTile.data;

  const tileStatesStart = appendData ? meshes.tileStates.count : 0;
  setStatesCount(
    meshes.tileStates,
    appendTileStates(meshes.tileStates, data, tileStatesStart, rowOfTile),
    tileStatesStart,
  );

  if (meshes.errorStates) {
    const errorStatesStart = appendData ? meshes.errorStates.count : 0;
    setStatesCount(
      meshes.errorStates,
      appendErrorStates(meshes.errorStates, data, errorStatesStart, rowOfTile),
      errorStatesStart,
    );
  }
}

/**
 * Syncs the meshes with the cache. Builds meshes for each new data tile,
 * reusing pooled ones, and returns evicted data tiles' meshes to the pool.
 * `rebuild` rebuilds them all, e.g. when the rows change.
 */
export function syncMeshes(rendererObj: RendererObj, rebuild = false) {
  if (rebuild) rendererObj.liveDataTileKey = undefined;
  const {
    tileStatesScene,
    errorStatesScene,
    availableMeshes,
    dataTileMeshes,
    liveDataTileKey,
    renderedGranularity,
  } = rendererObj;
  const dataTiles = renderedGranularity
    ? [
        ...tileStatesCaches[renderedGranularity]
          .getTiles()
          .map((dataTile) => ({ key: dataTileKey(dataTile), dataTile })),
        ...getFallbackDataTiles(renderedGranularity),
      ]
    : [];
  const rowOfTile = getRowOfTile(rendererObj.kind);

  const keys = new Set<string>();

  // Build meshes for new data tiles (skip already built ones)
  for (const { key, dataTile } of dataTiles) {
    keys.add(key);
    if (!rebuild && dataTileMeshes.has(key)) continue;

    const meshes =
      dataTileMeshes.get(key) ?? addDataTileMeshes(rendererObj, key);
    buildDataTileMeshes(rendererObj, meshes, dataTile, rowOfTile);
  }

  // Evict meshes for data tiles no longer cached and return them to the pool
  // to be reused. Exclude the live data tile's meshes from eviction.
  for (const [key, meshes] of dataTileMeshes) {
    if (keys.has(key) || key === liveDataTileKey) continue;

    tileStatesScene.remove(meshes.tileStates.mesh);
    if (meshes.errorStates) errorStatesScene.remove(meshes.errorStates.mesh);
    dataTileMeshes.delete(key);
    availableMeshes.push(meshes);
  }
}

/**
 * Other granularity data tiles to draw in place of visible (+1 overscan)
 * data tiles that haven't loaded. A txn data tile is replaced by its batch
 * data tile clipped to it. A batch data tile is replaced by its in-world txn
 * data tiles only if all of them have loaded, since txn data tiles past the
 * world end are never fetched.
 */
function getFallbackDataTiles(
  granularity: TileStatesGranularity,
): { key: string; dataTile: TileStatesDataTile }[] {
  const referenceNs = store.get(referenceNsAtom);
  const visibleRange = store.get(visibleRangeAtom);
  const worldRange = store.get(worldRangeAtom);
  if (referenceNs == null || !visibleRange || !worldRange) return [];
  const worldEndNs = calcAbsoluteNs(referenceNs, worldRange[1]);

  const isTxn = granularity === TileStatesGranularityEnum.txn;
  const fallbackGranularity = isTxn
    ? TileStatesGranularityEnum.txn_batch
    : TileStatesGranularityEnum.txn;
  const cache = tileStatesCaches[granularity];
  const fallbackCache = tileStatesCaches[fallbackGranularity];
  const tileNs = TILE_NS[granularity];

  const firstStartNs =
    (calcAbsoluteNs(referenceNs, visibleRange[0]) / tileNs - 1n) * tileNs;
  const lastStartNs =
    (calcAbsoluteNs(referenceNs, visibleRange[1]) / tileNs + 1n) * tileNs;

  const fallbacks: { key: string; dataTile: TileStatesDataTile }[] = [];
  for (let startNs = firstStartNs; startNs <= lastStartNs; startNs += tileNs) {
    if (cache.isTileFetched(startNs)) continue;
    const endNs = startNs + tileNs - 1n;

    if (isTxn) {
      const batchDataTile = fallbackCache.getTile(startNs);
      if (!batchDataTile) continue;
      fallbacks.push({
        key: fallbackDataTileKey(
          `${fallbackGranularity}:${startNs}`,
          batchDataTile,
        ),
        dataTile: {
          startNs,
          endNs,
          data: clipColumns(
            batchDataTile.data,
            calcRelativeMs(referenceNs, startNs),
            calcRelativeMs(referenceNs, endNs + 1n),
          ),
          meta: null,
        },
      });
      continue;
    }

    const txnDataTiles: (TileStatesDataTile & { isLive: boolean })[] = [];
    let hasAllTxnDataTiles = true;
    for (
      let txnStartNs = startNs;
      txnStartNs < endNs && txnStartNs < worldEndNs;
      txnStartNs += TILE_NS.txn
    ) {
      const txnDataTile = fallbackCache.getTile(txnStartNs);
      if (!txnDataTile) {
        hasAllTxnDataTiles = false;
        break;
      }
      txnDataTiles.push(txnDataTile);
    }
    if (!hasAllTxnDataTiles) continue;
    for (const dataTile of txnDataTiles) {
      fallbacks.push({
        key: fallbackDataTileKey(dataTileKey(dataTile), dataTile),
        dataTile,
      });
    }
  }
  return fallbacks;
}

/**
 * Fallback data tile mesh key. Live data tiles include their item count, so
 * their meshes are rebuilt as their data grows.
 */
function fallbackDataTileKey(
  key: string,
  { data, isLive }: { data: TileStateColumns; isLive: boolean },
) {
  return isLive ? `${key}:live:${itemCount(data)}` : key;
}

/**
 * Keep states and txn segments overlapping [startMs, endMs), clipped to it
 */
function clipColumns(
  data: TileStateColumns,
  startMs: number,
  endMs: number,
): TileStateColumns {
  const clipped: TileStateColumns = {
    state: [],
    state_tile: [],
    state_start_ms: [],
    state_end_ms: [],
    txn_slot: [],
    txn_idx: [],
    txn_tile: [],
    txn_start_ms: [],
    txn_end_ms: [],
    txn_error_code: [],
  };
  for (let i = 0; i < data.state.length; i++) {
    if (data.state_end_ms[i] <= startMs || data.state_start_ms[i] >= endMs)
      continue;
    clipped.state.push(data.state[i]);
    clipped.state_tile.push(data.state_tile[i]);
    clipped.state_start_ms.push(Math.max(startMs, data.state_start_ms[i]));
    clipped.state_end_ms.push(Math.min(endMs, data.state_end_ms[i]));
  }
  for (let i = 0; i < data.txn_idx.length; i++) {
    if (data.txn_end_ms[i] <= startMs || data.txn_start_ms[i] >= endMs)
      continue;
    clipped.txn_slot.push(data.txn_slot[i]);
    clipped.txn_idx.push(data.txn_idx[i]);
    clipped.txn_tile.push(data.txn_tile[i]);
    clipped.txn_start_ms.push(Math.max(startMs, data.txn_start_ms[i]));
    clipped.txn_end_ms.push(Math.min(endMs, data.txn_end_ms[i]));
    clipped.txn_error_code.push(data.txn_error_code[i]);
  }
  return clipped;
}

export function appendLiveStates(
  rendererObj: RendererObj,
  liveDataTile: TileStatesDataTile,
  newData: TileStateColumns,
  isNewDataTile: boolean,
) {
  const { dataTileMeshes } = rendererObj;
  const key = dataTileKey(liveDataTile);

  const hasLiveMeshes =
    !isNewDataTile &&
    rendererObj.liveDataTileKey === key &&
    dataTileMeshes.has(key);
  rendererObj.liveDataTileKey = key;

  const meshes = dataTileMeshes.get(key) ?? addDataTileMeshes(rendererObj, key);
  buildDataTileMeshes(
    rendererObj,
    meshes,
    liveDataTile,
    getRowOfTile(rendererObj.kind),
    hasLiveMeshes ? newData : undefined,
  );
}

export function clearLiveMarker(rendererObj: RendererObj) {
  rendererObj.liveDataTileKey = undefined;
}

export function clearLiveMarkerIfAdded(
  rendererObj: RendererObj,
  addedDataTiles: TileStatesDataTile[],
) {
  const { liveDataTileKey } = rendererObj;
  if (liveDataTileKey == null) return;
  if (!addedDataTiles.some((t) => dataTileKey(t) === liveDataTileKey)) return;

  clearLiveMarker(rendererObj);
}

/** Sets the bar height. The shaders size bars from it, so meshes don't change */
export function setBarHeight(
  rendererObj: RendererObj,
  barHeightPx: number,
  laneGapPx: number,
) {
  const uniforms = rendererObj.compositeUniforms;
  uniforms.uBarHeightPx.value = barHeightPx;
  uniforms.uLaneGapPx.value = laneGapPx;
}

function appendTileStates(
  mesh: StatesMesh,
  data: TileStateColumns,
  start: number,
  rowOfTile: RowOfTile,
): number {
  if (rowOfTile.size === 0) return start;

  let needed = 0;
  for (let i = 0; i < data.state.length; i++) {
    if (rowOfTile.has(data.state_tile[i])) needed++;
  }
  ensureStatesCapacity(mesh, start + needed);

  let count = start;
  for (let i = 0; i < data.state.length; i++) {
    const row = rowOfTile.get(data.state_tile[i]);
    if (row === undefined) continue;
    addRectToMesh(
      mesh,
      count++,
      data.state_start_ms[i],
      data.state_end_ms[i],
      row,
      data.state[i],
    );
  }
  return count;
}

function appendErrorStates(
  mesh: StatesMesh,
  data: TileStateColumns,
  start: number,
  rowOfTile: RowOfTile,
): number {
  if (rowOfTile.size === 0) return start;

  let needed = 0;
  for (let i = 0; i < data.txn_idx.length; i++) {
    if (rowOfTile.has(data.txn_tile[i]) && data.txn_error_code[i] !== null)
      needed++;
  }
  ensureStatesCapacity(mesh, start + needed);

  let count = start;
  for (let i = 0; i < data.txn_idx.length; i++) {
    const row = rowOfTile.get(data.txn_tile[i]);
    const errorCode = data.txn_error_code[i];
    if (row === undefined || errorCode === null) continue;
    addRectToMesh(
      mesh,
      count++,
      data.txn_start_ms[i],
      data.txn_end_ms[i],
      row,
      errorCode ? ErrorState.Failed : ErrorState.Succeeded,
    );
  }
  return count;
}

export function addRectToMesh(
  mesh: StatesMesh,
  idx: number,
  startMs: number,
  endMs: number,
  row: number,
  colorIndex: number,
  weight = 1,
) {
  const localStart = startMs - mesh.referenceX;
  const localEnd = endMs - mesh.referenceX;
  const startHi = Math.fround(localStart);
  const endHi = Math.fround(localEnd);
  const r = idx * 4;
  mesh.edges[r] = startHi;
  mesh.edges[r + 1] = localStart - startHi;
  mesh.edges[r + 2] = endHi;
  mesh.edges[r + 3] = localEnd - endHi;
  const b = idx * 3;
  mesh.bar[b] = row;
  mesh.bar[b + 1] = colorIndex;
  mesh.bar[b + 2] = weight;
}
