import { getDefaultStore, useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { useThrottledCallback } from "use-debounce";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlRenderer } from "../../WebGl/useWebGlRenderer.ts";
import { useFrameRender } from "../../WebGl/useFrameRender.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import { tilesAtom } from "../../../api/atoms.ts";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import { getVisibleWorldRangeNs } from "../utils.ts";
import { msBucketSizes } from "../const.ts";
import { OVERSCAN_BUCKETS, resolveHeldDraw } from "../useAggQuery.ts";
import {
  useTileCacheQuery,
  useTileCacheSubscription,
} from "../tiles/useTileCache.ts";
import {
  tileStatesCaches,
  type TileStatesCacheDelta,
} from "./tileStatesCache.ts";
import {
  appendLiveStates,
  clearLiveMarker,
  clearLiveMarkerIfAdded,
  getTileRows,
  setVisibleRange,
  render,
  handleResize,
  setBarHeight,
  setUpRenderer,
  syncMeshes,
  type RendererObj,
} from "./utils.ts";
import {
  getDisplayMode,
  getAvailableModes,
  getTileStatesGranularity,
  isAggregate,
  BAR_HEIGHT_RATIO,
  LANE_GAP_PX,
  TileStatesMode,
  tileStatesModeOptions,
  trackStates,
  tileStateLabels,
  type TileKind,
} from "./consts.ts";
import type {
  AggGranularity,
  TileStatesGranularity,
} from "../../../api/types.ts";
import { TileStatesGranularityEnum } from "../../../api/entities.ts";
import {
  aggTileStatesAtom,
  aggTileStatesEmitterAtom,
  drawEventType,
} from "./aggAtoms.ts";
import { buildAggStatesMesh } from "./aggUtils.ts";
import {
  getAggGranularity,
  type AggTileStatesQuery,
} from "./useAggTileStatesQuery.ts";
import LaneLabels from "./LaneLabels.tsx";
import TileStatesControls from "./TileStatesControls.tsx";
import { findTxnAtCursor } from "./hoverUtils.ts";
import { hoveredExecrpTxnAtom } from "./hoverAtoms.ts";
import { useHoveredPosition, type HoveredRect } from "../useHoveredPosition.ts";
import { tileStatesViewOptsAtoms } from "./atoms.ts";
import RowLabels from "../RowLabels.tsx";
import { getRowsLayout, ROW_LABEL_PX, trackInsetPx } from "../layout.ts";
import styles from "../track.module.css";
import { useSlotHighlightRender } from "../slotHighlight.ts";

const store = getDefaultStore();

interface TileStatesTrackProps extends WebGlRemountProps {
  kind: TileKind;
  height: number;
  aggQuery: AggTileStatesQuery;
  showStateLabels?: boolean;
  canShowErrorStates?: boolean;
}

