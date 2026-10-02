import { getDefaultStore, useAtomValue } from "jotai";
import {
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { useThrottledCallback } from "use-debounce";
import { Flex } from "@radix-ui/themes";
import { type ExplorableChartProps, type MarkerLinesProps } from "../const.ts";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlEventHandlers } from "../../WebGl/useWebGlEventHandlers.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import { tileCountAtom } from "../../Overview/SlotPerformance/atoms.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import { calcRelativeMs } from "../utils.ts";
import {
  useTileCacheQuery,
  useTileCacheSubscription,
} from "../tiles/useTileCache.ts";
import {
  resolveRenderTiles,
  txnTimestampsCaches,
  type TxnTimestampCacheDelta,
} from "./txnTimestampsCache.ts";
import {
  appendLive,
  clearLive,
  clearLiveIfAdded,
  moveCamera,
  rebuildAll,
  refreshOutlineUniforms,
  render,
  setOutlinesVisible,
  setUpRenderer,
  syncMeshes,
  type RendererObj,
} from "./utils.ts";
import {
  BATCH_MAX_MS,
  DEFAULT_EXECRP_VIEW_OPTS,
  ROW_HEIGHT_PX,
  TXN_MAX_MS,
  type ExecrpGranularity,
  type ExecrpViewOpts,
} from "./consts.ts";
import ExecrpYAxis from "./ExecrpYAxis.tsx";
import ExecrpControls from "./ExecrpControls.tsx";
import ExecrpLegend from "./ExecrpLegend.tsx";

const store = getDefaultStore();

interface ExecrpTrackProps
  extends WebGlRemountProps,
    ExplorableChartProps,
    MarkerLinesProps {
  width: number;
}

