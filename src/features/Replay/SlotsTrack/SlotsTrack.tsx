import { useAtomValue } from "jotai";
import { useRef, useCallback, useLayoutEffect, useState } from "react";
import useReplaySlotsQuery, { getGranularity } from "./useAggSlotsQuery.ts";
import {
  type ExplorableChartProps,
  type MarkerLinesProps,
  type RangeChangeSubscriberProps,
  type TsRange,
} from "../const.ts";
import { useThrottledCallback } from "use-debounce";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlEventHandlers } from "../../WebGl/useWebGlEventHandlers.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import {
  drawSlots,
  moveCamera,
  render,
  setUpRenderer,
  type RendererObj,
} from "./utils.ts";
import { aggSlotsAtom } from "../../../api/atoms.ts";
import type { AggGranularity } from "../../../api/types.ts";

const height = 150;
const subscriberId = "slots-track";

interface SlotsTrackProps
  extends WebGlRemountProps,
    RangeChangeSubscriberProps,
    ExplorableChartProps,
    MarkerLinesProps {
  width: number;
}

function SlotsTrack({
  remount,
  subscribeRangeChange,
  unsubscribeRangeChange,
  getAbsoluteMs,
  getRelativeMs,
  setUpExploreListeners,
  markerLinesClassName,
  width,
}: SlotsTrackProps) {
  const [granularity, setGranularity] = useState<AggGranularity | undefined>(
    undefined,
  );
  const aggSlots = useAtomValue(aggSlotsAtom);

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();

  const widthRef = useRef(width);
  widthRef.current = width;
  const hasWidth = width > 0;

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const aggQuery = useReplaySlotsQuery();

  const throttledRelativeTsQuery = useThrottledCallback(
    (relativeVisibleRange: TsRange, relativeWorldRange: TsRange) => {
      if (!aggQuery) return;
      const visibleRangeMs = relativeVisibleRange.map(getAbsoluteMs) as TsRange;
      const worldRangeMs = relativeWorldRange.map(getAbsoluteMs) as TsRange;
      const queryGranularity = getGranularity(
        visibleRangeMs[1] - visibleRangeMs[0],
      );
      aggQuery(visibleRangeMs, worldRangeMs, queryGranularity);
      setGranularity(queryGranularity);
    },
    200,
    { leading: true, trailing: true },
  );

  /**
   * Update camera and query data for new range
   */
  const onRangeChange = useCallback(
    (visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      if (!rendererRef.current) return;

      throttledRelativeTsQuery(visibleRangeMs, worldRangeMs);
      moveCamera(rendererRef.current, visibleRangeMs);
      render(rendererRef.current);
    },
    [throttledRelativeTsQuery],
  );

  // set up renderer and subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    if (rendererRef.current || !hasWidth) return;

    const rendererObj = setUpRenderer(
      widthRef.current,
      height,
      setUpContextListeners,
      getWasContextLost,
    );
    if (!rendererObj) return;

    rendererRef.current = rendererObj;
    containerRef.current?.replaceChildren(rendererObj.renderer.domElement);

    subscribeRangeChange(subscriberId, onRangeChange);
    const cleanupExploreListeners = containerRef.current
      ? setUpExploreListeners(containerRef.current)
      : undefined;

    // cleanup
    return () => {
      unsubscribeRangeChange(subscriberId);
      rendererRef.current?.cleanUpRenderer();
      rendererRef.current = undefined;
      cleanupExploreListeners?.();
    };
  }, [
    onRangeChange,
    setUpExploreListeners,
    subscribeRangeChange,
    unsubscribeRangeChange,
    setUpContextListeners,
    getWasContextLost,
    hasWidth,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.renderer.setSize(width, height);
    render(rendererRef.current);
  }, [width]);

  // trigger draw
  useLayoutEffect(() => {
    if (!rendererRef.current || !aggSlots) return;
    drawSlots(rendererRef.current, aggSlots, getRelativeMs);
    render(rendererRef.current);
  }, [aggSlots, getRelativeMs]);

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

const SlotsTrackWithRemount = withWebGlRemount(SlotsTrack);
export default SlotsTrackWithRemount;
