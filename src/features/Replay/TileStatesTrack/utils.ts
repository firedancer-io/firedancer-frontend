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
  tileStatesCaches,
  type TileStateColumns,
  type TileStatesDataTile,
} from "./tileStatesCache.ts";
import {
  createStateCoverageMaterial,
  createErrorStatesMaterial,
  createStatesMesh,
  ensureStatesCapacity,
  setErrorStatesPixelRatio,
  setStatesCount,
  type StatesMesh,
} from "./tileStatesMesh.ts";
import {
  BAR_HEIGHT_PX,
  HEATMAP_IDLE_WEIGHT,
  ROW_HEIGHT_PX,
  ErrorState,
  errorStateColors,
  tileStateColors,
  coverageStates,
  trackStates,
  TileStatesMode,
  type TileKind,
} from "./consts.ts";
import { replayTrackBackgroundColor } from "../../../colors.ts";
import { referenceNsAtom, visibleRangeAtom } from "../atoms.ts";
import { tilesAtom } from "../../../api/atoms.ts";
import { calcRelativeMs } from "../utils.ts";

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
  errorStatesMaterial: THREE.RawShaderMaterial;
  errorStatesScene: THREE.Scene;
  stateCoverageMaterial: THREE.RawShaderMaterial;
  /** Per state px coverage, a channel per coverage state and 4 per texture */
  coverageTarget: THREE.WebGLRenderTarget;
  coverageCompositeScene: THREE.Scene;
  coverageCompositeMaterial: THREE.RawShaderMaterial;
  /** Displayed mode for the visible span */
  mode: TileStatesMode;
  kind: TileKind;
  dataTileMeshes: Map<string, DataTileMeshes>;
  availableMeshes: DataTileMeshes[];
  liveDataTileKey: string | undefined;
  renderedGranularity: TileStatesGranularity | undefined;
  /** Agg buckets as weighted states, shaded by the same passes */
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

/**
 * Tile states are drawn opaque, so composite #RRGGBBAA colors over the background
 */
