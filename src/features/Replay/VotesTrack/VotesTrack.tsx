import { getDefaultStore } from "jotai";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useThrottledCallback } from "use-debounce";
import { MAX_WEBGL_PX_RATIO, nsPerMs } from "../../../consts.ts";
import {
  votesFastFinalizeColor,
  votesImplicitColor,
  votesNotarColor,
  votesSkippedColor,
  votesSlowColor,
} from "../../../colors.ts";
import { epochAtom } from "../../../atoms.ts";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils.ts";
import type { AggGranularity, VotesGranularity } from "../../../api/types.ts";
import { VotesGranularityEnum } from "../../../api/entities.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import { getVisibleWorldRangeNs } from "../utils.ts";
import { resolveHeldDraw } from "../useAggQuery.ts";
import {
  drawEventType,
  timelineSlotsAtom,
  timelineSlotsEmitterAtom,
  type SlotInfo,
} from "../HeaderTrack/nonAggAtoms.ts";
import { trackNames } from "../layout.ts";
import TrackControls, { type LegendItem } from "../TrackControls.tsx";
import {
  useTileCacheQuery,
  useTileCacheSubscription,
} from "../tiles/useTileCache.ts";
import chartStyles from "../chart.module.css";
import styles from "./votesTrack.module.css";
import VoteLineLegend from "./VoteLineLegend.tsx";
import {
  FAST_FINALIZE_THRESHOLD,
  NOTAR_THRESHOLD,
  getMarkerStyle,
  getVotesGranularity,
  getVotesView,
  type VotesView,
} from "./consts.ts";
import { drawStrip, drawVotes, getFracY, getVotesPlotLayout } from "./draw.ts";
import {
  drawLatencyChart,
  getLatencyPlotLayout,
  getLatencyTicks,
  getLatencyY,
  getVisibleMaxLatency,
  type LatencyChartSeries,
} from "./drawLatency.ts";
import { getSlotLatencies } from "./latency.ts";
import { getAggLatencySeries, getSlotLatencySeries } from "./series.ts";
import {
  aggVotesAtom,
  aggVotesEmitterAtom,
  drawEventType as aggDrawEventType,
} from "./aggAtoms.ts";
import {
  getAggVotesGranularity,
  useAggVotesQuery,
} from "./useAggVotesQuery.ts";
import {
  getFallbackVotesTiles,
  isVotesRangeDrawable,
  VOTES_REGION_NS,
  votesCaches,
  type VotesCacheDelta,
} from "./votesCache.ts";
import { buildSlotVotes, type SlotVotes, type VotesData } from "./votesData.ts";

const store = getDefaultStore();

const AGG_CHART_ID = "votes-agg";
const DEFAULT_TARGET_SLOT_MS = 400;
const AGG_BOTTOM_PAD_PX = 4;

const curvesLegend: LegendItem[] = [
  { label: "Fast finalized", color: votesNotarColor },
  { label: "Slow finalized", color: votesSlowColor },
  { label: "Implicit / not final", color: votesImplicitColor },
  { label: "Skipped", color: votesSkippedColor },
];

const latencyLegend: LegendItem[] = [
  { label: "Notarized", color: votesNotarColor },
  { label: "Fast finalized", color: votesFastFinalizeColor },
  { label: "Finalized", color: votesFastFinalizeColor, description: "dotted" },
  { label: "Skipped", color: votesSkippedColor },
];

const thresholds = [FAST_FINALIZE_THRESHOLD, NOTAR_THRESHOLD];

const emptySeries: LatencyChartSeries = {
  notarized: [],
  fast: [],
  slow: [],
  skipped: [],
};

function getSpanMs([start, end]: TsRange) {
  return end - start;
}

function getSlotInfos() {
  const slotInfos = new Map<number, SlotInfo>();
  for (const group of store.get(timelineSlotsAtom).slotGroups.values()) {
    for (const [slot, info] of group.slots) slotInfos.set(slot, info);
  }
  return slotInfos;
}

/**
 * Visible range clamped to the world range, in absolute ns
 */
