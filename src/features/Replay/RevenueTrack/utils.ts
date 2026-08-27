import { MAX_WEBGL_PX_RATIO } from "../../../consts.ts";
import * as THREE from "three";
import {
  createWebglResources,
  createRectMesh,
  disposeWebglResources,
  type RectMesh,
  type WebglResources,
  ensureCapacity,
  addRectangleToMesh,
  updateRectMeshCount,
  type RgbaColor,
  type TsRange,
  createRenderer,
} from "../../WebGl/webglUtils.ts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers.ts";
import { msBucketSizes } from "../const.ts";
import type { RevenueType } from "../../../api/entities.ts";
import type { AggRevenue } from "../../../api/types.ts";
import { omit } from "lodash";
import { clampNonZeroValue, logRatio } from "../../../mathUtils.ts";
import { revenueLogBase } from "../../Overview/SlotPerformance/TransactionBarsCard/consts.ts";
import { bigIntRatio } from "../../Overview/SlotPerformance/TransactionBarsCard/txnBarsPluginUtils.ts";
import {
  getPaidTxnValue,
  type TxnMetaBucket,
  type TxnMetaColumns,
} from "./txnMeta.ts";
import {
  AGGREGATE_THRESHOLD_MS,
  REVENUE_COLOR,
  minY,
  minNonZeroY,
  aggMaxY,
  nonAggMaxY,
  nonAggMinHeightRatio,
  nonAggMaxHeightRatio,
  nonAggMinAlpha,
  nonAggMaxAlpha,
} from "./consts.ts";

export interface RendererObj {
  renderer: THREE.WebGLRenderer;
  aggResources: AggResources;
  nonAggResources: NonAggResources;
  cleanUp: () => void;
}

