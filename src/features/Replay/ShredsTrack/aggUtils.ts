import * as THREE from "three";
import { updateCameraYRange } from "../../Shreds/WebGl/drawUtils";
import { msBucketSizes, nsBucketSizes } from "../const";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers";
import {
  createRectResources,
  createRectMesh,
  disposeRectResources,
  ensureRectCapacity,
  addRectangleToMesh,
  updateRectMeshCounts,
  type TsRange,
} from "../../WebGl/webglUtils";
import {
  shredEventSeries,
  type AggRendererResources,
  type RendererObj,
} from "./const";
import { type ShredBucketsByGranularity } from "./atoms";
import { getAggGranularity, OVERSCAN_BUCKETS } from "./useAggShredsQuery";
import { calcAbsoluteNs, calcRelativeMs, getBucketIdx } from "../utils";

export function setUpAggResources(
  getWasContextLost: ContextHelpers["getWasContextLost"],
) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, 0.5, 10);
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
export function drawAggShreds(
  rendererObj: RendererObj,
  referenceNs: bigint,
  visibleRange: TsRange,
  aggShreds: ShredBucketsByGranularity,
) {
  const granularity = getAggGranularity(visibleRange[1] - visibleRange[0]);

  const eventsByBucketIdx = aggShreds.get(granularity);
  if (!eventsByBucketIdx) return;

  const { camera, cameraReferenceMs, mesh } = rendererObj.aggResources;
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

  let maxVisibleShredsPerBucket = 0;
  let rectIdx = 0;
  for (
    let bucketIdx = startIdx - OVERSCAN_BUCKETS;
    bucketIdx <= endIdx + OVERSCAN_BUCKETS;
    bucketIdx++
  ) {
    const eventCounts = eventsByBucketIdx.get(bucketIdx);
    if (!eventCounts) continue;

    const isOverscan = bucketIdx < startIdx || bucketIdx > endIdx;
    const x = startX + (bucketIdx - startIdx) * bucketSizeMs;

    let shredsInBucket = 0;
    for (const { type, webGlColor } of shredEventSeries) {
      const count = eventCounts[type];
      if (!count) continue;

      ensureRectCapacity(mesh, rectIdx + 1);
      addRectangleToMesh(
        mesh,
        rectIdx,
        x,
        -shredsInBucket - count,
        bucketSizeMs,
        count,
        webGlColor,
      );

      shredsInBucket += count;
      rectIdx++;
    }

    // exclude overscan from max visible value
    if (!isOverscan && shredsInBucket > maxVisibleShredsPerBucket) {
      maxVisibleShredsPerBucket = shredsInBucket;
    }
  }

  // keep the previous Y scale when there's nothing visible instead of collapsing
  if (maxVisibleShredsPerBucket > 0) {
    updateCameraYRange(camera, maxVisibleShredsPerBucket);
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