function getVisibleWorldNs(): NsTsRange | undefined {
  const referenceNs = store.get(referenceNsAtom);
  const visibleRangeMs = store.get(visibleRangeAtom);
  const worldRangeMs = store.get(worldRangeAtom);
  if (referenceNs == null || !visibleRangeMs || !worldRangeMs) return;
  return getVisibleWorldRangeNs(referenceNs, visibleRangeMs, worldRangeMs);
}

function getTargetSlotMs() {
  const targetNs = store.get(epochAtom)?.target_slot_duration_nanos;
  return targetNs ? targetNs / nsPerMs : DEFAULT_TARGET_SLOT_MS;
}

interface VotesTrackProps {
  width: number;
  height: number;
}

export default function VotesTrack({ width, height }: VotesTrackProps) {
  const [view, setView] = useState<VotesView>("curves");
  const [aggGranularity, setAggGranularity] = useState<AggGranularity>();
  const [latencyTicks, setLatencyTicks] = useState<number[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** target view, which is queried */
  const viewRef = useRef<VotesView>("curves");
  /** drawn view, held on a view change until the target view is drawable */
  const drawnViewRef = useRef<VotesView>();
  /** fallback tiles in the current slot votes */
  const fallbackKeyRef = useRef<string>();
  const slotVotesRef = useRef(new Map<number, SlotVotes>());
  const slotLatencySeriesRef = useRef(emptySeries);
  const slotInfosRef = useRef(new Map<number, SlotInfo>());
  const granularityRef = useRef<VotesGranularity>(VotesGranularityEnum.vote);
  const liveTilesRef = useRef<
    Record<VotesGranularity, { startNs: bigint; data: VotesData } | null>
  >({ vote: null, vote_batch: null });

  const {
    query: aggQuery,
    getDrawTiles,
    isVisibleDrawable: isAggVisibleDrawable,
    pauseStaleRefreshes: pauseStaleAggRefreshes,
  } = useAggVotesQuery(AGG_CHART_ID);

  /**
   * View to draw. Keep the previous view on a view change until the target
   * view can draw all of the visible range.
   */
  const resolveDrawnView = useCallback(
    (referenceNs: bigint, visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      const view = resolveHeldDraw(
        drawnViewRef.current,
        getVotesView(getSpanMs(visibleRangeMs)),
        (view) =>
          view === "aggLatency"
            ? isAggVisibleDrawable(referenceNs, visibleRangeMs, worldRangeMs)
            : isVotesRangeDrawable(
                granularityRef.current,
                getVisibleWorldRangeNs(
                  referenceNs,
                  visibleRangeMs,
                  worldRangeMs,
                ),
              ),
      );
      drawnViewRef.current = view;
      return view;
    },
    [isAggVisibleDrawable],
  );

  const drawLatency = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      visibleRangeMs: TsRange,
      series: LatencyChartSeries,
      bottomPx: number,
    ) => {
      const ticks = getLatencyTicks(
        getVisibleMaxLatency(series, visibleRangeMs),
      );
      setLatencyTicks((prev) => (prev.join() === ticks.join() ? prev : ticks));
      drawLatencyChart(ctx, {
        widthPx: width,
        visibleRangeMs,
        series,
        layout: getLatencyPlotLayout(bottomPx, ticks),
        ticks,
      });
    },
    [width],
  );

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    const referenceNs = store.get(referenceNsAtom);
    const visibleRangeMs = store.get(visibleRangeAtom);
    const worldRangeMs = store.get(worldRangeAtom);
    if (!ctx || referenceNs == null || !visibleRangeMs || !worldRangeMs) return;

    const pxRatio = Math.min(devicePixelRatio, MAX_WEBGL_PX_RATIO);
    ctx.setTransform(pxRatio, 0, 0, pxRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const spanMs = getSpanMs(visibleRangeMs);

    const view = resolveDrawnView(referenceNs, visibleRangeMs, worldRangeMs);
    setView(view);
    switch (view) {
      case "curves":
        drawVotes(ctx, {
          widthPx: width,
          heightPx: height,
          visibleRangeMs,
          slotVotes: slotVotesRef.current,
          slotInfos: slotInfosRef.current,
          markerStyle: getMarkerStyle(spanMs),
        });
        break;
      case "slotLatency": {
        const layout = getVotesPlotLayout(height);
        const pxPerMs = width / spanMs;
        drawStrip(
          ctx,
          layout,
          width,
          (ms) => (ms - visibleRangeMs[0]) * pxPerMs,
          slotVotesRef.current,
          slotInfosRef.current,
        );
        drawLatency(
          ctx,
          visibleRangeMs,
          slotLatencySeriesRef.current,
          layout.bottomPx,
        );
        break;
      }
      case "aggLatency": {
        const granularity = getAggVotesGranularity(spanMs);
        setAggGranularity(granularity);
        const series = getAggLatencySeries(
          store.get(aggVotesAtom),
          granularity,
          getDrawTiles,
          referenceNs,
          visibleRangeMs,
        );
        drawLatency(ctx, visibleRangeMs, series, height - AGG_BOTTOM_PAD_PX);
        break;
      }
    }
  }, [width, height, drawLatency, getDrawTiles, resolveDrawnView]);

  /**
   * Rebuild slot votes from the current granularity, with other granularity
   * tiles in place of visible regions it hasn't loaded. Unless `force`, skip
   * if the fallback tiles haven't changed. Returns whether it rebuilt.
   */
  const rebuildSlotVotes = useCallback((force = true) => {
    const granularity = granularityRef.current;
    const visibleWorldNs = getVisibleWorldNs();
    const fallback = visibleWorldNs
      ? getFallbackVotesTiles(granularity, visibleWorldNs)
      : { regionStartsNs: new Set<bigint>(), tiles: [] };
    const fallbackKey = fallback.tiles.map(({ startNs }) => startNs).join();
    if (!force && fallbackKey === fallbackKeyRef.current) return false;
    fallbackKeyRef.current = fallbackKey;

    const isReplaced = (startNs: bigint) =>
      fallback.regionStartsNs.has(
        (startNs / VOTES_REGION_NS) * VOTES_REGION_NS,
      );
    const tiles = votesCaches[granularity]
      .getTiles()
      .filter(({ startNs }) => !isReplaced(startNs))
      .map(({ data }) => data);
    const live = liveTilesRef.current[granularity];
    if (live && !isReplaced(live.startNs)) tiles.push(live.data);
    for (const { data } of fallback.tiles) tiles.push(data);

    slotVotesRef.current = buildSlotVotes(tiles);
    slotLatencySeriesRef.current = getSlotLatencySeries(
      getSlotLatencies(slotVotesRef.current, getTargetSlotMs()),
    );
    return true;
  }, []);

  const queryVote = useTileCacheQuery(votesCaches.vote);
  const queryBatch = useTileCacheQuery(votesCaches.vote_batch);

  const throttledQuery = useThrottledCallback(
    (referenceNs: bigint, visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      if (viewRef.current === "aggLatency") {
        aggQuery(
          referenceNs,
          visibleRangeMs,
          worldRangeMs,
          getAggVotesGranularity(getSpanMs(visibleRangeMs)),
        );
        return;
      }
      const query =
        granularityRef.current === VotesGranularityEnum.vote
          ? queryVote
          : queryBatch;
      query(referenceNs, visibleRangeMs, worldRangeMs);
    },
    100,
    { leading: true, trailing: true },
  );

  const requestRange = useCallback(() => {
    const referenceNs = store.get(referenceNsAtom);
    const visibleRangeMs = store.get(visibleRangeAtom);
    const worldRangeMs = store.get(worldRangeAtom);
    if (referenceNs == null || !visibleRangeMs || !worldRangeMs) return;

    const spanMs = getSpanMs(visibleRangeMs);
    const nextView = getVotesView(spanMs);
    if (nextView !== viewRef.current) {
      if (viewRef.current === "aggLatency") pauseStaleAggRefreshes();
      viewRef.current = nextView;
    }

    const granularity =
      nextView === "aggLatency" ? undefined : getVotesGranularity(spanMs);
    if (granularity && granularity !== granularityRef.current) {
      granularityRef.current = granularity;
      rebuildSlotVotes();
    } else if (rebuildSlotVotes(false)) {
      // visible fallback tiles changed
      draw();
    }
    throttledQuery(referenceNs, visibleRangeMs, worldRangeMs);
  }, [draw, pauseStaleAggRefreshes, rebuildSlotVotes, throttledQuery]);

  useLayoutEffect(() => {
    rebuildSlotVotes();
    slotInfosRef.current = getSlotInfos();
    const onSlots = () => {
      slotInfosRef.current = getSlotInfos();
      draw();
    };
    const slotsEmitter = store.get(timelineSlotsEmitterAtom);
    slotsEmitter.addListener(drawEventType, onSlots);
    const aggEmitter = store.get(aggVotesEmitterAtom);
    aggEmitter.addListener(aggDrawEventType, draw);

    const unsubVisible = store.sub(visibleRangeAtom, () => {
      requestRange();
      draw();
    });
    const unsubWorld = store.sub(worldRangeAtom, requestRange);
    requestRange();

    return () => {
      slotsEmitter.removeListener(drawEventType, onSlots);
      aggEmitter.removeListener(aggDrawEventType, draw);
      unsubVisible();
      unsubWorld();
      throttledQuery.cancel();
    };
  }, [draw, rebuildSlotVotes, requestRange, throttledQuery]);

  const handleDelta = useCallback(
    (granularity: VotesGranularity, delta: VotesCacheDelta) => {
      const liveTiles = liveTilesRef.current;
      const live = liveTiles[granularity];
      if (delta.kind === "live") {
        liveTiles[granularity] = delta.tile;
      } else if (delta.kind === "clearLive" || delta.kind === "reset") {
        liveTiles[granularity] = null;
      } else if (live && delta.tiles.some((t) => t.startNs === live.startNs)) {
        liveTiles[granularity] = null;
      }

      if (granularity !== granularityRef.current) {
        // other granularity tiles are only drawn as a fallback
        if (rebuildSlotVotes(false)) draw();
        return;
      }
      rebuildSlotVotes();
      draw();
    },
    [draw, rebuildSlotVotes],
  );
  const onDeltaVote = useCallback(
    (delta: VotesCacheDelta) => handleDelta(VotesGranularityEnum.vote, delta),
    [handleDelta],
  );
  const onDeltaBatch = useCallback(
    (delta: VotesCacheDelta) =>
      handleDelta(VotesGranularityEnum.vote_batch, delta),
    [handleDelta],
  );
  useTileCacheSubscription(votesCaches.vote, onDeltaVote);
  useTileCacheSubscription(votesCaches.vote_batch, onDeltaBatch);

  // resize
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pxRatio = Math.min(devicePixelRatio, MAX_WEBGL_PX_RATIO);
    canvas.width = Math.round(width * pxRatio);
    canvas.height = Math.round(height * pxRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    draw();
  }, [width, height, draw]);

  const curvesLayout = getVotesPlotLayout(height);
  const latencyLayout = getLatencyPlotLayout(
    view === "aggLatency" ? height - AGG_BOTTOM_PAD_PX : curvesLayout.bottomPx,
    latencyTicks.length ? latencyTicks : getLatencyTicks(0),
  );
  const yLabels =
    view === "curves"
      ? thresholds.map((frac) => ({
          label: `${Math.round(frac * 100)}%`,
          top: getFracY(curvesLayout, frac),
        }))
      : latencyTicks.map((ms) => ({
          label: `${ms} ms`,
          top: getLatencyY(latencyLayout, ms),
        }));

  const description =
    view === "curves"
      ? "stake per slot"
      : view === "slotLatency"
        ? "time to certificate per slot"
        : `time to certificate per ${aggGranularity ?? ""}`;

  return (
    <>
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={chartStyles.yAxis}>
        {yLabels.map(({ label, top }) => (
          <div key={label} className={chartStyles.yAxisTick} style={{ top }}>
            <span className={chartStyles.yAxisTickLabel}>{label}</span>
          </div>
        ))}
      </div>
      <TrackControls
        name={trackNames.votes}
        bucketSize={undefined}
        description={description}
        trackId="votes"
        legend={view === "curves" ? curvesLegend : latencyLegend}
      >
        {view === "curves" && <VoteLineLegend />}
      </TrackControls>
    </>
  );
}