function TileStatesTrack({
  kind,
  height,
  showStateLabels = false,
  canShowErrorStates = false,
  remount,
  aggQuery: {
    query: aggQuery,
    getDrawTiles,
    isVisibleDrawable: isAggVisibleDrawable,
    pauseStaleRefreshes: pauseStaleAggRefreshes,
  },
}: TileStatesTrackProps) {
  const modes = tileStatesModeOptions[kind];
  const canSplitLanes = modes.some(
    ({ mode, separateLanes }) =>
      mode === TileStatesMode.Stacked && separateLanes !== undefined,
  );
  const [opts, setOpts] = useAtom(tileStatesViewOptsAtoms[kind]);
  const [mode, setMode] = useState(opts.mode);
  const [availableModes, setAvailableModes] = useState(() =>
    modes.map(({ mode }) => mode),
  );
  const [nonAggGranularity, setNonAggGranularity] =
    useState<TileStatesGranularity>(TileStatesGranularityEnum.txn);
  const [isAgg, setIsAgg] = useState(false);
  const [aggGranularity, setAggGranularity] = useState<AggGranularity>();

  const { containerRef, rendererRef } = useWebGlRenderer({
    remount,
    create: ({ setUpContextListeners, getWasContextLost }) =>
      setUpRenderer(
        kind,
        opts.mode,
        opts.separateLanes,
        setUpContextListeners,
        getWasContextLost,
      ),
    onResize: (rendererObj) => handleResize(rendererObj),
  });

  const requestRender = useFrameRender(() => {
    if (rendererRef.current) render(rendererRef.current);
  });
  useSlotHighlightRender(requestRender);

  const updateMode = useCallback(
    (renderer: RendererObj, visibleRangeMs: TsRange) => {
      const available = getAvailableModes(
        modes,
        visibleRangeMs[1] - visibleRangeMs[0],
      );
      renderer.mode = getDisplayMode(modes, renderer.selectedMode, available);
      setMode(renderer.mode);
      setAvailableModes((prev) =>
        prev.join() === available.join() ? prev : available,
      );
    },
    [modes],
  );

  const tiles = useAtomValue(tilesAtom);
  const rows = useMemo(() => getTileRows(tiles, kind), [tiles, kind]);
  const isLaneMode =
    mode === TileStatesMode.Gantt ||
    (mode === TileStatesMode.Stacked && opts.separateLanes);
  const showLaneLabels = showStateLabels && isLaneMode;
  const laneStates = trackStates[kind][isAgg ? "agg" : nonAggGranularity];
  const rowsLayout = getTileRowsLayout(
    height,
    rows.length,
    kind,
    showLaneLabels ? laneStates.length : 0,
  );
  const barHeightPx = rowsLayout.rowPx * BAR_HEIGHT_RATIO;
  const laneGapPx = showLaneLabels
    ? Math.min(LANE_GAP_PX, barHeightPx / laneStates.length / 4)
    : 0;

  const setHoveredExecrpTxn = useSetAtom(hoveredExecrpTxnAtom);
  const throttledResolveHover = useThrottledCallback(
    (clientX: number, clientY: number, rect: HoveredRect) => {
      const renderer = rendererRef.current;
      const visibleRangeMs = store.get(visibleRangeAtom);
      if (kind !== "execrp" || !renderer || !visibleRangeMs || !rect.width) {
        setHoveredExecrpTxn(undefined);
        return;
      }
      setHoveredExecrpTxn(
        findTxnAtCursor(renderer, visibleRangeMs, {
          fracX: (clientX - rect.left) / rect.width,
          fracY: (clientY - rect.top) / rect.height,
          widthPx: rect.width,
        }),
      );
    },
    30,
  );
  const onHoverLeave = useCallback(() => {
    throttledResolveHover.cancel();
    setHoveredExecrpTxn(undefined);
  }, [throttledResolveHover, setHoveredExecrpTxn]);
  const { setContainer, notifyChange: refreshHover } = useHoveredPosition({
    onHoverChange: throttledResolveHover,
    onHoverLeave,
  });

  const setContainerRef = useCallback(
    (el: HTMLDivElement | null) => {
      (containerRef as MutableRefObject<HTMLDivElement | null>).current = el;
      setContainer(el);
      if (el === null && kind === "execrp") onHoverLeave();
    },
    [containerRef, setContainer, kind, onHoverLeave],
  );

  const queryTxn = useTileCacheQuery(tileStatesCaches.txn);
  const queryBatch = useTileCacheQuery(tileStatesCaches.txn_batch);

  const throttledRangeQuery = useThrottledCallback(
    (referenceNs: bigint, visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      if (isAggregate(visibleRangeMs)) {
        const aggGranularity = getAggGranularity(
          visibleRangeMs[1] - visibleRangeMs[0],
        );
        aggQuery(referenceNs, visibleRangeMs, worldRangeMs, aggGranularity);
        setAggGranularity(aggGranularity);
        return;
      }

      pauseStaleAggRefreshes();
      const granularity = getTileStatesGranularity(
        visibleRangeMs[1] - visibleRangeMs[0],
      );
      const query =
        granularity === TileStatesGranularityEnum.txn ? queryTxn : queryBatch;
      query(referenceNs, visibleRangeMs, worldRangeMs);
    },
    100,
    { leading: true, trailing: true },
  );

  /** granularity and ms range covered by the agg mesh, including overscan */
  const drawnAggRef = useRef<{ granularity: AggGranularity; range: TsRange }>();

  const buildAgg = useCallback(
    (renderer: RendererObj, refNs: bigint, visibleRangeMs: TsRange) => {
      const granularity = getAggGranularity(
        visibleRangeMs[1] - visibleRangeMs[0],
      );
      buildAggStatesMesh(
        renderer,
        refNs,
        visibleRangeMs,
        store.get(aggTileStatesAtom),
        granularity,
        getDrawTiles,
      );
      const overscanMs = OVERSCAN_BUCKETS * msBucketSizes[granularity];
      drawnAggRef.current = {
        granularity,
        range: [visibleRangeMs[0] - overscanMs, visibleRangeMs[1] + overscanMs],
      };
    },
    [getDrawTiles],
  );

  /**
   * Whether the agg mesh was drawn at a different granularity or doesn't
   * cover the visible range
   */
  const isAggMeshOutdated = useCallback((visibleRangeMs: TsRange) => {
    const drawn = drawnAggRef.current;
    return (
      !drawn ||
      drawn.granularity !==
        getAggGranularity(visibleRangeMs[1] - visibleRangeMs[0]) ||
      visibleRangeMs[0] < drawn.range[0] ||
      visibleRangeMs[1] > drawn.range[1]
    );
  }, []);

  /**
   * Draw for the current range. Keeps the previous mode (agg or non agg) on a
   * mode change until the new mode can draw all of the visible range.
   */
  const updateView = useCallback(
    (moveView: boolean, query: boolean) => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      const refNs = store.get(referenceNsAtom);
      const visibleRangeMs = store.get(visibleRangeAtom);
      const worldRangeMs = store.get(worldRangeAtom);
      if (refNs == null || !visibleRangeMs || !worldRangeMs) return;

      const prevGranularity = renderer.renderedGranularity;
      const wasAgg = renderer.isAgg;
      const targetIsAgg = isAggregate(visibleRangeMs);
      // non agg can only be held at the granularity already drawn
      const nonAggGranularity = targetIsAgg
        ? prevGranularity
        : getTileStatesGranularity(visibleRangeMs[1] - visibleRangeMs[0]);

      const agg = resolveHeldDraw(
        wasAgg ? true : prevGranularity ? false : undefined,
        targetIsAgg,
        (agg) =>
          agg
            ? isAggVisibleDrawable(refNs, visibleRangeMs, worldRangeMs)
            : !!nonAggGranularity &&
              tileStatesCaches[nonAggGranularity].isRangeFetched(
                getVisibleWorldRangeNs(refNs, visibleRangeMs, worldRangeMs),
              ),
      );

      setIsAgg(agg);
      renderer.isAgg = agg;
      updateMode(renderer, visibleRangeMs);

      // Move camera before querying, because query may trigger immediate draw
      // if data is already available
      const viewChanged = moveView && setVisibleRange(renderer, visibleRangeMs);

      if (agg || !nonAggGranularity) {
        renderer.renderedGranularity = undefined;
        if (query) throttledRangeQuery(refNs, visibleRangeMs, worldRangeMs);

        // redraw from cache immediately if the mesh is from a previous
        // granularity or range, since the draw event waits on a query round
        // trip
        const meshOutdated = !wasAgg || isAggMeshOutdated(visibleRangeMs);
        if (agg && meshOutdated) buildAgg(renderer, refNs, visibleRangeMs);
        if (viewChanged || meshOutdated) requestRender();
        refreshHover();
        return;
      }

      renderer.renderedGranularity = nonAggGranularity;
      setNonAggGranularity(nonAggGranularity);

      const granularityChanged = nonAggGranularity !== prevGranularity;
      if (prevGranularity === undefined) {
        syncMeshes(renderer, true);
      } else if (granularityChanged) {
        clearLiveMarker(renderer);
        syncMeshes(renderer);
      } else if (viewChanged) {
        // update fallback data tiles for the new visible range
        syncMeshes(renderer);
      }

      if (query) throttledRangeQuery(refNs, visibleRangeMs, worldRangeMs);

      if (viewChanged || granularityChanged) requestRender();
      refreshHover();
    },
    [
      rendererRef,
      requestRender,
      throttledRangeQuery,
      refreshHover,
      updateMode,
      isAggVisibleDrawable,
      isAggMeshOutdated,
      buildAgg,
    ],
  );

  const onRangeChange = useCallback(
    (moveView: boolean) => updateView(moveView, true),
    [updateView],
  );

  const drawAgg = useCallback(() => {
    const renderer = rendererRef.current;
    const refNs = store.get(referenceNsAtom);
    const visibleRangeMs = store.get(visibleRangeAtom);
    if (!renderer || refNs == null || !visibleRangeMs) return;

    if (!renderer.isAgg) {
      // non agg may be held while agg data loads
      if (isAggregate(visibleRangeMs)) updateView(false, false);
      return;
    }

    buildAgg(renderer, refNs, visibleRangeMs);
    // agg may be held while non agg data loads
    if (!isAggregate(visibleRangeMs)) updateView(false, false);
    requestRender();
  }, [rendererRef, requestRender, buildAgg, updateView]);

  const throttledDrawAgg = useThrottledCallbackIfVisible(drawAgg, 50, {
    leading: false,
    trailing: true,
  });

  // subscribe to range changes to trigger queries
  useLayoutEffect(() => {
    const unsubscribeVisible = store.sub(visibleRangeAtom, () =>
      onRangeChange(true),
    );
    const unsubscribeWorld = store.sub(worldRangeAtom, () =>
      onRangeChange(false),
    );
    const aggEmitter = store.get(aggTileStatesEmitterAtom);
    aggEmitter.addListener(drawEventType, throttledDrawAgg);

    // trigger initial query, camera, and geometry build
    onRangeChange(true);

    return () => {
      aggEmitter.removeListener(drawEventType, throttledDrawAgg);
      throttledDrawAgg.cancel();
      throttledRangeQuery.cancel();
      unsubscribeVisible();
      unsubscribeWorld();
    };
  }, [onRangeChange, throttledDrawAgg, throttledRangeQuery]);

  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (renderer?.isAgg) {
      drawAgg();
      return;
    }
    if (!renderer?.renderedGranularity) return;
    syncMeshes(renderer, true);
    requestRender();
  }, [rendererRef, requestRender, rows, drawAgg]);

  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.errorStatesScene.visible = opts.showErrorStates;
    requestRender();
  }, [opts.showErrorStates, rendererRef, requestRender]);

  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.compositeUniforms.uIdleWeight.value = opts.idleWeight;
    requestRender();
  }, [opts.idleWeight, rendererRef, requestRender]);

  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    setBarHeight(renderer, barHeightPx, laneGapPx);
    requestRender();
  }, [barHeightPx, laneGapPx, rendererRef, requestRender]);

  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    const visibleRangeMs = store.get(visibleRangeAtom);
    if (!renderer) return;
    renderer.selectedMode = opts.mode;
    renderer.selectedSeparateLanes = opts.separateLanes;
    if (!visibleRangeMs) return;
    updateMode(renderer, visibleRangeMs);
    if (renderer.isAgg) drawAgg();
    else requestRender();
  }, [
    opts.mode,
    opts.separateLanes,
    rendererRef,
    updateMode,
    drawAgg,
    requestRender,
  ]);

  const handleDelta = useCallback(
    (granularity: TileStatesGranularity, delta: TileStatesCacheDelta) => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      if (renderer.isAgg) {
        // agg may be held while non agg data loads
        const visibleRangeMs = store.get(visibleRangeAtom);
        if (visibleRangeMs && !isAggregate(visibleRangeMs)) {
          updateView(false, false);
        }
        return;
      }
      if (granularity !== renderer.renderedGranularity) {
        // other granularity data, including its live data tile, is only drawn
        // as a fallback
        syncMeshes(renderer);
        requestRender();
        return;
      }

      if (delta.kind === "add") clearLiveMarkerIfAdded(renderer, delta.tiles);
      else if (delta.kind === "clearLive" || delta.kind === "reset")
        clearLiveMarker(renderer);

      if (delta.kind === "live") {
        appendLiveStates(renderer, delta.tile, delta.newData, delta.isNewTile);
        // the live data tile's first data replaces its fallback
        if (delta.isNewTile) syncMeshes(renderer);
      } else {
        syncMeshes(renderer);
      }

      requestRender();
      refreshHover();
    },
    [rendererRef, requestRender, refreshHover, updateView],
  );

  const onDeltaTxn = useCallback(
    (delta: TileStatesCacheDelta) =>
      handleDelta(TileStatesGranularityEnum.txn, delta),
    [handleDelta],
  );
  const onDeltaBatch = useCallback(
    (delta: TileStatesCacheDelta) =>
      handleDelta(TileStatesGranularityEnum.txn_batch, delta),
    [handleDelta],
  );
  useTileCacheSubscription(tileStatesCaches.txn, onDeltaTxn);
  useTileCacheSubscription(tileStatesCaches.txn_batch, onDeltaBatch);

  return (
    <>
      <div
        className={styles.rows}
        style={{
          top: rowsLayout.topPx,
          height: rowsLayout.rowPx * Math.max(rows.length, 1),
        }}
      >
        <div ref={setContainerRef} className={styles.trackCanvasContainer} />
      </div>
      {showLaneLabels ? (
        <LaneLabels
          labels={rows.map(({ label }) => label)}
          laneLabels={laneStates.map((state) => tileStateLabels[state])}
          layout={rowsLayout}
          laneGapPx={laneGapPx}
        />
      ) : (
        <RowLabels
          labels={rows.map(({ label }) => label)}
          layout={rowsLayout}
        />
      )}
      <TileStatesControls
        kind={kind}
        nonAggGranularity={nonAggGranularity}
        isAgg={isAgg}
        availableModes={availableModes}
        mode={mode}
        // lanes show each state on its own, so idle weight in is irrelevant
        showIdleWeight={!isLaneMode}
        showSplitLanes={canSplitLanes && mode === TileStatesMode.Stacked}
        showErrorStates={
          canShowErrorStates &&
          !isAgg &&
          nonAggGranularity === TileStatesGranularityEnum.txn &&
          mode === TileStatesMode.Heatmap
        }
        aggGranularity={aggGranularity}
        opts={opts}
        setOpts={setOpts}
      />
    </>
  );
}

function getTileRowsLayout(
  heightPx: number,
  rowCount: number,
  kind: TileKind,
  labeledLanes: number,
) {
  const insetPx = trackInsetPx[kind === "execrp" ? "banks" : "replay"];
  const isReplay = kind === "replay";
  const layout = getRowsLayout(heightPx, rowCount, {
    insetPx,
    fillWhenThin: isReplay,
  });
  const lanePx = (layout.rowPx * BAR_HEIGHT_RATIO) / labeledLanes;
  if (isReplay && labeledLanes && lanePx < ROW_LABEL_PX) {
    return getRowsLayout(heightPx, rowCount, { insetPx: 0 });
  }
  return layout;
}

const TileStatesTrackWithRemount = withWebGlRemount(TileStatesTrack);
export default TileStatesTrackWithRemount;
