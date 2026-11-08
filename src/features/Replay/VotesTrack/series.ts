import type { AggGranularity } from "../../../api/types";
import type { TsRange } from "../../WebGl/webglUtils";
import { msBucketSizes, nsBucketSizes } from "../const";
import { calcAbsoluteNs, calcRelativeMs, getBucketIdx } from "../utils";
import type { AggVotesByGranularity, AggVotesBucket } from "./aggAtoms";
import type { LatencyChartPoint, LatencyChartSeries } from "./latencyGeometry";
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
  };
}

export function getAggLatencySeries(
  aggVotes: AggVotesByGranularity,
  granularity: AggGranularity,
  referenceNs: bigint,
  [startMs, endMs]: TsRange,
): LatencyChartSeries {
  const series: LatencyChartSeries = {
    notarized: [],
    fast: [],
    slow: [],
  };
  const buckets = aggVotes.get(granularity);
  if (!buckets) return series;

  // one bucket past each edge so lines reach the edges
  const firstIdx =
    getBucketIdx(calcAbsoluteNs(referenceNs, startMs), granularity, false) - 1;
  const lastIdx =
    getBucketIdx(calcAbsoluteNs(referenceNs, endMs), granularity, true) + 1;
  const halfBucketMs = msBucketSizes[granularity] / 2;

  const lines = ["notarized", "fast", "slow"] as const;
  const broken = { notarized: true, fast: true, slow: true };
  for (let idx = firstIdx; idx <= lastIdx; idx++) {
    const bucket: AggVotesBucket | undefined = buckets.get(idx);
    const ts =
      calcRelativeMs(referenceNs, BigInt(idx) * nsBucketSizes[granularity]) +
      halfBucketMs;
    for (const line of lines) {
      const latencyMs = bucket?.[line];
      if (latencyMs == null) {
        broken[line] = true;
        continue;
      }
      series[line].push({ ts, latencyMs, breakBefore: broken[line] });
      broken[line] = false;
    }
  }
  return series;
}
