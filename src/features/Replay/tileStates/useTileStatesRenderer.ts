import { getDefaultStore, useAtomValue } from "jotai";
import { isEqual } from "lodash";
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
  setVisibleRange,
  render,
  handleResize,
  isVisibleTileRangeChanged,
  setUpRenderer,
  syncMeshes,
  type RendererObj,
  type TileStatesTrackConfig,
} from "./utils.ts";
import {
  getTileRows,
  getTileStatesGranularity,
  isAggregate,
} from "./consts.ts";
import type { TileStatesGranularity } from "../../../api/types.ts";
import { TileStatesGranularityEnum } from "../../../api/entities.ts";
import { aggTileStatesAtom, aggTileStatesEmitterAtom } from "./aggAtoms.ts";
import { dataChangeEventType, drawEventType } from "../const.ts";
import { useSlotHighlightRender } from "../slotHighlight.ts";
import { updateAggStatesMesh } from "./aggUtils.ts";
import { getAggGranularity } from "./useAggTileStatesQuery.ts";
import type { DataLevel } from "../coverage.ts";
import { useModeCoverage } from "../useModeCoverage.ts";

const store = getDefaultStore();

function getTargetGranularity(visibleRangeMs: TsRange): string {
  const windowMs = visibleRangeMs[1] - visibleRangeMs[0];
  return isAggregate(visibleRangeMs)
    ? getAggGranularity(windowMs)
    : getTileStatesGranularity(windowMs);
}

/**
 * Sets up a tile states track's renderer, and keeps its meshes in sync with the
 * visible range, tiles, and the txn, batch, and agg data. Queries on range
 * changes, after moving the camera.
 */
export function useTileStatesRenderer({
  config,
  remount,
  query,
  granularityLevels,
}: {
  config: TileStatesTrackConfig;
  remount: () => void;
  query: (
    referenceNs: bigint,
    visibleRangeMs: TsRange,
    worldRangeMs: TsRange,
  ) => void;
  granularityLevels: DataLevel[];
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
  const { resolveModeRanges, startAggDraw } = useModeCoverage({
    granularityLevels,
    getTargetGranularity,
    getAggGranularity,
  });

  const syncModes = useCallback(
    (renderer: RendererObj) => {
      const visibleRangeMs = store.get(visibleRangeAtom);
      if (!visibleRangeMs) return false;

      const prevModeRanges = renderer.modeRanges;
      const modeRanges = resolveModeRanges();
      renderer.modeRanges = modeRanges;

      // Agg views keep the last non agg granularity drawn for its fallback data
      const prevGranularity = renderer.renderedGranularity;
      const granularity = !modeRanges.nonAgg.length
        ? undefined
        : isAggregate(visibleRangeMs)
          ? (prevGranularity ?? TileStatesGranularityEnum.txn_batch)
          : getTileStatesGranularity(visibleRangeMs[1] - visibleRangeMs[0]);
      renderer.renderedGranularity = granularity;
      if (granularity) setNonAggGranularity(granularity);

      const granularityChanged = granularity !== prevGranularity;
      if (granularity && granularityChanged) {
        if (prevGranularity === undefined) {
          syncMeshes(renderer, true);
        } else {
          clearLiveMarker(renderer);
          syncMeshes(renderer);
        }
      }

      let aggChanged = false;
      if (modeRanges.agg.length) {
        const aggDraw = startAggDraw();
        aggChanged =
          !!aggDraw &&
          updateAggStatesMesh(
            renderer,
            aggDraw.referenceNs,
            aggDraw.visibleRange,
            store.get(aggTileStatesAtom),
            aggDraw.getDrawTiles,
          );
      }

      return (
        granularityChanged || aggChanged || !isEqual(modeRanges, prevModeRanges)
      );
    },
    [resolveModeRanges, startAggDraw],
  );

  const onRangeChange = useCallback(
    (updateView: boolean) => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      const refNs = store.get(referenceNsAtom);
      const visibleRangeMs = store.get(visibleRangeAtom);
      const worldRangeMs = store.get(worldRangeAtom);
      if (refNs == null || !visibleRangeMs || !worldRangeMs) return;

      setIsAgg(isAggregate(visibleRangeMs));

      // Move camera before querying, because query may trigger immediate draw
      // if data is already available
      const viewChanged =
        updateView && setVisibleRange(renderer, visibleRangeMs);
      const modesChanged = syncModes(renderer);
      if (viewChanged && isVisibleTileRangeChanged(renderer)) {
        syncMeshes(renderer);
      }

      query(refNs, visibleRangeMs, worldRangeMs);

      if (viewChanged || modesChanged) requestRender();
    },
    [rendererRef, requestRender, query, syncModes],
  );

  const drawModes = useCallback(() => {
    const renderer = rendererRef.current;
    if (renderer && syncModes(renderer)) requestRender();
  }, [rendererRef, requestRender, syncModes]);

  const throttledDrawModes = useThrottledCallbackIfVisible(drawModes, 50, {
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
    aggEmitter.addListener(drawEventType, throttledDrawModes);

    // trigger initial query, camera, and geometry build
    onRangeChange(true);

    return () => {
      aggEmitter.removeListener(dataChangeEventType, onAggChange);
      aggEmitter.removeListener(drawEventType, throttledDrawModes);
      throttledDrawModes.cancel();
      unsubscribeVisible();
      unsubscribeWorld();
    };
  }, [rendererRef, onRangeChange, throttledDrawModes]);

  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.aggMeshBuild = undefined;
    syncModes(renderer);
    if (renderer.renderedGranularity) syncMeshes(renderer, true);
    requestRender();
  }, [rendererRef, requestRender, rows, syncModes]);

  const handleDelta = useCallback(
    (granularity: TileStatesGranularity, delta: TileStatesCacheDelta) => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      const modesChanged = syncModes(renderer);
      if (granularity !== renderer.renderedGranularity) {
        if (delta.kind !== "live" && renderer.renderedGranularity) {
          syncMeshes(renderer);
        }
        if (delta.kind !== "live" || modesChanged) requestRender();
        return;
      }

      if (delta.kind === "add") clearLiveMarkerIfAdded(renderer, delta.tiles);
      else if (delta.kind === "clearLive" || delta.kind === "reset")
        clearLiveMarker(renderer);

      if (delta.kind === "live") {
        appendLiveStates(renderer, delta.tile, delta.newData, delta.isNewTile);
        if (delta.isNewTile) syncMeshes(renderer);
      } else {
        syncMeshes(renderer);
      }

      requestRender();
    },
    [rendererRef, requestRender, syncModes],
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
