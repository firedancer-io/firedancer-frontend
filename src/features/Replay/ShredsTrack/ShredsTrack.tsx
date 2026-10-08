import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { useRef, useCallback, useLayoutEffect, useState } from "react";
import { type ExplorableChartProps, type MarkerLinesProps } from "../const.ts";
import { useThrottledCallback } from "use-debounce";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlEventHandlers } from "../../WebGl/useWebGlEventHandlers.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import {
  convertToShredsRange,
  drawAggShreds,
  drawNonAggShreds,
  isAggregate,
  moveAggCamera,
  moveNonAggCamera,
  setUpRenderers,
} from "./utils.ts";
import { type RendererObj } from "./const.ts";
import { useAggShredsQuery, getAggGranularity } from "./useAggShredsQuery.ts";
import {
  getNonAggGranularity,
  useNonAggShredsQuery,
} from "./useNonAggShredsQuery.ts";
import type { AggGranularity, ShredsGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import {
  aggShredsAtom,
  drawEventType,
  aggShredsEmitterAtom,
  timelineShredsAtoms,
  timelineFecShredsAtoms,
} from "./atoms.ts";
import { minDirtySlotByChartAtom } from "../../Overview/ShredsProgression/atoms.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import clsx from "clsx";
import styles from "../track.module.css";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible.ts";

const height = 300;
const chartId = "shreds-track";
const store = getDefaultStore();

interface ShredsTrackProps
  extends WebGlRemountProps,
    ExplorableChartProps,
    MarkerLinesProps {
  width: number;
}

function ShredsTrack({
  remount,
  setUpExploreListeners,
  markerLinesClassName,
  width,
}: ShredsTrackProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [granularity, setGranularity] = useState<
    AggGranularity | ShredsGranularity | undefined
  >(undefined);

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();
  // active non-agg granularity, kept in a ref so the throttled draw/camera
  // closures always read the latest without re-creating the callback
  const nonAggGranularityRef = useRef<ShredsGranularity>(
    getNonAggGranularity(0),
  );

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const aggQuery = useAggShredsQuery(chartId);
  const { query: nonAggQuery, hasPendingTiles } = useNonAggShredsQuery(chartId);

  // non-agg data updates drive redraws (parallel to the agg emitter)
  const shredLastUpdateTs = useAtomValue(timelineShredsAtoms.lastUpdateTs);
  const fecLastUpdateTs = useAtomValue(timelineFecShredsAtoms.lastUpdateTs);

  const setMinDirtySlotByChart = useSetAtom(minDirtySlotByChartAtom);

  const throttledRelativeTsQuery = useThrottledCallback(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
      if (isAggregate(visibleRange)) {
        const queryGranularity = getAggGranularity(
          visibleRange[1] - visibleRange[0],
        );
        aggQuery(referenceNs, visibleRange, worldRange, queryGranularity);
        setGranularity(queryGranularity);
      } else {
        const queryGranularity = getNonAggGranularity(
          visibleRange[1] - visibleRange[0],
        );
        nonAggQuery(referenceNs, visibleRange, worldRange, queryGranularity);
        nonAggGranularityRef.current = queryGranularity;
        setGranularity(queryGranularity);
      }
    },
    100,
    { leading: true, trailing: true },
  );

  const renderActive = useCallback(() => {
    if (!rendererRef.current) return;
    const { renderer, aggResources, nonAggResources } = rendererRef.current;
    const visibleRange = store.get(visibleRangeAtom);
    if (!visibleRange) return;

    const { camera, scene } = isAggregate(visibleRange)
      ? aggResources
      : nonAggResources;
    renderer.render(scene, camera);
  }, []);

  // The actual non-agg draw. Extracted so it can run either throttled (on data
  // update) or synchronously (on range change / granularity switch, where the
  // shared mesh pool must be redrawn against the new reference in the same frame).
  const runDrawNonAgg = useCallback(
    (visibleRange: TsRange, referenceNs: bigint) => {
      if (!rendererRef.current) return;

      const nonAggGranularity = nonAggGranularityRef.current;
      const shredsVisibleRange = convertToShredsRange(
        visibleRange,
        referenceNs,
        nonAggGranularity,
      );
      if (!shredsVisibleRange) return;

      const { camera } = rendererRef.current.nonAggResources;

      // Move camera now because reference ts may have been missing before first data
      moveNonAggCamera(camera, visibleRange, referenceNs, nonAggGranularity);

      drawNonAggShreds(
        rendererRef.current,
        nonAggGranularity,
        shredsVisibleRange,
        [0, width],
        chartId,
        hasPendingTiles(),
      );
    },
    [hasPendingTiles, width],
  );

  /**
   * Update camera and query data for new range
   */
  const onRangeChange = useCallback(() => {
    if (!rendererRef.current) return;

    const referenceNs = store.get(referenceNsAtom);
    const worldRange = store.get(worldRangeAtom);
    const visibleRange = store.get(visibleRangeAtom);
    if (referenceNs == null || !visibleRange || !worldRange) return;

    throttledRelativeTsQuery(referenceNs, visibleRange, worldRange);

    // Move camera before querying, because query may trigger immediate draw if data is already available
    if (isAggregate(visibleRange)) {
      moveAggCamera(rendererRef.current.aggResources, visibleRange);
    } else {
      // Order matters: the query above marks tiles pending synchronously, THEN
      // we redraw. The redraw reads hasPendingTiles() to gate hiding of
      // incomplete slots — drawing before querying would read the previous
      // (settled) state and let an incomplete slot paint a bar to the edge.
      runDrawNonAgg(visibleRange, referenceNs);
    }

    renderActive();
  }, [renderActive, runDrawNonAgg, throttledRelativeTsQuery]);

  const throttledDrawAgg = useThrottledCallbackIfVisible(
    useCallback(() => {
      const referenceNs = store.get(referenceNsAtom);
      const visibleRange = store.get(visibleRangeAtom);
      const aggShreds = store.get(aggShredsAtom);
      if (!rendererRef.current || !visibleRange || referenceNs == null) return;

      drawAggShreds(rendererRef.current, referenceNs, visibleRange, aggShreds);
      renderActive();
    }, [renderActive]),
    50,
    { leading: true, trailing: true },
  );

  // redraw non-agg track when shred/fec data updates (mirrors throttledDrawAgg)
  const throttledDrawNonAgg = useThrottledCallbackIfVisible(
    useCallback(() => {
      const referenceNs = store.get(referenceNsAtom);
      const visibleRange = store.get(visibleRangeAtom);
      if (!rendererRef.current || !visibleRange || referenceNs == null) return;
      if (isAggregate(visibleRange)) return;

      runDrawNonAgg(visibleRange, referenceNs);
      renderActive();
    }, [renderActive, runDrawNonAgg]),
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

    // setup dirty slot tracking (trigger draw of every slot)
    setMinDirtySlotByChart((prev) => {
      prev.set(chartId, -Infinity);
      return prev;
    });

    rendererRef.current = rendererObj;
    containerRef.current.replaceChildren(rendererObj.renderer.domElement);

    const unsubscribeRange = store.sub(visibleRangeAtom, onRangeChange);
    const cleanUpExploreListeners = setUpExploreListeners(containerRef.current);
    const cleanUpRenderer = rendererRef.current.cleanUp;
    // listen for agg shreds draw events
    const aggEmitter = store.get(aggShredsEmitterAtom);
    aggEmitter.addListener(drawEventType, throttledDrawAgg);

    // trigger initial draw
    setIsInitialized(true);
    onRangeChange();

    // cleanup
    return () => {
      setMinDirtySlotByChart((prev) => {
        prev.delete(chartId);
        return prev;
      });
      aggEmitter.removeListener(drawEventType, throttledDrawAgg);
      throttledRelativeTsQuery.cancel();
      unsubscribeRange();
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
    throttledRelativeTsQuery,
    setMinDirtySlotByChart,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!isInitialized || !rendererRef.current) return;
    rendererRef.current.renderer.setSize(width, height);
    renderActive();
  }, [renderActive, width, isInitialized]);

  // redraw non-agg track on new shred/fec data
  useLayoutEffect(() => {
    if (!isInitialized) return;
    throttledDrawNonAgg();
  }, [isInitialized, shredLastUpdateTs, fecLastUpdateTs, throttledDrawNonAgg]);

  return (
    <div className={styles.trackContainer} style={{ height: `${height}px` }}>
      <div
        ref={containerRef}
        className={clsx(styles.trackCanvasContainer, markerLinesClassName)}
      />
      <div className={styles.bucketSizeLabel}>
        Bucket size: {granularity ?? "-"}
      </div>
    </div>
  );
}

const ShredsTrackWithRemount = withWebGlRemount(ShredsTrack);
export default ShredsTrackWithRemount;
