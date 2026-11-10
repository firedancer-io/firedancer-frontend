import { getDefaultStore, useAtomValue } from "jotai";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useWebGlRenderer } from "../../WebGl/useWebGlRenderer.ts";
import { useFrameRender } from "../../WebGl/useFrameRender.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import { tilesAtom } from "../../../api/atoms.ts";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import { useTileCacheSubscription } from "../tiles/useTileCache.ts";
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
  setUpRenderer,
  syncMeshes,
  type TileStatesTrackConfig,
} from "./utils.ts";
import { getTileStatesGranularity, isAggregate } from "./consts.ts";
import type { TileStatesGranularity } from "../../../api/types.ts";
import { TileStatesGranularityEnum } from "../../../api/entities.ts";
import { aggTileStatesAtom, aggTileStatesEmitterAtom } from "./aggAtoms.ts";
import { dataChangeEventType, drawEventType } from "../const.ts";
import { useSlotHighlightRender } from "../slotHighlight.ts";
import { updateAggMaxStateShare, updateAggStatesMesh } from "./aggUtils.ts";

const store = getDefaultStore();

/**
 * Sets up a tile states track's renderer, and keeps its meshes in sync with the
 * visible range, tiles, and the txn, batch, and agg data. Queries on range
 * changes, after moving the camera.
 */
export function useTileStatesRenderer({
  config,
  remount,
  query,
}: {
  config: TileStatesTrackConfig;
  remount: () => void;
  query: (
    referenceNs: bigint,
    visibleRangeMs: TsRange,
    worldRangeMs: TsRange,
  ) => void;
}) {
  const [nonAggGranularity, setNonAggGranularity] =
    useState<TileStatesGranularity>(TileStatesGranularityEnum.txn);
  const [isAgg, setIsAgg] = useState(false);

  const { containerRef, rendererRef } = useWebGlRenderer({
    remount,
    create: ({ setUpContextListeners, getWasContextLost }) =>
      setUpRenderer(config, setUpContextListeners, getWasContextLost),
    onResize: (rendererObj) => handleResize(rendererObj),
  });

  const requestRender = useFrameRender(() => {
    if (rendererRef.current) render(rendererRef.current);
  });
  useSlotHighlightRender(requestRender);

  const tiles = useAtomValue(tilesAtom);
  const rows = useMemo(
    () => getTileRows(tiles, config.kind),
    [tiles, config.kind],
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
      if (agg) {
        renderer.renderedGranularity = undefined;
        const viewChanged =
          updateView && setVisibleRange(renderer, visibleRangeMs);
        // Pans that stay within the built range skip the mesh rebuild, so
        // update the lane scale here instead
        const shareChanged =
          viewChanged && updateAggMaxStateShare(renderer, visibleRangeMs);
        query(refNs, visibleRangeMs, worldRangeMs);
        if (viewChanged || shareChanged) requestRender();
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

      query(refNs, visibleRangeMs, worldRangeMs);

      if (viewChanged || granularityChanged) requestRender();
    },
    [rendererRef, requestRender, query],
  );

  const drawAgg = useCallback(() => {
    const renderer = rendererRef.current;
    const refNs = store.get(referenceNsAtom);
    const visibleRangeMs = store.get(visibleRangeAtom);
    if (!renderer?.isAgg || refNs == null || !visibleRangeMs) return;

    const changed = updateAggStatesMesh(
      renderer,
      refNs,
      visibleRangeMs,
      store.get(aggTileStatesAtom),
    );
    if (changed) requestRender();
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
    const onAggChange = () => {
      if (rendererRef.current) rendererRef.current.aggMeshBuild = undefined;
    };
    aggEmitter.addListener(dataChangeEventType, onAggChange);
    aggEmitter.addListener(drawEventType, throttledDrawAgg);

    // trigger initial query, camera, and geometry build
    onRangeChange(true);

    return () => {
      aggEmitter.removeListener(dataChangeEventType, onAggChange);
      aggEmitter.removeListener(drawEventType, throttledDrawAgg);
      throttledDrawAgg.cancel();
      unsubscribeVisible();
      unsubscribeWorld();
    };
  }, [rendererRef, onRangeChange, throttledDrawAgg]);

  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (renderer) renderer.aggMeshBuild = undefined;
    if (renderer?.isAgg) {
      drawAgg();
      return;
    }
    if (!renderer?.renderedGranularity) return;
    syncMeshes(renderer, true);
    requestRender();
  }, [rendererRef, requestRender, rows, drawAgg]);

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

  return {
    containerRef,
    rendererRef,
    requestRender,
    rows,
    isAgg,
    nonAggGranularity,
  };
}
