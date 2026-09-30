import { Flex } from "@radix-ui/themes";
import { getDefaultStore, useAtomValue } from "jotai";
import { useRef, useCallback, useLayoutEffect, useState } from "react";
import { type ExplorableChartProps, type MarkerLinesProps } from "../const.ts";
import { useThrottledCallback } from "use-debounce";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlEventHandlers } from "../../WebGl/useWebGlEventHandlers.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import {
  drawAggRevenue,
  appendLiveTxns,
  clearLiveMarker,
  isAggregate,
  moveAggCamera,
  setUpRenderers,
  syncNonAggMeshes,
  moveNonAggCamera,
  refreshNonAggView,
  clearLiveMarkerIfAdded,
  type RendererObj,
} from "./utils.ts";
import RevenueYAxis from "./RevenueYAxis.tsx";
import RevenueControls from "./RevenueControls.tsx";
import { DEFAULT_REVENUE_VIEW_OPTS, type RevenueViewOpts } from "./consts.ts";
import useAggRevenueQuery, { getGranularity } from "./useAggRevenueQuery.ts";
import {
  useTileCacheQuery,
  useTileCacheSubscription,
} from "../tiles/useTileCache.ts";
import {
  txnMetaCache,
  type TxnMetaCacheDelta,
} from "./txnMeta/txnMetaCache.ts";
import { tileCountAtom } from "../../Overview/SlotPerformance/atoms.ts";
import type { RevenueType } from "../../../api/entities.ts";
import { aggRevenueAtom } from "../../../api/atoms.ts";
import type { AggGranularity } from "../../../api/types.ts";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import { calcAbsoluteNs, calcRelativeMs } from "../utils.ts";

const height = 150;
const store = getDefaultStore();

const getNumRows = (splitByRow: boolean, tileCount: number) =>
  splitByRow ? Math.max(tileCount, 1) : 1;

interface RevenueTrackProps
  extends WebGlRemountProps,
    ExplorableChartProps,
    MarkerLinesProps {
  width: number;
  type: RevenueType;
}

