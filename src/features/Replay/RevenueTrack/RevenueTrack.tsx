import { Flex } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useRef, useCallback, useLayoutEffect, useState } from "react";
import {
  type ExplorableChartProps,
  type MarkerLinesProps,
  type RangeChangeSubscriberProps,
} from "../const.ts";
import { useThrottledCallback } from "use-debounce";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlEventHandlers } from "../../WebGl/useWebGlEventHandlers.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import {
  drawAggRevenue,
  drawLiveTile,
  clearLiveTile,
  isAggregate,
  moveAggCamera,
  setUpRenderers,
  syncNonAggMeshes,
  moveNonAggCamera,
  refreshNonAggView,
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

const height = 150;
const baseSubscriptionId = "revenue-track";

const getNumRows = (splitByRow: boolean, tileCount: number) =>
  splitByRow ? Math.max(tileCount, 1) : 1;

interface RevenueTrackProps
  extends WebGlRemountProps,
    RangeChangeSubscriberProps,
    ExplorableChartProps,
    MarkerLinesProps {
  width: number;
  type: RevenueType;
}

function RevenueTrack({
  remount,
  subscribeRangeChange,
  getAbsoluteNs,
  getRelativeMs,
  setUpExploreListeners,
  markerLinesClassName,
  width,
  type,
}: RevenueTrackProps) {
  const subscriptionId = `${type}-${baseSubscriptionId}`;
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

  const widthRef = useRef(width);
  widthRef.current = width;
  const hasWidth = width > 0;

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const aggQuery = useAggRevenueQuery();
  const aggRevenue = useAtomValue(aggRevenueAtom);
  const txnMetaQuery = useTileCacheQuery(txnMetaCache);
  const execrpCount = useAtomValue(tileCountAtom).execrp;
  const numRows = getNumRows(opts.splitByRow, execrpCount);

  const throttledRelativeTsQuery = useThrottledCallback(
    (relativeVisibleRange: TsRange, relativeWorldRange: TsRange) => {
      const visibleRangeNs: NsTsRange = [
        getAbsoluteNs(relativeVisibleRange[0]),
        getAbsoluteNs(relativeVisibleRange[1]),
      ];

      if (isAggregate(relativeVisibleRange)) {
        const queryGranularity = getGranularity(
          relativeVisibleRange[1] - relativeVisibleRange[0],
        );
        aggQuery(visibleRangeNs, queryGranularity);
        setGranularity(queryGranularity);
      } else {
        const worldEndNs = getAbsoluteNs(relativeWorldRange[1]);
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
   * Cheap operation that runs on every nonAgg render:
   * - range change
   * - type/timeline-reference change
   * - resize
   * - scale/splitByTile toggle
   * - cache deltas
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
   * Used by nonAgg changes that alter the mesh set:
   * - range change resulting in mode entry (agg to nonAgg)
   * - type/timeline-reference change
   * - add/reset cache deltas
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

    const { renderer: gl, aggResources, nonAggResources } = renderer;
    const { camera, scene } = agg ? aggResources : nonAggResources;
    gl.render(scene, camera);
  }, []);

  /**
   * Update camera and query data for new range
   */
  const onRangeChange = useCallback(
    (visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      if (!rendererRef.current) return;

      throttledRelativeTsQuery(visibleRangeMs, worldRangeMs);

      const agg = isAggregate(visibleRangeMs);
      isAggCurrentRef.current = agg;
      setIsAgg(agg);

      if (agg) moveAggCamera(rendererRef.current, visibleRangeMs);
      else moveNonAggCamera(rendererRef.current, visibleRangeMs);

      renderActive();
    },
    [renderActive, throttledRelativeTsQuery],
  );

  // set up renderer and subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    if (rendererRef.current || !hasWidth || !containerRef.current) return;

    const rendererObj = setUpRenderers(
      widthRef.current,
      height,
      setUpContextListeners,
      getWasContextLost,
    );
    if (!rendererObj) return;

    rendererRef.current = rendererObj;
    containerRef.current.replaceChildren(rendererObj.renderer.domElement);

    const unsubscribe = subscribeRangeChange(subscriptionId, onRangeChange);
    const cleanUpExploreListeners = setUpExploreListeners(containerRef.current);
    const cleanUpRenderer = rendererRef.current.cleanUp;

    // cleanup
    return () => {
      unsubscribe?.();
      cleanUpRenderer();
      rendererRef.current = undefined;
      cleanUpExploreListeners();
    };
  }, [
    onRangeChange,
    setUpExploreListeners,
    subscribeRangeChange,
    setUpContextListeners,
    getWasContextLost,
    hasWidth,
    subscriptionId,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.renderer.setSize(width, height);
    renderActive();
  }, [renderActive, width]);

  // Trigger draw for aggregate
  useLayoutEffect(() => {
    if (!rendererRef.current || !aggRevenue || !isAgg) return;
    const maxValue = drawAggRevenue(
      rendererRef.current,
      type,
      aggRevenue,
      getRelativeMs,
      opts.scale,
    );
    setAggAxisMax(maxValue);
    renderActive();
  }, [aggRevenue, getRelativeMs, isAgg, opts.scale, renderActive, type]);

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
   * Sync historical tiles on add/reset.
   * Live tile mesh does not get cached and is rebuilt each time.
   */
  const onCacheDelta = useCallback(
    (delta: TxnMetaCacheDelta) => {
      const renderer = rendererRef.current;
      if (!renderer || isAggCurrentRef.current) return;

      if (delta.kind === "live") {
        drawLiveTile(renderer, type, delta.tile, getRelativeMs);
      } else {
        syncNonAggRef.current(renderer);
        if (delta.kind === "reset") clearLiveTile(renderer);
      }

      renderActive();
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
