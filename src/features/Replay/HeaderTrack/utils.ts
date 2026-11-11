import {
  msBucketSizes,
  nsBucketSizes,
  AGG_SLOT_SHRED_THRESHOLD_MS,
} from "../const";
import * as THREE from "three";
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
  type TsRange,
} from "../../WebGl/webglUtils";
import { type AggRendererResources, type RendererObj } from "./const";
import { omit } from "lodash";
import {
  getSlotCount,
  type SlotBucketsByGranularity,
  type SlotCounts,
} from "./aggAtoms";
import { OVERSCAN_BUCKETS } from "../useAggQuery";
import {
  drawnBuckets,
  type BucketOverlap,
  type GetDrawTiles,
} from "../aggDraw";
import {
  calcAbsoluteNs,
  calcRelativeMs,
  getAggSlotsGranularity,
  getBucketIdx,
} from "../utils";
import {
  headerMineGroupBorderColor,
  replayAggHeaderBackgroundColor,
  replayMiniMapSkippedColor,
} from "../../../colors";
import {
  blendColors,
  BucketColorState,
  type ColorInfo,
  getBucketColor,
} from "../slotUtils";

const minY = 0;
const maxY = 1;

const backgroundColor = convertToWebGlColor(replayAggHeaderBackgroundColor);
const skippedColor = convertToWebGlColor(replayMiniMapSkippedColor);
const mineColor = convertToWebGlColor(headerMineGroupBorderColor);
const mineSkippedColor =
  blendColors([
    [skippedColor, 1],
    [mineColor, 1],
  ]) ?? mineColor;

const bucketColors: Record<BucketColorState, ColorInfo> = {
  [BucketColorState.MyNotSkipped]: {
    color: mineColor,
    minWeight: 0.3,
  },
  [BucketColorState.MySkipped]: {
    color: mineSkippedColor,
    minWeight: 0.3,
  },
  [BucketColorState.OtherSkipped]: {
    color: skippedColor,
    minWeight: 0.3,
  },
  [BucketColorState.OtherNotSkipped]: { color: backgroundColor },
};

export function setUpRenderers(
  setUpContextListeners: ContextHelpers["setUpContextListeners"],
  getWasContextLost: ContextHelpers["getWasContextLost"],
): RendererObj | undefined {
  const rendererObj = createRenderer(setUpContextListeners, getWasContextLost);
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
  getDrawTiles: GetDrawTiles,
) {
  const granularity = getAggSlotsGranularity(visibleRange[1] - visibleRange[0]);
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
  const buckets = drawnBuckets(
    getDrawTiles(granularity, firstBucketIdx, lastBucketIdx),
    granularity,
    aggSlots,
    resampleSlotCounts,
  );
  for (const [bucketIdx, slotCounts] of buckets) {
    const { skipped, mine, mine_skipped } = slotCounts;
    const slotCount = getSlotCount(slotCounts);

    // don't draw empty buckets
    if (!slotCount) continue;

    const x = startX + (bucketIdx - startIdx) * bucketSizeMs;

    const color = getBucketColor({
      totalCount: slotCount,
      skippedCount: skipped,
      mineCount: mine,
      mySkippedCount: mine_skipped,
      colors: bucketColors,
      emptyColor: backgroundColor,
    });

    addRectangleToMesh(mesh, rectIdx, x, minY, bucketSizeMs, height, color);

    rectIdx++;
  }
  updateRectMeshCounts(mesh, rectIdx);

  /** store mesh positions relative to referenceX. This allows GPU to see small coordinates */
  mesh.referenceX = cameraReferenceMs;
  mesh.mesh.position.x = 0;
}

const countKeys = ["skipped", "mine", "mine_skipped"] as const;

/**
 * Slot range spanning the overlapping buckets, with each count's share of its
 * slots weighted by overlap
 */
export function resampleSlotCounts(
  overlaps: BucketOverlap<SlotCounts>[],
): SlotCounts {
  const resampled: SlotCounts = {
    start_slot: null,
    end_slot: null,
    skipped: null,
    mine: null,
    mine_skipped: null,
  };
  let weightedSlotCount = 0;
  const weightedCounts: Partial<Record<(typeof countKeys)[number], number>> =
    {};
  for (const { value, overlapMs, bucketMs } of overlaps) {
    if (value.start_slot != null) {
      resampled.start_slot = Math.min(
        resampled.start_slot ?? Infinity,
        value.start_slot,
      );
    }
    if (value.end_slot != null) {
      resampled.end_slot = Math.max(
        resampled.end_slot ?? -Infinity,
        value.end_slot,
      );
    }
    const weight = overlapMs / bucketMs;
    weightedSlotCount += (getSlotCount(value) ?? 0) * weight;
    for (const key of countKeys) {
      const count = value[key];
      if (count != null) {
        weightedCounts[key] = (weightedCounts[key] ?? 0) + count * weight;
      }
    }
  }

  // scale the weighted shares to the slot range, since only shares are drawn
  const slotCount = getSlotCount(resampled);
  if (!slotCount || !weightedSlotCount) return resampled;
  for (const key of countKeys) {
    const count = weightedCounts[key];
    if (count !== undefined) {
      resampled[key] = (slotCount * count) / weightedSlotCount;
    }
  }
  return resampled;
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
  return rangeMs[1] - rangeMs[0] > AGG_SLOT_SHRED_THRESHOLD_MS;
}

/**
 * Keep drawing the `prev` mode until all of the `target` mode's visible data
 * has arrived, as long as all of `prev`'s visible data is still available.
 */
export function resolveHeldDraw(
  prev: boolean,
  target: boolean,
  isVisibleDrawable: (isAgg: boolean) => boolean,
): boolean {
  if (prev === target || isVisibleDrawable(target)) return target;
  return isVisibleDrawable(prev) ? prev : target;
}
