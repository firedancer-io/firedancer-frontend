import * as THREE from "three";
import { getDefaultStore } from "jotai";
import {
  createRenderer,
  createRectResources,
  disposeRectResources,
  type RectResources,
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
  createSlotCoverageMaterial,
  createTileStatesMaterial,
  createStatesMesh,
  ensureStatesCapacity,
  setStatesCount,
  type StatesMesh,
} from "./tileStatesMesh.ts";
import type { TileKind } from "./consts.ts";
import { TILE_STATE_PALETTE, type CompositeContext } from "./composite.ts";
import { referenceNsAtom, visibleRangeAtom } from "../atoms.ts";
import { tilesAtom } from "../../../api/atoms.ts";
import { calcRelativeMs } from "../utils.ts";
import type { AggMeshBuild } from "./aggUtils.ts";
import {
  createSlotHighlight,
  getRelativeSlot,
  NO_SLOT,
  updateSlotHighlight,
  type SlotHighlight,
} from "../slotHighlight.ts";

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

export type RowOfTile = Map<number, number>;

export function getRowOfTile(kind: TileKind): RowOfTile {
  const rows = getTileRows(store.get(tilesAtom), kind);
  return new Map(rows.map(({ tileIdx }, row) => [tileIdx, row]));
}

/** Rects per data tile that a composite draws over itself, e.g. error states */
interface CompositeOverlay {
  material: THREE.RawShaderMaterial;
  scene: THREE.Scene;
  append: (
    mesh: StatesMesh,
    data: TileStateColumns,
    start: number,
    rowOfTile: RowOfTile,
  ) => number;
}

/** Shades the canvas from the coverage target */
export interface TileStatesComposite {
  overlay?: CompositeOverlay;
  setStates: (states: TileState[]) => void;
  resize?: () => void;
  render: (rendererObj: RendererObj, rowCount: number) => void;
  dispose: () => void;
}

export interface TileStatesTrackConfig {
  kind: TileKind;
  getStates: (granularity: TileStatesGranularity | undefined) => TileState[];
  createComposite: (ctx: CompositeContext) => TileStatesComposite;
}

interface DataTileMeshes {
  tileStates: StatesMesh;
  overlay?: StatesMesh;
  startMs: number;
  endMs: number;
}

export interface RendererObj {
  renderer: THREE.WebGLRenderer;
  camera: THREE.Camera;
  rectResources: RectResources;
  tileStatesScene: THREE.Scene;
  tileStatesMaterial: THREE.RawShaderMaterial;
  tileStatesTarget: THREE.WebGLRenderTarget;
  highlight: SlotHighlight;
  slotCoverageMaterial: THREE.RawShaderMaterial;
  slotCoverageTarget: THREE.WebGLRenderTarget;
  hasSlotCoverage: THREE.IUniform<number>;
  composite: TileStatesComposite;
  config: TileStatesTrackConfig;
  coverageStates: TileState[];
  dataTileMeshes: Map<string, DataTileMeshes>;
  availableMeshes: DataTileMeshes[];
  liveDataTileKey: string | undefined;
  renderedGranularity: TileStatesGranularity | undefined;
  aggStatesScene: THREE.Scene;
  aggMeshes: DataTileMeshes;
  aggMeshBuild: AggMeshBuild | undefined;
  /** The largest share of busy time any state has in a visible agg bucket */
  aggMaxStateShare: number;
  isAgg: boolean;
  msPerPx: number;
  anchorPx: number;
  viewStartPx: number;
  cleanUp: () => void;
}

function dataTileKey(dataTile: TileStatesDataTile): string {
  return `${dataTile.startNs}:${dataTile.endNs}`;
}

