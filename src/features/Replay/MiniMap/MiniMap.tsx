import { useAtomValue } from "jotai";
import { useRef, useCallback, useLayoutEffect } from "react";
import { replayMiniMapAtom } from "../../../atoms.ts";
import useReplayMiniMapQuery from "./useReplayMiniMapQuery.ts";
import {
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
import { mockMaxSlotCompletedTsNsAtom } from "../SlotsTrack/mockUtils.ts";

const height = 25;
const chartId = "mini-map-track";

interface MiniMapProps
  extends WebGlRemountProps,
    RangeChangeSubscriberProps,
    MarkerLinesProps {
  width: number;
  worldEndMs: number;
  selectedMs: number | undefined;
  setUpMiniMapListeners: (
    trackEl: HTMLDivElement,
    visibleRangeEl: HTMLDivElement,
  ) => () => void;
}

function MiniMap({
  remount,
  subscribeRangeChange,
  unsubscribeRangeChange,
  getAbsoluteMs,
  getRelativeMs,
  markerLinesClassName,
  width,
  worldEndMs,
  selectedMs,
  setUpMiniMapListeners,
}: MiniMapProps) {
  const maxDrawnSlotRef = useRef(-1);
  const mockWorldEndNs = useAtomValue(mockMaxSlotCompletedTsNsAtom);
  const replayMiniMapSlots = useAtomValue(replayMiniMapAtom);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const visibleRangeElRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();

  const widthRef = useRef(width);
  widthRef.current = width;
  const hasWidth = width > 0;

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const replayQuery = useReplayMiniMapQuery();
  const query = replayQuery?.query;

  const throttledRelativeTsQuery = useThrottledCallback(
    (relativeWorldRange: TsRange) => {
      if (!query) return;
      const worldRangeMs = relativeWorldRange.map(getAbsoluteMs) as TsRange;
      query(worldRangeMs);
    },
    1_000,
    { leading: true, trailing: true },
  );

  /**
   * Update camera and query data for new range
   */
  const onRangeChange = useCallback(
    (visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      if (!rendererRef.current) return;

      const el = visibleRangeElRef.current;
      if (el) {
        const worldRange = worldRangeMs[1] - worldRangeMs[0];
        const pct =
          ((visibleRangeMs[1] - visibleRangeMs[0]) / worldRange) * 100;
        el.style.width = `${pct}%`;
        const pos = 100 - (visibleRangeMs[1] / worldRange) * 100;
        el.style.right = `${pos}%`;
      }
      throttledRelativeTsQuery(worldRangeMs);
      moveCamera(rendererRef.current, worldRangeMs);
      render(rendererRef.current);
    },
    [throttledRelativeTsQuery],
  );

  // set up renderer and subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    if (
      rendererRef.current ||
      !hasWidth ||
      !containerRef.current ||
      !chartContainerRef.current ||
      !visibleRangeElRef.current
    )
      return;

    const rendererObj = setUpRenderer(
      widthRef.current,
      height,
      setUpContextListeners,
      getWasContextLost,
    );
    if (!rendererObj) return;

    rendererRef.current = rendererObj;
    chartContainerRef.current.replaceChildren(rendererObj.renderer.domElement);

    subscribeRangeChange(chartId, onRangeChange);
    const cleanupListeners = setUpMiniMapListeners(
      containerRef.current,
      visibleRangeElRef.current,
    );

    // cleanup
    return () => {
      unsubscribeRangeChange(chartId);
      rendererRef.current?.cleanUpRenderer();
      rendererRef.current = undefined;
      cleanupListeners?.();
    };
  }, [
    onRangeChange,
    subscribeRangeChange,
    unsubscribeRangeChange,
    setUpContextListeners,
    getWasContextLost,
    hasWidth,
    setUpMiniMapListeners,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.renderer.setSize(width, height);
    render(rendererRef.current);
  }, [width]);

  // refresh range
  useLayoutEffect(() => {
    if (mockWorldEndNs == null || !rendererRef.current) return;
    const worldRange: TsRange = [0, worldEndMs];
    throttledRelativeTsQuery(worldRange);
    moveCamera(rendererRef.current, worldRange);
    render(rendererRef.current);
  }, [mockWorldEndNs, throttledRelativeTsQuery, worldEndMs]);

  // trigger draw
  useLayoutEffect(() => {
    if (!rendererRef.current) return;
    maxDrawnSlotRef.current = drawSlots(
      maxDrawnSlotRef.current,
      rendererRef.current,
      replayMiniMapSlots,
      getRelativeMs,
    );
    render(rendererRef.current);
  }, [getRelativeMs, replayMiniMapSlots]);

  return (
    <div
      style={{ position: "relative", marginBottom: "10px" }}
      ref={containerRef}
    >
      <div
        ref={chartContainerRef}
        className={markerLinesClassName}
        style={{
          position: "relative",
          width: "100%",
          height: `${height}px`,
        }}
      />
      <div
        ref={visibleRangeElRef}
        style={{
          top: 0,
          margin: "-3px",
          position: "absolute",
          border: "2px solid white",
          height: `${height + 4}px`,
          width: "100%",
        }}
      />
    </div>
  );
}

const SlotsTrackWithRemount = withWebGlRemount(MiniMap);
export default SlotsTrackWithRemount;
