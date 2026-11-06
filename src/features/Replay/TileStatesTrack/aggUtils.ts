import type { TsRange } from "../../WebGl/webglUtils";
import { usPerMs } from "../../../consts";
import { msBucketSizes, nsBucketSizes } from "../const";
import { calcAbsoluteNs, calcRelativeMs, getBucketIdx } from "../utils";
import type { TileStatesBucketsByGranularity } from "./aggAtoms";
import { getAggGranularity, OVERSCAN_BUCKETS } from "./useAggTileStatesQuery";
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
) {
  const mesh = rendererObj.aggMeshes.tileStates;
  const rowOfTile = getRowOfTile(rendererObj.kind);
  const states = trackStates[rendererObj.kind].agg;
  const granularity = getAggGranularity(visibleRange[1] - visibleRange[0]);
  const statesByBucketIdx = aggTileStates.get(granularity);

  if (!statesByBucketIdx || !rowOfTile.size) {
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
  for (let bucketIdx = startIdx; bucketIdx <= endIdx; bucketIdx++) {
    const statesByTile = statesByBucketIdx.get(bucketIdx);
    if (!statesByTile) continue;

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
  }

  setStatesCount(mesh, count);
}