export function setUpRenderer(
  config: TileStatesTrackConfig,
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

  const canBlendFloat32 =
    renderer.extensions.has("EXT_color_buffer_float") &&
    renderer.extensions.has("EXT_float_blend");
  // Each px's time per row and coverage state. The composite pass shades every
  // mode from it
  const states = config.getStates(undefined);
  const tileStatesTarget = new THREE.WebGLRenderTarget(1, 1, {
    format: THREE.RedFormat,
    type: canBlendFloat32 ? THREE.FloatType : THREE.HalfFloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
  });
  const tileStatesMaterial = createTileStatesMaterial(
    TILE_STATE_PALETTE,
    getStateIdxs(states),
    states.length,
  );
  // Each px's time per row in the highlighted slots and groups, so composites
  // can highlight by the slot most of a px's time is in
  const highlight = createSlotHighlight();
  const slotCoverageTarget = new THREE.WebGLRenderTarget(1, 1, {
    format: THREE.RGBAFormat,
    type: tileStatesTarget.texture.type,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
  });
  const slotCoverageMaterial = createSlotCoverageMaterial(
    tileStatesMaterial,
    highlight,
  );
  const hasSlotCoverage = { value: 0 };
  const composite = config.createComposite({
    renderer,
    coverageTarget: tileStatesTarget,
    unitQuad: rectResources.unitQuad,
    states,
    highlight,
    slotCoverageTarget,
    hasSlotCoverage,
  });

  const dataTileMeshes = new Map<string, DataTileMeshes>();
  const availableMeshes: DataTileMeshes[] = [];

  const aggMeshes: DataTileMeshes = {
    tileStates: createStatesMesh(rectResources.unitQuad, tileStatesMaterial),
    startMs: -Infinity,
    endMs: Infinity,
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
      tileStatesTarget.dispose();
      slotCoverageMaterial.dispose();
      slotCoverageTarget.dispose();
      composite.dispose();
    }
    cleanUpRenderer();
  };

  const rendererObj: RendererObj = {
    renderer,
    camera,
    tileStatesScene,
    rectResources,
    tileStatesMaterial,
    tileStatesTarget,
    highlight,
    slotCoverageMaterial,
    slotCoverageTarget,
    hasSlotCoverage,
    composite,
    config,
    coverageStates: states,
    dataTileMeshes,
    availableMeshes,
    liveDataTileKey: undefined,
    renderedGranularity: undefined,
    aggStatesScene,
    aggMeshes,
    aggMeshBuild: undefined,
    aggMaxStateShare: 1,
    isAgg: false,
    msPerPx: 0,
    anchorPx: 0,
    viewStartPx: 0,
    cleanUp,
  };

  return rendererObj;
}

/** Each TileState's texel row among the coverage states, -1 if not drawn */
function getStateIdxs(states: TileState[]) {
  return TILE_STATE_PALETTE.map((_, state) => states.indexOf(state));
}

function syncCoverageStates(rendererObj: RendererObj) {
  const states = rendererObj.config.getStates(rendererObj.renderedGranularity);
  if (states === rendererObj.coverageStates) return states;
  rendererObj.coverageStates = states;
  rendererObj.tileStatesMaterial.uniforms.uStateIdxs.value =
    getStateIdxs(states);
  rendererObj.composite.setStates(states);
  return states;
}

export function handleResize(rendererObj: RendererObj) {
  rendererObj.composite.resize?.();
  const visibleRangeMs = store.get(visibleRangeAtom);
  if (visibleRangeMs) setVisibleRange(rendererObj, visibleRangeMs);
  render(rendererObj);
}

export function render(rendererObj: RendererObj) {
  const {
    renderer,
    camera,
    tileStatesTarget,
    highlight,
    slotCoverageMaterial,
    slotCoverageTarget,
    hasSlotCoverage,
    composite,
  } = rendererObj;
  const { width, height } = renderer.domElement;
  if (!width || !height) return;
  updateSlotHighlight(highlight, width);
  const rowCount = Math.max(getRowOfTile(rendererObj.config.kind).size, 1);
  const states = syncCoverageStates(rendererObj);
  const coverageHeight = rowCount * states.length;
  if (
    tileStatesTarget.width !== width ||
    tileStatesTarget.height !== coverageHeight
  ) {
    tileStatesTarget.setSize(width, coverageHeight);
  }
  for (const material of getRectMaterials(rendererObj)) {
    material.uniforms.uRowCount.value = rowCount;
  }

  const statesScene = rendererObj.isAgg
    ? rendererObj.aggStatesScene
    : rendererObj.tileStatesScene;
  renderer.setRenderTarget(tileStatesTarget);
  renderer.clear();
  renderer.render(statesScene, camera);

  // batch and agg data have no slots, so composites highlight them by time
  const drawSlotCoverage =
    rendererObj.renderedGranularity === TileStatesGranularityEnum.txn &&
    highlight.uniforms.uHighlightActive.value > 0.5;
  hasSlotCoverage.value = drawSlotCoverage ? 1 : 0;
  if (drawSlotCoverage) {
    if (
      slotCoverageTarget.width !== width ||
      slotCoverageTarget.height !== rowCount
    ) {
      slotCoverageTarget.setSize(width, rowCount);
    }
    renderer.setRenderTarget(slotCoverageTarget);
    renderer.clear();
    statesScene.overrideMaterial = slotCoverageMaterial;
    renderer.render(statesScene, camera);
    statesScene.overrideMaterial = null;
  }

  composite.render(rendererObj, rowCount);
}