function RevenueTrack({
  remount,
  setUpExploreListeners,
  markerLinesClassName,
  width,
  type,
}: RevenueTrackProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [granularity, setGranularity] = useState<AggGranularity | undefined>(
    undefined,
  );
  const [aggAxisMax, setAggAxisMax] = useState(0n);
  const [nonAggAxisMax, setNonAggAxisMax] = useState(0n);
  const [opts, setOpts] = useState<RevenueViewOpts>(DEFAULT_REVENUE_VIEW_OPTS);

  const [isAgg, setIsAgg] = useState(true);
  const isAggCurrentRef = useRef(isAgg);
  const isAggPreviousRef = useRef(isAgg);

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();

  const referenceNs = useAtomValue(referenceNsAtom);
  const getRelativeMs = useCallback(
    (absoluteNs: bigint) => calcRelativeMs(referenceNs ?? 0n, absoluteNs),
    [referenceNs],
  );

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const aggQuery = useAggRevenueQuery();
  const aggRevenue = useAtomValue(aggRevenueAtom);
  const txnMetaQuery = useTileCacheQuery(txnMetaCache);
  const execrpCount = useAtomValue(tileCountAtom).execrp;
  const numRows = getNumRows(opts.splitByRow, execrpCount);

  const throttledRangeQuery = useThrottledCallback(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
      const visibleRangeNs: NsTsRange = [
        calcAbsoluteNs(referenceNs, visibleRange[0]),
        calcAbsoluteNs(referenceNs, visibleRange[1]),
      ];

      if (isAggregate(visibleRange)) {
        const queryGranularity = getGranularity(
          visibleRange[1] - visibleRange[0],
        );
        aggQuery(visibleRangeNs, queryGranularity);
        setGranularity(queryGranularity);
      } else {
        const worldEndNs = calcAbsoluteNs(referenceNs, worldRange[1]);
        txnMetaQuery(visibleRangeNs, worldEndNs);
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
      syncNonAggMeshes(renderer, type, getRelativeMs, tiles);
    },
    [type, getRelativeMs],
  );

  const syncNonAggRef = useRef(syncNonAgg);
  syncNonAggRef.current = syncNonAgg;
  const refreshNonAggRef = useRef(refreshNonAgg);
  refreshNonAggRef.current = refreshNonAgg;

  const renderActive = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const agg = isAggCurrentRef.current;
    if (!agg) {
      // mode entry (agg to nonAgg)
      if (isAggPreviousRef.current) syncNonAggRef.current(renderer);
      refreshNonAggRef.current(renderer);
    }
    isAggPreviousRef.current = agg;

    const { aggResources, nonAggResources } = renderer;
    const { camera, scene } = agg ? aggResources : nonAggResources;
    renderer.renderer.render(scene, camera);
  }, []);

  /**
   * Query data for new range and optionally update camera.
   */
  const onRangeChange = useCallback(
    (updateView: boolean) => {
      if (!rendererRef.current) return;

      const referenceNs = store.get(referenceNsAtom);
      const visibleRangeMs = store.get(visibleRangeAtom);
      const worldRangeMs = store.get(worldRangeAtom);
      if (referenceNs == null || !visibleRangeMs || !worldRangeMs) return;

      throttledRangeQuery(referenceNs, visibleRangeMs, worldRangeMs);

      if (!updateView) return;

      const agg = isAggregate(visibleRangeMs);
      isAggCurrentRef.current = agg;
      setIsAgg(agg);

      if (agg) moveAggCamera(rendererRef.current, visibleRangeMs);
      else moveNonAggCamera(rendererRef.current, visibleRangeMs);

      renderActive();
    },
    [renderActive, throttledRangeQuery],
  );

  // set up renderer and subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    if (rendererRef.current || !containerRef.current) return;

    const rendererObj = setUpRenderers(
      0,
      height,
      setUpContextListeners,
      getWasContextLost,
    );
    if (!rendererObj) return;

    rendererRef.current = rendererObj;
    containerRef.current.replaceChildren(rendererObj.renderer.domElement);

    const unsubscribeVisible = store.sub(visibleRangeAtom, () =>
      onRangeChange(true),
    );
    const unsubscribeWorld = store.sub(worldRangeAtom, () =>
      onRangeChange(false),
    );
    const cleanUpExploreListeners = setUpExploreListeners(containerRef.current);
    const cleanUpRenderer = rendererRef.current.cleanUp;

    // trigger initial draw
    setIsInitialized(true);
    onRangeChange(true);

    // cleanup
    return () => {
      unsubscribeVisible();
      unsubscribeWorld();
      cleanUpRenderer();
      rendererRef.current = undefined;
      cleanUpExploreListeners();
    };
  }, [
    onRangeChange,
    setUpExploreListeners,
    setUpContextListeners,
    getWasContextLost,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!isInitialized || !rendererRef.current) return;
    rendererRef.current.renderer.setSize(width, height);
    renderActive();
  }, [renderActive, width, isInitialized]);

  // Trigger draw for aggregate
  useLayoutEffect(() => {
    const referenceNs = store.get(referenceNsAtom);
    if (!rendererRef.current || !aggRevenue || !isAgg || referenceNs == null)
      return;
    const maxValue = drawAggRevenue(
      rendererRef.current,
      type,
      aggRevenue,
      referenceNs,
      opts.scale,
    );
    setAggAxisMax(maxValue);
    renderActive();
  }, [aggRevenue, isAgg, opts.scale, renderActive, type]);

  // Trigger refresh for nonAgg mode entry or a rows/scale change.
  useLayoutEffect(() => {
    if (isAgg) return;
    renderActive();
  }, [isAgg, numRows, opts.scale, renderActive]);

  // Trigger sync for nonAgg mode entry or a type/timeline-reference change
  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || isAgg) return;
    syncNonAggRef.current(renderer);
    renderActive();
  }, [isAgg, type, getRelativeMs, renderActive]);

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
          type,
          delta.tile,
          delta.newData,
          delta.isNewTile,
          getRelativeMs,
        );
      } else {
        syncNonAggRef.current(renderer);
      }

      // Only render on delta updates when non aggregate view is active
      if (!isAggCurrentRef.current) renderActive();
    },
    [type, getRelativeMs, renderActive],
  );

  useTileCacheSubscription(txnMetaCache, onCacheDelta);

  return (
    <Flex direction="column" gap="2" width="100%">
      <RevenueControls
        isAgg={isAgg}
        granularity={granularity}
        opts={opts}
        setOpts={setOpts}
      />
      <div
        style={{
          position: "relative",
          width: "100%",
          height: `${height}px`,
        }}
      >
        <div
          ref={containerRef}
          className={markerLinesClassName}
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
          }}
        />
        <RevenueYAxis
          maxValue={isAgg ? aggAxisMax : nonAggAxisMax}
          scale={opts.scale}
          splitRows={!isAgg && opts.splitByRow}
          numRows={numRows}
        />
      </div>
    </Flex>
  );
}

const RevenueTrackWithRemount = withWebGlRemount(RevenueTrack);
export default RevenueTrackWithRemount;
