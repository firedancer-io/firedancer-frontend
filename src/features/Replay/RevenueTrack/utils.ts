import { MAX_WEBGL_PX_RATIO } from "../../../consts.ts";
import * as THREE from "three";
import {
  createRectResources,
  createRectMesh,
  disposeRectResources,
  type RectMesh,
  type RectResources,
  ensureRectCapacity,
  addRectangleToMesh,
  updateRectMeshCounts,
  type TsRange,
  createRenderer,
} from "../../WebGl/webglUtils.ts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers.ts";
import { calcAbsoluteNs, calcRelativeMs, getBucketIdx } from "../utils.ts";
import { msBucketSizes, nsBucketSizes } from "../const.ts";
import type { RevenueType } from "../../../api/entities.ts";
import { omit } from "lodash";
import {
  AGGREGATE_THRESHOLD_MS,
  REVENUE_COLOR,
  maxHeightRatio,
  maxY,
  minY,
  type RevenueScale,
} from "./consts.ts";
import { getRevenueRatio } from "./scale.ts";
import {
  AGG_BUCKET_COUNT_THRESHOLD,
  getGranularity,
  OVERSCAN_BUCKETS,
} from "./useAggRevenueQuery.ts";
import { type RevenueBucketsByGranularity } from "./atoms.ts";
import { getTxnValue, type TxnMetaTile } from "./txnMeta/txnMetaCache.ts";
import {
  createTxnMesh,
  createTxnResources,
  disposeTxnResources,
  ensureTxnCapacity,
  addTxnToMesh,
  setTxnMeshUniforms,
  updateTxnMeshCount,
  type TxnMesh,
  type TxnResources,
} from "./txnMesh.ts";

const MIN_BAR_WIDTH_PX = 1;

export interface RendererObj {
  renderer: THREE.WebGLRenderer;
  aggResources: AggResources;
  nonAggResources: NonAggResources;
  cleanUp: () => void;
}

export interface AggResources {
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  resources: RectResources;
  mesh: RectMesh;
  /**
   * origin ms subtracted from both the camera bounds and
   * the rectangle geometry so the GPU works with small, float32-precise coordinates
   * instead of ~3.4e8.
   * Mesh position x values must be updated when this changes
   */
  cameraReferenceMs: number;
}

export interface NonAggResources {
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  resources: TxnResources;
  availableMeshes: TxnMesh[];
  tileMeshes: Map<bigint, TxnMesh>;
  liveTileStartNs: bigint | undefined;
  liveTile: TxnMetaTile | undefined;
  cameraReferenceMs: number;
}

export const isAggregate = (rangeMs: TsRange) => {
  return rangeMs[1] - rangeMs[0] > AGGREGATE_THRESHOLD_MS;
};

export function setUpRenderers(
  canvasWidth: number,
  canvasHeight: number,
  setUpContextListeners: ContextHelpers["setUpContextListeners"],
  getWasContextLost: ContextHelpers["getWasContextLost"],
): RendererObj | undefined {
  const rendererObj = createRenderer(
    canvasWidth,
    canvasHeight,
    MAX_WEBGL_PX_RATIO,
    setUpContextListeners,
    getWasContextLost,
  );
  if (!rendererObj) return;

  const { renderer, cleanUpRenderer } = rendererObj;
  const aggResources = setUpAggResources(getWasContextLost);
  const nonAggResources = setUpNonAggResources(getWasContextLost);

  const cleanUp = () => {
    aggResources.cleanUpResources();
    nonAggResources.cleanUpResources();
    cleanUpRenderer();
  };

  return {
    renderer,
    aggResources: omit(aggResources, "cleanUpResources"),
    nonAggResources: omit(nonAggResources, "cleanUpResources"),
    cleanUp,
  };
}

export function setUpAggResources(
  getWasContextLost: ContextHelpers["getWasContextLost"],
): AggResources & { cleanUpResources: () => void } {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, maxY, minY, 0.5, 10);
  camera.position.z = 1;

  const resources = createRectResources();
  const mesh = createRectMesh(resources, AGG_BUCKET_COUNT_THRESHOLD);
  scene.add(mesh.mesh);

  const cleanUpResources = () => {
    // If context was lost at some point, its GPU objects are already gone so skip objects disposal,
    // to prevent warnings e.g. WebGL: INVALID_OPERATION: delete: object does not belong to this context
    // Three doesn't restore GPU objects for restored contexts unless there's a render.
    // Remount on restore to reset the context listeners state
    if (!getWasContextLost()) {
      mesh.mesh.geometry.dispose();
      // dispose this chart's own unitQuad / rectMaterial
      disposeRectResources(resources);
    }
  };

  return {
    camera,
    scene,
    resources,
    mesh,
    cameraReferenceMs: 0,
    cleanUpResources,
  };
}

