import { getDefaultStore, useAtomValue } from "jotai";
import { useRef, useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useThrottledCallback } from "use-debounce";
import clsx from "clsx";
import { type MarkerLinesProps } from "../const.ts";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlEventHandlers } from "../../WebGl/useWebGlEventHandlers.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import { tilesAtom } from "../../../api/atoms.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import { calcRelativeMs } from "../utils.ts";
import {
  useTileCacheQuery,
  useTileCacheSubscription,
} from "../tiles/useTileCache.ts";
import {
  getActiveTiles,
  tileStatesCaches,
  type TileStatesCacheDelta,
} from "./tileStatesCache.ts";
import {
  appendLive,
  clearLive,
  clearLiveIfAdded,
  getTileRows,
  setVisibleRange,
  rebuildAll,
  refreshSizeUniforms,
  render,
  setOutlinesVisible,
  setUpRenderer,
  syncMeshes,
  type RendererObj,
  type RowOfTile,
} from "./utils.ts";
import {
  DEFAULT_TILE_STATES_VIEW_OPTS,
  getTileStatesView,
  ROW_HEIGHT_PX,
  TOP_INSET_PX,
  type TileStatesView,
  type TileStatesViewOpts,
  type TileKind,
} from "./consts.ts";
import type { TileStatesGranularity } from "../../../api/types.ts";
import TileStatesYAxis from "./TileStatesYAxis.tsx";
import AggTileStates from "./AggTileStatesTrack.tsx";
import TileStatesControls from "./TileStatesControls.tsx";
import styles from "../track.module.css";

const store = getDefaultStore();

/** The tile cache that drives the renderer; agg is hidden, so batch is fine. */
function granularityOf(view: TileStatesView): TileStatesGranularity {
  return view === "txn" ? "txn" : "txn_batch";
}

interface TileStatesTrackProps extends WebGlRemountProps, MarkerLinesProps {
  kind: TileKind;
  width: number;
}

