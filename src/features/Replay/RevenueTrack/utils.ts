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
  updateRectMeshCounts,
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
import { getPaidTxnValue, type TxnMetaBucket } from "./txnMeta.ts";
import {
  createTxnMesh,
  disposeTxnMesh,
  ensureTxnCapacity,
  setTxnInstance,
  updateTxnMeshCount,
  SCALE_UNIFORM,
  type TxnMesh,
} from "./txnMesh.ts";
import {
  AGGREGATE_THRESHOLD_MS,
  REVENUE_COLOR,
  viewMinY,
  minHeightRatio,
  viewMaxY,
  revenueExpBase,
  type RevenueScale,
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
  cameraReferenceMs: number;
}

export interface NonAggResources {
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  mesh: TxnMesh;
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
  const camera = new THREE.OrthographicCamera(
    0,
    0,
    viewMaxY,
    viewMinY,
    0.5,
    10,
  );
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

export function setUpNonAggResources(
  getWasContextLost: ContextHelpers["getWasContextLost"],
): NonAggResources & { cleanUpResources: () => void } {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(
    0,
    0,
    viewMaxY,
    viewMinY,
    0.5,
    10,
  );
  camera.position.z = 1;

  const mesh = createTxnMesh(REVENUE_COLOR);

  scene.add(mesh.mesh);

  const cleanUpResources = () => {
    if (!getWasContextLost()) {
      disposeTxnMesh(mesh);
    }
  };

  return {
    camera,
    scene,
    mesh,
    cameraReferenceMs: 0,
    cleanUpResources,
  };
}

export function getRevenueRatio(
  scale: RevenueScale,
  maxValue: bigint,
  value: bigint,
) {
  if (maxValue === 0n || value <= 0n) return 0;

  const normalized = Number(value) / Number(maxValue);

  // Height as a ratio of usable height: [minHeightRatio, 1]
  let ratio: number;
  switch (scale) {
    case "linear":
      ratio = normalized;
      break;
    case "power":
      ratio = normalized * normalized;
      break;
    case "exp":
      ratio =
        (Math.exp(revenueExpBase * normalized) - 1) /
        (Math.exp(revenueExpBase) - 1);
      break;
    case "banks":
      ratio = 1 / logRatio(Number(maxValue), Number(value), revenueLogBase);
      break;
  }
  return clampNonZeroValue(ratio, minHeightRatio, 1);
}

export function invertRevenueRatio(
  scale: RevenueScale,
  heightRatio: number,
  maxValue: number,
): number {
  switch (scale) {
    case "linear":
      return maxValue * heightRatio;
    case "power":
      return maxValue * Math.sqrt(heightRatio);
    case "exp":
      return (
        (maxValue *
          Math.log(1 + heightRatio * (Math.exp(revenueExpBase) - 1))) /
        revenueExpBase
      );
    case "banks":
      return maxValue * Math.pow(revenueLogBase, -1 / heightRatio);
  }
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

  mesh.referenceX = cameraReferenceMs;
  mesh.mesh.position.x = 0;

  const dataCount = maxValue === 0n ? 0 : data.length;
  ensureCapacity(mesh, dataCount);
  updateRectMeshCounts(mesh, dataCount);

  for (let rectangleIdx = 0; rectangleIdx < dataCount; rectangleIdx++) {
    const [value, startMs] = data[rectangleIdx];
    const endMs = startMs + bucketMs;
    addRectangleToMesh(
      mesh,
      rectangleIdx,
      startMs - mesh.referenceX,
      viewMinY,
      endMs - startMs,
      getRevenueRatio(scale, maxValue, value),
      REVENUE_COLOR,
    );
  }

  return maxValue;
}

export function moveAggCamera(
  rendererObj: RendererObj,
  visibleRangeMs: TsRange,
) {
  const { camera, mesh } = rendererObj.aggResources;

  const cameraReferenceMs = visibleRangeMs[0];
  rendererObj.aggResources.cameraReferenceMs = cameraReferenceMs;
  camera.left = visibleRangeMs[0] - cameraReferenceMs;
  camera.right = visibleRangeMs[1] - cameraReferenceMs;
  camera.updateProjectionMatrix();

  if (mesh.referenceX != null) {
    mesh.mesh.position.x = mesh.referenceX - cameraReferenceMs;
  }
}

export function isAggregate(rangeMs: TsRange) {
  return rangeMs[1] - rangeMs[0] > AGGREGATE_THRESHOLD_MS;
}

export function buildNonAggBuffer(
  rendererObj: RendererObj,
  type: RevenueType,
  buckets: TxnMetaBucket[],
  getRelativeMs: (absoluteNs: bigint) => number,
  rows: number,
) {
  const { mesh } = rendererObj.nonAggResources;

  const drawn = new Set<string>();
  let txnTotal = 0;
  let minStartMs = Infinity;
  for (const bucket of buckets) {
    const { txns } = bucket;
    for (let i = 0; i < txns.txn_exec_idx.length; i++) {
      if (getPaidTxnValue(txns, i, type) <= 0n) continue;

      const key = `${txns.slot[i]}:${txns.txn_idx[i]}`;
      if (drawn.has(key)) continue;
      drawn.add(key);

      const startMs = getRelativeMs(txns.txn_load_start_nanos[i]);
      const endMs = getRelativeMs(txns.txn_commit_end_nanos[i]);
      if (endMs <= startMs) continue;
      if (rows > 1) {
        const bank = txns.txn_exec_idx[i];
        if (bank < 0 || bank >= rows) continue;
      }
      if (startMs < minStartMs) minStartMs = startMs;
      txnTotal++;
    }
  }

  const referenceX = minStartMs === Infinity ? 0 : minStartMs;
  mesh.referenceX = referenceX;
  mesh.mesh.position.x =
    referenceX - rendererObj.nonAggResources.cameraReferenceMs;

  ensureTxnCapacity(mesh, txnTotal);

  drawn.clear();
  let idx = 0;
  for (const bucket of buckets) {
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

      let row = 0;
      if (rows > 1) {
        const bank = txns.txn_exec_idx[i];
        if (bank < 0 || bank >= rows) continue;
        row = bank;
      }

      setTxnInstance(
        mesh,
        idx,
        startMs - referenceX,
        endMs - startMs,
        Number(value),
        row,
      );
      idx++;
    }
  }

