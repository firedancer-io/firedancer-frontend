import {
  colors,
  drawShreds,
  setUpRendererResources,
  updateCameraXRange,
} from "../../Overview/ShredsProgression/WebGl/chartUtils";
import { msBucketSizes, nsBucketSizes } from "../const";
import * as THREE from "three";
import { MAX_WEBGL_PX_RATIO, nsPerMs } from "../../../consts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers";
import {
  createRectResources,
  createRectMesh,
  disposeRectResources,
  createRenderer,
  ensureRectCapacity,
  addRectangleToMesh,
  updateRectMeshCounts,
  type TsRange,
  type RgbColor,
} from "../../WebGl/webglUtils";
import {
  SHREDS_AGG_THRESHOLD_MS,
  type AggRendererResources,
  type RendererObj,
} from "./const";
import { omit } from "lodash";
import {
  getNonAggAtoms,
  shredsTimelineReferenceTsAtoms,
  timelineShredsDataAtoms,
  type ShredBucketsByGranularity,
} from "./atoms";
import { getAggGranularity, OVERSCAN_BUCKETS } from "./useAggShredsQuery";
import {
  AggShredEventType,
  ShredsGranularityEnum,
} from "../../../api/entities";
import { calcAbsoluteNs, calcRelativeMs, getBucketIdx } from "../utils";
import type { ShredsGranularity } from "../../../api/types";
import { getDefaultStore } from "jotai";
import {
  minDirtySlotByChartAtom,
  type LiveShredsData,
  type Slot,
  type SlotsShreds,
} from "../../Overview/ShredsProgression/atoms";
import { OVERSCAN_TILES_COUNT, tileSizeMs } from "./useNonAggShredsQuery";

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
  // single shared slot-mesh pool for both non-agg granularities. Only one
  // granularity's merged dataset is drawn per call (fallback slots are rebased to
  // the active reference), so switching granularity redraws into the same pool.
  const nonAggResources = setUpRendererResources(getWasContextLost);
  const aggResources = setUpAggResources(getWasContextLost);

  const cleanUp = () => {
    aggResources.cleanUpResources();
    nonAggResources.cleanUpResources();
    cleanUpRenderer();
  };

  return {
    renderer,
    nonAggResources: omit(nonAggResources, "cleanUpResources"),
    aggResources: omit(aggResources, "cleanUpResources"),
    cleanUp,
  };
}

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

const orderedEventColors: Record<AggShredEventType, RgbColor> = {
  [AggShredEventType.Repair]: colors.replayedRepair,
  [AggShredEventType.Reconstructed]: colors.replayedNothing,
  [AggShredEventType.Turbine]: colors.replayedTurbine,
  [AggShredEventType.Published]: colors.published,
};

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
    for (const [eventType, color] of Object.entries(orderedEventColors)) {
      const count = eventCounts[eventType as AggShredEventType];
      if (!count) continue;

      ensureRectCapacity(mesh, rectIdx + 1);
      addRectangleToMesh(
        mesh,
        rectIdx,
        x,
        -shredsInBucket - count,
        bucketSizeMs,
        count,
        color,
      );

      shredsInBucket += count;
      rectIdx++;
    }

    // exclude overscan from max visible value
    if (!isOverscan && shredsInBucket > maxVisibleShredsPerBucket) {
      maxVisibleShredsPerBucket = shredsInBucket;
    }
  }

  updateCameraYRange(camera, maxVisibleShredsPerBucket);
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

const store = getDefaultStore();

/**
 * convert replay-relative ts to shreds-relative ts
 */
function convertToShredsTs(
  replayMs: number,
  replayReferenceNs: bigint,
  granularity: ShredsGranularity,
) {
  const shredsReferenceTsMs = store.get(
    shredsTimelineReferenceTsAtoms[granularity],
  );
  if (shredsReferenceTsMs == null) return;

  // replayMs is relative to replayReferenceNs; shreds coordinates are relative to
  // shredsReferenceTsMs. Rebase by adding back the replay reference and subtracting
  // the shreds reference: shredsMs = absoluteNs(replayMs) relative to the shreds reference.
  const absoluteNs = calcAbsoluteNs(replayReferenceNs, replayMs);
  const shredsReferenceNs = BigInt(shredsReferenceTsMs) * BigInt(nsPerMs);
  return calcRelativeMs(shredsReferenceNs, absoluteNs);
}