function convertToOpaqueWebGlColor(hex: string): RgbColor {
  const rgb = convertToWebGlColor(hex.slice(0, 7));
  const alpha = hex.length === 9 ? parseInt(hex.slice(7), 16) / 255 : 1;
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
attribute vec2 position; // unit quad in [-0.5, 0.5]

void main() {
  gl_Position = vec4(position * 2.0, 0.0, 1.0);
}
`;

const SRGB_PALETTE = TILE_STATE_SRGB_PALETTE.map(
  (color) => new THREE.Vector3(...color),
);

/** Most lanes of any track, the execrp txn states */
const MAX_LANES = 5;

const shaderModeIds: Record<TileStatesMode, number> = {
  [TileStatesMode.Heatmap]: 0,
  [TileStatesMode.Stacked]: 1,
  [TileStatesMode.Gantt]: 2,
};

/**
 * Shades each px's row bar from its per state time coverage.
 * Heatmap: busy state colors mixed by time in linear light over the
 * background, with idle time weighted by uIdleWeight.
 * Stacked: lane states bottom-up in reverse, so top-down they read in lane
 * order like gantt. Idle isn't drawn, so the bar height is the busy fraction.
 * Gantt: a lane per state top-down, shaded by the state's coverage.
 */
const createCoverageCompositeFragmentShader = (targetCount: number) => {
  const channelCount = targetCount * 4;
  const indices = Array.from({ length: targetCount }, (_, i) => i);
  return /* glsl */ `
precision highp float;

${indices.map((i) => `uniform sampler2D uCoverage${i};`).join("\n")}
uniform vec2 uCanvasSize;     // px in canvas dimensions
uniform float uRowCount;
uniform float uBarFrac;       // bar height / row height
uniform vec3 uBackground;     // srgb
uniform vec3 uBackgroundLinear;
uniform vec3 uChannelColors[${channelCount}]; // srgb
uniform vec3 uChannelLinearColors[${channelCount}];
uniform int uMode;
uniform float uIdleWeight;
uniform float uLaneChannels[${MAX_LANES}];
uniform float uLaneCount;

vec3 linearToSrgb(vec3 c) {
  return mix(
    c * 12.92,
    1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
    step(0.0031308, c)
  );
}

void main() {
  vec2 uv = gl_FragCoord.xy / uCanvasSize;
  float rowH = 1.0 / uRowCount;
  // bars sit at the bottom of their rows
  float barY = mod(uv.y, rowH) / (rowH * uBarFrac);
  vec3 color = uBackground;
  if (barY < 1.0) {
    float coverage[${channelCount}];
${indices
  .map(
    (i) => `    vec4 c${i} = texture2D(uCoverage${i}, uv);
    coverage[${i * 4}] = c${i}.r; coverage[${i * 4 + 1}] = c${i}.g;
    coverage[${i * 4 + 2}] = c${i}.b; coverage[${i * 4 + 3}] = c${i}.a;`,
  )
  .join("\n")}
    if (uMode == ${shaderModeIds[TileStatesMode.Heatmap]}) {
      vec3 busyColor = vec3(0.0);
      float busy = 0.0;
      for (int i = 0; i < ${channelCount}; i++) {
        busyColor += uChannelLinearColors[i] * coverage[i];
        busy += coverage[i];
      }
      // time without a busy state is idle, shown as weighted background
      float idle = max(1.0 - busy, 0.0);
      float backgroundWeight = uIdleWeight * idle;
      float total = busy + backgroundWeight;
      if (total > 0.0) {
        color = linearToSrgb(
          (busyColor + uBackgroundLinear * backgroundWeight) / total
        );
      }
    } else if (uMode == ${shaderModeIds[TileStatesMode.Gantt]}) {
      float lane = floor((1.0 - barY) * uLaneCount);
      float laneChannel = -1.0;
      for (int i = 0; i < ${MAX_LANES}; i++) {
        if (float(i) == lane) laneChannel = uLaneChannels[i];
      }
      for (int i = 0; i < ${channelCount}; i++) {
        if (float(i) == laneChannel) {
          color = mix(uBackground, uChannelColors[i], min(coverage[i], 1.0));
        }
      }
    } else {
      float top = 0.0;
      for (int lane = ${MAX_LANES} - 1; lane >= 0; lane--) {
        if (float(lane) >= uLaneCount) continue;
        float laneChannel = uLaneChannels[lane];
        for (int i = 0; i < ${channelCount}; i++) {
          if (float(i) == laneChannel) {
            top += coverage[i];
            if (barY < top) color = uChannelColors[i];
          }
        }
        if (barY < top) break;
      }
    }
  }
  gl_FragColor = vec4(color, 1.0);
}
`;
};

/** Pads per channel colors to whole render targets */
function getChannelColors(
  channelStates: TileState[],
  palette: THREE.Vector3[],
) {
  const colors = channelStates.map((state) => palette[state]);
  while (colors.length % 4) colors.push(new THREE.Vector3());
  return colors;
}

function createCoverageCompositeMaterial(
  coverageTarget: THREE.WebGLRenderTarget,
  channelStates: TileState[],
) {
  const { textures } = coverageTarget;
  return new THREE.RawShaderMaterial({
    vertexShader: compositeVertexShader,
    fragmentShader: createCoverageCompositeFragmentShader(textures.length),
    depthTest: false,
    uniforms: {
      ...Object.fromEntries(
        textures.map((texture, i) => [`uCoverage${i}`, { value: texture }]),
      ),
      uCanvasSize: { value: new THREE.Vector2(1, 1) },
      uRowCount: { value: 1 },
      uBarFrac: { value: BAR_HEIGHT_PX / ROW_HEIGHT_PX },
      uBackground: { value: new THREE.Vector3(...BACKGROUND_SRGB) },
      uBackgroundLinear: { value: new THREE.Vector3(...BACKGROUND_LINEAR) },
      uChannelColors: { value: getChannelColors(channelStates, SRGB_PALETTE) },
      uChannelLinearColors: {
        value: getChannelColors(channelStates, TILE_STATE_PALETTE),
      },
      uMode: { value: shaderModeIds[TileStatesMode.Heatmap] },
      uIdleWeight: { value: HEATMAP_IDLE_WEIGHT },
      uLaneChannels: { value: new Array<number>(MAX_LANES).fill(-1) },
      uLaneCount: { value: 1 },
    },
  });
}

export function setUpRenderer(
  kind: TileKind,
  mode: TileStatesMode,
  setUpContextListeners: ContextHelpers["setUpContextListeners"],
  getWasContextLost: ContextHelpers["getWasContextLost"],
): RendererObj | undefined {
  const renderObj = createRenderer(
    0,
    0,
    1,
    setUpContextListeners,
    getWasContextLost,
    false,
    1, // canvas is sized in device px so no rescaling it
  );
  if (!renderObj) return;
  const { renderer, cleanUpRenderer } = renderObj;
  const canvasStyle = renderer.domElement.style;
  canvasStyle.display = "block";
  canvasStyle.width = "100%";
  canvasStyle.height = "100%";

  // Manual clearing because we render multiple scenes and clear between rendering each
  renderer.autoClear = false;

  const camera = new THREE.Camera();
  const rectResources = createRectResources();

  const tileStatesScene = new THREE.Scene();
  const errorStatesScene = new THREE.Scene();
  errorStatesScene.visible = false;
  const errorStatesMaterial = createErrorStatesMaterial(
    devicePixelRatio,
    ERROR_STATE_PALETTE,
  );

  const canBlendFloat32 =
    renderer.extensions.has("EXT_color_buffer_float") &&
    renderer.extensions.has("EXT_float_blend");
  // Each px's time per coverage state, written to every texture in one pass.
  // The composite pass shades every mode from these
  const channelStates = coverageStates[kind];
  const coverageTarget = new THREE.WebGLRenderTarget(1, 1, {
    count: Math.ceil(channelStates.length / 4),
    type: canBlendFloat32 ? THREE.FloatType : THREE.HalfFloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
  });
  const stateCoverageMaterial = createStateCoverageMaterial(
    TILE_STATE_PALETTE,
    TILE_STATE_PALETTE.map((_, state) => channelStates.indexOf(state)),
    coverageTarget.textures.length,
  );
  const coverageCompositeMaterial = createCoverageCompositeMaterial(
    coverageTarget,
    channelStates,
  );
  const coverageCompositeMesh = new THREE.Mesh(
    rectResources.unitQuad,
    coverageCompositeMaterial,
  );
  coverageCompositeMesh.frustumCulled = false;
  const coverageCompositeScene = new THREE.Scene();
  coverageCompositeScene.add(coverageCompositeMesh);

  const dataTileMeshes = new Map<string, DataTileMeshes>();
  const availableMeshes: DataTileMeshes[] = [];

  const aggMeshes: DataTileMeshes = {
    tileStates: createStatesMesh(rectResources.unitQuad, stateCoverageMaterial),
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
      errorStatesMaterial.dispose();
      stateCoverageMaterial.dispose();
      coverageTarget.dispose();
      coverageCompositeMaterial.dispose();
    }
    cleanUpRenderer();
  };

  const rendererObj: RendererObj = {
    renderer,
    camera,
    tileStatesScene,
    rectResources,
    errorStatesMaterial,
    errorStatesScene,
    stateCoverageMaterial,
    coverageTarget,
    coverageCompositeScene,
    coverageCompositeMaterial,
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

/**
 * Size the drawing buffer to the canvas's exact device px
 */
export function resizeCanvas(
  rendererObj: RendererObj,
  widthPx: number,
  heightPx: number,
) {
  rendererObj.renderer.setSize(widthPx, heightPx, false);
  setErrorStatesPixelRatio(rendererObj.errorStatesMaterial, devicePixelRatio);
  const visibleRangeMs = store.get(visibleRangeAtom);
  if (visibleRangeMs) setVisibleRange(rendererObj, visibleRangeMs);
  render(rendererObj);
}

export function render(rendererObj: RendererObj) {
  const {
    renderer,
    camera,
    errorStatesScene,
    coverageTarget,
    coverageCompositeScene,
    coverageCompositeMaterial,
  } = rendererObj;
  const { width, height } = renderer.domElement;
  if (!width || !height) return;
  if (coverageTarget.width !== width || coverageTarget.height !== height) {
    coverageTarget.setSize(width, height);
    (coverageCompositeMaterial.uniforms.uCanvasSize.value as THREE.Vector2).set(
      width,
      height,
    );
  }

  const statesScene = rendererObj.isAgg
    ? rendererObj.aggStatesScene
    : rendererObj.tileStatesScene;
  const { uniforms } = coverageCompositeMaterial;
  uniforms.uMode.value = shaderModeIds[rendererObj.mode];
  const laneStates =
    trackStates[rendererObj.kind][
      rendererObj.renderedGranularity ?? TileStatesGranularityEnum.txn
    ];
  const channelStates = coverageStates[rendererObj.kind];
  const laneChannels = uniforms.uLaneChannels.value as number[];
  for (let i = 0; i < MAX_LANES; i++) {
    laneChannels[i] =
      i < laneStates.length ? channelStates.indexOf(laneStates[i]) : -1;
  }
  uniforms.uLaneCount.value = laneStates.length;

  renderer.setRenderTarget(coverageTarget);
  renderer.clear();
  renderer.render(statesScene, camera);
  renderer.setRenderTarget(null);
  renderer.render(coverageCompositeScene, camera);
  if (
    !rendererObj.isAgg &&
    rendererObj.renderedGranularity === TileStatesGranularityEnum.txn
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
  const {
    renderer,
    dataTileMeshes,
    stateCoverageMaterial,
    errorStatesMaterial,
  } = rendererObj;

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

  for (const material of [stateCoverageMaterial, errorStatesMaterial]) {
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
  const { rectResources, stateCoverageMaterial, errorStatesMaterial, kind } =
    rendererObj;
  const tileStates = createStatesMesh(
    rectResources.unitQuad,
    stateCoverageMaterial,
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
    ? tileStatesCaches[renderedGranularity].getTiles()
    : [];
  const rowOfTile = getRowOfTile(rendererObj.kind);
  rendererObj.coverageCompositeMaterial.uniforms.uRowCount.value = Math.max(
    rowOfTile.size,
    1,
  );

  const keys = new Set<string>();

  // Build meshes for new data tiles (skip already built ones)
  for (const dataTile of dataTiles) {
    const key = dataTileKey(dataTile);
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

/** Row height and bar height in [0, 1] view space. */
export function getRowLayout(rowOfTile: RowOfTile) {
  const rowH = 1 / rowOfTile.size;
  return { rowH, barH: (rowH * BAR_HEIGHT_PX) / ROW_HEIGHT_PX };
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

  const { rowH, barH } = getRowLayout(rowOfTile);
  let count = start;
  for (let i = 0; i < data.state.length; i++) {
    const row = rowOfTile.get(data.state_tile[i]);
    if (row === undefined) continue;
    addRectToMesh(
      mesh,
      count++,
      data.state_start_ms[i],
      data.state_end_ms[i],
      tileYPosition(row, rowH),
      barH,
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

  const { rowH, barH } = getRowLayout(rowOfTile);
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
      tileYPosition(row, rowH),
      barH,
      errorCode ? ErrorState.Failed : ErrorState.Succeeded,
    );
  }
  return count;
}

/**
 * `weight` is the fraction of [startMs, endMs] the state covers, for agg
 * buckets that sum a state's time
 */
export function addRectToMesh(
  mesh: StatesMesh,
  idx: number,
  startMs: number,
  endMs: number,
  y: number,
  height: number,
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
  const b = idx * 4;
  mesh.bar[b] = y;
  mesh.bar[b + 1] = height;
  mesh.bar[b + 2] = colorIndex;
  mesh.bar[b + 3] = weight;
}

/** Bottom y of a row, rows stacked top-down. */
export function tileYPosition(row: number, rowH: number) {
  return 1 - (row + 1) * rowH;
}