/**
 * Redraw all available data in the visible range at the appropriate granularity
 * level. Returns the max visible (non-overscan) value for axis scaling.
 */
export function drawAggRevenue(
  rendererObj: RendererObj,
  referenceNs: bigint,
  visibleRangeMs: TsRange,
  type: RevenueType,
  aggRevenue: RevenueBucketsByGranularity,
  scale: RevenueScale,
): bigint {
  const granularity = getGranularity(visibleRangeMs[1] - visibleRangeMs[0]);
  const revenueByBucketIdx = aggRevenue.get(granularity);

  const { cameraReferenceMs, mesh } = rendererObj.aggResources;
  const bucketSizeMs = msBucketSizes[granularity];

  /** store mesh positions relative to referenceX. This allows GPU to see small coordinates */
  mesh.referenceX = cameraReferenceMs;
  mesh.mesh.position.x = 0;

  if (!revenueByBucketIdx) {
    updateRectMeshCounts(mesh, 0);
    return 0n;
  }

  const startIdx = getBucketIdx(
    calcAbsoluteNs(referenceNs, visibleRangeMs[0]),
    granularity,
    false,
  );
  const endIdx = getBucketIdx(
    calcAbsoluteNs(referenceNs, visibleRangeMs[1]),
    granularity,
    true,
  );

  // x: relative ts shifted by camera reference to keep coordinates small
  const startX =
    // use bigint to prevent ms rounding imprecision
    calcRelativeMs(referenceNs, BigInt(startIdx) * nsBucketSizes[granularity]) -
    cameraReferenceMs;

  let maxVisibleValue = 0n;
  const toDraw: [value: bigint, x: number][] = [];
  for (
    let bucketIdx = startIdx - OVERSCAN_BUCKETS;
    bucketIdx <= endIdx + OVERSCAN_BUCKETS;
    bucketIdx++
  ) {
    const isOverscan = bucketIdx < startIdx || bucketIdx > endIdx;
    const revenues = revenueByBucketIdx.get(bucketIdx);
    const value = revenues?.[type];
    // don't draw missing or zero values
    if (!value) continue;

    const x = startX + (bucketIdx - startIdx) * bucketSizeMs;
    toDraw.push([value, x]);

    // exclude overscan from max visible value
    if (!isOverscan && value > maxVisibleValue) {
      maxVisibleValue = value;
    }
  }

  ensureRectCapacity(mesh, toDraw.length);

  for (let rectIdx = 0; rectIdx < toDraw.length; rectIdx++) {
    const [value, x] = toDraw[rectIdx];
    addRectangleToMesh(
      mesh,
      rectIdx,
      x,
      minY,
      bucketSizeMs,
      getRevenueRatio(scale, maxVisibleValue, value) * maxHeightRatio,
      REVENUE_COLOR,
    );
  }
  updateRectMeshCounts(mesh, toDraw.length);

  return maxVisibleValue;
}

/**
 * Move camera and update mesh reference x
 */
export function moveAggCamera(
  rendererObj: RendererObj,
  visibleRangeMs: TsRange,
) {
  const { camera, mesh } = rendererObj.aggResources;

  // Store a camera reference to make mesh coordinates smaller for GPU
  const cameraReferenceMs = visibleRangeMs[0];
  rendererObj.aggResources.cameraReferenceMs = cameraReferenceMs;
  camera.left = visibleRangeMs[0] - cameraReferenceMs;
  camera.right = visibleRangeMs[1] - cameraReferenceMs;
  camera.updateProjectionMatrix();

  // Mesh point coordinates are already set. Move them to match camera reference
  // by manipulating mesh position.x
  if (mesh.referenceX != null) {
    mesh.mesh.position.x = mesh.referenceX - cameraReferenceMs;
  }
}

export function setUpNonAggResources(
  getWasContextLost: ContextHelpers["getWasContextLost"],
): NonAggResources & { cleanUpResources: () => void } {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, maxY, minY, 0.5, 10);
  camera.position.z = 1;

  const resources = createTxnResources(REVENUE_COLOR);
  const tileMeshes = new Map<bigint, TxnMesh>();
  const availableMeshes: TxnMesh[] = [];

  const cleanUpResources = () => {
    if (!getWasContextLost()) {
      for (const mesh of tileMeshes.values()) mesh.geometry.dispose();
      for (const mesh of availableMeshes) mesh.geometry.dispose();
      disposeTxnResources(resources);
    }
  };

  return {
    camera,
    scene,
    resources,
    availableMeshes,
    tileMeshes,
    liveTileStartNs: undefined,
    liveTile: undefined,
    cameraReferenceMs: 0,
    cleanUpResources,
  };
}

