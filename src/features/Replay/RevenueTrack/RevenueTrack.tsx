import { getDefaultStore } from "jotai";
import { useRef, useCallback, useLayoutEffect, useState } from "react";
import { type ExplorableChartProps, type MarkerLinesProps } from "../const.ts";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible.ts";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlEventHandlers } from "../../WebGl/useWebGlEventHandlers.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import {
  drawAggRevenue,
  isAggregate,
  moveAggCamera,
  setUpRenderers,
  type RendererObj,
} from "./utils.ts";
import { getGranularity } from "./useAggRevenueQuery.ts";
import type { RevenueType } from "../../../api/entities.ts";
import type { AggGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import {
  aggRevenueAtom,
  drawEventType,
  aggRevenueEmitterAtom,
} from "./atoms.ts";
import clsx from "clsx";
import styles from "../track.module.css";

const height = 150;
const store = getDefaultStore();

interface RevenueTrackProps
  extends WebGlRemountProps,
    ExplorableChartProps,
    MarkerLinesProps {
  width: number;
  type: RevenueType;
  aggQuery: (
    referenceNs: bigint,
    visibleRange: TsRange,
    worldRange: TsRange,
    granularity: AggGranularity,
  ) => void;
}

function RevenueTrack({
  remount,
  setUpExploreListeners,
  markerLinesClassName,
  width,
  type,
  aggQuery,
}: RevenueTrackProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [granularity, setGranularity] = useState<AggGranularity | undefined>(
    undefined,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const throttledRelativeTsQuery = useThrottledCallbackIfVisible(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
      if (isAggregate(visibleRange)) {
        const queryGranularity = getGranularity(
          visibleRange[1] - visibleRange[0],
        );
        aggQuery(referenceNs, visibleRange, worldRange, queryGranularity);
        setGranularity(queryGranularity);
      } else {
        // TODO: non-aggregate query
        setGranularity(undefined);
      }
    },
    100,
    { leading: true, trailing: true },
  );

  const renderActive = useCallback(() => {
    if (!rendererRef.current) return;
    const { renderer, aggResources } = rendererRef.current;
    // TODO: add non-aggregate resources
    const { camera, scene } = aggResources;
    renderer.render(scene, camera);
  }, []);

  /**
   * Update camera and query data for new range
   */
  const onRangeChange = useCallback(() => {
    if (!rendererRef.current) return;

    const referenceNs = store.get(referenceNsAtom);
    const worldRange = store.get(worldRangeAtom);
    const visibleRange = store.get(visibleRangeAtom);
    if (referenceNs == null || !visibleRange || !worldRange) return;

    // Move camera before querying, because query may trigger immediate draw if data is already available
    if (isAggregate(visibleRange)) {
      moveAggCamera(rendererRef.current, visibleRange);
    } else {
      // TODO: move non-agg camera
    }

    throttledRelativeTsQuery(referenceNs, visibleRange, worldRange);
    renderActive();
  }, [renderActive, throttledRelativeTsQuery]);

  const throttledDrawAgg = useThrottledCallbackIfVisible(
    useCallback(() => {
      const referenceNs = store.get(referenceNsAtom);
      const visibleRange = store.get(visibleRangeAtom);
      const aggRevenue = store.get(aggRevenueAtom);
      if (!rendererRef.current || !visibleRange || referenceNs == null) return;
      drawAggRevenue(
        rendererRef.current,
        referenceNs,
        visibleRange,
        type,
        aggRevenue,
      );
      renderActive();
    }, [renderActive, type]),
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

    rendererRef.current = rendererObj;
    containerRef.current.replaceChildren(rendererObj.renderer.domElement);

    const unsubscribeRange = store.sub(visibleRangeAtom, onRangeChange);
    const cleanUpExploreListeners = setUpExploreListeners(containerRef.current);
    const cleanUpRenderer = rendererRef.current.cleanUp;

    // listen for agg revenue draw events
    const aggEmitter = store.get(aggRevenueEmitterAtom);
    aggEmitter.addListener(drawEventType, throttledDrawAgg);

    // trigger initial draw
    setIsInitialized(true);
    onRangeChange();

    // cleanup
    return () => {
      aggEmitter.removeListener(drawEventType, throttledDrawAgg);
      // cancel pending trailing timers so they don't accumulate across remounts
      throttledDrawAgg.cancel();
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
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!isInitialized || !rendererRef.current) return;
    rendererRef.current.renderer.setSize(width, height);
    renderActive();
  }, [renderActive, width, isInitialized]);

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

const RevenueTrackWithRemount = withWebGlRemount(RevenueTrack);
export default RevenueTrackWithRemount;
