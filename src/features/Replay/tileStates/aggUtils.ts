import type { TsRange } from "../../WebGl/webglUtils";
import type { AggGranularity } from "../../../api/types";
import { usPerMs } from "../../../consts";
import { msBucketSizes, nsBucketSizes } from "../const";
import { calcAbsoluteNs, calcRelativeMs, getBucketIdx } from "../utils";
import type { TileStatesBucketsByGranularity } from "./aggAtoms";
import { getAggGranularity, OVERSCAN_BUCKETS } from "./useAggTileStatesQuery";
import { ensureStatesCapacity, setStatesCount } from "./tileStatesMesh";
import {
  addRectToMesh,
  getRowOfTile,
  updateDataTileMeshPositions,
  type RendererObj,
} from "./utils";

/**
 * What the agg mesh was last built from, to skip rebuilding the same rects.
 * Cleared when the agg data or rows change.
 */
export interface AggMeshBuild {
  referenceNs: bigint;
  granularity: AggGranularity;
  startIdx: number;
  endIdx: number;
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
 * Rebuilds the agg mesh if the view left the built bucket range, or the
 * granularity changed, and updates the lane scale.
 * Returns whether anything drawn changed.
 */
export function updateAggStatesMesh(
  rendererObj: RendererObj,
  referenceNs: bigint,
  visibleRange: TsRange,
  aggTileStates: TileStatesBucketsByGranularity,
) {
  const granularity = getAggGranularity(visibleRange[1] - visibleRange[0]);
  const [visibleStartIdx, visibleEndIdx] = getVisibleBucketRange(
    referenceNs,
    visibleRange,
    granularity,
  );

  const built = rendererObj.aggMeshBuild;
  const isBuilt =
    built?.referenceNs === referenceNs &&
    built.granularity === granularity &&
    built.startIdx <= visibleStartIdx &&
    visibleEndIdx <= built.endIdx;
  if (!isBuilt) {
    const startIdx = visibleStartIdx - OVERSCAN_BUCKETS;
    const endIdx = visibleEndIdx + OVERSCAN_BUCKETS;
    const build: AggMeshBuild = {
      referenceNs,
      granularity,
      startIdx,
      endIdx,
      maxStateShares: new Float32Array(endIdx - startIdx + 1),
    };
    buildAggStatesMesh(rendererObj, build, aggTileStates);
    rendererObj.aggMeshBuild = build;
  }

  const shareChanged = updateAggMaxStateShare(rendererObj, visibleRange);
  return !isBuilt || shareChanged;
}

/**
 * Builds a rect per busy state weighted by its time share of its bucket, and
 * records each bucket's largest share of busy time any state has
 */
function buildAggStatesMesh(
  rendererObj: RendererObj,
  { referenceNs, granularity, startIdx, endIdx, maxStateShares }: AggMeshBuild,
  aggTileStates: TileStatesBucketsByGranularity,
) {
  const mesh = rendererObj.aggMeshes.tileStates;
  const rowOfTile = getRowOfTile(rendererObj.config.kind);
  const states = rendererObj.config.getStates(undefined);
  const statesByBucketIdx = aggTileStates.get(granularity);

  if (!statesByBucketIdx || !rowOfTile.size) {
    setStatesCount(mesh, 0);
    return;
  }

  const bucketSizeMs = msBucketSizes[granularity];
  const bucketUs = bucketSizeMs * usPerMs;

  mesh.referenceX = calcRelativeMs(
    referenceNs,
    BigInt(startIdx) * nsBucketSizes[granularity],
  );
  updateDataTileMeshPositions(rendererObj, rendererObj.aggMeshes);
  ensureStatesCapacity(
    mesh,
    (endIdx - startIdx + 1) * rowOfTile.size * states.length,
  );

  let count = 0;
  for (let bucketIdx = startIdx; bucketIdx <= endIdx; bucketIdx++) {
    const statesByTile = statesByBucketIdx.get(bucketIdx);
    if (!statesByTile) continue;

    const startMs = mesh.referenceX + (bucketIdx - startIdx) * bucketSizeMs;
    let maxStateShare = 0;
    for (const [tileIdx, durationsUs] of statesByTile) {
      const row = rowOfTile.get(tileIdx);
      if (row === undefined) continue;

      let busyWeight = 0;
      let maxWeight = 0;
      for (const state of states) {
        const us = durationsUs[state];
        if (!us) continue;

        const weight = Math.min(us / bucketUs, 1);
        busyWeight += weight;
        maxWeight = Math.max(maxWeight, weight);
        addRectToMesh(
          mesh,
          count++,
          startMs,
          startMs + bucketSizeMs,
          row,
          state,
          weight,
        );
      }
      if (busyWeight > 0) {
        maxStateShare = Math.max(maxStateShare, maxWeight / busyWeight);
      }
    }
    maxStateShares[bucketIdx - startIdx] = maxStateShare;
  }

  setStatesCount(mesh, count);
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
