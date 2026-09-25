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
import { msBucketSizes } from "../const.ts";
import type { RevenueType } from "../../../api/entities.ts";
import type { AggRevenue } from "../../../api/types.ts";
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
import { AGG_BUCKET_COUNT_THRESHOLD } from "./useAggRevenueQuery.ts";
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
  /** One mesh per cached historical tile.
   * They are built once and returned to the available meshes pool on eviction. */
  historicalMeshes: Map<bigint, TxnMesh>;
  /** Mesh for the single live tile. It is rebuilt on each `live` delta. */
  liveMesh: TxnMesh;
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

export function drawAggRevenue(
  rendererObj: RendererObj,
  type: RevenueType,
  aggRevenue: AggRevenue,
  getRelativeMs: (absoluteNs: bigint) => number,
  scale: RevenueScale,
) {
  const { granularity, reference_ts_ns } = aggRevenue;
  const referenceMs = getRelativeMs(reference_ts_ns);
  const bucketMs = msBucketSizes[granularity];

  let maxValue = 0n;
  const data = aggRevenue[type].reduce<[value: bigint, startMs: number][]>(
    (acc, value, i) => {
      if (value != null) {
        const startMs = referenceMs + i * bucketMs;
        acc.push([value, startMs]);

        if (value > maxValue) {
          maxValue = value;
        }
      }
      return acc;
    },
    [],
  );

  const { cameraReferenceMs, mesh } = rendererObj.aggResources;

  /** store mesh positions relative to referenceX. This allows GPU to see small coordinates */
  mesh.referenceX = cameraReferenceMs;
  mesh.mesh.position.x = 0;

  // draw nothing if max value is 0
  const dataCount = maxValue === 0n ? 0 : data.length;
  ensureRectCapacity(mesh, dataCount);
  updateRectMeshCounts(mesh, dataCount);

  for (let rectangleIdx = 0; rectangleIdx < dataCount; rectangleIdx++) {
    const [value, startMs] = data[rectangleIdx];
    const endMs = startMs + bucketMs;
    addRectangleToMesh(
      mesh,
      rectangleIdx,
      startMs - mesh.referenceX,
      minY,
      endMs - startMs,
      getRevenueRatio(scale, maxValue, value) * maxHeightRatio,
      REVENUE_COLOR,
    );
  }

  return maxValue;
}

/**
 * Move camera and and update camera and mesh reference x
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
  const liveMesh = createTxnMesh(resources);
  scene.add(liveMesh.mesh);
  const historicalMeshes = new Map<bigint, TxnMesh>();
  const availableMeshes: TxnMesh[] = [];

  const cleanUpResources = () => {
    if (!getWasContextLost()) {
      for (const mesh of historicalMeshes.values()) mesh.geometry.dispose();
      for (const mesh of availableMeshes) mesh.geometry.dispose();
      liveMesh.geometry.dispose();
      disposeTxnResources(resources);
    }
  };

  return {
    camera,
    scene,
    resources,
    availableMeshes,
    historicalMeshes,
    liveMesh,
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
) {
  const referenceX = getRelativeMs(tile.startNs);
  mesh.referenceX = referenceX;
  mesh.mesh.position.x = referenceX - cameraReferenceMs;

  const { data: txns } = tile;
  ensureTxnCapacity(mesh, txns.txn_exec_idx.length);

  let idx = 0;
  for (let i = 0; i < txns.txn_exec_idx.length; i++) {
    const value = getTxnValue(txns, i, type);
    if (value <= 0n) continue;

    // A txn that straddles a tile boundary is returned in both tiles'
    // queries. Only include the txn in the mesh if the tile owns its
    // load-start to prevent duplicates.
    const loadStart = txns.txn_load_start_nanos[i];
    if (tile.endNs < loadStart || loadStart < tile.startNs) continue;

    const startMs = getRelativeMs(loadStart);
    const endMs = getRelativeMs(txns.txn_commit_end_nanos[i]);
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

  updateTxnMeshCount(mesh, idx);
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
    resources,
    availableMeshes,
    historicalMeshes,
  } = rendererObj.nonAggResources;

  const tileIds = new Set<bigint>();

  // Build meshes for new tiles (skip already built ones)
  for (const tile of tiles) {
    tileIds.add(tile.startNs);
    if (historicalMeshes.has(tile.startNs)) continue;

    const mesh = availableMeshes.pop() ?? createTxnMesh(resources);
    historicalMeshes.set(tile.startNs, mesh);
    scene.add(mesh.mesh);
    buildTxnMeshFromTile(mesh, type, tile, getRelativeMs, cameraReferenceMs);
  }

  // Evicts meshes for tiles no longer cached (return to the pool to be reused)
  for (const [startNs, mesh] of historicalMeshes) {
    if (tileIds.has(startNs)) continue;

    scene.remove(mesh.mesh);
    historicalMeshes.delete(startNs);
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
    const startMs = getRelativeMs(txns.txn_load_start_nanos[i]);
    const endMs = getRelativeMs(txns.txn_commit_end_nanos[i]);
    if (startMs >= endMs || visibleStartMs > endMs || startMs > visibleEndMs)
      continue;
    const value = getTxnValue(txns, i, type);
    if (maxValue < value) maxValue = value;
  }
  return maxValue;
}

export function drawLiveTile(
  rendererObj: RendererObj,
  type: RevenueType,
  tile: TxnMetaTile,
  getRelativeMs: (absoluteNs: bigint) => number,
) {
  const resources = rendererObj.nonAggResources;
  resources.liveTile = tile;
  buildTxnMeshFromTile(
    resources.liveMesh,
    type,
    tile,
    getRelativeMs,
    resources.cameraReferenceMs,
  );
}

export function clearLiveTile(rendererObj: RendererObj) {
  const resources = rendererObj.nonAggResources;
  resources.liveTile = undefined;
  updateTxnMeshCount(resources.liveMesh, 0);
}

export function moveNonAggCamera(
  rendererObj: RendererObj,
  visibleRangeMs: TsRange,
) {
  const { camera, historicalMeshes, liveMesh } = rendererObj.nonAggResources;

  const cameraReferenceMs = visibleRangeMs[0];
  rendererObj.nonAggResources.cameraReferenceMs = cameraReferenceMs;
  camera.left = visibleRangeMs[0] - cameraReferenceMs;
  camera.right = visibleRangeMs[1] - cameraReferenceMs;
  camera.updateProjectionMatrix();

  for (const mesh of historicalMeshes.values()) {
    if (mesh.referenceX != null) {
      mesh.mesh.position.x = mesh.referenceX - cameraReferenceMs;
    }
  }
  if (liveMesh.referenceX != null) {
    liveMesh.mesh.position.x = liveMesh.referenceX - cameraReferenceMs;
  }
}
