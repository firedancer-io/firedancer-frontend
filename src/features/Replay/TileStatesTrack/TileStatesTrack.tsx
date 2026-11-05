import { getDefaultStore, useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
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
  setUpRenderer,
  syncMeshes,
  updateBarHeight,
} from "./utils.ts";
import {
  getTileStatesGranularity,
  isAggregate,
  type TileKind,
} from "./consts.ts";
import type { TileStatesGranularity } from "../../../api/types.ts";
import { TileStatesGranularityEnum } from "../../../api/entities.ts";
import AggTileStates from "./AggTileStatesTrack.tsx";
import TileStatesControls from "./TileStatesControls.tsx";
import { findTxnAtCursor } from "./hoverUtils.ts";
import { hoveredExecrpTxnAtom } from "./hoverAtoms.ts";
import { useHoveredPosition, type HoveredRect } from "../useHoveredPosition.ts";
import { tileStatesViewOptsAtoms } from "./atoms.ts";
import RowLabels from "../RowLabels.tsx";
import { getRowsLayout, trackInsetPx } from "../layout.ts";
import styles from "../track.module.css";
import { useSlotHighlightRender } from "../slotHighlight.ts";

const store = getDefaultStore();

interface TileStatesTrackProps extends WebGlRemountProps {
  kind: TileKind;
  height: number;
}

function TileStatesTrack({ kind, height, remount }: TileStatesTrackProps) {
  const [opts, setOpts] = useAtom(tileStatesViewOptsAtoms[kind]);
  const [granularity, setGranularity] = useState<TileStatesGranularity>(
    TileStatesGranularityEnum.txn,
  );
  const [isAgg, setIsAgg] = useState(false);

  const { containerRef, rendererRef } = useWebGlRenderer({
    remount,
    create: ({ setUpContextListeners, getWasContextLost }) =>
      setUpRenderer(kind, setUpContextListeners, getWasContextLost),
    onResize: (rendererObj) => handleResize(rendererObj),
  });

  const requestRender = useFrameRender(() => {
    if (rendererRef.current) render(rendererRef.current);
  });
  useSlotHighlightRender(requestRender);

  const tiles = useAtomValue(tilesAtom);
  const rows = useMemo(() => getTileRows(tiles, kind), [tiles, kind]);
  const rowsLayout = getRowsLayout(height, rows.length, {
    insetPx: trackInsetPx[kind === "execrp" ? "banks" : "replay"],
    fillWhenThin: kind === "replay",
  });

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
      if (agg) {
        renderer.renderedGranularity = undefined;
        refreshHover();
        return;
      }

      const granularity = getTileStatesGranularity(
        visibleRangeMs[1] - visibleRangeMs[0],
      );
      renderer.renderedGranularity = granularity;
      setGranularity(granularity);

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
      refreshHover();
    },
    [rendererRef, requestRender, throttledRangeQuery, refreshHover],
  );

  // subscribe to range changes to trigger queries
  useLayoutEffect(() => {
    const unsubscribeVisible = store.sub(visibleRangeAtom, () =>
      onRangeChange(true),
    );
    const unsubscribeWorld = store.sub(worldRangeAtom, () =>
      onRangeChange(false),
    );

    // trigger initial query, camera, and geometry build
    onRangeChange(true);

    return () => {
      unsubscribeVisible();
      unsubscribeWorld();
    };
  }, [onRangeChange]);

  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    updateBarHeight(renderer);
    if (renderer.renderedGranularity) syncMeshes(renderer, true);
    requestRender();
  }, [rendererRef, requestRender, rows]);

  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.errorStatesScene.visible = opts.showErrorStates;
    requestRender();
  }, [opts.showErrorStates, rendererRef, requestRender]);

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
      refreshHover();
    },
    [rendererRef, requestRender, refreshHover],
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
        <div
          ref={setContainerRef}
          className={styles.trackCanvasContainer}
          style={{ visibility: isAgg ? "hidden" : undefined }}
        />
        {isAgg && <AggTileStates />}
      </div>
      <RowLabels labels={rows.map(({ label }) => label)} layout={rowsLayout} />
      <TileStatesControls
        kind={kind}
        granularity={granularity}
        isAgg={isAgg}
        opts={opts}
        setOpts={setOpts}
      />
    </>
  );
}

const TileStatesTrackWithRemount = withWebGlRemount(TileStatesTrack);
export default TileStatesTrackWithRemount;