export function convertToShredsRange(
  replayRange: TsRange,
  replayReferenceNs: bigint,
  granularity: ShredsGranularity,
): TsRange | undefined {
  const start = convertToShredsTs(
    replayRange[0],
    replayReferenceNs,
    granularity,
  );
  if (start == null) return;
  const end = convertToShredsTs(replayRange[1], replayReferenceNs, granularity);
  if (end == null) return;

  return [start, end];
}

export function moveNonAggCamera(
  camera: THREE.OrthographicCamera,
  replayVisibleRange: TsRange,
  replayReferenceNs: bigint,
  granularity: ShredsGranularity,
) {
  const shredsVisibleRange = convertToShredsRange(
    replayVisibleRange,
    replayReferenceNs,
    granularity,
  );
  if (!shredsVisibleRange) return;

  return updateCameraXRange(shredsVisibleRange, camera);
}

/** the other non-agg granularity used as a per-slot fallback */
function otherGranularity(granularity: ShredsGranularity): ShredsGranularity {
  return granularity === ShredsGranularityEnum.fec
    ? ShredsGranularityEnum.shred
    : ShredsGranularityEnum.fec;
}

interface MergedShredsData {
  data: LiveShredsData;
  /** slot numbers whose drawn data came from the fec granularity */
  fecSlots: Set<number>;
}

/**
 * A fec entry represents a whole FEC set (~32 shreds), so a fec set spans
 * SHREDS_PER_FEC_SET rows on the shred-index axis. Fec rows are drawn
 * SHREDS_PER_FEC_SET tall (see FEC_ROW_HEIGHT usage in drawNonAggShreds).
 */
export const SHREDS_PER_FEC_SET = 32;

/**
 * Re-index a fec slot's shreds so fec set i lands at row i * SHREDS_PER_FEC_SET.
 * The array is also padded to (maxSet + 1) * SHREDS_PER_FEC_SET entries so that
 * getDrawInfo's camera-Y extent (== shreds.length) matches the full stacked
 * height of the SHREDS_PER_FEC_SET-tall rows drawn for each set.
 */
function scaleFecSlotIdx(slot: Slot): Slot {
  const shreds: Slot["shreds"] = [];
  let maxSet = -1;
  for (let i = 0; i < slot.shreds.length; i++) {
    const shred = slot.shreds[i];
    if (shred == null) continue;
    shreds[i * SHREDS_PER_FEC_SET] = shred;
    maxSet = i;
  }
  if (maxSet >= 0) shreds.length = (maxSet + 1) * SHREDS_PER_FEC_SET;
  return { ...slot, shreds };
}

/** whether a slot has events that getDrawInfo would actually draw */
function hasDrawableEvents(slot: Slot | undefined): boolean {
  return !!slot && slot.shreds.length > 0 && slot.minEventTsDelta != null;
}

/** whether a slot has a completion event (won't paint an open-ended bar) */
function isComplete(slot: Slot | undefined): boolean {
  return slot?.completionTsDelta != null;
}

/** shift every event-ts delta of a slot by refDeltaMs so it reads against a new referenceTs */
function rebaseSlot(slot: Slot, refDeltaMs: number): Slot {
  if (refDeltaMs === 0) return slot;
  return {
    shreds: slot.shreds.map((shred) =>
      shred?.map((tsDelta) =>
        tsDelta == null ? tsDelta : tsDelta + refDeltaMs,
      ),
    ),
    minEventTsDelta:
      slot.minEventTsDelta == null
        ? slot.minEventTsDelta
        : slot.minEventTsDelta + refDeltaMs,
    maxEventTsDelta:
      slot.maxEventTsDelta == null
        ? slot.maxEventTsDelta
        : slot.maxEventTsDelta + refDeltaMs,
    completionTsDelta:
      slot.completionTsDelta == null
        ? slot.completionTsDelta
        : slot.completionTsDelta + refDeltaMs,
  };
}