function buildTxnMeshFromTile(
  mesh: TxnMesh,
  type: RevenueType,
  tile: TxnMetaTile,
  getRelativeMs: (absoluteNs: bigint) => number,
  cameraReferenceMs: number,
  startIdx = 0,
): number {
  if (startIdx === 0) {
    const referenceX = getRelativeMs(tile.startNs);
    mesh.referenceX = referenceX;
    mesh.mesh.position.x = referenceX - cameraReferenceMs;
  }
  const endIdx = appendTxnsToMesh(mesh, type, tile, startIdx, getRelativeMs);
  updateTxnMeshCount(mesh, endIdx);
  return endIdx;
}

function appendTxnsToMesh(
  mesh: TxnMesh,
  type: RevenueType,
  tile: TxnMetaTile,
  startIdx: number,
  getRelativeMs: (absoluteNs: bigint) => number,
): number {
  const referenceX = mesh.referenceX ?? 0;
  const { data: txns } = tile;
  ensureTxnCapacity(mesh, startIdx + txns.txn_exec_idx.length);

  const tileStartMs = getRelativeMs(tile.startNs);
  const tileEndMs = getRelativeMs(tile.endNs);

  let idx = startIdx;
  for (let i = 0; i < txns.txn_exec_idx.length; i++) {
    const value = getTxnValue(txns, i, type);
    if (value <= 0n) continue;

    // A txn that straddles a tile boundary is returned in both tiles'
    // queries. Only include the txn in the mesh if the tile owns its
    // commit end to prevent duplicates.
    const txnEndMs = txns.txn_commit_end_ms[i];
    if (tileEndMs < txnEndMs || txnEndMs < tileStartMs) continue;

    const startMs = txns.txn_load_start_ms[i];
    const endMs = txns.txn_commit_end_ms[i];
    if (endMs <= startMs) continue;

    addTxnToMesh(
      mesh,
      idx,
      startMs - referenceX,
      txns.txn_exec_idx[i],
      endMs - startMs,
      Number(value),
    );
    idx++;
  }

  return idx;
}

/** Acquires a pooled mesh, or creates one, for a tile and adds it to the scene. */
function addTileMesh(nonAgg: NonAggResources, startNs: bigint): TxnMesh {
  const mesh = nonAgg.availableMeshes.pop() ?? createTxnMesh(nonAgg.resources);
  nonAgg.tileMeshes.set(startNs, mesh);
  nonAgg.scene.add(mesh.mesh);
  return mesh;
}

/**
 * Syncs the meshes with the cache. Builds a mesh for each new tile,
 * reusing pooled ones, and returns evicted tiles' meshes to the pool.
 */
export function syncNonAggMeshes(
  rendererObj: RendererObj,
  type: RevenueType,
  getRelativeMs: (absoluteNs: bigint) => number,
  tiles: TxnMetaTile[],
) {
  const {
    scene,
    cameraReferenceMs,
    availableMeshes,
    tileMeshes,
    liveTileStartNs,
  } = rendererObj.nonAggResources;

  const tileIds = new Set<bigint>();

  // Build meshes for new tiles (skip already built ones)
  for (const tile of tiles) {
    tileIds.add(tile.startNs);
    if (tileMeshes.has(tile.startNs)) continue;

    const mesh = addTileMesh(rendererObj.nonAggResources, tile.startNs);
    buildTxnMeshFromTile(mesh, type, tile, getRelativeMs, cameraReferenceMs);
  }

  // Evicts meshes for tiles no longer cached and return them to the pool to
  // be reused. Exclude live tile mesh from eviction.
  for (const [startNs, mesh] of tileMeshes) {
    if (tileIds.has(startNs) || startNs === liveTileStartNs) continue;

    scene.remove(mesh.mesh);
    tileMeshes.delete(startNs);
    availableMeshes.push(mesh);
  }
}