function TileStatesTrack({
  kind,
  remount,
  markerLinesClassName,
  width,
}: TileStatesTrackProps) {
  const [opts, setOpts] = useState<TileStatesViewOpts>(
    DEFAULT_TILE_STATES_VIEW_OPTS,
  );
  const [view, setView] = useState<TileStatesView>("txn");

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();
  const viewRef = useRef<TileStatesView>("txn");

  const referenceNs = useAtomValue(referenceNsAtom);
  const getRelativeMs = useCallback(
    (absoluteNs: bigint) => calcRelativeMs(referenceNs ?? 0n, absoluteNs),
    [referenceNs],
  );
  const getRelativeMsRef = useRef(getRelativeMs);
  getRelativeMsRef.current = getRelativeMs;

  const tiles = useAtomValue(tilesAtom);
  const rows = useMemo(() => getTileRows(tiles, kind), [tiles, kind]);
  const rowOfTile: RowOfTile = useMemo(
    () => new Map(rows.map(({ tileIdx }, row) => [tileIdx, row])),
    [rows],
  );
  const height = Math.max(rows.length, 1) * ROW_HEIGHT_PX;
  const rowOfTileRef = useRef(rowOfTile);
  rowOfTileRef.current = rowOfTile;

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const queryTxn = useTileCacheQuery(tileStatesCaches.txn);
  const queryBatch = useTileCacheQuery(tileStatesCaches.txn_batch);

  /** The cached tiles to render for the active granularity. */
  const resolveTiles = useCallback(
    () => getActiveTiles(granularityOf(viewRef.current)),
    [],
  );

  /** Full rebuild (row layout / reference-ts change). */
  const rebuild = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    rebuildAll(
      renderer,
      resolveTiles(),
      rowOfTileRef.current,
      getRelativeMsRef.current,
    );
    render(renderer);
  }, [resolveTiles]);

  /** Incremental re-sync to the resolved tile set (data/granularity change). */
  const syncRender = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    syncMeshes(
      renderer,
      resolveTiles(),
      rowOfTileRef.current,
      getRelativeMsRef.current,
    );
    render(renderer);
  }, [resolveTiles]);

  const throttledQuery = useThrottledCallback(
    (referenceNs: bigint, visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      const query = viewRef.current === "txn" ? queryTxn : queryBatch;
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

      const view = getTileStatesView(visibleRangeMs[1] - visibleRangeMs[0]);
      const prevView = viewRef.current;
      viewRef.current = view;
      setView(view);
      // Aggregates replace the state canvas; nothing to fetch or draw for it.
      if (view === "agg") return;

      // Switch render source when the view changes (deltas were ignored while
      // it was another granularity or agg); cached tiles make this instant.
      if (view !== prevView) {
        clearLive(renderer);
        // Re-sync to the new active source (shows fallback immediately).
        syncRender();
      }

      throttledQuery(refNs, visibleRangeMs, worldRangeMs);

      if (!updateView) return;
      setVisibleRange(renderer, visibleRangeMs);
      render(renderer);
    },
    [syncRender, throttledQuery],
  );

  // set up renderer and subscribe to range changes to trigger queries
  useLayoutEffect(() => {
    if (rendererRef.current || !containerRef.current) return;

    const rendererObj = setUpRenderer(
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
    const cleanUpRenderer = rendererObj.cleanUp;

    // trigger initial query, camera, and geometry build
    onRangeChange(true);
    rebuild();

    return () => {
      unsubscribeVisible();
      unsubscribeWorld();
      cleanUpRenderer();
      rendererRef.current = undefined;
    };
  }, [
    rebuild,
    onRangeChange,
    setUpContextListeners,
    getWasContextLost,
    height,
  ]);

  // handle chart resize (geometry is unchanged; only the outline resolution and
  // the drawing buffer need updating)
  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    // Size the canvas to a whole number of device pixels. A fractional CSS
    // size makes the browser resample the drawing buffer slightly, and with
    // pixel-snapped bars that beats into wide bands of dimmer columns.
    const { renderer: r } = renderer;
    const pixelRatio = r.getPixelRatio();
    const bufferWidth = Math.floor(width * pixelRatio);
    const bufferHeight = Math.round(height * pixelRatio);
    // +0.5 so three's floor(size * pixelRatio) lands exactly on the buffer size.
    r.setSize(
      (bufferWidth + 0.5) / pixelRatio,
      (bufferHeight + 0.5) / pixelRatio,
      false,
    );
    r.domElement.style.width = `${bufferWidth / pixelRatio}px`;
    r.domElement.style.height = `${bufferHeight / pixelRatio}px`;
    refreshSizeUniforms(renderer);
    render(renderer);
  }, [width, height]);

  // full rebuild when the row layout or absolute→relative time mapping changes
  useLayoutEffect(() => {
    rebuild();
  }, [rebuild, getRelativeMs, rowOfTile]);

  // toggle the outline meshes on/off (no geometry rebuild)
  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    setOutlinesVisible(renderer, opts.showOutlines);
    render(renderer);
  }, [opts.showOutlines]);

  const handleDelta = useCallback(
    (granularity: TileStatesGranularity, delta: TileStatesCacheDelta) => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      // Only the active granularity drives the renderer; the inactive cache's
      // tiles stay cached but aren't shown.
      if (granularity !== viewRef.current) return;

      if (delta.kind === "live") {
        appendLive(
          renderer,
          delta.tile,
          delta.newData,
          delta.isNewTile,
          rowOfTileRef.current,
          getRelativeMsRef.current,
        );
        render(renderer);
        return;
      }

      if (delta.kind === "add") clearLiveIfAdded(renderer, delta.tiles);
      else clearLive(renderer);
      syncRender();
    },
    [syncRender],
  );

  const onDeltaTxn = useCallback(
    (delta: TileStatesCacheDelta) => handleDelta("txn", delta),
    [handleDelta],
  );
  const onDeltaBatch = useCallback(
    (delta: TileStatesCacheDelta) => handleDelta("txn_batch", delta),
    [handleDelta],
  );
  useTileCacheSubscription(tileStatesCaches.txn, onDeltaTxn);
  useTileCacheSubscription(tileStatesCaches.txn_batch, onDeltaBatch);

  return (
    <div className={styles.trackContainer} style={{ paddingTop: TOP_INSET_PX }}>
      <div style={{ position: "relative", height: `${height}px` }}>
        <div
          ref={containerRef}
          className={clsx(styles.trackCanvasContainer, markerLinesClassName)}
          style={{ visibility: view === "agg" ? "hidden" : undefined }}
        />
        {view === "agg" && <AggTileStates />}
        <TileStatesYAxis labels={rows.map(({ label }) => label)} />
      </div>
      <TileStatesControls
        kind={kind}
        view={view}
        opts={opts}
        setOpts={setOpts}
      />
    </div>
  );
}

const TileStatesTrackWithRemount = withWebGlRemount(TileStatesTrack);
export default TileStatesTrackWithRemount;