/** A rect's relative slot for highlighting, NO_SLOT if it has none */
export function getRectSlot(highlight: SlotHighlight, slot: number) {
  return Number.isNaN(slot) ? NO_SLOT : getRelativeSlot(highlight, slot);
}

/** Materials of the rects positioned in the view */
function getRectMaterials({ tileStatesMaterial, composite }: RendererObj) {
  return composite.overlay
    ? [tileStatesMaterial, composite.overlay.material]
    : [tileStatesMaterial];
}

// An anchor near the view keeps shader px values small
const ANCHOR_STEP_PX = 2 ** 16;

export function setVisibleRange(
  rendererObj: RendererObj,
  visibleRangeMs: TsRange,
): boolean {
  const { renderer, dataTileMeshes } = rendererObj;

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

  for (const material of getRectMaterials(rendererObj)) {
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
  if (scaleChanged || viewMoved) {
    for (const meshes of dataTileMeshes.values())
      updateDataTileMeshVisibility(rendererObj, meshes);
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
  for (const statesMesh of [meshes.tileStates, meshes.overlay]) {
    if (!statesMesh) continue;
    statesMesh.mesh.position.x = anchorHi;
    statesMesh.mesh.position.y = anchorMs - anchorHi;
  }
}

/** Hides a data tile's meshes out of view, so the GPU skips their rects */
function updateDataTileMeshVisibility(
  rendererObj: RendererObj,
  meshes: DataTileMeshes,
) {
  const { msPerPx, viewStartPx, renderer } = rendererObj;
  const viewStartMs = viewStartPx * msPerPx;
  const viewEndMs = viewStartMs + renderer.domElement.width * msPerPx;
  const visible = meshes.endMs >= viewStartMs && meshes.startMs <= viewEndMs;
  meshes.tileStates.mesh.visible = visible;
  if (meshes.overlay) meshes.overlay.mesh.visible = visible;
}

function createDataTileMeshes(rendererObj: RendererObj): DataTileMeshes {
  const { rectResources, tileStatesMaterial, composite } = rendererObj;
  const tileStates = createStatesMesh(
    rectResources.unitQuad,
    tileStatesMaterial,
  );
  const overlay =
    composite.overlay &&
    createStatesMesh(rectResources.unitQuad, composite.overlay.material);
  return {
    tileStates,
    overlay,
    startMs: 0,
    endMs: 0,
  };
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
  if (meshes.overlay)
    rendererObj.composite.overlay?.scene.add(meshes.overlay.mesh);
  return meshes;
}

function disposeDataTileMeshes(meshes: DataTileMeshes) {
  meshes.tileStates.mesh.geometry.dispose();
  meshes.overlay?.mesh.geometry.dispose();
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
    const referenceNs = store.get(referenceNsAtom) ?? 0n;
    const referenceX = calcRelativeMs(referenceNs, dataTile.startNs);
    meshes.tileStates.referenceX = referenceX;
    if (meshes.overlay) meshes.overlay.referenceX = referenceX;
    meshes.startMs = referenceX;
    meshes.endMs = calcRelativeMs(referenceNs, dataTile.endNs);
    updateDataTileMeshPositions(rendererObj, meshes);
    updateDataTileMeshVisibility(rendererObj, meshes);
  }

  const data = appendData ?? dataTile.data;

  const tileStatesStart = appendData ? meshes.tileStates.count : 0;
  setStatesCount(
    meshes.tileStates,
    appendTileStates(
      rendererObj.highlight,
      meshes.tileStates,
      data,
      tileStatesStart,
      rowOfTile,
    ),
    tileStatesStart,
  );

  const overlay = rendererObj.composite.overlay;
  if (meshes.overlay && overlay) {
    const overlayStart = appendData ? meshes.overlay.count : 0;
    setStatesCount(
      meshes.overlay,
      overlay.append(meshes.overlay, data, overlayStart, rowOfTile),
      overlayStart,
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
    composite,
    availableMeshes,
    dataTileMeshes,
    liveDataTileKey,
    renderedGranularity,
  } = rendererObj;
  const dataTiles = renderedGranularity
    ? tileStatesCaches[renderedGranularity].getTiles()
    : [];
  const rowOfTile = getRowOfTile(rendererObj.config.kind);

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
    if (meshes.overlay) composite.overlay?.scene.remove(meshes.overlay.mesh);
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
    getRowOfTile(rendererObj.config.kind),
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

function appendTileStates(
  highlight: SlotHighlight,
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
      1,
      getRectSlot(highlight, data.state_slot[i]),
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
  slot = NO_SLOT,
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
  mesh.slot[idx] = slot;
}
