import { isEqual } from "lodash";
import type { TsRange } from "../../WebGl/webglUtils";
import type { AggGranularity } from "../../../api/types";
import { usPerMs } from "../../../consts";
import { msBucketSizes, nsBucketSizes } from "../const";
import { calcAbsoluteNs, calcRelativeMs, getBucketIdx } from "../utils";
import { NO_SLOT } from "../slotHighlight";
import type {
  StateDurationsByTile,
  TileStatesBucketsByGranularity,
} from "./aggAtoms";
import {
  drawnBuckets,
  type AggDrawTile,
  type BucketOverlap,
  type GetDrawTiles,
} from "../aggDraw";
import { getAggGranularity, OVERSCAN_BUCKETS } from "./useAggTileStatesQuery";
import { ensureStatesCapacity, setStatesCount } from "./tileStatesMesh";
import { addRect, MAX_COVERAGE_STATES } from "./tileStatesRects";
import { getRowOfTile, updateMeshPosition, type RendererObj } from "./utils";

/**
 * What the agg mesh was last built from, to skip rebuilding the same rects.
 * Cleared when the agg data or rows change.
 */
export interface AggMeshBuild {
  referenceNs: bigint;
  granularity: AggGranularity;
  startIdx: number;
  endIdx: number;
  drawTiles: AggDrawTile[];
  maxStateShares: Float32Array;
}

function getVisibleBucketRange(
  referenceNs: bigint,
  visibleRange: TsRange,
  granularity: AggGranularity,
): [number, number] {
  return [
    getBucketIdx(
      calcAbsoluteNs(referenceNs, visibleRange[0]),
      granularity,
      false,
    ),
    getBucketIdx(
      calcAbsoluteNs(referenceNs, visibleRange[1]),
      granularity,
      true,
    ),
  ];
}

/**
 * Rebuilds the agg mesh if the view left the built bucket range, the
 * granularity changed, or the granularity each span is drawn from changed, and
 * updates the lane scale.
 * Returns whether anything drawn changed.
 */
export function updateAggStatesMesh(
  rendererObj: RendererObj,
  referenceNs: bigint,
  visibleRange: TsRange,
  aggTileStates: TileStatesBucketsByGranularity,
  getDrawTiles: GetDrawTiles,
) {
  const granularity = getAggGranularity(visibleRange[1] - visibleRange[0]);
  const [visibleStartIdx, visibleEndIdx] = getVisibleBucketRange(
    referenceNs,
    visibleRange,
    granularity,
  );

  const built = rendererObj.aggMeshBuild;
  const isInBuiltRange =
    built?.referenceNs === referenceNs &&
    built.granularity === granularity &&
    built.startIdx <= visibleStartIdx &&
    visibleEndIdx <= built.endIdx;
  const startIdx = isInBuiltRange
    ? built.startIdx
    : visibleStartIdx - OVERSCAN_BUCKETS;
  const endIdx = isInBuiltRange
    ? built.endIdx
    : visibleEndIdx + OVERSCAN_BUCKETS;
  const drawTiles = getDrawTiles(granularity, startIdx, endIdx);
  const isBuilt = isInBuiltRange && isEqual(drawTiles, built.drawTiles);
  if (!isBuilt) {
    const build: AggMeshBuild = {
      referenceNs,
      granularity,
      startIdx,
      endIdx,
      drawTiles,
      maxStateShares: new Float32Array(endIdx - startIdx + 1),
    };
    buildAggStatesMesh(rendererObj, build, aggTileStates);
    rendererObj.aggMeshBuild = build;
  }

  const shareChanged = updateAggMaxStateShare(rendererObj, visibleRange);
  return !isBuilt || shareChanged;
}

/**
 * Builds a rect per busy bucket and tile with each state's time share, and
 * records each bucket's largest share of busy time any state has
 */
