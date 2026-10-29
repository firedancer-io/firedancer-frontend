import { getDefaultStore, useAtomValue } from "jotai";
import { useRef, useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useThrottledCallback } from "use-debounce";
import clsx from "clsx";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlEventHandlers } from "../../WebGl/useWebGlEventHandlers.ts";
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
  resizeCanvas,
  setUpRenderer,
  syncMeshes,
  type RendererObj,
} from "./utils.ts";
import {
  DEFAULT_TILE_STATES_VIEW_OPTS,
  getTileStatesGranularity,
  isAggregate,
  ROW_HEIGHT_PX,
  type TileStatesViewOpts,
  type TileKind,
} from "./consts.ts";
import type { TileStatesGranularity } from "../../../api/types.ts";
import { TileStatesGranularityEnum } from "../../../api/entities.ts";
import TileStatesYAxis from "./TileStatesYAxis.tsx";
import AggTileStates from "./AggTileStatesTrack.tsx";
import TileStatesControls from "./TileStatesControls.tsx";
import styles from "../track.module.css";

const store = getDefaultStore();

interface TileStatesTrackProps extends WebGlRemountProps {
  kind: TileKind;
}

function TileStatesTrack({ kind, remount }: TileStatesTrackProps) {
  const [opts, setOpts] = useState<TileStatesViewOpts>(
    DEFAULT_TILE_STATES_VIEW_OPTS,
  );
  const [granularity, setGranularity] = useState<TileStatesGranularity>(
    TileStatesGranularityEnum.txn,
  );
  const [isAgg, setIsAgg] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();

  const tiles = useAtomValue(tilesAtom);
  const rows = useMemo(() => getTileRows(tiles, kind), [tiles, kind]);
  const height = Math.max(rows.length, 1) * ROW_HEIGHT_PX;

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

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

      if (viewChanged || granularityChanged) render(renderer);
    },
    [throttledRangeQuery],
  );

  // set up renderer and subscribe to range changes to trigger queries
  useLayoutEffect(() => {
    if (rendererRef.current || !containerRef.current) return;

    const rendererObj = setUpRenderer(
      kind,
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
    const cleanUpRenderer = rendererObj.cleanUp;

    const hasDevicePixelBox =
      "devicePixelContentBoxSize" in ResizeObserverEntry.prototype;
    const resizeObserver = new ResizeObserver(([entry]) => {
      if (hasDevicePixelBox) {
        const [size] = entry.devicePixelContentBoxSize;
        resizeCanvas(rendererObj, size.inlineSize, size.blockSize);
      } else {
        const { width, height } = entry.contentRect;
        resizeCanvas(
          rendererObj,
          Math.round(width * devicePixelRatio),
          Math.round(height * devicePixelRatio),
        );
      }
    });
    resizeObserver.observe(
      rendererObj.renderer.domElement,
      hasDevicePixelBox ? { box: "device-pixel-content-box" } : undefined,
    );

    // trigger initial query, camera, and geometry build
    onRangeChange(true);

    return () => {
      resizeObserver.disconnect();
      unsubscribeVisible();
      unsubscribeWorld();
      cleanUpRenderer();
      rendererRef.current = undefined;
    };
  }, [kind, onRangeChange, setUpContextListeners, getWasContextLost]);

  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer?.renderedGranularity) return;
    syncMeshes(renderer, true);
    render(renderer);
  }, [rows]);

  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.errorStatesScene.visible = opts.showErrorStates;
    render(renderer);
  }, [opts.showErrorStates]);

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

      render(renderer);
    },
    [],
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
    <div className={clsx(styles.trackContainer, styles.topInset)}>
      <div style={{ position: "relative", height: `${height}px` }}>
        <div
          ref={containerRef}
          className={styles.trackCanvasContainer}
          style={{ visibility: isAgg ? "hidden" : undefined }}
        />
        {isAgg && <AggTileStates />}
        <TileStatesYAxis labels={rows.map(({ label }) => label)} />
      </div>
      <TileStatesControls
        kind={kind}
        granularity={granularity}
        isAgg={isAgg}
        opts={opts}
        setOpts={setOpts}
      />
    </div>
  );
}

const TileStatesTrackWithRemount = withWebGlRemount(TileStatesTrack);
export default TileStatesTrackWithRemount;
