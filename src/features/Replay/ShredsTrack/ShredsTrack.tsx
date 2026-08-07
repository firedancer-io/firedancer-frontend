import { useAtomValue } from "jotai";
import { useRef, useCallback, useLayoutEffect } from "react";
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
import { useTimelineQuery } from "./useTimelineQuery.ts";
import {
  render,
  setUpRenderer,
  type RendererObj,
} from "../../Overview/ShredsProgression/WebGl/chartUtils.ts";
import {
  convertToShredsRange,
  drawHistoricalShreds,
  moveCamera,
} from "./utils.ts";
import { timelineShredsAtoms } from "../../Overview/ShredsProgression/atoms.ts";

const height = 150;
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
  unsubscribeRangeChange,
  getAbsoluteMs,
  getRelativeMs,
  setUpExploreListeners,
  markerLinesClassName,
  width,
}: ShredsTrackProps) {
  const lastUpdateTs = useAtomValue(timelineShredsAtoms.lastUpdateTs);

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();
  const shredsVisibleRangeRef = useRef<TsRange | undefined>();

  const widthRef = useRef(width);
  widthRef.current = width;
  const hasWidth = width > 0;

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const query = useTimelineQuery();

  const throttledRelativeTsQuery = useThrottledCallback(
    (relativeVisibleRange: TsRange, relativeWorldRange: TsRange) => {
      if (!query) return;
      const visibleRangeMs = relativeVisibleRange.map(getAbsoluteMs) as TsRange;
      const worldRangeMs = relativeWorldRange.map(getAbsoluteMs) as TsRange;
      query(visibleRangeMs, worldRangeMs);
    },
    100,
    { leading: true, trailing: true },
  );

  /**
   * Update camera and query data for new range
   */
  const onRangeChange = useCallback(
    (visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      // renderer is created by the setup effect before we subscribe
      if (!rendererRef.current) return;

      throttledRelativeTsQuery(visibleRangeMs, worldRangeMs);

      moveCamera(rendererRef.current.camera, visibleRangeMs, getRelativeMs);
      render(rendererRef.current);
      shredsVisibleRangeRef.current = convertToShredsRange(
        visibleRangeMs,
        getRelativeMs,
      );
    },
    [throttledRelativeTsQuery, getRelativeMs],
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

    subscribeRangeChange(chartId, onRangeChange);
    const cleanupExploreListeners = containerRef.current
      ? setUpExploreListeners(containerRef.current)
      : undefined;

    // cleanup
    return () => {
      unsubscribeRangeChange(chartId);
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
    if (!rendererRef.current || !shredsVisibleRangeRef.current) return;

    drawHistoricalShreds(rendererRef.current, shredsVisibleRangeRef.current, [
      0,
      widthRef.current,
    ]);
  }, [lastUpdateTs]);

  return (
    <div
      ref={containerRef}
      className={markerLinesClassName}
      style={{
        position: "relative",
        width: "100%",
        height: `${height}px`,
      }}
    />
  );
}

const ShredsTrackWithRemount = withWebGlRemount(ShredsTrack);
export default ShredsTrackWithRemount;