/**
 * Merge the active granularity's data with the other granularity as a per-slot
 * fallback: a slot is drawn from the active granularity if present, otherwise
 * from the other granularity. The merged data reads against the active
 * granularity's referenceTs; fallback slots are rebased by the reference
 * difference so they land at the correct absolute time.
 *
 * Fec-sourced slots are idx-scaled (fec set i -> row i * SHREDS_PER_FEC_SET, so
 * shreds.length reflects the stacked band height for camera-Y) and reported in
 * fecSlots so the draw layer can give them SHREDS_PER_FEC_SET-tall rows. A slot
 * is scaled per its *source* granularity, so fec slots are scaled whether fec is
 * the active granularity or the fallback.
 */
function mergeWithFallback(
  active: LiveShredsData,
  fallback: LiveShredsData,
  activeGranularity: ShredsGranularity,
): MergedShredsData {
  const fallbackGranularity = otherGranularity(activeGranularity);
  const activeSlots = active.slotsShreds;
  const fallbackSlots = fallback.slotsShreds;
  const activeIsFec = activeGranularity === ShredsGranularityEnum.fec;
  const fallbackIsFec = fallbackGranularity === ShredsGranularityEnum.fec;
  const fecSlots = new Set<number>();

  // no active data yet: draw the fallback as-is (its own reference is self-consistent)
  if (!activeSlots) {
    if (!fallbackSlots) return { data: fallback, fecSlots };
    const slots = new Map<number, Slot>();
    for (const [slotNumber, slot] of fallbackSlots.slots) {
      slots.set(slotNumber, fallbackIsFec ? scaleFecSlotIdx(slot) : slot);
      if (fallbackIsFec) fecSlots.add(slotNumber);
    }
    return {
      data: { ...fallback, slotsShreds: { ...fallbackSlots, slots } },
      fecSlots,
    };
  }

  const refDeltaMs = fallbackSlots
    ? fallbackSlots.referenceTs - activeSlots.referenceTs
    : 0;

  const mergedSlots = new Map<number, Slot>();
  for (const [slotNumber, slot] of activeSlots.slots) {
    mergedSlots.set(slotNumber, activeIsFec ? scaleFecSlotIdx(slot) : slot);
    if (activeIsFec) fecSlots.add(slotNumber);
  }
  for (const [slotNumber, slot] of fallbackSlots?.slots ?? []) {
    const activeSlot = activeSlots.slots.get(slotNumber);
    // Prefer the active granularity when its slot is drawable, EXCEPT when the
    // active slot is incomplete (no completion event) while the fallback slot for
    // the same slot is complete. An incomplete slot paints an open-ended bar to
    // the chart edge (see addEventsForRow); if the other granularity has a
    // complete version, draw that instead so the bar is bounded. Falls back per
    // slot, so a mix of shred + fec slots can appear in one draw.
    if (
      hasDrawableEvents(activeSlot) &&
      (isComplete(activeSlot) || !isComplete(slot))
    ) {
      continue;
    }
    const rebased = rebaseSlot(slot, refDeltaMs);
    mergedSlots.set(
      slotNumber,
      fallbackIsFec ? scaleFecSlotIdx(rebased) : rebased,
    );
    if (fallbackIsFec) fecSlots.add(slotNumber);
    else fecSlots.delete(slotNumber);
  }

  const merged: SlotsShreds = {
    referenceTs: activeSlots.referenceTs,
    slots: mergedSlots,
  };

  const range =
    active.range && fallback.range
      ? {
          min: Math.min(active.range.min, fallback.range.min),
          max: Math.max(active.range.max, fallback.range.max),
        }
      : (active.range ?? fallback.range);

  const minCompletedSlot =
    active.minCompletedSlot != null && fallback.minCompletedSlot != null
      ? Math.min(active.minCompletedSlot, fallback.minCompletedSlot)
      : (active.minCompletedSlot ?? fallback.minCompletedSlot);

  return {
    data: { slotsShreds: merged, range, minCompletedSlot },
    fecSlots,
  };
}

/** whether a slot would be drawn by getDrawInfo for the given draw range */
function isDrawableInRange(
  slot: Slot | undefined,
  drawRange: TsRange,
): boolean {
  if (!slot || !slot.shreds.length || slot.minEventTsDelta == null)
    return false;
  // started after the (padded) draw window's right edge
  if (slot.minEventTsDelta > drawRange[1]) return false;
  // ended before the draw window's left edge
  const slotEndTsDelta = slot.completionTsDelta ?? slot.maxEventTsDelta;
  if (slotEndTsDelta != null && slotEndTsDelta < drawRange[0]) return false;
  return true;
}

