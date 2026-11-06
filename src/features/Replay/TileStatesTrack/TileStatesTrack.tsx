import { getDefaultStore, useAtom, useAtomValue } from "jotai";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useThrottledCallback } from "use-debounce";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlRenderer } from "../../WebGl/useWebGlRenderer.ts";
import { useFrameRender } from "../../WebGl/useFrameRender.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import { tilesAtom } from "../../../api/atoms.ts";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
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
  syncAggTileStatesTilesAtom,
} from "./aggAtoms.ts";
import { buildAggStatesMesh } from "./aggUtils.ts";
import {
  getAggGranularity,
  type AggTileStatesQuery,
} from "./useAggTileStatesQuery.ts";
import LaneLabels from "./LaneLabels.tsx";
import TileStatesControls from "./TileStatesControls.tsx";
import { tileStatesViewOptsAtoms } from "./atoms.ts";
import RowLabels from "../RowLabels.tsx";
import { getTileKey } from "../CpuTrack/const.ts";
import { getRowsLayout, ROW_LABEL_PX, trackInsetPx } from "../layout.ts";
import styles from "../track.module.css";

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
    pauseStaleRefreshes: pauseStaleAggRefreshes,
    resetQueries: resetAggQueries,
  },
}: TileStatesTrackProps) {
  const modes = tileStatesModeOptions[kind];
  const canSplitLanes = modes.some(
    ({ mode, separateLanes }) =>
      mode === TileStatesMode.Stacked && separateLanes !== undefined,
  );
  const [opts, setOpts] = useAtom(tileStatesViewOptsAtoms[kind]);
  const [availableModes, setAvailableModes] = useState(() =>
    modes.map(({ mode }) => mode),
  );
  const mode = getDisplayMode(modes, opts.mode, availableModes);
  const [nonAggGranularity, setNonAggGranularity] =
    useState<TileStatesGranularity>(TileStatesGranularityEnum.txn);
  const [isAgg, setIsAgg] = useState(false);
  const [aggGranularity, setAggGranularity] = useState<AggGranularity>();

  const { containerRef, rendererRef } = useWebGlRenderer({
    remount,
    create: ({ setUpContextListeners, getWasContextLost }) =>
      setUpRenderer(kind, setUpContextListeners, getWasContextLost),
    onResize: (rendererObj) => handleResize(rendererObj),
  });

  const requestRender = useFrameRender(() => {
    if (rendererRef.current) render(rendererRef.current);
  });

  const updateAvailableModes = useCallback(
    (visibleRangeMs: TsRange) => {
      const available = getAvailableModes(
        modes,
        visibleRangeMs[1] - visibleRangeMs[0],
      );
      setAvailableModes((prev) =>
        prev.join() === available.join() ? prev : available,
      );
    },
    [modes],
  );

  const tiles = useAtomValue(tilesAtom);
  const rows = useMemo(() => getTileRows(tiles, kind), [tiles, kind]);
  const tilesKey = useMemo(
    () => (tiles ?? []).map(getTileKey).join(","),
    [tiles],
  );
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

  const onRangeChange = useCallback(
    (updateView: boolean) => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      const refNs = store.get(referenceNsAtom);
      const visibleRangeMs = store.get(visibleRangeAtom);
      const worldRangeMs = store.get(worldRangeAtom);
      if (refNs == null || !visibleRangeMs || !worldRangeMs) return;

      const prevGranularity = renderer.renderedGranularity;
      const agg = isAggregate(visibleRangeMs);
      setIsAgg(agg);
      renderer.isAgg = agg;
      updateAvailableModes(visibleRangeMs);
      if (agg) {
        renderer.renderedGranularity = undefined;
        const viewChanged =
          updateView && setVisibleRange(renderer, visibleRangeMs);
        throttledRangeQuery(refNs, visibleRangeMs, worldRangeMs);
        if (viewChanged) requestRender();
        return;
      }

      const granularity = getTileStatesGranularity(
        visibleRangeMs[1] - visibleRangeMs[0],
      );
      renderer.renderedGranularity = granularity;
      setNonAggGranularity(granularity);

      // Move camera before querying, because query may trigger immediate draw
      // if data is already available
      const viewChanged =
        updateView && setVisibleRange(renderer, visibleRangeMs);

      const granularityChanged = granularity !== prevGranularity;
      if (prevGranularity === undefined) {
        syncMeshes(renderer, true);
      } else if (granularityChanged) {
        clearLiveMarker(renderer);
        syncMeshes(renderer);
      }

      throttledRangeQuery(refNs, visibleRangeMs, worldRangeMs);

      if (viewChanged || granularityChanged) requestRender();
    },
    [rendererRef, requestRender, throttledRangeQuery, updateAvailableModes],
  );

  const drawAgg = useCallback(() => {
    const renderer = rendererRef.current;
    const refNs = store.get(referenceNsAtom);
    const visibleRangeMs = store.get(visibleRangeAtom);
    if (!renderer?.isAgg || refNs == null || !visibleRangeMs) return;

    buildAggStatesMesh(
      renderer,
      refNs,
      visibleRangeMs,
      store.get(aggTileStatesAtom),
    );
    requestRender();
  }, [rendererRef, requestRender]);

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

  // Refresh agg states if list of tiles change
  useLayoutEffect(() => {
    if (!store.set(syncAggTileStatesTilesAtom, tilesKey)) return;
    resetAggQueries();
    onRangeChange(false);
  }, [tilesKey, resetAggQueries, onRangeChange]);

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
    requestRender();
  }, [opts.mode, opts.separateLanes, requestRender]);

  const handleDelta = useCallback(
    (granularity: TileStatesGranularity, delta: TileStatesCacheDelta) => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      if (granularity !== renderer.renderedGranularity) return;

      if (delta.kind === "add") clearLiveMarkerIfAdded(renderer, delta.tiles);
      else if (delta.kind === "clearLive" || delta.kind === "reset")
        clearLiveMarker(renderer);

      if (delta.kind === "live") {
        appendLiveStates(renderer, delta.tile, delta.newData, delta.isNewTile);
      } else {
        syncMeshes(renderer);
      }

      requestRender();
    },
    [rendererRef, requestRender],
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
        <div ref={containerRef} className={styles.trackCanvasContainer} />
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
