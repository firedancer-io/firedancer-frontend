import type { TsRange } from "../../WebGl/webglUtils";
import type { AggGranularity } from "../../../api/types";
import { usPerMs } from "../../../consts";
import { msBucketSizes, nsBucketSizes } from "../const";
import {
  forEachDrawnBucket,
  OVERSCAN_BUCKETS,
  type BucketOverlap,
  type GetDrawTiles,
} from "../useAggQuery";
import { calcAbsoluteNs, calcRelativeMs, getBucketIdx } from "../utils";
import type {
  StateDurationsByTile,
  TileStatesBucketsByGranularity,
} from "./aggAtoms";
import { trackStates } from "./consts";
import { ensureStatesCapacity, setStatesCount } from "./tileStatesMesh";
import {
  addRectToMesh,
  getRowOfTile,
  updateDataTileMeshPositions,
  type RendererObj,
} from "./utils";

/** Builds a rect per busy state weighted by its time share of its bucket */
export function buildAggStatesMesh(
  rendererObj: RendererObj,
  referenceNs: bigint,
  visibleRange: TsRange,
  aggTileStates: TileStatesBucketsByGranularity,
  granularity: AggGranularity,
  getDrawTiles: GetDrawTiles,
) {
  const mesh = rendererObj.aggMeshes.tileStates;
  const rowOfTile = getRowOfTile(rendererObj.kind);
  const states = trackStates[rendererObj.kind].agg;

  if (!rowOfTile.size) {
    setStatesCount(mesh, 0);
    return;
  }

  const bucketSizeMs = msBucketSizes[granularity];
  const bucketUs = bucketSizeMs * usPerMs;
  const startIdx =
    getBucketIdx(
      calcAbsoluteNs(referenceNs, visibleRange[0]),
      granularity,
      false,
    ) - OVERSCAN_BUCKETS;
  const endIdx =
    getBucketIdx(
      calcAbsoluteNs(referenceNs, visibleRange[1]),
      granularity,
      true,
    ) + OVERSCAN_BUCKETS;

  mesh.referenceX = calcRelativeMs(
    referenceNs,
    BigInt(startIdx) * nsBucketSizes[granularity],
  );
  updateDataTileMeshPositions(rendererObj, rendererObj.aggMeshes);

  let count = 0;
  forEachDrawnBucket(
    getDrawTiles(granularity, startIdx, endIdx),
    granularity,
    aggTileStates,
    resampleStatesByTile,
    (bucketIdx, statesByTile) => {
      const startMs = mesh.referenceX + (bucketIdx - startIdx) * bucketSizeMs;
      for (const [tileIdx, durationsUs] of statesByTile) {
        const row = rowOfTile.get(tileIdx);
        if (row === undefined) continue;

        for (const state of states) {
          const us = durationsUs[state];
          if (!us) continue;

          ensureStatesCapacity(mesh, count + 1);
          addRectToMesh(
            mesh,
            count++,
            startMs,
            startMs + bucketSizeMs,
            row,
            state,
            Math.min(us / bucketUs, 1),
          );
        }
      }
    },
  );

  setStatesCount(mesh, count);
}

/**
 * Sum each tile's state durations, weighted by the portion of each bucket
 * overlapping
 */
function resampleStatesByTile(
  overlaps: BucketOverlap<StateDurationsByTile>[],
): StateDurationsByTile {
  const resampled: StateDurationsByTile = new Map();
  for (const { value, overlapMs, bucketMs } of overlaps) {
    const weight = overlapMs / bucketMs;
    for (const [tileIdx, durationsUs] of value) {
      let sums = resampled.get(tileIdx);
      if (!sums) {
        sums = new Array<number | null>(durationsUs.length).fill(null);
        resampled.set(tileIdx, sums);
      }
      durationsUs.forEach((us, state) => {
        if (us == null) return;
        sums[state] = (sums[state] ?? 0) + us * weight;
      });
    }
  }
  return resampled;
}
