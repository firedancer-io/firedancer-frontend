import clsx from "clsx";
import { getDefaultStore } from "jotai";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useThrottledCallback } from "use-debounce";
import { MAX_WEBGL_PX_RATIO, nsPerMs } from "../../../consts.ts";
import { votesFastFinalizeColor, votesNotarColor } from "../../../colors.ts";
import { epochAtom } from "../../../atoms.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import { useFrameRender } from "../../WebGl/useFrameRender.ts";
import type { AggGranularity, VotesGranularity } from "../../../api/types.ts";
import { VotesGranularityEnum } from "../../../api/entities.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import { getVisibleYLabels, trackNames } from "../layout.ts";
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
  type MarkerStyle,
  type VotesView,
} from "./consts.ts";
import {
  drawVotes,
  getFracY,
  getVotesPlotLayout,
  loadCertIcons,
  type CertIcons,
} from "./draw.ts";
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
import { votesCaches, type VotesCacheDelta } from "./votesCache.ts";
import { buildSlotVotes, type SlotVotes, type VotesData } from "./votesData.ts";

const store = getDefaultStore();

const AGG_CHART_ID = "votes-agg";
const DEFAULT_TARGET_SLOT_MS = 400;
const latencyLegend: LegendItem[] = [
  { label: "Notarized", color: votesNotarColor },
  { label: "Fast finalized", color: votesFastFinalizeColor },
  { label: "Finalized", color: votesFastFinalizeColor, description: "dotted" },
];

const thresholds = [FAST_FINALIZE_THRESHOLD, NOTAR_THRESHOLD];

const emptySeries: LatencyChartSeries = {
  notarized: [],
  fast: [],
  slow: [],
};

