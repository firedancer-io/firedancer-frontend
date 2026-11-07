import { getDefaultStore, useAtom, useAtomValue } from "jotai";
import { useRef, useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible.ts";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlRenderer } from "../../WebGl/useWebGlRenderer.ts";
import { useFrameRender } from "../../WebGl/useFrameRender.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import {
  drawAggRevenue,
  isAggregate,
  moveAggCamera,
  setUpRenderers,
  syncNonAggMeshes,
  moveNonAggCamera,
  refreshNonAggView,
  resizeRenderer,
  appendLiveTxns,
  clearLiveMarkerIfAdded,
  clearLiveMarker,
  type RendererObj,
} from "./utils.ts";
import { calcRelativeMs } from "../utils.ts";
import useAggRevenueQuery, {
  getGranularity,
  type AggRevenueQuery,
} from "./useAggRevenueQuery.ts";
import { useTxnMetaCache } from "./txnMeta/useTxnMetaCache.ts";
import type { AggGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import {
  aggRevenueAtom,
  drawEventType,
  aggRevenueEmitterAtom,
  revenueViewOptsAtom,
} from "./atoms.ts";
import { tileCountAtom } from "../../Overview/SlotPerformance/atoms.ts";
import RevenueYAxis from "./RevenueYAxis.tsx";
import RevenueControls from "./RevenueControls.tsx";
import {
  useTileCacheQuery,
  useTileCacheSubscription,
} from "../tiles/useTileCache.ts";
import {
  txnMetaCache,
  txnMetaLevel,
  type TxnMetaCacheDelta,
} from "./txnMeta/txnMetaCache.ts";
import styles from "../track.module.css";
import type { DataLevel } from "../coverage.ts";
import { useModeCoverage } from "../useModeCoverage.ts";

const store = getDefaultStore();

const getNumRows = (splitByRow: boolean, tileCount: number) =>
  splitByRow ? Math.max(tileCount, 1) : 1;

interface RevenueTrackProps {
  height: number;
}

interface RevenueTrackBodyProps extends RevenueTrackProps, WebGlRemountProps {
  aggQuery: AggRevenueQuery;
}

/**
 * Granularity the visible range should be drawn at
 */
function getTargetGranularity(visibleRangeMs: TsRange): AggGranularity | "txn" {
  return isAggregate(visibleRangeMs)
    ? getGranularity(visibleRangeMs[1] - visibleRangeMs[0])
    : txnMetaLevel.id;
}

function RevenueTrackBody({
  remount,
  height,
  aggQuery: {
    query: aggQuery,
    granularityLevels: aggLevels,
    pauseStaleRefreshes,
  },
}: RevenueTrackBodyProps) {
  const [granularity, setGranularity] = useState<AggGranularity | undefined>(
    undefined,
  );
  const [aggAxisMax, setAggAxisMax] = useState(0n);
  const [nonAggAxisMax, setNonAggAxisMax] = useState(0n);
  const [opts, setOpts] = useAtom(revenueViewOptsAtom);
  const { type } = opts;

  /** whether the target granularity is agg */
  const [isAgg, setIsAgg] = useState(true);
  /** whether the last render drew non agg in any of the visible range */
  const isNonAggDrawnRef = useRef(false);

  const { containerRef, rendererRef } = useWebGlRenderer({
    remount,
    create: ({ setUpContextListeners, getWasContextLost }) =>
      setUpRenderers(setUpContextListeners, getWasContextLost),
    onResize: (rendererObj) => {
      resizeRenderer(rendererObj);
      const visibleRangeMs = store.get(visibleRangeAtom);
      if (visibleRangeMs) moveNonAggCamera(rendererObj, visibleRangeMs);
      renderActive();
    },
  });

  const referenceNs = useAtomValue(referenceNsAtom);
  const getRelativeMs = useCallback(
    (absoluteNs: bigint) => calcRelativeMs(referenceNs ?? 0n, absoluteNs),
    [referenceNs],
  );

  const txnMetaQuery = useTileCacheQuery(txnMetaCache);
  const execrpCount = useAtomValue(tileCountAtom).execrp;
  const numRows = getNumRows(opts.splitByRow, execrpCount);

  /** agg granularities then txn meta, from coarsest to finest */
  const granularityLevels = useMemo<DataLevel<AggGranularity | "txn">[]>(
    () => [...aggLevels, txnMetaLevel],
    [aggLevels],
  );

  const {
    modeRangesRef,
    resolveModeRanges,
    startAggDraw,
    shouldDrawAgg,
    shouldDrawAggAfterNonAgg,
    renderModes,
  } = useModeCoverage({
    granularityLevels,
    getTargetGranularity,
    getAggGranularity: getGranularity,
  });

  const throttledRangeQuery = useThrottledCallbackIfVisible(
    (referenceNs: bigint, visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      if (isAggregate(visibleRangeMs)) {
        const queryGranularity = getGranularity(
          visibleRangeMs[1] - visibleRangeMs[0],
        );
        aggQuery(referenceNs, visibleRangeMs, worldRangeMs, queryGranularity);
        setGranularity(queryGranularity);
      } else {
        pauseStaleRefreshes();
        txnMetaQuery(referenceNs, visibleRangeMs, worldRangeMs);
        setGranularity(undefined);
      }
    },
    100,
    { leading: true, trailing: true },
  );

  /**
   * Computes the max value across visible txns and pushes the shared
   * uniforms to every mesh (no rebuild), then updates the axis max.
   */
  const refreshNonAgg = useCallback(
    (renderer: RendererObj) => {
      const tiles = txnMetaCache.getTiles();
      const max = refreshNonAggView(
        renderer,
        type,
        tiles,
        getRelativeMs,
        numRows,
        opts.scale,
      );
      if (max > 0n) setNonAggAxisMax(max);
    },
    [type, getRelativeMs, numRows, opts.scale],
  );

  /**
   * Builds a mesh for each new tile and returns evicted tiles' meshes
   * to the pool.
   */
  const syncNonAgg = useCallback(
    (renderer: RendererObj) => {
      const tiles = txnMetaCache.getTiles();
      syncNonAggMeshes(renderer, getRelativeMs, tiles);
    },
    [getRelativeMs],
  );

  const syncNonAggRef = useRef(syncNonAgg);
  syncNonAggRef.current = syncNonAgg;
  const refreshNonAggRef = useRef(refreshNonAgg);
  refreshNonAggRef.current = refreshNonAgg;

  const renderActive = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const isNonAggDrawn = modeRangesRef.current.nonAgg.length > 0;
    if (isNonAggDrawn) {
      // non agg draw entry
      if (!isNonAggDrawnRef.current) syncNonAggRef.current(renderer);
      refreshNonAggRef.current(renderer);
    }
    isNonAggDrawnRef.current = isNonAggDrawn;

    renderModes(
      renderer.renderer,
      renderer.aggResources,
      renderer.nonAggResources,
    );
  }, [modeRangesRef, rendererRef, renderModes]);

  const requestRender = useFrameRender(renderActive);

  /**
   * Draw the agg mesh for the agg spans
   */
  const drawAgg = useCallback(() => {
    if (!rendererRef.current) return;
    const aggDraw = startAggDraw();
    if (!aggDraw) return;

    const maxValue = drawAggRevenue(
      rendererRef.current,
      aggDraw.referenceNs,
      aggDraw.visibleRange,
      type,
      store.get(aggRevenueAtom),
      aggDraw.granularity,
      aggDraw.getDrawTiles,
      opts.scale,
    );
    setAggAxisMax(maxValue);
  }, [rendererRef, startAggDraw, type, opts.scale]);

  /**
   * Query data for new range and optionally update camera.
   */
  const onRangeChange = useCallback(
    (updateView: boolean) => {
      if (!rendererRef.current) return;

      const referenceNs = store.get(referenceNsAtom);
      const worldRangeMs = store.get(worldRangeAtom);
      const visibleRangeMs = store.get(visibleRangeAtom);
      if (referenceNs == null || !visibleRangeMs || !worldRangeMs) return;

      // Move camera before querying, because query may trigger immediate draw if data is already available.
      // Move both, since both modes may be drawn
      if (updateView) {
        moveAggCamera(rendererRef.current, visibleRangeMs);
        moveNonAggCamera(rendererRef.current, visibleRangeMs);
        setIsAgg(isAggregate(visibleRangeMs));

        resolveModeRanges();
        // Redraw agg from cache immediately if the mesh is outdated, since
        // the draw event waits on a query round trip
        if (shouldDrawAgg()) drawAgg();
      }

      throttledRangeQuery(referenceNs, visibleRangeMs, worldRangeMs);

      if (updateView) requestRender();
    },
    [
      drawAgg,
      requestRender,
      rendererRef,
      resolveModeRanges,
      shouldDrawAgg,
      throttledRangeQuery,
    ],
  );

  const throttledDrawAgg = useThrottledCallbackIfVisible(
    useCallback(() => {
      resolveModeRanges();
      // update the whole agg mesh, so it's ready for when agg draws more of
      // the range
      drawAgg();
      requestRender();
    }, [drawAgg, requestRender, resolveModeRanges]),
    50,
    { leading: false, trailing: true },
  );

  // subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    const unsubscribeVisible = store.sub(visibleRangeAtom, () =>
      onRangeChange(true),
    );
    const unsubscribeWorld = store.sub(worldRangeAtom, () =>
      onRangeChange(false),
    );

    // listen for agg revenue draw events
    const aggEmitter = store.get(aggRevenueEmitterAtom);
    aggEmitter.addListener(drawEventType, throttledDrawAgg);

    // trigger initial draw
    onRangeChange(true);

    // cleanup
    return () => {
      aggEmitter.removeListener(drawEventType, throttledDrawAgg);
      // cancel pending trailing timers so they don't accumulate across remounts
      throttledDrawAgg.cancel();
      throttledRangeQuery.cancel();
      unsubscribeVisible();
      unsubscribeWorld();
    };
  }, [onRangeChange, throttledDrawAgg, throttledRangeQuery]);

  // Trigger agg refresh for a scale/type change. Agg may be drawn in either
  // target mode.
  useLayoutEffect(() => {
    throttledDrawAgg();
  }, [opts.scale, type, throttledDrawAgg]);

  // Trigger nonAgg refresh for a rows/scale/type/timeline-reference change
  useLayoutEffect(() => {
    requestRender();
  }, [numRows, opts.scale, type, getRelativeMs, requestRender]);

  /**
   * Trigger updates for nonAgg data changes.
   */
  const onCacheDelta = useCallback(
    (delta: TxnMetaCacheDelta) => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      if (delta.kind === "add") clearLiveMarkerIfAdded(renderer, delta.tiles);
      else if (delta.kind === "clearLive" || delta.kind === "reset")
        clearLiveMarker(renderer);

      if (delta.kind === "live") {
        appendLiveTxns(
          renderer,
          delta.tile,
          delta.newData,
          delta.isNewTile,
          getRelativeMs,
        );
      } else {
        syncNonAggRef.current(renderer);
      }

      const { nonAgg } = resolveModeRanges();
      if (shouldDrawAggAfterNonAgg()) drawAgg();
      // Only render on delta updates when non agg is or was drawn
      if (nonAgg.length || isNonAggDrawnRef.current) requestRender();
    },
    [
      drawAgg,
      getRelativeMs,
      requestRender,
      rendererRef,
      resolveModeRanges,
      shouldDrawAggAfterNonAgg,
    ],
  );

  useTileCacheSubscription(txnMetaCache, onCacheDelta);

  return (
    <>
      <div ref={containerRef} className={styles.trackCanvasContainer} />
      <RevenueYAxis
        height={height}
        maxValue={isAgg ? aggAxisMax : nonAggAxisMax}
        scale={opts.scale}
        splitRows={!isAgg && opts.splitByRow}
        numRows={numRows}
      />
      <RevenueControls
        isAgg={isAgg}
        granularity={granularity}
        opts={opts}
        setOpts={setOpts}
      />
    </>
  );
}

const RevenueTrackBodyWithRemount = withWebGlRemount(RevenueTrackBody);
export default function RevenueTrack(props: RevenueTrackProps) {
  const aggQuery = useAggRevenueQuery();
  useTxnMetaCache();

  return <RevenueTrackBodyWithRemount aggQuery={aggQuery} {...props} />;
}
