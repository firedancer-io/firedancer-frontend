import { useAtomValue } from "jotai";
import { useRef, useCallback, useLayoutEffect, useState } from "react";
import {
  type ExplorableChartProps,
  type MarkerLinesProps,
  type RangeChangeSubscriberProps,
} from "../const.ts";
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
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils.ts";
import { aggShredsAtom, lastUpdateTsAtom } from "./atoms.ts";

const height = 500;
const chartId = "shreds-track";

interface ShredsTrackProps
  extends WebGlRemountProps,
    RangeChangeSubscriberProps,
    ExplorableChartProps,
    MarkerLinesProps {
  width: number;
}

function ShredsTrack({
  remount,
  subscribeRangeChange,
  getAbsoluteNs,
  getRelativeMs,
  setUpExploreListeners,
  markerLinesClassName,
  width,
}: ShredsTrackProps) {
  // TODO: handle non-agg shreds granularity
  const [granularity, setGranularity] = useState<AggGranularity | undefined>(
    undefined,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();
  const absoluteVisibleRangeRef = useRef<NsTsRange | undefined>(undefined);

  const widthRef = useRef(width);
  widthRef.current = width;
  const hasWidth = width > 0;

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const aggQuery = useAggShredsQuery();
  const aggShreds = useAtomValue(aggShredsAtom);
  const lastAggUpdateTs = useAtomValue(lastUpdateTsAtom);

  const throttledAggQuery = useThrottledCallback(
    (relativeVisibleRange: TsRange, relativeWorldRange: TsRange) => {
      const visibleRangeNs: NsTsRange = [
        getAbsoluteNs(relativeVisibleRange[0]),
        getAbsoluteNs(relativeVisibleRange[1]),
      ];
      absoluteVisibleRangeRef.current = visibleRangeNs;

      const worldRangeNs: NsTsRange = [
        getAbsoluteNs(relativeWorldRange[0]),
        getAbsoluteNs(relativeWorldRange[1]),
      ];

      if (isAggregate(visibleRangeNs)) {
        const queryGranularity = getAggGranularity(
          visibleRangeNs[1] - visibleRangeNs[0],
        );
        aggQuery(visibleRangeNs, worldRangeNs, queryGranularity);
        setGranularity(queryGranularity);
      } else {
        // TODO: non-aggregate query
        setGranularity(undefined);
      }
    },
    200,
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
  const onRangeChange = useCallback(
    (visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      // renderer is created by the setup effect before we subscribe
      if (!rendererRef.current) return;

      const { aggResources } = rendererRef.current;
      const visibleRangeNs: NsTsRange = [
        getAbsoluteNs(visibleRangeMs[0]),
        getAbsoluteNs(visibleRangeMs[1]),
      ];

      if (isAggregate(visibleRangeNs)) {
        throttledAggQuery(visibleRangeMs, worldRangeMs);
        moveAggCamera(aggResources, visibleRangeMs);
      } else {
        // TODO: handle non-agg shreds
      }
      renderActive();
    },
    [getAbsoluteNs, renderActive, throttledAggQuery],
  );

  // set up renderer and subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    if (rendererRef.current || !hasWidth || !containerRef.current) return;

    const rendererObj = setUpRenderers(
      widthRef.current,
      height,
      setUpContextListeners,
      getWasContextLost,
    );
    if (!rendererObj) return;

    // TODO: handle non-agg shreds (set up dirty slot tracking via
    // minDirtySlotByChartAtom)

    rendererRef.current = rendererObj;
    containerRef.current.replaceChildren(rendererObj.renderer.domElement);

    const unsubscribe = subscribeRangeChange(chartId, onRangeChange);
    const cleanUpExploreListeners = setUpExploreListeners(containerRef.current);
    const cleanUpRenderer = rendererRef.current.cleanUp;

    // cleanup
    return () => {
      // TODO: handle non-agg shreds (clean up dirty slot tracking)
      unsubscribe?.();
      cleanUpRenderer();
      rendererRef.current = undefined;
      cleanUpExploreListeners();
    };
  }, [
    onRangeChange,
    setUpExploreListeners,
    subscribeRangeChange,
    setUpContextListeners,
    getWasContextLost,
    hasWidth,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.renderer.setSize(width, height);
    renderActive();
  }, [renderActive, width]);

  // trigger draw
  useLayoutEffect(() => {
    if (!rendererRef.current || !absoluteVisibleRangeRef.current) return;
    if (isAggregate(absoluteVisibleRangeRef.current)) {
      drawAggShreds(
        rendererRef.current,
        absoluteVisibleRangeRef.current,
        getRelativeMs,
        aggShreds,
      );
    } else {
      // TODO: draw non-agg
    }
    renderActive();
  }, [getRelativeMs, renderActive, aggShreds, lastAggUpdateTs]);

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
      <div style={{ position: "absolute", top: 0, left: "5px" }}>
        Bucket size: {granularity ?? "-"}
      </div>
    </div>
  );
}

const ShredsTrackWithRemount = withWebGlRemount(ShredsTrack);
export default ShredsTrackWithRemount;