function buildAggStatesMesh(
  rendererObj: RendererObj,
  {
    referenceNs,
    granularity,
    startIdx,
    endIdx,
    drawTiles,
    maxStateShares,
  }: AggMeshBuild,
  aggTileStates: TileStatesBucketsByGranularity,
) {
  const mesh = rendererObj.aggMesh;
  const rowOfTile = getRowOfTile(rendererObj.config.kind);
  const states = rendererObj.config.getStates(undefined);

  if (!drawTiles.length || !rowOfTile.size) {
    setStatesCount(mesh, 0);
    return;
  }

  const bucketSizeMs = msBucketSizes[granularity];
  const bucketUs = bucketSizeMs * usPerMs;

  mesh.referenceX = calcRelativeMs(
    referenceNs,
    BigInt(startIdx) * nsBucketSizes[granularity],
  );
  updateMeshPosition(rendererObj, mesh);
  ensureStatesCapacity(mesh, (endIdx - startIdx + 1) * rowOfTile.size);

  // shares past the track's states stay 0
  const shares = new Float64Array(MAX_COVERAGE_STATES);
  let count = 0;
  for (const [bucketIdx, statesByTile] of drawnBuckets(
    drawTiles,
    granularity,
    aggTileStates,
    resampleDurations,
  )) {
    const startMs = mesh.referenceX + (bucketIdx - startIdx) * bucketSizeMs;
    let maxStateShare = 0;
    for (const [tileIdx, durationsUs] of statesByTile) {
      const row = rowOfTile.get(tileIdx);
      if (row === undefined) continue;

      let busyWeight = 0;
      let maxWeight = 0;
      for (let i = 0; i < states.length; i++) {
        const weight = Math.min((durationsUs[states[i]] ?? 0) / bucketUs, 1);
        shares[i] = weight;
        busyWeight += weight;
        maxWeight = Math.max(maxWeight, weight);
      }
      if (!busyWeight) continue;

      addRect(
        mesh,
        count++,
        startMs,
        startMs + bucketSizeMs,
        row,
        NO_SLOT,
        shares,
      );
      maxStateShare = Math.max(maxStateShare, maxWeight / busyWeight);
    }
    maxStateShares[bucketIdx - startIdx] = maxStateShare;
  }

  setStatesCount(mesh, count);
}

/**
 * Each state's time in a draw bucket from the fallback buckets overlapping it,
 * assuming time is spread evenly over each fallback bucket
 */
function resampleDurations(
  overlaps: BucketOverlap<StateDurationsByTile>[],
): StateDurationsByTile {
  const resampled: StateDurationsByTile = new Map();
  for (const { value, overlapMs, bucketMs } of overlaps) {
    const share = overlapMs / bucketMs;
    for (const [tileIdx, durationsUs] of value) {
      let sums = resampled.get(tileIdx);
      if (!sums) {
        sums = new Array<number | null>(durationsUs.length).fill(null);
        resampled.set(tileIdx, sums);
      }
      for (let state = 0; state < durationsUs.length; state++) {
        const us = durationsUs[state];
        if (us != null) sums[state] = (sums[state] ?? 0) + us * share;
      }
    }
  }
  return resampled;
}

/**
 * Finds the largest share of busy time any state has in a visible bucket,
 * from the shares recorded in the last build.
 * Returns whether it changed.
 */
export function updateAggMaxStateShare(
  rendererObj: RendererObj,
  visibleRange: TsRange,
) {
  const prev = rendererObj.aggMaxStateShare;
  rendererObj.aggMaxStateShare = 1;

  const built = rendererObj.aggMeshBuild;
  if (built) {
    const [visibleStartIdx, visibleEndIdx] = getVisibleBucketRange(
      built.referenceNs,
      visibleRange,
      built.granularity,
    );
    const start = Math.max(visibleStartIdx - built.startIdx, 0);
    const end = Math.min(
      visibleEndIdx - built.startIdx,
      built.maxStateShares.length - 1,
    );

    let maxStateShare = 0;
    for (let i = start; i <= end; i++) {
      maxStateShare = Math.max(maxStateShare, built.maxStateShares[i]);
    }
    if (maxStateShare > 0) rendererObj.aggMaxStateShare = maxStateShare;
  }

  return rendererObj.aggMaxStateShare !== prev;
}
