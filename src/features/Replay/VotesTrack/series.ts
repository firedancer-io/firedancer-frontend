import type { AggGranularity } from "../../../api/types";
import type { TsRange } from "../../WebGl/webglUtils";
import { msBucketSizes, nsBucketSizes } from "../const";
import { calcAbsoluteNs, calcRelativeMs, getBucketIdx } from "../utils";
import {
  forEachDrawnBucket,
  type BucketOverlap,
  type GetDrawTiles,
} from "../useAggQuery";
import type { AggVotesByGranularity, AggVotesBucket } from "./aggAtoms";
import type { LatencyChartPoint, LatencyChartSeries } from "./drawLatency";
import type { LatencyPoint, SlotLatencies } from "./latency";

function toSlotPoints(points: LatencyPoint[]): LatencyChartPoint[] {
  return points.map(({ slot, ts, latencyMs }, i) => ({
    ts,
    latencyMs,
    breakBefore: i > 0 && slot !== points[i - 1].slot + 1,
  }));
}

export function getSlotLatencySeries(
  latencies: SlotLatencies,
): LatencyChartSeries {
  return {
    notarized: toSlotPoints(latencies.notarized),
    fast: toSlotPoints(latencies.fast),
    slow: toSlotPoints(latencies.slow),
    skipped: latencies.skipped.map(({ ts }) => ts),
  };
}

export function getAggLatencySeries(
  aggVotes: AggVotesByGranularity,
  granularity: AggGranularity,
  getDrawTiles: GetDrawTiles,
  referenceNs: bigint,
  [startMs, endMs]: TsRange,
): LatencyChartSeries {
  const series: LatencyChartSeries = {
    notarized: [],
    fast: [],
    slow: [],
    skipped: [],
  };

  // one bucket past each edge so lines reach the edges
  const firstIdx =
    getBucketIdx(calcAbsoluteNs(referenceNs, startMs), granularity, false) - 1;
  const lastIdx =
    getBucketIdx(calcAbsoluteNs(referenceNs, endMs), granularity, true) + 1;
  const halfBucketMs = msBucketSizes[granularity] / 2;

  const lines = ["notarized", "fast", "slow"] as const;
  // break lines across buckets without a sample
  const prevIdxs = { notarized: -Infinity, fast: -Infinity, slow: -Infinity };
  forEachDrawnBucket(
    getDrawTiles(granularity, firstIdx, lastIdx),
    granularity,
    aggVotes,
    resampleVotes,
    (idx, bucket) => {
      const ts =
        calcRelativeMs(referenceNs, BigInt(idx) * nsBucketSizes[granularity]) +
        halfBucketMs;
      for (const line of lines) {
        const latencyMs = bucket[line];
        if (latencyMs == null) continue;
        series[line].push({
          ts,
          latencyMs,
          breakBefore: idx !== prevIdxs[line] + 1,
        });
        prevIdxs[line] = idx;
      }
      if (bucket.skippedCnt) series.skipped.push(ts);
    },
  );
  return series;
}

/**
 * Average each latency, weighted by the portion of each bucket overlapping.
 * Sum skipped counts, weighted the same way.
 */
function resampleVotes(
  overlaps: BucketOverlap<AggVotesBucket>[],
): AggVotesBucket {
  const resampleLatency = (line: "notarized" | "fast" | "slow") => {
    let sum = 0;
    let weight = 0;
    for (const { value, overlapMs } of overlaps) {
      const latencyMs = value[line];
      if (latencyMs == null) continue;
      sum += latencyMs * overlapMs;
      weight += overlapMs;
    }
    return weight ? sum / weight : null;
  };

  let skippedCnt = 0;
  for (const { value, overlapMs, bucketMs } of overlaps) {
    skippedCnt += (value.skippedCnt * overlapMs) / bucketMs;
  }
  return {
    notarized: resampleLatency("notarized"),
    fast: resampleLatency("fast"),
    slow: resampleLatency("slow"),
    skippedCnt,
  };
}
