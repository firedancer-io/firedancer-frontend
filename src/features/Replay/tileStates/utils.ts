import * as THREE from "three";
import { getDefaultStore } from "jotai";
import {
  createRenderer,
  createRectResources,
  disposeRectResources,
  drawInRangesPx,
  getRangesPx,
  type NsTsRange,
  type RectResources,
  type TsRange,
} from "../../WebGl/webglUtils.ts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers.ts";
import type { TileStatesGranularity } from "../../../api/types.ts";
import {
  type TileState,
  TileStatesGranularityEnum,
} from "../../../api/entities.ts";
import {
  tileStatesCaches,
  type TileStatesData,
  type TileStatesDataTile,
} from "./tileStatesCache.ts";
import {
  appendStates,
  clearStates,
  createSlotCoverageMaterial,
  createTileStatesMaterial,
  createStatesMesh,
  setStatesCount,
  wrapStates,
  type StatesMesh,
} from "./tileStatesMesh.ts";
import {
  MAX_COVERAGE_STATES,
  tileStatesBarLayout,
  type BarLayout,
} from "./tileStatesRects.ts";
import type { MergedLevel } from "./mergeTileStates.ts";
import {
  getTileRows,
  MERGE_BIN_PX,
  tileKinds,
  tileStatesTileNs,
  type TileKind,
} from "./consts.ts";
import type { CompositeContext } from "./composite.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import { tilesAtom } from "../../../api/atoms.ts";
import {
  calcAbsoluteNs,
  calcAbsoluteNsRange,
  calcRelativeMs,
} from "../utils.ts";
import type { AggMeshBuild } from "./aggUtils.ts";
import type { ModeRanges } from "../coverage.ts";
import {
  createSlotHighlight,
  getRelativeSlot,
  NO_SLOT,
  updateSlotHighlight,
  type SlotHighlight,
} from "../slotHighlight.ts";

const store = getDefaultStore();

export type RowOfTile = Map<number, number>;

export function getRowOfTile(kind: TileKind): RowOfTile {
  const rows = getTileRows(store.get(tilesAtom), kind);
  return new Map(rows.map(({ tileIdx }, row) => [tileIdx, row]));
}

/** Rects per data tile that a composite draws over itself, e.g. error states */
interface CompositeOverlay {
  material: THREE.RawShaderMaterial;
  barLayout: BarLayout;
  scene: THREE.Scene;
  append: (
    mesh: StatesMesh,
    data: TileStatesData,
    start: number,
    rowOfTile: RowOfTile,
  ) => number;
}

/** Shades the canvas from the coverage target */
export interface TileStatesComposite {
  overlay?: CompositeOverlay;
  setStates: (states: TileState[]) => void;
  resize?: () => void;
  render: (rendererObj: RendererObj, rowCount: number, isAgg: boolean) => void;
  dispose: () => void;
}

export interface TileStatesTrackConfig {
  kind: TileKind;
  getStates: (granularity: TileStatesGranularity | undefined) => TileState[];
  createComposite: (ctx: CompositeContext) => TileStatesComposite;
}

interface LevelMesh {
  binMs: number;
  mesh: StatesMesh;
}

interface DataTileMeshes {
  // ascending bins, one shown at a time
  levels: LevelMesh[];
  // built from the live tile, so they hold copies of every level
  isLive: boolean;
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
  /** Visible data tiles range the meshes were last synced for */
  syncedTileRangeNs: NsTsRange | undefined;
  aggStatesScene: THREE.Scene;
  aggMesh: StatesMesh;
  aggMeshBuild: AggMeshBuild | undefined;
  /** The largest share of busy time any state has in a visible agg bucket */
  aggMaxStateShare: number;
  modeRanges: ModeRanges;
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
  const tileStatesMaterial = createTileStatesMaterial(states.length);
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

  const aggMesh = createStatesMesh(
    rectResources.unitQuad,
    tileStatesMaterial,
    tileStatesBarLayout,
  );
  const aggStatesScene = new THREE.Scene();
  aggStatesScene.add(aggMesh.mesh);