  updateTxnMeshCount(mesh, idx);
}

export function refreshNonAggView(
  rendererObj: RendererObj,
  type: RevenueType,
  buckets: TxnMetaBucket[],
  getRelativeMs: (absoluteNs: bigint) => number,
  minWidthPx: number,
  rows: number,
  scale: RevenueScale,
): bigint {
  const { cameraReferenceMs, mesh, camera } = rendererObj.nonAggResources;

  const visibleStartMs = cameraReferenceMs + camera.left;
  const visibleEndMs = cameraReferenceMs + camera.right;
  const visibleDurationMs = camera.right - camera.left;

  const canvasCssPx = rendererObj.renderer.domElement.clientWidth || 1;
  const deviceRatio = rendererObj.renderer.getPixelRatio();
  const msPerPx = visibleDurationMs / (canvasCssPx * deviceRatio);
  const minBarMs = minWidthPx * msPerPx;

  let maxValue = 0n;
  for (const bucket of buckets) {
    const bucketStartMs = getRelativeMs(bucket.startNs);
    const bucketEndMs = getRelativeMs(bucket.endNs);
    if (visibleStartMs > bucketEndMs || bucketStartMs > visibleEndMs) continue;

    if (bucketStartMs >= visibleStartMs && bucketEndMs <= visibleEndMs) {
      if (bucket.maxima[type] > maxValue) maxValue = bucket.maxima[type];
      continue;
    }

    const { txns } = bucket;
    for (let i = 0; i < txns.txn_exec_idx.length; i++) {
      const startMs = getRelativeMs(txns.txn_load_start_nanos[i]);
      const endMs = getRelativeMs(txns.txn_commit_end_nanos[i]);
      if (startMs >= endMs || visibleStartMs > endMs || startMs > visibleEndMs)
        continue;
      const value = getPaidTxnValue(txns, i, type);
      if (value > maxValue) maxValue = value;
    }
  }

  const { uniforms } = mesh.material;
  uniforms.uMaxValue.value = Number(maxValue);
  uniforms.uMinBarMs.value = minBarMs;
  uniforms.uRows.value = Math.max(rows, 1);
  uniforms.uScale.value = SCALE_UNIFORM[scale];

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
