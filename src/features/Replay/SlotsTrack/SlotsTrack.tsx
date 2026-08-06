import { useAtomValue } from "jotai";
import { useRef, useCallback, useLayoutEffect } from "react";
import { replayEpochsAtom, replaySlotsAtom } from "../../../atoms.ts";
import useReplaySlotsQuery from "./useReplaySlotsQuery.ts";
import {
  slotsThreshold,
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
  drawEpochs,
  drawSlots,
  moveCamera,
  render,
  setUpRenderer,
  type RendererObj,
} from "./utils.ts";
import { MOCK_SLOT_DURATION_MS } from "./mockUtils.ts";

const height = 150;
const chartId = "slots-track";

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
  const replaySlots = useAtomValue(replaySlotsAtom);
  const replayEpochs = useAtomValue(replayEpochsAtom);

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();

  const widthRef = useRef(width);
  widthRef.current = width;
  const hasWidth = width > 0;

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const replayQuery = useReplaySlotsQuery();
  const query = replayQuery?.query;

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
    if (!rendererRef.current) return;
    const visibleSpanMs =
      rendererRef.current.camera.right - rendererRef.current.camera.left;

    // determine draw granularity
    if (visibleSpanMs > MOCK_SLOT_DURATION_MS * slotsThreshold) {
      drawEpochs(rendererRef.current, replayEpochs, getRelativeMs);
    } else {
      drawSlots(rendererRef.current, replaySlots, getRelativeMs);
    }
    render(rendererRef.current);
  }, [replayEpochs, replaySlots, getRelativeMs]);

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

const SlotsTrackWithRemount = withWebGlRemount(SlotsTrack);
export default SlotsTrackWithRemount;
