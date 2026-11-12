import clsx from "clsx";
import { getDefaultStore } from "jotai";
import { isEqual } from "lodash";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useThrottledCallback } from "use-debounce";
import { nsPerMs } from "../../../consts.ts";
import {
  votesColor,
  votesFastFinalizeColor,
  votesNotarColor,
} from "../../../colors.ts";
import { epochAtom } from "../../../atoms.ts";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils.ts";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlRenderer } from "../../WebGl/useWebGlRenderer.ts";
import { useFrameRender } from "../../WebGl/useFrameRender.ts";
import type { AggGranularity, VotesGranularity } from "../../../api/types.ts";
import { VotesGranularityEnum } from "../../../api/entities.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import { trackNames } from "../layout.ts";
import {
  updateSlotHighlight,
  useSlotHighlightRender,
} from "../slotHighlight.ts";
import { calcAbsoluteNsRange, getVisibleWorldRangeNs } from "../utils.ts";
import { resolveCoverage, type DataLevel } from "../coverage.ts";
import { getVisibleYLabels } from "./yLabels.ts";
import TrackControls, { type LegendItem } from "../TrackControls.tsx";
import {
  useTileCacheQuery,
  useTileCacheSubscription,
} from "../tiles/useTileCache.ts";
import chartStyles from "../chart.module.css";
import trackStyles from "../track.module.css";
import VoteLineLegend from "./VoteLineLegend.tsx";
import {
  THRESHOLD_FRACS,
  getMarkerStyle,
  getVotesGranularity,
  getVotesView,
  type MarkerStyle,
  type VotesView,
} from "./consts.ts";
import { getFracY, getVotesPlotLayout } from "./curvesGeometry.ts";
import {
  buildLatency,
  formatLatencyTick,
  getLatencyPlotLayout,
  getLatencyTicks,
  getLatencyY,
  getVisibleMaxLatency,
  type LatencyChartSeries,
} from "./latencyGeometry.ts";
import { getSlotLatencies } from "./latency.ts";
import { applyVotesDelta, type LiveTiles } from "./liveTiles.ts";
import { getCoverageLatencySeries, getSlotLatencySeries } from "./series.ts";
import { aggVotesAtom, aggVotesEmitterAtom } from "./aggAtoms.ts";
import { drawEventType } from "../const.ts";
import {
  getAggVotesGranularity,
  useAggVotesQuery,
} from "./useAggVotesQuery.ts";
import {
  getFallbackDataTiles,
  getFallbackRangeNs,
  hasFallbackData,
  slotVotesLevel,
  votesCaches,
  type VotesCacheDelta,
} from "./votesCache.ts";
import {
  buildSlotVotes,
  type SlotVotes,
  type VotesDataTile,
} from "./votesData.ts";
import {
  showNearVotesTiles,
  drawVotesCurves,
  drawVotesLatency,
  getRendererSize,
  isLatencyDrawn,
  moveVotesCamera,
  resizeVotesScene,
  setUpRenderer,
  showVotesView,
  syncVotesTiles,
  type VotesLayout,
} from "./votesScene.ts";

const store = getDefaultStore();

const AGG_VOTES_CHART_ID = "votes-agg";
const DEFAULT_TARGET_SLOT_MS = 400;
const latencyLegend: LegendItem[] = [
  { label: "Notarized", color: votesNotarColor },
  { label: "Fast finalized", color: votesFastFinalizeColor },
  { label: "Finalized", color: votesColor },
];

const emptySeries: LatencyChartSeries = {
  notarized: [],
  fast: [],
  slow: [],
};

function getWindowSizeMs([start, end]: TsRange) {
  return end - start;
}

function getTargetSlotMs() {
  const targetNs = store.get(epochAtom)?.target_slot_duration_nanos;
  return targetNs ? targetNs / nsPerMs : DEFAULT_TARGET_SLOT_MS;
}

interface VotesTrackProps {
  height: number;
}