export function refreshNonAggView(
  rendererObj: RendererObj,
  type: RevenueType,
  tiles: TxnMetaTile[],
  getRelativeMs: (absoluteNs: bigint) => number,
  rows: number,
  scale: RevenueScale,
): bigint {
  const { cameraReferenceMs, liveTile, camera, resources } =
    rendererObj.nonAggResources;

  const visibleStartMs = cameraReferenceMs + camera.left;
  const visibleEndMs = cameraReferenceMs + camera.right;
  const visibleDurationMs = camera.right - camera.left;

  const canvasCssPx = rendererObj.renderer.domElement.clientWidth || 1;
  const msPerCssPx = visibleDurationMs / canvasCssPx;
  const minBarMs = MIN_BAR_WIDTH_PX * msPerCssPx;

  let maxValue = 0n;
  const allTiles = liveTile ? [...tiles, liveTile] : tiles;
  for (const tile of allTiles) {
    const visibleMax = visibleTileMax(
      tile,
      type,
      getRelativeMs,
      visibleStartMs,
      visibleEndMs,
    );
    if (maxValue < visibleMax) maxValue = visibleMax;
  }

  setTxnMeshUniforms(resources, Number(maxValue), minBarMs, rows, scale);

  return maxValue;
}

/** Max value of a tile's txns that fall within the visible range. */
function visibleTileMax(
  tile: TxnMetaTile,
  type: RevenueType,
  getRelativeMs: (absoluteNs: bigint) => number,
  visibleStartMs: number,
  visibleEndMs: number,
): bigint {
  const tileStartMs = getRelativeMs(tile.startNs);
  const tileEndMs = getRelativeMs(tile.endNs);
  if (visibleStartMs > tileEndMs || tileStartMs > visibleEndMs) return 0n;

  // Use the precomputed maxima for fully visible tiles
  if (visibleStartMs <= tileStartMs && tileEndMs <= visibleEndMs) {
    return tile.meta[type];
  }

  let maxValue = 0n;
  const { data: txns } = tile;
  for (let i = 0; i < txns.txn_exec_idx.length; i++) {
    const startMs = txns.txn_load_start_ms[i];
    const endMs = txns.txn_commit_end_ms[i];
    if (startMs >= endMs || visibleStartMs > endMs || startMs > visibleEndMs)
      continue;
    const value = getTxnValue(txns, i, type);
    if (maxValue < value) maxValue = value;
  }
  return maxValue;
}

export function appendLiveTxns(
  rendererObj: RendererObj,
  type: RevenueType,
  tile: TxnMetaTile,
  newData: TxnMetaTile["data"],
  isNewTile: boolean,
  getRelativeMs: (absoluteNs: bigint) => number,
) {
  const resources = rendererObj.nonAggResources;
  const { tileMeshes } = resources;

  const hasLiveMesh =
    !isNewTile &&
    resources.liveTileStartNs === tile.startNs &&
    tileMeshes.has(tile.startNs);

  if (!hasLiveMesh) {
    resources.liveTileStartNs = tile.startNs;
    if (!tileMeshes.has(tile.startNs)) addTileMesh(resources, tile.startNs);
  }

  const liveStartNs = resources.liveTileStartNs;
  const mesh = liveStartNs != null ? tileMeshes.get(liveStartNs) : undefined;
  if (!mesh) return;

  resources.liveTile = tile;

  const dataTile: TxnMetaTile = {
    startNs: tile.startNs,
    endNs: tile.endNs,
    data: hasLiveMesh ? newData : tile.data,
    meta: tile.meta,
  };
  buildTxnMeshFromTile(
    mesh,
    type,
    dataTile,
    getRelativeMs,
    resources.cameraReferenceMs,
    hasLiveMesh ? mesh.count : 0,
  );
}

export function clearLiveMarker(rendererObj: RendererObj) {
  const resources = rendererObj.nonAggResources;
  resources.liveTile = undefined;
  resources.liveTileStartNs = undefined;
}

export function clearLiveMarkerIfAdded(
  rendererObj: RendererObj,
  addedTiles: TxnMetaTile[],
) {
  const { liveTileStartNs } = rendererObj.nonAggResources;
  if (liveTileStartNs == null) return;
  if (!addedTiles.some((tile) => tile.startNs === liveTileStartNs)) return;

  clearLiveMarker(rendererObj);
}

export function moveNonAggCamera(
  rendererObj: RendererObj,
  visibleRangeMs: TsRange,
) {
  const { camera, tileMeshes } = rendererObj.nonAggResources;

  const cameraReferenceMs = visibleRangeMs[0];
  rendererObj.nonAggResources.cameraReferenceMs = cameraReferenceMs;
  camera.left = visibleRangeMs[0] - cameraReferenceMs;
  camera.right = visibleRangeMs[1] - cameraReferenceMs;
  camera.updateProjectionMatrix();

  for (const mesh of tileMeshes.values()) {
    if (mesh.referenceX != null) {
      mesh.mesh.position.x = mesh.referenceX - cameraReferenceMs;
    }
  }
}