export interface AggResources {
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  resources: WebglResources;
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
  resources: WebglResources;
  mesh: RectMesh;
  cameraReferenceMs: number;
}

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
  const camera = new THREE.OrthographicCamera(0, 0, aggMaxY, minY, 0.5, 10);
  camera.position.z = 1;

  const resources = createWebglResources();
  const mesh = createRectMesh(resources);

  scene.add(mesh.mesh);

  const cleanUpResources = () => {
    // If context was lost at some point, its GPU objects are already gone so skip objects disposal,
    // to prevent warnings e.g. WebGL: INVALID_OPERATION: delete: object does not belong to this context
    // Three doesn't restore GPU objects for restored contexts unless there's a render.
    // Remount on restore to reset the context listeners state
    if (!getWasContextLost()) {
      mesh.mesh.geometry.dispose();
      // dispose this chart's own unitQuad / sharedMaterial
      disposeWebglResources(resources);
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

export function setUpNonAggResources(
  getWasContextLost: ContextHelpers["getWasContextLost"],
): NonAggResources & { cleanUpResources: () => void } {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 0, nonAggMaxY, minY, 0.5, 10);
  camera.position.z = 1;

  const resources = createWebglResources();
  const mesh = createRectMesh(resources);

  scene.add(mesh.mesh);

  const cleanUpResources = () => {
    if (!getWasContextLost()) {
      mesh.mesh.geometry.dispose();
      disposeWebglResources(resources);
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

function getRevenueRatio(
  maxValue: bigint,
  value: bigint,
  min: number,
  max: number,
) {
  if (maxValue === 0n) return 0;
  const ratio = 1 / logRatio(Number(maxValue), Number(value), revenueLogBase);
  return clampNonZeroValue(ratio, min, max);
}

function getNonAggRevenueAlpha(maxValue: bigint, value: bigint) {
  if (maxValue === 0n) return 0;
  return Math.max(
    Math.min(nonAggMaxAlpha, bigIntRatio(value, maxValue, 4)),
    nonAggMinAlpha,
  );
}

export function drawAggRevenue(
  rendererObj: RendererObj,
  type: RevenueType,
  aggRevenue: AggRevenue,
  getRelativeMs: (absoluteNs: bigint) => number,
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
  if (mesh.referenceX == null) {
    mesh.referenceX = cameraReferenceMs;
  }
  mesh.mesh.position.x = mesh.referenceX - cameraReferenceMs;

  // draw nothing if max value is 0
  const dataCount = maxValue === 0n ? 0 : data.length;
  ensureCapacity(mesh, dataCount);
  updateRectMeshCount(mesh, dataCount);

  for (let rectangleIdx = 0; rectangleIdx < dataCount; rectangleIdx++) {
    const [value, startMs] = data[rectangleIdx];
    const endMs = startMs + bucketMs;
    addRectangleToMesh(
      mesh,
      rectangleIdx,
      startMs - mesh.referenceX,
      minY,
      endMs - startMs,
      getRevenueRatio(maxValue, value, minNonZeroY, aggMaxY),
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

export function isAggregate(rangeMs: TsRange) {
  return rangeMs[1] - rangeMs[0] > AGGREGATE_THRESHOLD_MS;
}

export function drawNonAggRevenue(
  rendererObj: RendererObj,
  type: RevenueType,
  buckets: TxnMetaBucket[],
  getRelativeMs: (absoluteNs: bigint) => number,
  minWidthPx: number,
  rows: number,
) {
  const { cameraReferenceMs, mesh, camera } = rendererObj.nonAggResources;

  const visibleStartMs = cameraReferenceMs + camera.left;
  const visibleEndMs = cameraReferenceMs + camera.right;
  const visibleDurationMs = camera.right - camera.left;

  const canvasCssPx = rendererObj.renderer.domElement.clientWidth || 1;
  const deviceRatio = rendererObj.renderer.getPixelRatio();
  const msPerPx = visibleDurationMs / (canvasCssPx * deviceRatio);
  const minBarMs = minWidthPx * msPerPx;
  const rowHeight = nonAggMaxY / rows;

  const isTxnVisible = (txns: TxnMetaColumns, i: number) => {
    const startMs = getRelativeMs(txns.txn_load_start_nanos[i]);
    const endMs = getRelativeMs(txns.txn_commit_end_nanos[i]);
    return (
      startMs < endMs && visibleStartMs <= endMs && startMs <= visibleEndMs
    );
  };

  let maxValue = 0n;
  let txnTotal = 0;
  for (const bucket of buckets) {
    const bucketStartMs = getRelativeMs(bucket.startNs);
    const bucketEndMs = getRelativeMs(bucket.endNs);
    // Skip buckets outside of the visible range
    if (visibleStartMs > bucketEndMs || bucketStartMs > visibleEndMs) continue;

    // Use bucket maxima if bucket lies entirely in visible range
    if (bucketStartMs >= visibleStartMs && bucketEndMs <= visibleEndMs) {
      if (bucket.maxima[type] > maxValue) maxValue = bucket.maxima[type];
      txnTotal += bucket.txns.txn_exec_idx.length;
      continue;
    }

    // Use only transactions within visible range if bucket stradles it
    const { txns } = bucket;
    for (let i = 0; i < txns.txn_exec_idx.length; i++) {
      if (!isTxnVisible(txns, i)) continue;
      txnTotal++;
      const value = getPaidTxnValue(txns, i, type);
      if (value > maxValue) maxValue = value;
    }
  }

  if (mesh.referenceX == null) {
    mesh.referenceX = cameraReferenceMs;
  }
  mesh.mesh.position.x = mesh.referenceX - cameraReferenceMs;

  const dataCount = maxValue === 0n ? 0 : txnTotal;
  ensureCapacity(mesh, dataCount);

  // Dedup by (slot, txn_idx) since a bucket straddling txn appears in two buckets.
  const drawn = new Set<string>();
  let rectangleIdx = 0;
  for (const bucket of buckets) {
    const bucketStartMs = getRelativeMs(bucket.startNs);
    const bucketEndMs = getRelativeMs(bucket.endNs);
    if (visibleStartMs > bucketEndMs || bucketStartMs > visibleEndMs) continue;

    const { txns } = bucket;
    for (let i = 0; i < txns.txn_exec_idx.length; i++) {
      const value = getPaidTxnValue(txns, i, type);
      if (value <= 0n) continue;

      const key = `${txns.slot[i]}:${txns.txn_idx[i]}`;
      if (drawn.has(key)) continue;
      drawn.add(key);

      const startMs = getRelativeMs(txns.txn_load_start_nanos[i]);
      const endMs = getRelativeMs(txns.txn_commit_end_nanos[i]);
      if (endMs <= startMs) continue;
      if (visibleStartMs > endMs || startMs > visibleEndMs) continue;

      const widthMs = Math.max(endMs - startMs, minBarMs);

      const color: RgbaColor = [
        REVENUE_COLOR[0],
        REVENUE_COLOR[1],
        REVENUE_COLOR[2],
        getNonAggRevenueAlpha(maxValue, value),
      ];

      let yPosForRow = minY;
      if (rows > 1) {
        const bank = txns.txn_exec_idx[i];
        if (bank < 0 || bank >= rows) continue;
        yPosForRow = (rows - 1 - bank) * rowHeight;
      }

      addRectangleToMesh(
        mesh,
        rectangleIdx,
        startMs - mesh.referenceX,
        yPosForRow,
        widthMs,
        rowHeight *
          getRevenueRatio(
            maxValue,
            value,
            nonAggMinHeightRatio,
            nonAggMaxHeightRatio,
          ),
        color,
      );
      rectangleIdx++;
    }
  }

  updateRectMeshCount(mesh, rectangleIdx);

  return maxValue;
}

export function moveNonAggCamera(
  rendererObj: RendererObj,
  visibleRangeMs: TsRange,
) {
  const { camera, mesh } = rendererObj.nonAggResources;

  const cameraReferenceMs = visibleRangeMs[0];
  rendererObj.nonAggResources.cameraReferenceMs = cameraReferenceMs;
  camera.left = visibleRangeMs[0] - cameraReferenceMs;
  camera.right = visibleRangeMs[1] - cameraReferenceMs;
  camera.updateProjectionMatrix();

  if (mesh.referenceX != null) {
    mesh.mesh.position.x = mesh.referenceX - cameraReferenceMs;
  }
}