/**
 * Delete the leading (lowest-slot-number) run of consecutive incomplete +
 * unskipped slots from the merged slots map, considering only slots getDrawInfo
 * would actually draw. Mirrors getTrailingIncompleteSlots at the opposite end,
 * but unconditional (every draw) and applied by removing the slots from the map
 * so getDrawInfo never sees them (keeping camera-Y / range off them too).
 *
 * Incomplete slots paint a bar to the draw edge; the leading run is the one that
 * paints "residual lines" off the left of where real data begins.
 */
function dropLeadingIncompleteSlots(
  slots: Map<number, Slot>,
  slotRange: { min: number; max: number },
  minCompletedSlot: number,
  skippedSlots: Set<number>,
  drawRange: TsRange,
): void {
  // getDrawInfo starts at max(slotRange.min, minCompletedSlot)
  const minSlot = Math.max(slotRange.min, minCompletedSlot);
  for (let slotNumber = minSlot; slotNumber <= slotRange.max; slotNumber++) {
    const slot = slots.get(slotNumber);
    // not a drawn slot: getDrawInfo skips it, so it doesn't break the run
    if (!isDrawableInRange(slot, drawRange)) continue;
    // first drawn slot that is complete or skipped ends the leading run
    if (slot!.completionTsDelta != null || skippedSlots.has(slotNumber)) break;
    slots.delete(slotNumber);
  }
}

/**
 * Delete the trailing (highest-slot-number) run of consecutive incomplete +
 * unskipped slots from the merged slots map, considering only slots getDrawInfo
 * would actually draw. Mirror of dropLeadingIncompleteSlots at the opposite end,
 * applied unconditionally (every draw).
 *
 * Unlike the Overview live chart — where a trailing incomplete slot at the right
 * edge is in progress and correctly drawn stretched — in Replay historical data a
 * trailing incomplete slot means its slot_complete event lives in a tile beyond
 * the current fetched right edge (as the view widens, lastTile advances and the
 * slot's completion arrives later). Drawing it in the meantime paints a bar to the
 * chart edge. Hide the trailing incomplete run until its completion is fetched.
 * This is independent of hasPendingTiles: the symptom persists after all in-view
 * tiles settle (the completion lives in an as-yet-unrequested tile to the right).
 */
function dropTrailingIncompleteSlots(
  slots: Map<number, Slot>,
  slotRange: { min: number; max: number },
  minCompletedSlot: number,
  skippedSlots: Set<number>,
  drawRange: TsRange,
): void {
  // getDrawInfo starts at max(slotRange.min, minCompletedSlot); don't walk below it
  const minSlot = Math.max(slotRange.min, minCompletedSlot);
  for (let slotNumber = slotRange.max; slotNumber >= minSlot; slotNumber--) {
    const slot = slots.get(slotNumber);
    // not a drawn slot: getDrawInfo skips it, so it doesn't break the run
    if (!isDrawableInRange(slot, drawRange)) continue;
    // first drawn slot that is complete or skipped ends the trailing run
    if (slot!.completionTsDelta != null || skippedSlots.has(slotNumber)) break;
    slots.delete(slotNumber);
  }
}

/**
 * While any tile is still in flight, drop every unskipped incomplete slot from
 * the merged slots map. An incomplete slot's completion may live in a tile that
 * hasn't arrived yet (e.g. a gap between fetched tiles), so it would otherwise
 * paint a bar across the unfetched region until its data settles. Removing the
 * slots from the map keeps getDrawInfo, camera-Y and range off them too.
 */
function dropIncompleteSlotsWhilePending(
  slots: Map<number, Slot>,
  skippedSlots: Set<number>,
): void {
  for (const [slotNumber, slot] of slots) {
    if (slot.completionTsDelta == null && !skippedSlots.has(slotNumber)) {
      slots.delete(slotNumber);
    }
  }
}

