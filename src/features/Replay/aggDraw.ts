import type { AggGranularity } from "../../api/types";
import type { NsTsRange } from "../WebGl/webglUtils";
import { msBucketSizes, nsBucketSizes } from "./const";
import { resolveCoverage, type DataLevel } from "./coverage";

/** Inclusive draw bucket idxs of a coverage span, drawn from `granularity` */
export interface AggDrawTile {
  granularity: AggGranularity;
  first: number;
  last: number;
}

export type GetDrawTiles = (
  drawGranularity: AggGranularity,
  firstBucketIdx: number,
  lastBucketIdx: number,
) => AggDrawTile[];

/** Which agg granularity to draw each span of the buckets from */
export function getCoverageDrawTiles(
  granularityLevels: DataLevel[],
  targetLevelId: string,
  windowNs: bigint,
  worldRangeNs: NsTsRange | undefined,
  drawGranularity: AggGranularity,
  firstBucketIdx: number,
  lastBucketIdx: number,
): AggDrawTile[] {
  const bucketNs = nsBucketSizes[drawGranularity];
  const ceilBucketIdx = (ns: bigint) => Number((ns + bucketNs - 1n) / bucketNs);

  const spans = resolveCoverage(
    granularityLevels,
    targetLevelId,
    [BigInt(firstBucketIdx) * bucketNs, BigInt(lastBucketIdx + 1) * bucketNs],
    windowNs,
    worldRangeNs,
  );

  const drawTiles: AggDrawTile[] = [];
  for (const { rangeNs, level } of spans) {
    if (!level?.isAgg) continue;
    // A bucket belongs to the span containing its start, so spans that aren't
    // bucket aligned don't share buckets
    const first = ceilBucketIdx(rangeNs[0]);
    const last = ceilBucketIdx(rangeNs[1]) - 1;
    if (last < first) continue;
    drawTiles.push({
      granularity: level.id as AggGranularity,
      first,
      last,
    });
  }
  return drawTiles;
}

/**
 * A bucket overlapping a draw bucket, with the overlap duration
 */
export interface BucketOverlap<V> {
  value: V;
  overlapMs: number;
  bucketMs: number;
}

/** Yield each drawn bucket's value resampling fallback granularity buckets */
export function* drawnBuckets<V>(
  drawTiles: AggDrawTile[],
  drawGranularity: AggGranularity,
  bucketsByGranularity: Map<AggGranularity, Map<number, V>>,
  resample: (overlaps: BucketOverlap<V>[]) => V,
): Generator<[bucketIdx: number, value: V]> {
  const drawBucketMs = msBucketSizes[drawGranularity];
  for (const { granularity, first, last } of drawTiles) {
    const buckets = bucketsByGranularity.get(granularity);
    if (!buckets) continue;
    const fallbackMs = msBucketSizes[granularity];

    for (let bucketIdx = first; bucketIdx <= last; bucketIdx++) {
      if (granularity === drawGranularity) {
        const value = buckets.get(bucketIdx);
        if (value !== undefined) yield [bucketIdx, value];
        continue;
      }

      const startMs = bucketIdx * drawBucketMs;
      const endMs = startMs + drawBucketMs;
      const overlaps: BucketOverlap<V>[] = [];
      for (
        let fallbackIdx = Math.floor(startMs / fallbackMs);
        fallbackIdx * fallbackMs < endMs;
        fallbackIdx++
      ) {
        const value = buckets.get(fallbackIdx);
        if (value === undefined) continue;
        const overlapMs =
          Math.min(endMs, (fallbackIdx + 1) * fallbackMs) -
          Math.max(startMs, fallbackIdx * fallbackMs);
        overlaps.push({ value, overlapMs, bucketMs: fallbackMs });
      }
      if (overlaps.length) yield [bucketIdx, resample(overlaps)];
    }
  }
}

export function getDrawnBucket<V>(
  getDrawTiles: GetDrawTiles,
  drawGranularity: AggGranularity,
  bucketIdx: number,
  bucketsByGranularity: Map<AggGranularity, Map<number, V>>,
  resample: (overlaps: BucketOverlap<V>[]) => V,
): V | undefined {
  for (const [, value] of drawnBuckets(
    getDrawTiles(drawGranularity, bucketIdx, bucketIdx),
    drawGranularity,
    bucketsByGranularity,
    resample,
  )) {
    return value;
  }
}