function ExecrpTrack({
  remount,
  setUpExploreListeners,
  markerLinesClassName,
  width,
}: ExecrpTrackProps) {
  // Granularity is chosen by zoom: per-txn detail at fine zoom, aggregated
  // batches above TXN_MAX_MS. Each granularity has its own tile cache; only the
  // active one drives the renderer.
  const [opts, setOpts] = useState<ExecrpViewOpts>(DEFAULT_EXECRP_VIEW_OPTS);
  // The toggle is only shown below the threshold (above it, batch is forced).
  const [belowThreshold, setBelowThreshold] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();
  const granularityRef = useRef<ExecrpGranularity>("txn");
  const optsGranularityRef = useRef(opts.granularity);
  optsGranularityRef.current = opts.granularity;

  const referenceNs = useAtomValue(referenceNsAtom);
  const getRelativeMs = useCallback(
    (absoluteNs: bigint) => calcRelativeMs(referenceNs ?? 0n, absoluteNs),
    [referenceNs],
  );
  const getRelativeMsRef = useRef(getRelativeMs);
  getRelativeMsRef.current = getRelativeMs;

  const execrpTileCount = useAtomValue(tileCountAtom).execrp;
  // One row per execrp (execution/replay) tile — rows are indexed by txn_exec_idx.
  const execrpCount = execrpTileCount > 0 ? execrpTileCount : 1;
  const height = execrpCount * ROW_HEIGHT_PX;
  const execrpCountRef = useRef(execrpCount);
  execrpCountRef.current = execrpCount;

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const queryTxn = useTileCacheQuery(txnTimestampsCaches.txn);
  const queryBatch = useTileCacheQuery(txnTimestampsCaches.txn_batch);

  /** The cached tiles to render for the active granularity. */
  const resolveTiles = useCallback(
    () => resolveRenderTiles(granularityRef.current),
    [],
  );

  /** Full rebuild (row layout / reference-ts change). */
  const rebuild = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    rebuildAll(
      renderer,
      resolveTiles(),
      execrpCountRef.current,
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
      execrpCountRef.current,
      getRelativeMsRef.current,
    );
    render(renderer);
  }, [resolveTiles]);

  const throttledQuery = useThrottledCallback(
    (referenceNs: bigint, visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      const query = granularityRef.current === "txn" ? queryTxn : queryBatch;
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

      // Batch is forced above TXN_MAX_MS and the toggle decides below it. Switch
      // render source when the effective granularity changes; the inactive
      // cache's tiles are kept so switching back is instant.
      const span = visibleRangeMs[1] - visibleRangeMs[0];
      const below = span < TXN_MAX_MS;
      setBelowThreshold(below);
      const granularity = below ? optsGranularityRef.current : "txn_batch";
      if (granularity !== granularityRef.current) {
        granularityRef.current = granularity;
        clearLive(renderer);
        // Re-sync to the new active source (shows fallback immediately).
        syncRender();
      }

      // Beyond BATCH_MAX_MS the view is too coarse to be worth fetching: keep
      // showing whatever is already loaded (pans with the camera) but stop
      // querying for more.
      if (span < BATCH_MAX_MS) {
        throttledQuery(refNs, visibleRangeMs, worldRangeMs);
      }

      if (!updateView) return;
      moveCamera(renderer, visibleRangeMs);
      render(renderer);
    },
    [syncRender, throttledQuery],
  );

  // Re-resolve granularity when the toggle flips. useEffect (not layout) so the
  // switch paints immediately; the mesh rebuild follows on the next frame.
  useEffect(() => {
    onRangeChange(true);
  }, [opts.granularity, onRangeChange]);

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
    const cleanUpExploreListeners = setUpExploreListeners(containerRef.current);
    const cleanUpRenderer = rendererObj.cleanUp;

    // trigger initial query, camera, and geometry build
    onRangeChange(true);
    rebuild();

    return () => {
      unsubscribeVisible();
      unsubscribeWorld();
      cleanUpRenderer();
      rendererRef.current = undefined;
      cleanUpExploreListeners();
    };
  }, [
    rebuild,
    onRangeChange,
    setUpExploreListeners,
    setUpContextListeners,
    getWasContextLost,
    height,
  ]);

  // handle chart resize (geometry is unchanged; only the outline resolution and
  // the drawing buffer need updating)
  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.renderer.setSize(width, height);
    refreshOutlineUniforms(renderer);
    render(renderer);
  }, [width, height]);

  // full rebuild when the row layout or absolute→relative time mapping changes
  useLayoutEffect(() => {
    rebuild();
  }, [rebuild, getRelativeMs, execrpCount]);

  // toggle the outline meshes on/off (no geometry rebuild)
  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    setOutlinesVisible(renderer, opts.showOutlines);
    render(renderer);
  }, [opts.showOutlines]);

  const handleDelta = useCallback(
    (granularity: ExecrpGranularity, delta: TxnTimestampCacheDelta) => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      // Only the active granularity drives the renderer; the inactive cache's
      // tiles stay cached but aren't shown.
      if (granularity !== granularityRef.current) return;

      if (delta.kind === "live") {
        appendLive(
          renderer,
          delta.tile,
          execrpCountRef.current,
          getRelativeMsRef.current,
        );
        render(renderer);
        return;
      }

      if (delta.kind === "add") clearLiveIfAdded(renderer, delta.tiles);
      else clearLive(renderer); // "clearLive" | "reset"
      syncRender();
    },
    [syncRender],
  );

  const onDeltaTxn = useCallback(
    (delta: TxnTimestampCacheDelta) => handleDelta("txn", delta),
    [handleDelta],
  );
  const onDeltaBatch = useCallback(
    (delta: TxnTimestampCacheDelta) => handleDelta("txn_batch", delta),
    [handleDelta],
  );
  useTileCacheSubscription(txnTimestampsCaches.txn, onDeltaTxn);
  useTileCacheSubscription(txnTimestampsCaches.txn_batch, onDeltaBatch);

  return (
    <Flex direction="column" gap="2" width="100%">
      <Flex justify="between" align="center" gap="4" width="100%">
        <ExecrpLegend />
        <ExecrpControls
          opts={opts}
          setOpts={setOpts}
          showGranularity={belowThreshold}
        />
      </Flex>
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
          style={{ position: "absolute", inset: 0 }}
        />
        <ExecrpYAxis numRows={execrpCount} />
      </div>
    </Flex>
  );
}

const ExecrpTrackWithRemount = withWebGlRemount(ExecrpTrack);
export default ExecrpTrackWithRemount;
