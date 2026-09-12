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
  drawAggSlots,
  isAggregate,
  moveAggCamera,
  setUpRenderers,
  trackHeight,
} from "./utils.ts";
import { type RendererObj } from "./const.ts";
import { useAggHeaderQuery, getAggGranularity } from "./useAggHeaderQuery.ts";
import type { AggGranularity } from "../../../api/types.ts";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils.ts";
import { aggSlotsAtom, lastUpdateTsAtom } from "./atoms.ts";

const chartId = "header-track";

interface HeaderTrackProps
  extends WebGlRemountProps,
    RangeChangeSubscriberProps,
    ExplorableChartProps,
    MarkerLinesProps {
  width: number;
}

function HeaderTrack({
  remount,
  subscribeRangeChange,
  getAbsoluteNs,
  getRelativeMs,
  setUpExploreListeners,
  markerLinesClassName,
  width,
}: HeaderTrackProps) {
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

  const aggQuery = useAggHeaderQuery();
  const aggSlots = useAtomValue(aggSlotsAtom);
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
        // TODO: handle non-agg slots
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
      trackHeight,
      setUpContextListeners,
      getWasContextLost,
    );
    if (!rendererObj) return;

    rendererRef.current = rendererObj;
    containerRef.current.replaceChildren(rendererObj.renderer.domElement);

    const unsubscribe = subscribeRangeChange(chartId, onRangeChange);
    const cleanUpExploreListeners = setUpExploreListeners(containerRef.current);
    const cleanUpRenderer = rendererRef.current.cleanUp;

    // cleanup
    return () => {
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
    rendererRef.current.renderer.setSize(width, trackHeight);
    renderActive();
  }, [renderActive, width]);

  // trigger draw
  useLayoutEffect(() => {
    if (!rendererRef.current || !absoluteVisibleRangeRef.current) return;
    if (isAggregate(absoluteVisibleRangeRef.current)) {
      drawAggSlots(
        rendererRef.current,
        absoluteVisibleRangeRef.current,
        getRelativeMs,
        aggSlots,
      );
    } else {
      // TODO: draw non-agg
    }
    renderActive();
  }, [getRelativeMs, renderActive, aggSlots, lastAggUpdateTs]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: `${trackHeight}px`,
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

const HeaderTrackWithRemount = withWebGlRemount(HeaderTrack);
export default HeaderTrackWithRemount;