interface VotesTrackBodyProps extends VotesTrackProps, WebGlRemountProps {
  aggQuery: ReturnType<typeof useAggVotesQuery>;
}

function VotesTrackBody({
  remount,
  height,
  aggQuery: {
    query: aggQuery,
    granularityLevels: aggLevels,
    pauseStaleRefreshes: pauseStaleAggRefreshes,
  },
}: VotesTrackBodyProps) {
  const [view, setView] = useState<VotesView>("curves");
  const [markerStyle, setMarkerStyle] = useState<MarkerStyle>("icon");
  const [aggGranularity, setAggGranularity] = useState<AggGranularity>();
  const [latencyTicks, setLatencyTicks] = useState<number[]>([]);

  const slotVotesRef = useRef(new Map<number, SlotVotes>());
  const dataTilesRef = useRef<VotesDataTile[]>([]);
  const slotLatencySeriesRef = useRef(emptySeries);
  const granularityRef = useRef<VotesGranularity>(VotesGranularityEnum.vote);
  const liveTilesRef = useRef<LiveTiles>({ vote: null, vote_batch: null });
  const shownViewRef = useRef<VotesView>();
  const fallbackRangeNsRef = useRef<NsTsRange>();

  const granularityLevels = useMemo<DataLevel[]>(
    () => [...aggLevels, slotVotesLevel],
    [aggLevels],
  );

  const getLatencySeries = useCallback(
    (view: VotesView, visibleRangeMs: TsRange) => {
      const referenceNs = store.get(referenceNsAtom);
      const worldRangeMs = store.get(worldRangeAtom);
      if (referenceNs == null || !worldRangeMs) return emptySeries;

      const targetId =
        view === "slotLatency"
          ? slotVotesLevel.id
          : getAggVotesGranularity(getWindowSizeMs(visibleRangeMs));
      const targetLevel = granularityLevels.find(({ id }) => id === targetId);
      if (!targetLevel) return emptySeries;
      const spans = resolveCoverage(
        granularityLevels,
        targetId,
        calcAbsoluteNsRange(referenceNs, visibleRangeMs),
        calcAbsoluteNsRange(referenceNs, worldRangeMs),
      );
      return getCoverageLatencySeries(
        spans,
        targetLevel,
        store.get(aggVotesAtom),
        slotLatencySeriesRef.current,
        referenceNs,
      );
    },
    [granularityLevels],
  );

  /**
   * Keep showing a latency view after zooming into curves until the visible
   * slot data has loaded, since curves can't be drawn from agg data.
   * Returns whether the shown view changed.
   */
  const updateShownView = useCallback(() => {
    const visibleRangeMs = store.get(visibleRangeAtom);
    if (!visibleRangeMs) return false;
    const targetView = getVotesView(getWindowSizeMs(visibleRangeMs));
    const prevView = shownViewRef.current;
    const referenceNs = store.get(referenceNsAtom);
    const worldRangeMs = store.get(worldRangeAtom);
    const isHeld =
      targetView === "curves" &&
      prevView !== undefined &&
      prevView !== "curves" &&
      referenceNs != null &&
      !!worldRangeMs &&
      !slotVotesLevel.isRangeFetched(
        getVisibleWorldRangeNs(referenceNs, visibleRangeMs, worldRangeMs),
      );
    const shownView = isHeld ? prevView : targetView;
    if (shownView === prevView) return false;
    shownViewRef.current = shownView;
    setView(shownView);
    return true;
  }, []);

  const getDrawInput = useCallback(
    (visibleRangeMs: TsRange) => {
      const windowSizeMs = getWindowSizeMs(visibleRangeMs);
      const view = shownViewRef.current ?? getVotesView(windowSizeMs);
      const base = {
        view,
        granularity: granularityRef.current,
        markerStyle: getMarkerStyle(windowSizeMs),
      };
      if (view === "curves") {
        const layout: VotesLayout = { ...base, ticks: [] };
        return { layout, series: emptySeries };
      }
      const series = getLatencySeries(view, visibleRangeMs);
      const ticks = getLatencyTicks(
        getVisibleMaxLatency(series, visibleRangeMs),
      );
      const layout: VotesLayout = { ...base, ticks };
      return { layout, series };
    },
    [getLatencySeries],
  );

  const { containerRef, rendererRef } = useWebGlRenderer({
    remount,
    create: ({ setUpContextListeners, getWasContextLost }) =>
      setUpRenderer(setUpContextListeners, getWasContextLost, requestRender),
    onResize: (rendererObj) => {
      const { x: widthPx, y: heightPx } = getRendererSize(rendererObj);
      resizeVotesScene(
        rendererObj,
        widthPx,
        heightPx,
        rendererObj.renderer.getPixelRatio(),
      );
      const visibleRangeMs = store.get(visibleRangeAtom);
      if (visibleRangeMs) moveVotesCamera(rendererObj, visibleRangeMs);
      renderFrame();
    },
  });

  const renderFrame = useCallback(() => {
    const rendererObj = rendererRef.current;
    const visibleRangeMs = store.get(visibleRangeAtom);
    if (!rendererObj || !visibleRangeMs) return;

    const { layout, series } = getDrawInput(visibleRangeMs);
    showVotesView(rendererObj, layout.view);
    if (layout.view === "curves") {
      if (!isEqual(rendererObj.curves.layout, layout)) {
        drawVotesCurves(
          rendererObj,
          dataTilesRef.current,
          slotVotesRef.current,
          layout,
        );
      }
      showNearVotesTiles(rendererObj);
    } else if (!isLatencyDrawn(rendererObj, layout, series)) {
      const { y: heightPx } = getRendererSize(rendererObj);
      const geometry = buildLatency({
        series,
        layout: getLatencyPlotLayout(heightPx, layout.ticks),
        ticks: layout.ticks,
      });
      drawVotesLatency(rendererObj, geometry, layout, series);
      setLatencyTicks((prev) =>
        isEqual(prev, layout.ticks) ? prev : layout.ticks,
      );
    }
    updateSlotHighlight(rendererObj.highlight, rendererObj.renderer);
    rendererObj.renderer.render(rendererObj.scene, rendererObj.camera);
  }, [rendererRef, getDrawInput]);
  const requestRender = useFrameRender(renderFrame);
  useSlotHighlightRender(requestRender);

  const moveCamera = useCallback(() => {
    const rendererObj = rendererRef.current;
    const visibleRangeMs = store.get(visibleRangeAtom);
    if (!rendererObj || !visibleRangeMs) return;
    moveVotesCamera(rendererObj, visibleRangeMs);
    requestRender();
  }, [rendererRef, requestRender]);

  const rebuildSlotVotes = useCallback(() => {
    const granularity = granularityRef.current;
    const fallbackRangeNs = getFallbackRangeNs(granularity);
    fallbackRangeNsRef.current = fallbackRangeNs;
    const tiles: VotesDataTile[] = [
      ...votesCaches[granularity].getTiles(),
      ...(fallbackRangeNs
        ? getFallbackDataTiles(granularity, fallbackRangeNs)
        : []),
    ];
    const live = liveTilesRef.current[granularity];
    dataTilesRef.current = live ? [...tiles, live] : tiles;
    slotVotesRef.current = buildSlotVotes(
      dataTilesRef.current.map(({ data }) => data),
    );
    slotLatencySeriesRef.current = getSlotLatencySeries(
      getSlotLatencies(slotVotesRef.current, getTargetSlotMs()),
    );
  }, []);

  const syncDataTiles = useCallback(
    (changedStartNs: bigint[]) => {
      rebuildSlotVotes();
      const rendererObj = rendererRef.current;
      if (rendererObj) {
        syncVotesTiles(
          rendererObj,
          dataTilesRef.current,
          slotVotesRef.current,
          changedStartNs,
        );
      }
      requestRender();
    },
    [rebuildSlotVotes, rendererRef, requestRender],
  );

  const queryVote = useTileCacheQuery(votesCaches.vote, hasFallbackData.vote);
  const queryBatch = useTileCacheQuery(
    votesCaches.vote_batch,
    hasFallbackData.vote_batch,
  );

  const throttledQuery = useThrottledCallback(
    (referenceNs: bigint, visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      const windowSizeMs = getWindowSizeMs(visibleRangeMs);
      if (getVotesView(windowSizeMs) === "aggLatency") {
        aggQuery(
          referenceNs,
          visibleRangeMs,
          worldRangeMs,
          getAggVotesGranularity(windowSizeMs),
          granularityLevels,
        );
        return;
      }
      pauseStaleAggRefreshes();
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

    const windowSizeMs = getWindowSizeMs(visibleRangeMs);
    const nextView = getVotesView(windowSizeMs);
    setMarkerStyle(getMarkerStyle(windowSizeMs));
    if (updateShownView()) requestRender();

    if (nextView === "aggLatency") {
      setAggGranularity(getAggVotesGranularity(windowSizeMs));
    } else {
      const granularity = getVotesGranularity(windowSizeMs);
      if (granularity !== granularityRef.current) {
        granularityRef.current = granularity;
        rebuildSlotVotes();
        requestRender();
      } else if (
        !isEqual(getFallbackRangeNs(granularity), fallbackRangeNsRef.current)
      ) {
        syncDataTiles([]);
      }
    }
    throttledQuery(referenceNs, visibleRangeMs, worldRangeMs);
  }, [
    rebuildSlotVotes,
    requestRender,
    syncDataTiles,
    throttledQuery,
    updateShownView,
  ]);

  useLayoutEffect(() => {
    rebuildSlotVotes();
    const aggEmitter = store.get(aggVotesEmitterAtom);
    aggEmitter.addListener(drawEventType, requestRender);

    const unsubVisible = store.sub(visibleRangeAtom, () => {
      requestRange();
      moveCamera();
    });
    const unsubWorld = store.sub(worldRangeAtom, requestRange);
    requestRange();
    moveCamera();

    return () => {
      aggEmitter.removeListener(drawEventType, requestRender);
      unsubVisible();
      unsubWorld();
      throttledQuery.cancel();
    };
  }, [
    rebuildSlotVotes,
    requestRange,
    moveCamera,
    requestRender,
    throttledQuery,
  ]);

  const handleDelta = useCallback(
    (granularity: VotesGranularity, delta: VotesCacheDelta) => {
      const changedStartNs = applyVotesDelta(
        liveTilesRef.current,
        granularity,
        delta,
      );
      const isViewChanged = updateShownView();
      if (granularity !== granularityRef.current && delta.kind === "live") {
        if (isViewChanged) requestRender();
        return;
      }
      syncDataTiles(changedStartNs);
    },
    [requestRender, syncDataTiles, updateShownView],
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

  const curvesLayout = getVotesPlotLayout(height);
  const latencyLayout = getLatencyPlotLayout(
    height,
    latencyTicks.length ? latencyTicks : getLatencyTicks(0),
  );
  const yLabels = getVisibleYLabels(
    view === "curves"
      ? THRESHOLD_FRACS.map((frac) => ({
          label: `${Math.round(frac * 100)}%`,
          top: getFracY(curvesLayout, frac),
        }))
      : latencyTicks.map((ms) => ({
          label: formatLatencyTick(ms),
          top: getLatencyY(latencyLayout, ms),
        })),
  );

  const description =
    view === "curves"
      ? "stake per slot"
      : view === "slotLatency"
        ? "time to certificate per slot"
        : `time to certificate per ${aggGranularity}`;

  return (
    <>
      <div ref={containerRef} className={trackStyles.trackCanvasContainer} />
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

const VotesTrackBodyWithRemount = withWebGlRemount(VotesTrackBody);
export default function VotesTrack(props: VotesTrackProps) {
  const aggQuery = useAggVotesQuery(AGG_VOTES_CHART_ID);
  return <VotesTrackBodyWithRemount aggQuery={aggQuery} {...props} />;
}
