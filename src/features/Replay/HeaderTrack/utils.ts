import { msBucketSizes, nsBucketSizes } from "../const";
import * as THREE from "three";
import { MAX_WEBGL_PX_RATIO } from "../../../consts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers";
import {
  createRectResources,
  createRectMesh,
  disposeRectResources,
  createRenderer,
  ensureRectCapacity,
  addRectangleToMesh,
  updateRectMeshCounts,
  convertToWebGlColor,
  type RgbColor,
  type TsRange,
} from "../../WebGl/webglUtils";
import {
  HEADER_AGG_THRESHOLD_MS,
  type AggRendererResources,
  type RendererObj,
} from "./const";
import { omit } from "lodash";
import type { SlotBucketsByGranularity } from "./aggAtoms";
import { getAggGranularity, OVERSCAN_BUCKETS } from "./useAggHeaderQuery";
import { calcAbsoluteNs, calcRelativeMs, getBucketIdx } from "../utils";
import {
  replayAggHeaderBackgroundColor,
  replayMiniMapSkippedColor,
} from "../../../colors";

const minY = 0;
const maxY = 1;

const backgroundColor = convertToWebGlColor(replayAggHeaderBackgroundColor);
const skippedColor = convertToWebGlColor(replayMiniMapSkippedColor);

const minSkippedRatio = 0.3;

function getBucketColor(
  slotCount: number,
  skippedCount: number | null,
): RgbColor {
  const skipped = skippedCount ?? 0;
  const skippedRatio = skipped
    ? Math.max(minSkippedRatio, skipped / slotCount)
    : 0;

  const notSkippedRatio = 1 - skippedRatio;
  return [
    backgroundColor[0] * notSkippedRatio + skippedColor[0] * skippedRatio,
    backgroundColor[1] * notSkippedRatio + skippedColor[1] * skippedRatio,
    backgroundColor[2] * notSkippedRatio + skippedColor[2] * skippedRatio,
  ];
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
) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, maxY, minY, 0.5, 10);
  camera.position.z = 1;

  const resources = createRectResources(1);
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
 * Redraw all available data in the visible range at the appropriate granularity level
 */
export function drawAggSlots(
  rendererObj: RendererObj,
  referenceNs: bigint,
  visibleRange: TsRange,
  aggSlots: SlotBucketsByGranularity,
) {
  const granularity = getAggGranularity(visibleRange[1] - visibleRange[0]);
  const slotsByBucketIdx = aggSlots.get(granularity);
  if (!slotsByBucketIdx) return;

  const { cameraReferenceMs, mesh } = rendererObj.aggResources;
  const bucketSizeMs = msBucketSizes[granularity];

  const startIdx = getBucketIdx(
    calcAbsoluteNs(referenceNs, visibleRange[0]),
    granularity,
    false,
  );
  const endIdx = getBucketIdx(
    calcAbsoluteNs(referenceNs, visibleRange[1]),
    granularity,
    true,
  );

  // x: relative ts shifted by camera reference to keep coordinates small
  const startX =
    // use bigint to prevent ms rounding imprecision
    calcRelativeMs(referenceNs, BigInt(startIdx) * nsBucketSizes[granularity]) -
    cameraReferenceMs;

  const height = maxY - minY;

  // one rectangle per bucket
  const firstBucketIdx = startIdx - OVERSCAN_BUCKETS;
  const lastBucketIdx = endIdx + OVERSCAN_BUCKETS;
  ensureRectCapacity(mesh, lastBucketIdx - firstBucketIdx + 1);

  let rectIdx = 0;
  for (
    let bucketIdx = firstBucketIdx;
    bucketIdx <= lastBucketIdx;
    bucketIdx++
  ) {
    const slotCounts = slotsByBucketIdx.get(bucketIdx);
    if (!slotCounts) continue;

    const { start_slot, end_slot, skipped } = slotCounts;
    const slotCount =
      start_slot != null && end_slot != null && end_slot >= start_slot
        ? end_slot - start_slot + 1
        : 0;

    // don't draw empty buckets
    if (slotCount === 0) continue;

    const x = startX + (bucketIdx - startIdx) * bucketSizeMs;

    const color = getBucketColor(slotCount, skipped);

    addRectangleToMesh(mesh, rectIdx, x, minY, bucketSizeMs, height, color);

    rectIdx++;
  }
  updateRectMeshCounts(mesh, rectIdx);

  /** store mesh positions relative to referenceX. This allows GPU to see small coordinates */
  mesh.referenceX = cameraReferenceMs;
  mesh.mesh.position.x = 0;
}

/**
 * Move camera and update mesh reference x
 */
export function moveAggCamera(
  resources: AggRendererResources,
  visibleRangeMs: TsRange,
) {
  const { camera, mesh } = resources;

  // Store a camera reference to make mesh coordinates smaller for GPU
  const cameraReferenceMs = visibleRangeMs[0];
  resources.cameraReferenceMs = cameraReferenceMs;
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
  return rangeMs[1] - rangeMs[0] > HEADER_AGG_THRESHOLD_MS;
}
