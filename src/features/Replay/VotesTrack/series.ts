import type { AggGranularity } from "../../../api/types";
import { msBucketSizes, nsBucketSizes } from "../const";
import type { CoverageSpan, DataLevel } from "../coverage";
import { calcRelativeMs, getBucketIdx } from "../utils";
import type { AggVotesByGranularity } from "./aggAtoms";
import type { LatencyChartPoint, LatencyChartSeries } from "./latencyGeometry";
import type { LatencyPoint, SlotLatencies } from "./latency";

function toSlotPoints(points: LatencyPoint[]): LatencyChartPoint[] {
  return points.map(({ slot, ts, latencyMs }, i) => ({
    slot,
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

function lerp(
  fromTs: number,
  fromMs: number,
  toTs: number,
  toMs: number,
  atMs: number,
) {
  return fromMs + ((toMs - fromMs) * (atMs - fromTs)) / (toTs - fromTs);
}

function firstPointAtOrAfter(points: LatencyChartPoint[], ms: number) {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (points[mid].ts < ms) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function getCoverageLatencySeries(
  spans: CoverageSpan[],
  targetLevel: DataLevel,
  aggVotes: AggVotesByGranularity,
  slotSeries: LatencyChartSeries,
  referenceNs: bigint,
): LatencyChartSeries {
  const series: LatencyChartSeries = {
    notarized: [],
    fast: [],
    slow: [],
  };
  const lines = ["notarized", "fast", "slow"] as const;
  const broken = { notarized: true, fast: true, slow: true };

  spans.forEach(({ rangeNs, level = targetLevel }, i) => {
    const isFirst = i === 0;
    const isLast = i === spans.length - 1;
    const spanStartMs = calcRelativeMs(referenceNs, rangeNs[0]);
    const spanEndMs = calcRelativeMs(referenceNs, rangeNs[1]);

    if (!level.isAgg) {
      for (const line of lines) {
        const points = slotSeries[line];
        // one point past the outer spans' edges so lines reach the edges
        let startIdx = firstPointAtOrAfter(points, spanStartMs);
        if (isFirst) startIdx = Math.max(0, startIdx - 1);
        let endIdx = firstPointAtOrAfter(points, spanEndMs);
        if (isLast) endIdx = Math.min(points.length, endIdx + 1);

        for (let idx = startIdx; idx < endIdx; idx++) {
          const point = points[idx];
          series[line].push(
            broken[line] && !point.breakBefore
              ? { ...point, breakBefore: true }
              : point,
          );
          broken[line] = false;
        }
        // no samples in the span, so don't connect across it
        if (startIdx >= endIdx) broken[line] = true;
      }
      return;
    }

    // points past the outer spans so lines reach the edges
    const startMs = isFirst ? -Infinity : spanStartMs;
    const endMs = isLast ? Infinity : spanEndMs;
    const granularity = level.id as AggGranularity;
    const buckets = aggVotes.get(granularity);
    // one bucket past each side, to clip lines where they cross the span edges
    const firstIdx = getBucketIdx(rangeNs[0], granularity, false) - 1;
    const lastIdx = getBucketIdx(rangeNs[1], granularity, true) + 1;
    const bucketMs = msBucketSizes[granularity];
    // bucket centers stepped in ms, to avoid bigint math per bucket
    const firstTs =
      calcRelativeMs(
        referenceNs,
        BigInt(firstIdx) * nsBucketSizes[granularity],
      ) +
      bucketMs / 2;

    // previous bucket's sample per line, NaN if it has none
    const prevTs = { notarized: NaN, fast: NaN, slow: NaN };
    const prevLatencyMs = { notarized: NaN, fast: NaN, slow: NaN };
    const hasPoints = { notarized: false, fast: false, slow: false };
    const push = (
      line: (typeof lines)[number],
      ts: number,
      latencyMs: number,
    ) => {
      series[line].push({
        slot: undefined,
        ts,
        latencyMs,
        breakBefore: broken[line],
      });
      broken[line] = false;
      hasPoints[line] = true;
    };

    for (let idx = firstIdx; idx <= lastIdx; idx++) {
      const ts = firstTs + (idx - firstIdx) * bucketMs;
      const isInSpan = ts >= startMs && ts <= endMs;
      const bucket = buckets?.get(idx);
      for (const line of lines) {
        const latencyMs = bucket?.[line];
        if (latencyMs == null) {
          if (isInSpan) broken[line] = true;
          prevTs[line] = NaN;
          continue;
        }

        const prevSampleTs = prevTs[line];
        const prevSampleMs = prevLatencyMs[line];
        // a coarse bucket's segment can cross the span without a sample in it
        if (prevSampleTs < startMs && ts > startMs) {
          const atStartMs = lerp(
            prevSampleTs,
            prevSampleMs,
            ts,
            latencyMs,
            startMs,
          );
          push(line, startMs, atStartMs);
        }
        if (prevSampleTs < endMs && ts > endMs) {
          const atEndMs = lerp(
            prevSampleTs,
            prevSampleMs,
            ts,
            latencyMs,
            endMs,
          );
          push(line, endMs, atEndMs);
        }
        if (isInSpan) push(line, ts, latencyMs);
        prevTs[line] = ts;
        prevLatencyMs[line] = latencyMs;
      }
    }
    for (const line of lines) {
      // no samples in the span, so don't connect across it
      if (!hasPoints[line]) broken[line] = true;
    }
  });
  return series;
}
