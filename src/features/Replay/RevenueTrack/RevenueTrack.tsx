import { Flex } from "@radix-ui/themes";
import { getDefaultStore, useAtomValue } from "jotai";
import { useRef, useCallback, useLayoutEffect, useState } from "react";
import { type ExplorableChartProps, type MarkerLinesProps } from "../const.ts";
import { DEFAULT_REVENUE_VIEW_OPTS, type RevenueViewOpts } from "./consts.ts";
import { useThrottledCallback } from "use-debounce";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlEventHandlers } from "../../WebGl/useWebGlEventHandlers.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import {
  drawAggRevenue,
  isAggregate,
  moveAggCamera,
  setUpRenderers,
  syncNonAggMeshes,
  moveNonAggCamera,
  refreshNonAggView,
  appendLiveTxns,
  clearLiveMarkerIfAdded,
  clearLiveMarker,
  type RendererObj,
} from "./utils.ts";
import { calcRelativeMs } from "../utils.ts";
import { getGranularity } from "./useAggRevenueQuery.ts";
import type { RevenueType } from "../../../api/entities.ts";
import type { AggGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import {
  aggRevenueAtom,
  drawEventType,
  aggRevenueEmitterAtom,
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
  type TxnMetaCacheDelta,
} from "./txnMeta/txnMetaCache.ts";

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
  aggQuery: (
    referenceNs: bigint,
    visibleRangeMs: TsRange,
    worldRangeMs: TsRange,
    granularity: AggGranularity,
  ) => void;
}

function RevenueTrack({
  remount,
  setUpExploreListeners,
  markerLinesClassName,
  width,
  type,
  aggQuery,
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

  const txnMetaQuery = useTileCacheQuery(txnMetaCache);
  const execrpCount = useAtomValue(tileCountAtom).execrp;
  const numRows = getNumRows(opts.splitByRow, execrpCount);

  const throttledRangeQuery = useThrottledCallback(
    (referenceNs: bigint, visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      if (isAggregate(visibleRangeMs)) {
        const queryGranularity = getGranularity(
          visibleRangeMs[1] - visibleRangeMs[0],
        );
        aggQuery(referenceNs, visibleRangeMs, worldRangeMs, queryGranularity);
        setGranularity(queryGranularity);
      } else {
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
      const worldRangeMs = store.get(worldRangeAtom);
      const visibleRangeMs = store.get(visibleRangeAtom);
      if (referenceNs == null || !visibleRangeMs || !worldRangeMs) return;

      // Move camera before querying, because query may trigger immediate draw if data is already available
      if (updateView) {
        const agg = isAggregate(visibleRangeMs);
        isAggCurrentRef.current = agg;
        setIsAgg(agg);

        if (agg) moveAggCamera(rendererRef.current, visibleRangeMs);
        else moveNonAggCamera(rendererRef.current, visibleRangeMs);
      }

      throttledRangeQuery(referenceNs, visibleRangeMs, worldRangeMs);

      if (updateView) renderActive();
    },
    [renderActive, throttledRangeQuery],
  );

  const throttledDrawAgg = useThrottledCallback(
    useCallback(() => {
      const referenceNs = store.get(referenceNsAtom);
      const visibleRangeMs = store.get(visibleRangeAtom);
      const aggRevenue = store.get(aggRevenueAtom);
      if (!rendererRef.current || !visibleRangeMs || referenceNs == null)
        return;
      const maxValue = drawAggRevenue(
        rendererRef.current,
        referenceNs,
        visibleRangeMs,
        type,
        aggRevenue,
        opts.scale,
      );
      setAggAxisMax(maxValue);
      renderActive();
    }, [renderActive, type, opts.scale]),
    50,
    { leading: true, trailing: true },
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

    // listen for agg revenue draw events
    const aggEmitter = store.get(aggRevenueEmitterAtom);
    aggEmitter.addListener(drawEventType, throttledDrawAgg);

    // trigger initial draw
    setIsInitialized(true);
    onRangeChange(true);

    // cleanup
    return () => {
      aggEmitter.removeListener(drawEventType, throttledDrawAgg);
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
    throttledDrawAgg,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!isInitialized || !rendererRef.current) return;
    rendererRef.current.renderer.setSize(width, height);
    renderActive();
  }, [renderActive, width, isInitialized]);

  // Trigger refresh for agg mode entry or a rows/scale change.
  useLayoutEffect(() => {
    if (!isAgg) return;
    throttledDrawAgg();
  }, [isAgg, throttledDrawAgg]);

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
