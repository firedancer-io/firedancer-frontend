import { getDefaultStore } from "jotai";
import { useRef, useCallback, useLayoutEffect, useState } from "react";
import { type MarkerLinesProps } from "../const.ts";
import chartStyles from "../chart.module.css";
import { useThrottledCallback } from "use-debounce";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlEventHandlers } from "../../WebGl/useWebGlEventHandlers.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import {
  drawAggShreds,
  isAggregate,
  moveAggCamera,
  setUpRenderers,
} from "./utils.ts";
// TODO: handle non-agg shreds (minDirtySlotByChartAtom dirty-slot tracking)
import { type RendererObj } from "./const.ts";
import { useAggShredsQuery, getAggGranularity } from "./useAggShredsQuery.ts";
import type { AggGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import { aggShredsAtom, drawEventType, aggShredsEmitterAtom } from "./atoms.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";

const height = 300;
const chartId = "shreds-track";
const store = getDefaultStore();

interface ShredsTrackProps extends WebGlRemountProps, MarkerLinesProps {
  width: number;
}

function ShredsTrack({
  remount,
  markerLinesClassName,
  width,
}: ShredsTrackProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  // TODO: handle non-agg shreds granularity
  const [granularity, setGranularity] = useState<AggGranularity | undefined>(
    undefined,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const aggQuery = useAggShredsQuery(chartId);

  const throttledRelativeTsQuery = useThrottledCallback(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
      if (isAggregate(visibleRange)) {
        const queryGranularity = getAggGranularity(
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
      moveAggCamera(rendererRef.current.aggResources, visibleRange);
    } else {
      // TODO: handle non-agg shreds
    }

    throttledRelativeTsQuery(referenceNs, visibleRange, worldRange);
    renderActive();
  }, [renderActive, throttledRelativeTsQuery]);

  const throttledDrawAgg = useThrottledCallback(
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

    // TODO: handle non-agg shreds (set up dirty slot tracking via
    // minDirtySlotByChartAtom)

    rendererRef.current = rendererObj;
    containerRef.current.replaceChildren(rendererObj.renderer.domElement);

    const unsubscribeRange = store.sub(visibleRangeAtom, onRangeChange);
    const cleanUpRenderer = rendererRef.current.cleanUp;
    // listen for agg shreds draw events
    const aggEmitter = store.get(aggShredsEmitterAtom);
    aggEmitter.addListener(drawEventType, throttledDrawAgg);

    // trigger initial draw
    setIsInitialized(true);
    onRangeChange();

    // cleanup
    return () => {
      // TODO: handle non-agg shreds (clean up dirty slot tracking)
      aggEmitter.removeListener(drawEventType, throttledDrawAgg);
      unsubscribeRange();
      cleanUpRenderer();
      rendererRef.current = undefined;
    };
  }, [
    onRangeChange,
    setUpContextListeners,
    getWasContextLost,
    throttledDrawAgg,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!isInitialized || !rendererRef.current) return;
    rendererRef.current.renderer.setSize(width, height);
    renderActive();
  }, [renderActive, width, isInitialized]);

  return (
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
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
        }}
      />
      <div
        className={chartStyles.noChartExplore}
        style={{ position: "absolute", top: 0, left: "5px" }}
      >
        Bucket size: {granularity ?? "-"}
      </div>
    </div>
  );
}

const ShredsTrackWithRemount = withWebGlRemount(ShredsTrack);
export default ShredsTrackWithRemount;
