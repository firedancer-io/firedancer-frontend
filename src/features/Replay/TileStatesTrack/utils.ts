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
import { TileStatesGranularityEnum } from "../../../api/entities.ts";
import {
  tileStatesCaches,
  type TileStateColumns,
  type TileStatesDataTile,
} from "./tileStatesCache.ts";
import {
  createTileStatesMaterial,
  createErrorStatesMaterial,
  createStatesMesh,
  ensureStatesCapacity,
  setErrorStatesPixelRatio,
  setStatesCount,
  type StatesMesh,
} from "./tileStatesMesh.ts";
import {
  BAR_HEIGHT_PX,
  ROW_HEIGHT_PX,
  ErrorState,
  errorStateColors,
  tileStateColors,
  type TileKind,
} from "./consts.ts";
import { replayTrackBackgroundColor } from "../../../colors.ts";
import { referenceNsAtom, visibleRangeAtom } from "../atoms.ts";
import { tilesAtom } from "../../../api/atoms.ts";
import { calcRelativeMs } from "../utils.ts";

const store = getDefaultStore();

interface TileRow {
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

type RowOfTile = Map<number, number>;

function getRowOfTile(kind: TileKind): RowOfTile {
  const rows = getTileRows(store.get(tilesAtom), kind);
  return new Map(rows.map(({ tileIdx }, row) => [tileIdx, row]));
}

interface DataTileMeshes {
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
  errorStatesScene: THREE.Scene;
  compositeScene: THREE.Scene;
  compositeMaterial: THREE.RawShaderMaterial;
  kind: TileKind;
  dataTileMeshes: Map<string, DataTileMeshes>;
  availableMeshes: DataTileMeshes[];
  liveDataTileKey: string | undefined;
  renderedGranularity: TileStatesGranularity | undefined;
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

const BACKGROUND_LINEAR = toLinear(
  convertToWebGlColor(replayTrackBackgroundColor),
);

const TILE_STATE_PALETTE = Object.values(tileStateColors).map(
  (color) => new THREE.Vector3(...toLinear(convertToWebGlColor(color))),
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

/** Shades each px's summed states over the background and encodes to sRGB. */
const compositeFragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uStateColors; // linear rgb = sum of color * coverage, a = busy
uniform vec2 uCanvasSize;       // px in canvas dimensions
uniform vec3 uBackground;       // linear color

vec3 linearToSrgb(vec3 c) {
  return mix(
    c * 12.92,
    1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
    step(0.0031308, c)
  );
}

void main() {
  vec4 s = texture2D(uStateColors, gl_FragCoord.xy / uCanvasSize);
  vec3 color = s.rgb + uBackground * (1.0 - min(s.a, 1.0));
  gl_FragColor = vec4(linearToSrgb(color), 1.0);
}
`;

function createCompositeMaterial(
  stateColors: THREE.Texture,
  backgroundLinear: [number, number, number],
) {
  return new THREE.RawShaderMaterial({
    vertexShader: compositeVertexShader,
    fragmentShader: compositeFragmentShader,
    depthTest: false,
    uniforms: {
      uStateColors: { value: stateColors },
      uCanvasSize: { value: new THREE.Vector2(1, 1) },
      uBackground: { value: new THREE.Vector3(...backgroundLinear) },
    },
  });
}

export function setUpRenderer(
  kind: TileKind,
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
  const tileStatesMaterial = createTileStatesMaterial(TILE_STATE_PALETTE);
  const errorStatesMaterial = createErrorStatesMaterial(
    devicePixelRatio,
    ERROR_STATE_PALETTE,
  );

  const canBlendFloat32 =
    renderer.extensions.has("EXT_color_buffer_float") &&
    renderer.extensions.has("EXT_float_blend");
  // Holds each pixel's state colors summed by time, and how busy it was in
  // alpha. The composite pass turns this into the final color.
  const tileStatesTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: canBlendFloat32 ? THREE.FloatType : THREE.HalfFloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
  });

  const compositeMaterial = createCompositeMaterial(
    tileStatesTarget.texture,
    BACKGROUND_LINEAR,
  );
  const compositeMesh = new THREE.Mesh(
    rectResources.unitQuad,
    compositeMaterial,
  );
  compositeMesh.frustumCulled = false;
  const compositeScene = new THREE.Scene();
  compositeScene.add(compositeMesh);

  const dataTileMeshes = new Map<string, DataTileMeshes>();
  const availableMeshes: DataTileMeshes[] = [];

  const cleanUp = () => {
    // Skip GPU disposal if the context was lost since its objects are already gone.
    if (!getWasContextLost()) {
      for (const meshes of dataTileMeshes.values())
        disposeDataTileMeshes(meshes);
      for (const meshes of availableMeshes) disposeDataTileMeshes(meshes);
      disposeRectResources(rectResources);
      tileStatesMaterial.dispose();
      errorStatesMaterial.dispose();
      tileStatesTarget.dispose();
      compositeMaterial.dispose();
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
    tileStatesTarget,
    errorStatesScene,
    compositeScene,
    compositeMaterial,
    kind,
    dataTileMeshes,
    availableMeshes,
    liveDataTileKey: undefined,
    renderedGranularity: undefined,
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
    tileStatesScene,
    camera,
    tileStatesTarget,
    errorStatesScene,
    compositeScene,
  } = rendererObj;
  const { width, height } = renderer.domElement;
  if (!width || !height) return;
  if (tileStatesTarget.width !== width || tileStatesTarget.height !== height) {
    tileStatesTarget.setSize(width, height);
    (
      rendererObj.compositeMaterial.uniforms.uCanvasSize.value as THREE.Vector2
    ).set(width, height);
  }
  renderer.setRenderTarget(tileStatesTarget);
  renderer.clear();
  renderer.render(tileStatesScene, camera);
  renderer.setRenderTarget(null);
  renderer.render(compositeScene, camera);
  if (rendererObj.renderedGranularity === TileStatesGranularityEnum.txn) {
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
  }

  // Callers can skip rendering if no px value has changed
  return scaleChanged || viewMoved;
}

function updateDataTileMeshPositions(
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
    ? tileStatesCaches[renderedGranularity].getTiles()
    : [];
  const rowOfTile = getRowOfTile(rendererObj.kind);

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
function getRowLayout(rowOfTile: RowOfTile) {
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

function addRectToMesh(
  mesh: StatesMesh,
  idx: number,
  startMs: number,
  endMs: number,
  y: number,
  height: number,
  colorIndex: number,
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
  mesh.bar[b] = y;
  mesh.bar[b + 1] = height;
  mesh.bar[b + 2] = colorIndex;
}

/** Bottom y of a row, rows stacked top-down. */
function tileYPosition(row: number, rowH: number) {
  return 1 - (row + 1) * rowH;
}
