import { getDefaultStore, useAtomValue } from "jotai";
import { useRef, useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useThrottledCallback } from "use-debounce";
import clsx from "clsx";
import SelectionMarker from "../SelectionMarker.tsx";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlEventHandlers } from "../../WebGl/useWebGlEventHandlers.ts";
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
  resizeCanvas,
  setUpRenderer,
  syncMeshes,
  type RendererObj,
} from "./utils.ts";
import {
  DEFAULT_TILE_STATES_MODE_OPTIONS,
  getDefaultViewOpts,
  getDisplayMode,
  getAvailableModes,
  getTileStatesGranularity,
  isAggregate,
  type TileStatesModeOption,
  ROW_HEIGHT_PX,
  type TileStatesViewOpts,
  type TileKind,
} from "./consts.ts";
import type {
  AggGranularity,
  TileStatesGranularity,
} from "../../../api/types.ts";
import { TileStatesGranularityEnum } from "../../../api/entities.ts";
import TileStatesYAxis from "./TileStatesYAxis.tsx";
import {
  aggTileStatesAtom,
  aggTileStatesEmitterAtom,
  drawEventType,
} from "./aggAtoms.ts";
import { buildAggStatesMesh } from "./aggUtils.ts";
import {
  getAggGranularity,
  useAggTileStatesQuery,
  type AggTileStatesQuery,
} from "./useAggTileStatesQuery.ts";
import TileStatesControls from "./TileStatesControls.tsx";
import styles from "../track.module.css";

const store = getDefaultStore();

interface TileStatesTrackProps {
  kind: TileKind;
  canControlsOverlapRows?: boolean;
  modes?: TileStatesModeOption[];
}

interface TileStatesTrackBodyProps
  extends TileStatesTrackProps,
    WebGlRemountProps {
  aggQuery: AggTileStatesQuery;
}

function TileStatesTrackBody({
  kind,
  canControlsOverlapRows = false,
  modes = DEFAULT_TILE_STATES_MODE_OPTIONS,
  remount,
  aggQuery: { query: aggQuery, pauseStaleRefreshes: pauseStaleAggRefreshes },
}: TileStatesTrackBodyProps) {
  const defaultMode = modes[0].mode;
  const [opts, setOpts] = useState<TileStatesViewOpts>(() =>
    getDefaultViewOpts(defaultMode),
  );
  const [mode, setMode] = useState(defaultMode);
  const [availableModes, setAvailableModes] = useState(() =>
    modes.map(({ mode }) => mode),
  );
  const [granularity, setGranularity] = useState<TileStatesGranularity>(
    TileStatesGranularityEnum.txn,
  );
  const [isAgg, setIsAgg] = useState(false);
  const [aggGranularity, setAggGranularity] = useState<AggGranularity>();

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();
  // Refs so callbacks don't depend on the props' identity
  const modesRef = useRef(modes);
  modesRef.current = modes;
  const selectedModeRef = useRef(opts.mode);
  selectedModeRef.current = opts.mode;

  /** Resolves the displayed and available modes for the visible span */
  const updateMode = useCallback(
    (renderer: RendererObj, visibleRangeMs: TsRange) => {
      const spanMs = visibleRangeMs[1] - visibleRangeMs[0];
      renderer.mode = getDisplayMode(
        modesRef.current,
        selectedModeRef.current,
        spanMs,
      );
      setMode(renderer.mode);
      const available = getAvailableModes(modesRef.current, spanMs);
      setAvailableModes((prev) =>
        prev.length === available.length &&
        prev.every((mode, i) => mode === available[i])
          ? prev
          : available,
      );
    },
    [],
  );

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
      updateMode(renderer, visibleRangeMs);
      if (agg) {
        renderer.renderedGranularity = undefined;
        const viewChanged =
          updateView && setVisibleRange(renderer, visibleRangeMs);
        throttledRangeQuery(refNs, visibleRangeMs, worldRangeMs);
        if (viewChanged) render(renderer);
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
    [throttledRangeQuery, updateMode],
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
    render(renderer);
  }, []);

  const throttledDrawAgg = useThrottledCallbackIfVisible(drawAgg, 50, {
    leading: false,
    trailing: true,
  });

  // set up renderer and subscribe to range changes to trigger queries
  useLayoutEffect(() => {
    if (rendererRef.current || !containerRef.current) return;

    const rendererObj = setUpRenderer(
      kind,
      defaultMode,
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

    const aggEmitter = store.get(aggTileStatesEmitterAtom);
    aggEmitter.addListener(drawEventType, throttledDrawAgg);

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
      aggEmitter.removeListener(drawEventType, throttledDrawAgg);
      throttledDrawAgg.cancel();
      throttledRangeQuery.cancel();
      resizeObserver.disconnect();
      unsubscribeVisible();
      unsubscribeWorld();
      cleanUpRenderer();
      rendererRef.current = undefined;
    };
  }, [
    kind,
    defaultMode,
    onRangeChange,
    setUpContextListeners,
    getWasContextLost,
    throttledDrawAgg,
    throttledRangeQuery,
  ]);

  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (renderer?.isAgg) {
      drawAgg();
      return;
    }
    if (!renderer?.renderedGranularity) return;
    syncMeshes(renderer, true);
    render(renderer);
  }, [rows, drawAgg]);

  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.errorStatesScene.visible = opts.showErrorStates;
    render(renderer);
  }, [opts.showErrorStates]);

  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    const visibleRangeMs = store.get(visibleRangeAtom);
    if (!renderer || !visibleRangeMs) return;
    updateMode(renderer, visibleRangeMs);
    if (renderer.isAgg) drawAgg();
    else render(renderer);
  }, [opts.mode, updateMode, drawAgg]);

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
    <div
      className={clsx(
        styles.trackContainer,
        canControlsOverlapRows ? styles.topInset : styles.controlsInset,
      )}
    >
      <div style={{ position: "relative", height: `${height}px` }}>
        <div ref={containerRef} className={styles.trackCanvasContainer} />
        <SelectionMarker />
        <TileStatesYAxis
          labels={rows.map(({ label }) => label)}
          offsetFirstLabel={canControlsOverlapRows}
        />
      </div>
      <TileStatesControls
        kind={kind}
        granularity={granularity}
        isAgg={isAgg}
        availableModes={availableModes}
        mode={mode}
        aggGranularity={aggGranularity}
        opts={opts}
        setOpts={setOpts}
      />
    </div>
  );
}

const TileStatesTrackBodyWithRemount = withWebGlRemount(TileStatesTrackBody);
export default function TileStatesTrack(props: TileStatesTrackProps) {
  const aggQuery = useAggTileStatesQuery();

  return <TileStatesTrackBodyWithRemount aggQuery={aggQuery} {...props} />;
}