function getSpanMs([start, end]: TsRange) {
  return end - start;
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
  const [markerStyle, setMarkerStyle] = useState<MarkerStyle>("icon");
  const [aggGranularity, setAggGranularity] = useState<AggGranularity>();
  const [latencyTicks, setLatencyTicks] = useState<number[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const certIconsRef = useRef<CertIcons>();
  const viewRef = useRef<VotesView>("curves");
  const slotVotesRef = useRef(new Map<number, SlotVotes>());
  const slotLatencySeriesRef = useRef(emptySeries);
  const granularityRef = useRef<VotesGranularity>(VotesGranularityEnum.vote);
  const liveTilesRef = useRef<
    Record<VotesGranularity, { startNs: bigint; data: VotesData } | null>
  >({ vote: null, vote_batch: null });

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
    const visibleRangeMs = store.get(visibleRangeAtom);
    if (!ctx || !visibleRangeMs) return;

    const pxRatio = Math.min(devicePixelRatio, MAX_WEBGL_PX_RATIO);
    ctx.setTransform(pxRatio, 0, 0, pxRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const spanMs = getSpanMs(visibleRangeMs);

    switch (getVotesView(spanMs)) {
      case "curves":
        drawVotes(ctx, {
          widthPx: width,
          heightPx: height,
          visibleRangeMs,
          slotVotes: slotVotesRef.current,
          markerStyle: getMarkerStyle(spanMs),
          certIcons: certIconsRef.current,
        });
        break;
      case "slotLatency":
        drawLatency(
          ctx,
          visibleRangeMs,
          slotLatencySeriesRef.current,
          getVotesPlotLayout(height).bottomPx,
        );
        break;
      case "aggLatency": {
        const referenceNs = store.get(referenceNsAtom);
        if (referenceNs == null) return;
        const series = getAggLatencySeries(
          store.get(aggVotesAtom),
          getAggVotesGranularity(spanMs),
          referenceNs,
          visibleRangeMs,
        );
        drawLatency(
          ctx,
          visibleRangeMs,
          series,
          getVotesPlotLayout(height).bottomPx,
        );
        break;
      }
    }
  }, [width, height, drawLatency]);
  const requestRender = useFrameRender(draw);

  const rebuildSlotVotes = useCallback(() => {
    const granularity = granularityRef.current;
    const tiles = votesCaches[granularity].getTiles().map(({ data }) => data);
    const live = liveTilesRef.current[granularity];
    if (live) tiles.push(live.data);
    slotVotesRef.current = buildSlotVotes(tiles);
    slotLatencySeriesRef.current = getSlotLatencySeries(
      getSlotLatencies(slotVotesRef.current, getTargetSlotMs()),
    );
  }, []);

  const queryVote = useTileCacheQuery(votesCaches.vote);
  const queryBatch = useTileCacheQuery(votesCaches.vote_batch);
  const { query: aggQuery, pauseStaleRefreshes: pauseStaleAggRefreshes } =
    useAggVotesQuery(AGG_CHART_ID);

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
      setView(nextView);
    }
    setMarkerStyle(getMarkerStyle(spanMs));

    if (nextView === "aggLatency") {
      setAggGranularity(getAggVotesGranularity(spanMs));
    } else {
      const granularity = getVotesGranularity(spanMs);
      if (granularity !== granularityRef.current) {
        granularityRef.current = granularity;
        rebuildSlotVotes();
      }
    }
    throttledQuery(referenceNs, visibleRangeMs, worldRangeMs);
  }, [pauseStaleAggRefreshes, rebuildSlotVotes, throttledQuery]);

  useLayoutEffect(() => {
    rebuildSlotVotes();
    const aggEmitter = store.get(aggVotesEmitterAtom);
    aggEmitter.addListener(aggDrawEventType, requestRender);

    const unsubVisible = store.sub(visibleRangeAtom, () => {
      requestRange();
      requestRender();
    });
    const unsubWorld = store.sub(worldRangeAtom, requestRange);
    requestRange();

    return () => {
      aggEmitter.removeListener(aggDrawEventType, requestRender);
      unsubVisible();
      unsubWorld();
      throttledQuery.cancel();
    };
  }, [rebuildSlotVotes, requestRange, requestRender, throttledQuery]);

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

      if (granularity !== granularityRef.current) return;
      rebuildSlotVotes();
      requestRender();
    },
    [rebuildSlotVotes, requestRender],
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

  useEffect(() => {
    let cancelled = false;
    void loadCertIcons().then((icons) => {
      if (cancelled) return;
      certIconsRef.current = icons;
      requestRender();
    });
    return () => {
      cancelled = true;
    };
  }, [requestRender]);

  // resize
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pxRatio = Math.min(devicePixelRatio, MAX_WEBGL_PX_RATIO);
    canvas.width = Math.round(width * pxRatio);
    canvas.height = Math.round(height * pxRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    requestRender();
  }, [width, height, requestRender]);

  const curvesLayout = getVotesPlotLayout(height);
  const latencyLayout = getLatencyPlotLayout(
    curvesLayout.bottomPx,
    latencyTicks.length ? latencyTicks : getLatencyTicks(0),
  );
  const yLabels = getVisibleYLabels(
    view === "curves"
      ? thresholds.map((frac) => ({
          label: `${Math.round(frac * 100)}%`,
          top: getFracY(curvesLayout, frac),
        }))
      : latencyTicks.map((ms) => ({
          label: `${ms} ms`,
          top: getLatencyY(latencyLayout, ms),
        })),
  );

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
        {yLabels.map(({ label, top, besideTitle }) => (
          <div
            key={label}
            className={clsx(chartStyles.yAxisTick, {
              [chartStyles.besideTitle]: besideTitle,
            })}
            style={{ top }}
          >
            <span className={chartStyles.yAxisTickLabel}>{label}</span>
          </div>
        ))}
      </div>
      <TrackControls
        name={trackNames.votes}
        bucketSize={undefined}
        description={description}
        trackId="votes"
        legend={view === "curves" ? undefined : latencyLegend}
      >
        {view === "curves" && (
          <VoteLineLegend showOwnVotes={markerStyle === "icon"} />
        )}
      </TrackControls>
    </>
  );
}
