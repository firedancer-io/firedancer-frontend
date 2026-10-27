import { getDefaultStore } from "jotai";
import { useRef, useCallback, useLayoutEffect, useState } from "react";
import SelectionMarker from "../SelectionMarker.tsx";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible.ts";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlEventHandlers } from "../../WebGl/useWebGlEventHandlers.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import {
  drawAggSlots,
  isAggregate,
  moveAggCamera,
  setUpRenderers,
} from "./utils.ts";
import { aggTrackHeight, type RendererObj } from "./const.ts";
import { useAggHeaderQuery, getAggGranularity } from "./useAggHeaderQuery.ts";
import type { AggGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import clsx from "clsx";
import styles from "../track.module.css";
import chartStyles from "../chart.module.css";
import {
  aggHeaderEmitterAtom,
  aggSlotsAtom,
  drawEventType,
} from "./aggAtoms.ts";
import { Box } from "@radix-ui/themes";

const chartId = "agg-header-track";
const store = getDefaultStore();

interface AggHeaderTrackProps extends WebGlRemountProps {
  width: number;
  className: string;
  showAgg: () => void;
}

function AggHeaderTrack({
  remount,
  width,
  className,
  showAgg,
}: AggHeaderTrackProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [granularity, setGranularity] = useState<AggGranularity | undefined>(
    undefined,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const { query: aggQuery, pauseStaleRefreshes } = useAggHeaderQuery(chartId);

  const throttledRelativeTsQuery = useThrottledCallbackIfVisible(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
      if (isAggregate(visibleRange)) {
        const queryGranularity = getAggGranularity(
          visibleRange[1] - visibleRange[0],
        );
        aggQuery(referenceNs, visibleRange, worldRange, queryGranularity);
        setGranularity(queryGranularity);
      } else {
        pauseStaleRefreshes();
        // TODO: non-aggregate query
        setGranularity(undefined);
      }
    },
    100,
    { leading: true, trailing: true },
  );

  const renderIfActive = useCallback(() => {
    if (!rendererRef.current) return;

    const visibleRange = store.get(visibleRangeAtom);
    if (!visibleRange || !isAggregate(visibleRange)) return;

    const { renderer, aggResources } = rendererRef.current;
    const { camera, scene } = aggResources;
    renderer.render(scene, camera);
  }, []);

  /**
   * Update camera, toggle visibility, and query data for a new range.
   */
  const onRangeChange = useCallback(() => {
    if (!rendererRef.current) return;

    const referenceNs = store.get(referenceNsAtom);
    const worldRange = store.get(worldRangeAtom);
    const visibleRange = store.get(visibleRangeAtom);
    if (
      referenceNs == null ||
      !visibleRange ||
      !worldRange ||
      !isAggregate(visibleRange)
    ) {
      return;
    }

    // Move camera before querying, because query may trigger immediate draw if data is already available
    moveAggCamera(rendererRef.current.aggResources, visibleRange);
    throttledRelativeTsQuery(referenceNs, visibleRange, worldRange);
    renderIfActive();
  }, [renderIfActive, throttledRelativeTsQuery]);

  const throttledDrawAgg = useThrottledCallbackIfVisible(
    useCallback(() => {
      const referenceNs = store.get(referenceNsAtom);
      const visibleRange = store.get(visibleRangeAtom);
      const aggSlots = store.get(aggSlotsAtom);
      if (
        !rendererRef.current ||
        !visibleRange ||
        referenceNs == null ||
        !isAggregate(visibleRange)
      ) {
        return;
      }

      drawAggSlots(rendererRef.current, referenceNs, visibleRange, aggSlots);
      renderIfActive();
      showAgg();
    }, [showAgg, renderIfActive]),
    50,
    { leading: true, trailing: true },
  );

  // set up renderer and subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    if (rendererRef.current || !containerRef.current) return;

    const rendererObj = setUpRenderers(
      0,
      aggTrackHeight,
      setUpContextListeners,
      getWasContextLost,
    );
    if (!rendererObj) return;

    rendererRef.current = rendererObj;
    containerRef.current.replaceChildren(rendererObj.renderer.domElement);

    const unsubscribeRange = store.sub(visibleRangeAtom, onRangeChange);
    const cleanUpRenderer = rendererRef.current.cleanUp;

    // listen for agg slots draw events
    const aggEmitter = store.get(aggHeaderEmitterAtom);
    aggEmitter.addListener(drawEventType, throttledDrawAgg);

    // trigger initial draw
    setIsInitialized(true);
    onRangeChange();

    // cleanup
    return () => {
      aggEmitter.removeListener(drawEventType, throttledDrawAgg);
      throttledDrawAgg.cancel();
      throttledRelativeTsQuery.cancel();
      unsubscribeRange();
      cleanUpRenderer();
      rendererRef.current = undefined;
    };
  }, [
    onRangeChange,
    setUpContextListeners,
    getWasContextLost,
    throttledDrawAgg,
    throttledRelativeTsQuery,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!isInitialized || !rendererRef.current) return;
    rendererRef.current.renderer.setSize(width, aggTrackHeight);
    renderIfActive();
  }, [isInitialized, renderIfActive, width]);

  return (
    <Box
      height={`${aggTrackHeight}px`}
      className={clsx(className, styles.trackContainer)}
    >
      <div ref={containerRef} className={styles.trackCanvasContainer} />
      <SelectionMarker />
      <div className={clsx(chartStyles.noChartExplore, styles.bucketSizeLabel)}>
        Bucket size: {granularity ?? "-"}
      </div>
    </Box>
  );
}

const AggHeaderTrackWithRemount = withWebGlRemount(AggHeaderTrack);
export default AggHeaderTrackWithRemount;
