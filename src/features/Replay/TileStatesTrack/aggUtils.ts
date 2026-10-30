import type { TsRange } from "../../WebGl/webglUtils";
import { TileState } from "../../../api/entities";
import { msBucketSizes, nsBucketSizes } from "../const";
import { OVERSCAN_BUCKETS } from "../useAggQuery";
import { calcAbsoluteNs, calcRelativeMs, getBucketIdx } from "../utils";
import type { TileStatesBucketsByGranularity } from "./aggAtoms";
import { getAggGranularity } from "./useAggTileStatesQuery";
import { ensureStatesCapacity, setStatesCount } from "./tileStatesMesh";
import {
  addRectToMesh,
  getRowLayout,
  getRowOfTile,
  tileYPosition,
  updateDataTileMeshPositions,
  type RendererObj,
} from "./utils";

/**
 * Rebuilds the agg mesh for the visible range at the appropriate granularity.
 * Each tile's bucket gets a rect per state, weighted by the state's fraction of
 * the bucket, so the non-agg coverage passes shade it the same way.
 */
export function buildAggStatesMesh(
  rendererObj: RendererObj,
  referenceNs: bigint,
  visibleRange: TsRange,
  aggTileStates: TileStatesBucketsByGranularity,
) {
  const mesh = rendererObj.aggMeshes.tileStates;
  const rowOfTile = getRowOfTile(rendererObj.kind);
  const granularity = getAggGranularity(visibleRange[1] - visibleRange[0]);
  const statesByBucketIdx = aggTileStates.get(granularity);

  let count = 0;
  if (statesByBucketIdx && rowOfTile.size) {
    const bucketSizeMs = msBucketSizes[granularity];
    const bucketUs = bucketSizeMs * 1_000;
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

    // rects are stored in ms from the first bucket.
    // use bigint to prevent ms rounding imprecision
    mesh.referenceX = calcRelativeMs(
      referenceNs,
      BigInt(startIdx) * nsBucketSizes[granularity],
    );
    updateDataTileMeshPositions(rendererObj, rendererObj.aggMeshes);

    const { rowH, barH } = getRowLayout(rowOfTile);
    for (let bucketIdx = startIdx; bucketIdx <= endIdx; bucketIdx++) {
      const statesByTile = statesByBucketIdx.get(bucketIdx);
      if (!statesByTile) continue;

      const startMs = mesh.referenceX + (bucketIdx - startIdx) * bucketSizeMs;
      for (const [tileIdx, durationsUs] of statesByTile) {
        const row = rowOfTile.get(tileIdx);
        if (row === undefined) continue;
        const y = tileYPosition(row, rowH);

        // agg reports states 0-9. Idle isn't drawn, since time without a busy
        // state is idle
        const stateCount = Math.min(
          durationsUs.length,
          TileState.SlotFinish + 1,
        );
        for (let state = TileState.Idle + 1; state < stateCount; state++) {
          const us = durationsUs[state];
          if (!us) continue;

          ensureStatesCapacity(mesh, count + 1);
          addRectToMesh(
            mesh,
            count++,
            startMs,
            startMs + bucketSizeMs,
            y,
            barH,
            state,
            Math.min(us / bucketUs, 1),
          );
        }
      }
    }
  }

  setStatesCount(mesh, count);
}