export function drawNonAggShreds(
  rendererObj: RendererObj,
  granularity: ShredsGranularity,
  shredsVisibleRange: TsRange,
  cssRange: [min: number, max: number],
  chartId: string,
  // whether any tile is still in flight for the active granularity. While true,
  // trailing incomplete slots are hidden so they don't stretch to the edge before
  // their data settles.
  hasPendingTiles?: boolean,
) {
  const resources = rendererObj.nonAggResources;

  const other = otherGranularity(granularity);

  // skipped slots are a network-level property, independent of granularity, but
  // each set only records the skips from its own batches -> union both so
  // fallback slots are still styled as skipped
  const skippedSlots = new Set([
    ...store.get(getNonAggAtoms(granularity).skippedSlots),
    ...store.get(getNonAggAtoms(other).skippedSlots),
  ]);
  const activeData = store.get(timelineShredsDataAtoms[granularity]);
  const fallbackData = store.get(timelineShredsDataAtoms[other]);
  const { data, fecSlots } = mergeWithFallback(
    activeData,
    fallbackData,
    granularity,
  );
  if (!data.slotsShreds) return;

  // fec-sourced slots are drawn SHREDS_PER_FEC_SET-tall so each fec set fills its
  // band; all other slots keep the default 1-tall rows
  const rowHeightForSlot = (slotNumber: number) =>
    fecSlots.has(slotNumber) ? SHREDS_PER_FEC_SET : 1;

  // Key each slot's mesh by the ACTIVE granularity of this draw, not the slot's
  // source granularity. Rect X coordinates are event-ts-deltas against the active
  // granularity's referenceTs (fallback slots are rebased to it in the merge), so
  // a mesh's geometry is only valid for the reference it was drawn against. Two
  // granularities have different referenceTs, so keying by the active granularity
  // keeps a separate mesh per (slot, reference-basis): revisiting a granularity
  // reuses meshes already at the correct reference (no X jump), and a switch draws
  // into the other granularity's mesh set (no stale wrong-scale/offset geometry).
  const meshKeyForSlot = (slotNumber: number) => `${granularity}:${slotNumber}`;

  // Draw an extra range on each side matching the extra tiles fetched by
  // useNonAggShredsQuery, so panning doesn't reveal empty edges before the next
  // draw. Camera Y still scales to the visible range only (handled in
  // drawShreds via the separate visible/draw ranges).
  const drawPaddingMs = OVERSCAN_TILES_COUNT * tileSizeMs;
  const shredsDrawRange: TsRange = [
    shredsVisibleRange[0] - drawPaddingMs,
    shredsVisibleRange[1] + drawPaddingMs,
  ];

  // Never draw the leading/trailing runs of consecutive incomplete+unskipped
  // slots: drop them from the merged map so getDrawInfo (and camera-Y/range)
  // ignore them. The trailing run is an incomplete slot at the right edge whose
  // slot_complete lives in a tile beyond the current fetched extent; drawing it
  // paints a bar to the chart edge until that tile arrives.
  if (data.range && data.minCompletedSlot != null) {
    dropLeadingIncompleteSlots(
      data.slotsShreds.slots,
      data.range,
      data.minCompletedSlot,
      skippedSlots,
      shredsDrawRange,
    );
    dropTrailingIncompleteSlots(
      data.slotsShreds.slots,
      data.range,
      data.minCompletedSlot,
      skippedSlots,
      shredsDrawRange,
    );
  }

  // While any tile is in flight, an incomplete slot's completion may live in a
  // not-yet-fetched tile (incl. a gap between fetched tiles), so hide every
  // unskipped incomplete slot until fetching settles.
  if (hasPendingTiles) {
    dropIncompleteSlotsWhilePending(data.slotsShreds.slots, skippedSlots);
  }

  const { renderer } = rendererObj;
  if (
    drawShreds(
      data,
      [shredsVisibleRange[0], shredsVisibleRange[1]],
      cssRange,
      {
        renderer,
        ...resources,
      },
      true,
      chartId,
      skippedSlots,
      shredsDrawRange,
      hasPendingTiles,
      rowHeightForSlot,
      meshKeyForSlot,
      () => granularity,
    )
  ) {
    store.set(minDirtySlotByChartAtom, (prev) => {
      prev.set(chartId, Infinity);
      return prev;
    });
  }
}

export function updateCameraYRange(
  camera: THREE.OrthographicCamera,
  maxShredCount: number,
) {
  if (maxShredCount === 0) return;

  const bottom = -maxShredCount;
  if (camera.bottom === bottom) return;

  camera.top = 0;
  camera.bottom = bottom;
  camera.updateProjectionMatrix();
}

export function isAggregate(rangeMs: TsRange) {
  return rangeMs[1] - rangeMs[0] > SHREDS_AGG_THRESHOLD_MS;
}