  const cleanUp = () => {
    // Skip GPU disposal if the context was lost since its objects are already gone.
    if (!getWasContextLost()) {
      for (const meshes of dataTileMeshes.values())
        disposeDataTileMeshes(meshes);
      for (const meshes of availableMeshes) disposeDataTileMeshes(meshes);
      aggMesh.mesh.geometry.dispose();
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
    syncedTileRangeNs: undefined,
    aggStatesScene,
    aggMesh,
    aggMeshBuild: undefined,
    aggMaxStateShare: 1,
    modeRanges: { agg: [], nonAgg: [] },
    msPerPx: 0,
    anchorPx: 0,
    viewStartPx: 0,
    cleanUp,
  };

  return rendererObj;
}

function syncCoverageStates(rendererObj: RendererObj) {
  const states = rendererObj.config.getStates(rendererObj.renderedGranularity);
  if (states === rendererObj.coverageStates) return states;
  rendererObj.coverageStates = states;
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
  updateSlotHighlight(highlight, renderer);
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

  const visibleRange = store.get(visibleRangeAtom);
  const { agg, nonAgg } = rendererObj.modeRanges;
  const aggRangesPx =
    visibleRange && nonAgg.length ? getRangesPx(visibleRange, agg, width) : [];
  const isAggOnly = !nonAgg.length;

  // Each mode's states cover its ranges. Agg is drawn over the non agg base
  renderer.setRenderTarget(tileStatesTarget);
  renderer.clear();
  renderer.render(
    isAggOnly ? rendererObj.aggStatesScene : rendererObj.tileStatesScene,
    camera,
  );
  if (aggRangesPx.length) {
    tileStatesTarget.scissorTest = true;
    for (const [startPx, endPx] of aggRangesPx) {
      tileStatesTarget.scissor.set(startPx, 0, endPx - startPx, coverageHeight);
      // reapplies the target's scissor
      renderer.setRenderTarget(tileStatesTarget);
      renderer.clear();
      renderer.render(rendererObj.aggStatesScene, camera);
    }
    tileStatesTarget.scissorTest = false;
  }

  // batch and agg data have no slots, so composites highlight them by time
  const drawSlotCoverage =
    !isAggOnly &&
    rendererObj.renderedGranularity === TileStatesGranularityEnum.txn &&
    highlight.uniforms.uHighlightActive.value > 0.5;
  if (drawSlotCoverage) {
    if (
      slotCoverageTarget.width !== width ||
      slotCoverageTarget.height !== rowCount
    ) {
      slotCoverageTarget.setSize(width, rowCount);
    }
    const { tileStatesScene } = rendererObj;
    renderer.setRenderTarget(slotCoverageTarget);
    renderer.clear();
    tileStatesScene.overrideMaterial = slotCoverageMaterial;
    renderer.render(tileStatesScene, camera);
    tileStatesScene.overrideMaterial = null;
  }

  hasSlotCoverage.value = drawSlotCoverage ? 1 : 0;
  composite.render(rendererObj, rowCount, isAggOnly);
  if (aggRangesPx.length) {
    hasSlotCoverage.value = 0;
    drawInRangesPx(renderer, aggRangesPx, () =>
      composite.render(rendererObj, rowCount, true),
    );
  }
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
    for (const meshes of dataTileMeshes.values()) {
      for (const statesMesh of getStatesMeshes(meshes))
        updateMeshPosition(rendererObj, statesMesh);
    }
    updateMeshPosition(rendererObj, rendererObj.aggMesh);
  }
  if (scaleChanged || viewMoved) {
    for (const meshes of dataTileMeshes.values())
      updateDataTileMeshVisibility(rendererObj, meshes);
  }

  // Callers can skip rendering if no px value has changed
  return scaleChanged || viewMoved;
}

export function updateMeshPosition(
  rendererObj: RendererObj,
  statesMesh: StatesMesh,
) {
  const { msPerPx, anchorPx } = rendererObj;
  const anchorMs = anchorPx * msPerPx - statesMesh.referenceX;
  const anchorHi = Math.fround(anchorMs);
  statesMesh.mesh.position.x = anchorHi;
  statesMesh.mesh.position.y = anchorMs - anchorHi;
}

function getStatesMeshes(meshes: DataTileMeshes): StatesMesh[] {
  const statesMeshes = meshes.levels.map(({ mesh }) => mesh);
  if (meshes.overlay) statesMeshes.push(meshes.overlay);
  return statesMeshes;
}

/** The coarsest level with bins at most MERGE_BIN_PX */
function getLevelIdx(levels: LevelMesh[], msPerPx: number) {
  let levelIdx = 0;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i].binMs <= msPerPx * MERGE_BIN_PX) levelIdx = i;
  }
  return levelIdx;
}

