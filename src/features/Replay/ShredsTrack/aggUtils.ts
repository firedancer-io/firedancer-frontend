import * as THREE from "three";
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
  aggShredEvents,
  type AggRendererResources,
  type RendererObj,
} from "./const";
import { type ShredBucketsByGranularity, type ShredEventCounts } from "./atoms";
import type { AggGranularity } from "../../../api/types";
import { OVERSCAN_BUCKETS } from "../useAggQuery";
import {
  drawnBuckets,
  type BucketOverlap,
  type GetDrawTiles,
} from "../aggDraw";
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
 * Redraw all available data in the visible range at the appropriate granularity
 * level. Returns the tallest visible bucket's shred count, or 0 when nothing is
 * drawn.
 */
export function drawAggShreds(
  rendererObj: RendererObj,
  referenceNs: bigint,
  visibleRange: TsRange,
  aggShreds: ShredBucketsByGranularity,
  granularity: AggGranularity,
  getDrawTiles: GetDrawTiles,
): number {
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

  let maxVisibleShredsPerBucket = 0;
  let rectIdx = 0;
  const buckets = drawnBuckets(
    getDrawTiles(
      granularity,
      startIdx - OVERSCAN_BUCKETS,
      endIdx + OVERSCAN_BUCKETS,
    ),
    granularity,
    aggShreds,
    resampleEventCounts,
  );
  for (const [bucketIdx, eventCounts] of buckets) {
    const isOverscan = bucketIdx < startIdx || bucketIdx > endIdx;
    const x = startX + (bucketIdx - startIdx) * bucketSizeMs;

    let shredsInBucket = 0;
    for (const { type, webGlColor } of aggShredEvents) {
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

  updateRectMeshCounts(mesh, rectIdx);

  /** store mesh positions relative to referenceX. This allows GPU to see small coordinates */
  mesh.referenceX = cameraReferenceMs;
  mesh.mesh.position.x = 0;

  return maxVisibleShredsPerBucket;
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

export function getAggShredCount(counts: ShredEventCounts | undefined): number {
  if (!counts) return 0;
  return aggShredEvents.reduce((sum, { type }) => sum + (counts[type] ?? 0), 0);
}

/**
 * Sum each event type, weighted by the portion of each bucket overlapping
 */
export function resampleEventCounts(
  overlaps: BucketOverlap<ShredEventCounts>[],
): ShredEventCounts {
  const resampled = Object.fromEntries(
    aggShredEvents.map(({ type }) => [type, null]),
  ) as ShredEventCounts;
  for (const { value, overlapMs, bucketMs } of overlaps) {
    for (const { type } of aggShredEvents) {
      const count = value[type];
      if (count == null) continue;
      resampled[type] = (resampled[type] ?? 0) + (count * overlapMs) / bucketMs;
    }
  }
  return resampled;
}
