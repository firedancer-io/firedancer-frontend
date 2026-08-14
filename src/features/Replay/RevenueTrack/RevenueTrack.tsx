import { useAtomValue } from "jotai";
import { useRef, useCallback, useLayoutEffect, useState } from "react";
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
  drawRevenue,
  moveCamera,
  render,
  setUpRenderer,
  type RendererObj,
} from "./utils.ts";
import useAggRevenueQuery, { getGranularity } from "./useAggRevenueQuery.ts";
import type { RevenueType } from "../../../api/entities.ts";
import { aggRevenueAtom } from "../../../api/atoms.ts";
import type { AggGranularity } from "../../../api/types.ts";

const height = 150;
const baseSubscriptionId = "revenue-track";

interface RevenueTrackProps
  extends WebGlRemountProps,
    RangeChangeSubscriberProps,
    ExplorableChartProps,
    MarkerLinesProps {
  width: number;
  type: RevenueType;
}

function RevenueTrack({
  remount,
  subscribeRangeChange,
  unsubscribeRangeChange,
  getAbsoluteMs,
  getRelativeMs,
  setUpExploreListeners,
  markerLinesClassName,
  width,
  type,
}: RevenueTrackProps) {
  const subscriptionId = `${type}-${baseSubscriptionId}`;
  const [granularity, setGranularity] = useState<AggGranularity | undefined>(
    undefined,
  );
  const aggRevenue = useAtomValue(aggRevenueAtom);

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();

  const widthRef = useRef(width);
  widthRef.current = width;
  const hasWidth = width > 0;

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const aggQuery = useAggRevenueQuery();

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

    subscribeRangeChange(subscriptionId, onRangeChange);
    const cleanupExploreListeners = containerRef.current
      ? setUpExploreListeners(containerRef.current)
      : undefined;

    // cleanup
    return () => {
      unsubscribeRangeChange(subscriptionId);
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
    subscriptionId,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.renderer.setSize(width, height);
    render(rendererRef.current);
  }, [width]);

  // trigger draw
  useLayoutEffect(() => {
    if (!rendererRef.current || !aggRevenue) return;
    drawRevenue(rendererRef.current, type, aggRevenue, getRelativeMs);
    render(rendererRef.current);
  }, [aggRevenue, getRelativeMs, type]);

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

const RevenueTrackWithRemount = withWebGlRemount(RevenueTrack);
export default RevenueTrackWithRemount;