/** Shows a data tile's level for the view's scale, and hides it out of view */
function updateDataTileMeshVisibility(
  rendererObj: RendererObj,
  meshes: DataTileMeshes,
) {
  const { msPerPx, viewStartPx, renderer } = rendererObj;
  const viewStartMs = viewStartPx * msPerPx;
  const viewEndMs = viewStartMs + renderer.domElement.width * msPerPx;
  const visible = meshes.endMs >= viewStartMs && meshes.startMs <= viewEndMs;
  const levelIdx = getLevelIdx(meshes.levels, msPerPx);
  for (let i = 0; i < meshes.levels.length; i++) {
    meshes.levels[i].mesh.mesh.visible = visible && i === levelIdx;
  }
  if (meshes.overlay) meshes.overlay.mesh.visible = visible;
}

function createDataTileMeshes(rendererObj: RendererObj): DataTileMeshes {
  const { rectResources, composite } = rendererObj;
  const overlay =
    composite.overlay &&
    createStatesMesh(
      rectResources.unitQuad,
      composite.overlay.material,
      composite.overlay.barLayout,
    );
  return {
    levels: [],
    isLive: false,
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
  for (const level of meshes.levels) {
    rendererObj.tileStatesScene.add(level.mesh.mesh);
  }
  if (meshes.overlay)
    rendererObj.composite.overlay?.scene.add(meshes.overlay.mesh);
  return meshes;
}

function disposeDataTileMeshes(meshes: DataTileMeshes) {
  for (const statesMesh of getStatesMeshes(meshes)) {
    statesMesh.mesh.geometry.dispose();
  }
}

/** Adds meshes for at least levelCount levels */
function ensureLevelMeshes(
  rendererObj: RendererObj,
  meshes: DataTileMeshes,
  levelCount: number,
) {
  while (meshes.levels.length < levelCount) {
    const mesh = createStatesMesh(
      rendererObj.rectResources.unitQuad,
      rendererObj.tileStatesMaterial,
      tileStatesBarLayout,
    );
    rendererObj.tileStatesScene.add(mesh.mesh);
    meshes.levels.push({ binMs: Infinity, mesh });
  }
}

/** A level's slots relative to the highlight's, NO_SLOT for none */
function getRelativeSlots(
  highlight: SlotHighlight,
  { slot, count }: MergedLevel,
  referenceSlot: number,
) {
  const relativeSlots = new Float32Array(count);
  let offset: number | undefined;
  for (let i = 0; i < count; i++) {
    if (Number.isNaN(slot[i])) {
      relativeSlots[i] = NO_SLOT;
      continue;
    }
    offset ??= getRelativeSlot(highlight, referenceSlot);
    relativeSlots[i] = slot[i] + offset;
  }
  return relativeSlots;
}

function buildDataTileMeshes(
  rendererObj: RendererObj,
  meshes: DataTileMeshes,
  dataTile: TileStatesDataTile,
  rowOfTile: RowOfTile,
  isLive: boolean,
  appendData?: TileStatesData,
) {
  const { config, highlight } = rendererObj;
  if (appendData) {
    appendData.levels[config.kind].forEach((level, i) => {
      const { edges, bar, count } = level;
      const slots = getRelativeSlots(
        highlight,
        level,
        appendData.referenceSlot,
      );
      appendStates(meshes.levels[i].mesh, edges, bar, slots, count);
    });
  } else {
    const { levels: levelsByKind, referenceSlot } = dataTile.data;
    const levels = levelsByKind[config.kind];
    ensureLevelMeshes(rendererObj, meshes, levels.length);
    const referenceNs = store.get(referenceNsAtom) ?? 0n;
    const referenceX = calcRelativeMs(referenceNs, dataTile.startNs);
    meshes.levels.forEach((levelMesh, i) => {
      const level = levels.at(i);
      levelMesh.binMs = level?.binMs ?? Infinity;
      const { mesh } = levelMesh;
      if (!level) {
        if (mesh.count || !mesh.capacity) clearStates(mesh);
        return;
      }
      const { edges, bar, count } = level;
      const slots = getRelativeSlots(highlight, level, referenceSlot);
      // the live tile's arrays are replaced as its states arrive
      if (isLive) {
        setStatesCount(mesh, 0);
        appendStates(mesh, edges, bar, slots, count);
      } else {
        wrapStates(mesh, edges, bar, slots, count);
      }
    });
    meshes.isLive = isLive;
    for (const statesMesh of getStatesMeshes(meshes)) {
      statesMesh.referenceX = referenceX;
      updateMeshPosition(rendererObj, statesMesh);
    }
    meshes.startMs = referenceX;
    meshes.endMs = calcRelativeMs(referenceNs, dataTile.endNs);
    updateDataTileMeshVisibility(rendererObj, meshes);
  }

  const data = appendData ?? dataTile.data;
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
    renderedGranularity,
  } = rendererObj;
  rendererObj.syncedTileRangeNs =
    renderedGranularity && getVisibleTileRangeNs(renderedGranularity);
  const dataTiles = renderedGranularity
    ? [
        ...tileStatesCaches[renderedGranularity].getTiles().map((dataTile) => ({
          key: dataTileKey(dataTile),
          getDataTile: () => dataTile,
        })),
        ...getFallbackDataTiles(renderedGranularity),
      ]
    : [];
  const rowOfTile = getRowOfTile(rendererObj.config.kind);

  const keys = new Set<string>();

  // Build meshes for new data tiles, and rebuild the ones built while live
  for (const { key, getDataTile } of dataTiles) {
    keys.add(key);
    const built = dataTileMeshes.get(key);
    if (!rebuild && built && !built.isLive) continue;

    const meshes = built ?? addDataTileMeshes(rendererObj, key);
    buildDataTileMeshes(rendererObj, meshes, getDataTile(), rowOfTile, false);
  }

  // Build unmarked live data tile meshes, e.g. after a granularity change
  if (renderedGranularity && rendererObj.liveDataTileKey === undefined) {
    const liveDataTile = tileStatesCaches[renderedGranularity].getLiveTile();
    // skip a just cached live tile, which is drawn from its kept levels
    if (liveDataTile && !keys.has(dataTileKey(liveDataTile))) {
      appendLiveStates(rendererObj, liveDataTile, liveDataTile.data, true);
    }
  }

  // Evict meshes for data tiles no longer cached and return them to the pool
  // to be reused. Exclude the live data tile's meshes from eviction.
  for (const [key, meshes] of dataTileMeshes) {
    if (keys.has(key) || key === rendererObj.liveDataTileKey) continue;

    for (const level of meshes.levels) tileStatesScene.remove(level.mesh.mesh);
    if (meshes.overlay) composite.overlay?.scene.remove(meshes.overlay.mesh);
    dataTileMeshes.delete(key);
    availableMeshes.push(meshes);
  }
}

