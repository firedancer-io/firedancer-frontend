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
  type RgbColor,
  type TsRange,
  createRenderer,
  type NsTsRange,
} from "../../WebGl/webglUtils.ts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers.ts";
import { msBucketSizes, nsBucketSizes } from "../const.ts";
import type { RevenueType } from "../../../api/entities.ts";
import { omit } from "lodash";
import { clampNonZeroValue, logRatio } from "../../../mathUtils.ts";
import { revenueLogBase } from "../../Overview/SlotPerformance/TransactionBarsCard/consts.ts";
import type { RevenueBucketsByGranularity } from "./atoms.ts";
import { getGranularity, OVERSCAN_BUCKETS } from "./useAggRevenueQuery.ts";

// TODO: set reasonable threshold with non-agg data
const AGGREGATE_THRESHOLD_MS = 0;

const REVENUE_COLOR: RgbColor = [116 / 255, 178 / 255, 238 / 255];
const REVENUE_OPACITY = 1;

const minY = 0;
const minNonZeroY = 0.1;
const maxY = 5;

export interface RendererObj {
  renderer: THREE.WebGLRenderer;
  aggResources: AggResources;
  // TODO: add nonAggResources
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
  // TODO: set up non-agg resources

  const cleanUp = () => {
    aggResources.cleanUpResources();
    // TODO: add non-agg clean up
    cleanUpRenderer();
  };

  return {
    renderer,
    aggResources: omit(aggResources, "cleanUpResources"),
    cleanUp,
  };
}

export function setUpAggResources(
  getWasContextLost: ContextHelpers["getWasContextLost"],
): AggResources & { cleanUpResources: () => void } {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 0, maxY, minY, 0.5, 10);
  camera.position.z = 1;

  const resources = createWebglResources(REVENUE_OPACITY);
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

function getRevenueRatio(maxValue: bigint, value: bigint) {
  if (maxValue === 0n) return 0;
  const ratio = 1 / logRatio(Number(maxValue), Number(value), revenueLogBase);
  return clampNonZeroValue(ratio, minNonZeroY, maxY);
}

/**
 * Redraw all available data in the visible range at the appropriate granularity level
 */
export function drawAggRevenue(
  rendererObj: RendererObj,
  absoluteVisibleRange: NsTsRange,
  getRelativeMs: (absoluteNs: bigint) => number,
  type: RevenueType,
  aggRevenue: RevenueBucketsByGranularity,
) {
  const granularity = getGranularity(
    absoluteVisibleRange[1] - absoluteVisibleRange[0],
  );
  const revenueByBucketIdx = aggRevenue.get(granularity);
  if (!revenueByBucketIdx) return;

  const { cameraReferenceMs, mesh } = rendererObj.aggResources;
  const bucketSizeNs = nsBucketSizes[granularity];
  const startIdx = Number(absoluteVisibleRange[0] / bucketSizeNs);
  // don't include next bucket if on boundary
  const endIdx = Number((absoluteVisibleRange[1] - 1n) / bucketSizeNs);

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
    if (!value) continue;

    const startNs = BigInt(bucketIdx) * bucketSizeNs;
    // shift start by camera reference to keep coordinates small
    const x = getRelativeMs(startNs) - cameraReferenceMs;
    toDraw.push([value, x]);

    // exclude overscan from max visible value
    if (!isOverscan && value > maxVisibleValue) {
      maxVisibleValue = value;
    }
  }

  const width = msBucketSizes[granularity];
  for (let rectIdx = 0; rectIdx < toDraw.length; rectIdx++) {
    const [value, x] = toDraw[rectIdx];
    addRectangleToMesh(
      mesh,
      rectIdx,
      x,
      minY,
      width,
      getRevenueRatio(maxVisibleValue, value),
      REVENUE_COLOR,
    );
  }
  ensureCapacity(mesh, toDraw.length);
  updateRectMeshCounts(mesh, toDraw.length);

  /** store mesh positions relative to referenceX. This allows GPU to see small coordinates */
  mesh.referenceX = cameraReferenceMs;
  mesh.mesh.position.x = 0;
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