/** Whether the visible data tiles changed since the meshes were synced */
export function isVisibleTileRangeChanged(rendererObj: RendererObj) {
  const { renderedGranularity, syncedTileRangeNs } = rendererObj;
  if (!renderedGranularity) return false;
  const rangeNs = getVisibleTileRangeNs(renderedGranularity);
  return (
    rangeNs?.[0] !== syncedTileRangeNs?.[0] ||
    rangeNs?.[1] !== syncedTileRangeNs?.[1]
  );
}

function getVisibleTileRangeNs(
  granularity: TileStatesGranularity,
): NsTsRange | undefined {
  const referenceNs = store.get(referenceNsAtom);
  const visibleRange = store.get(visibleRangeAtom);
  if (referenceNs == null || !visibleRange) return;

  const tileNs = tileStatesTileNs[granularity];
  return [
    (calcAbsoluteNs(referenceNs, visibleRange[0]) / tileNs - 1n) * tileNs,
    (calcAbsoluteNs(referenceNs, visibleRange[1]) / tileNs + 2n) * tileNs,
  ];
}

interface DataTileSource {
  key: string;
  getDataTile: () => TileStatesDataTile;
}

/** Other granularity data tiles to draw where visible ones haven't loaded */
function getFallbackDataTiles(
  granularity: TileStatesGranularity,
): DataTileSource[] {
  const referenceNs = store.get(referenceNsAtom);
  const worldRange = store.get(worldRangeAtom);
  const tileRangeNs = getVisibleTileRangeNs(granularity);
  if (referenceNs == null || !worldRange || !tileRangeNs) return [];
  const [worldStartNs, worldEndNs] = calcAbsoluteNsRange(
    referenceNs,
    worldRange,
  );

  const tileNs = tileStatesTileNs[granularity];
  const [firstStartNs, endNs] = tileRangeNs;

  const fallbacks: DataTileSource[] = [];
  for (let startNs = firstStartNs; startNs < endNs; startNs += tileNs) {
    const tileEndNs = startNs + tileNs;
    // data tiles are never fetched outside the world
    if (startNs >= worldEndNs || tileEndNs <= worldStartNs) continue;
    // cached data tiles, including partial ones, are drawn from their own data
    if (tileStatesCaches[granularity].getTile(startNs)) continue;

    if (granularity === TileStatesGranularityEnum.txn) {
      // its batch data tile, clipped to it
      const batchDataTile = tileStatesCaches.txn_batch.getTile(startNs);
      if (!batchDataTile || batchDataTile.isLive) continue;
      fallbacks.push({
        key: `${TileStatesGranularityEnum.txn_batch}:${startNs}`,
        getDataTile: () => ({
          startNs,
          endNs: tileEndNs - 1n,
          data: clipData(batchDataTile, startNs, tileEndNs, referenceNs),
          meta: null,
        }),
      });
      continue;
    }

    // whichever of its txn data tiles have loaded
    for (
      let txnStartNs = startNs;
      txnStartNs < tileEndNs;
      txnStartNs += tileStatesTileNs.txn
    ) {
      const txnDataTile = tileStatesCaches.txn.getTile(txnStartNs);
      if (!txnDataTile || txnDataTile.isLive) continue;
      fallbacks.push({
        key: dataTileKey(txnDataTile),
        getDataTile: () => txnDataTile,
      });
    }
  }
  return fallbacks;
}

/**
 * Keep the data tile's rects and txn segments overlapping [startNs, endNs),
 * clipped to it. Rect edges are moved to be from startNs.
 */
function clipData(
  dataTile: TileStatesDataTile,
  startNs: bigint,
  endNs: bigint,
  referenceNs: bigint,
): TileStatesData {
  const { data } = dataTile;
  const offsetMs = calcRelativeMs(dataTile.startNs, startNs);
  const durationMs = calcRelativeMs(startNs, endNs);
  const levels = {} as TileStatesData["levels"];
  for (const kind of tileKinds) {
    levels[kind] = data.levels[kind].map((level) =>
      clipLevel(level, offsetMs, durationMs),
    );
  }

  const clipped: TileStatesData = {
    levels,
    referenceSlot: data.referenceSlot,
    txn_slot: [],
    txn_idx: [],
    txn_tile: [],
    txn_start_ms: [],
    txn_end_ms: [],
    txn_error_code: [],
    lthash_slot: [],
    lthash_tile: [],
    lthash_start_ms: [],
    lthash_end_ms: [],
  };
  const startMs = calcRelativeMs(referenceNs, startNs);
  const endMs = calcRelativeMs(referenceNs, endNs);
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

/**
 * Keep rects overlapping [offsetMs, offsetMs + durationMs) of the level's
 * data tile, clipped to it and moved to be from offsetMs
 */
function clipLevel(
  level: MergedLevel,
  offsetMs: number,
  durationMs: number,
): MergedLevel {
  const barStride = MAX_COVERAGE_STATES + 1;
  const edges: number[] = [];
  const bar: number[] = [];
  const slot: number[] = [];
  const pushEdge = (ms: number) => {
    const hi = Math.fround(ms);
    edges.push(hi, ms - hi);
  };
  for (let i = 0; i < level.count; i++) {
    const r = i * 4;
    const startMs = level.edges[r] + level.edges[r + 1] - offsetMs;
    const endMs = level.edges[r + 2] + level.edges[r + 3] - offsetMs;
    if (endMs <= 0 || startMs >= durationMs) continue;
    pushEdge(Math.max(0, startMs));
    pushEdge(Math.min(durationMs, endMs));
    for (let j = 0; j < barStride; j++) bar.push(level.bar[i * barStride + j]);
    slot.push(level.slot[i]);
  }
  return {
    binMs: level.binMs,
    edges: Float32Array.from(edges),
    bar: Uint16Array.from(bar),
    slot: Float32Array.from(slot),
    count: slot.length,
  };
}

export function appendLiveStates(
  rendererObj: RendererObj,
  liveDataTile: TileStatesDataTile,
  newData: TileStatesData,
  isNewDataTile: boolean,
) {
  const { dataTileMeshes } = rendererObj;
  const key = dataTileKey(liveDataTile);

  const built = dataTileMeshes.get(key);
  // a live tile's first windows can have no levels, e.g. past the result limit
  const hasLiveMeshes =
    !isNewDataTile &&
    rendererObj.liveDataTileKey === key &&
    !!built &&
    newData.levels[rendererObj.config.kind].every(
      ({ binMs }, i) => built.levels[i]?.binMs === binMs,
    );
  rendererObj.liveDataTileKey = key;

  const meshes = built ?? addDataTileMeshes(rendererObj, key);
  buildDataTileMeshes(
    rendererObj,
    meshes,
    liveDataTile,
    getRowOfTile(rendererObj.config.kind),
    true,
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
