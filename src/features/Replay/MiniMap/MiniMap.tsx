import { useRef, useCallback, useLayoutEffect } from "react";
import {
  type MarkerLinesProps,
  type MiniMapSetupProps,
  type RangeChangeSubscriberProps,
} from "../const.ts";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlEventHandlers } from "../../WebGl/useWebGlEventHandlers.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import {
  drawMiniMap,
  moveCamera,
  render,
  setUpRenderer,
  type RendererObj,
} from "./utils.ts";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils.ts";
import useMiniMapQuery, { getMiniMapGranularity } from "./useMiniMapQuery.ts";
import type { AggSlots } from "../../../api/types.ts";
import { useTimelineServerMessage } from "../utils.ts";
import { RequesterId } from "../useAggSlotsQuery.ts";
import { useThrottledCallback } from "use-debounce";
import styles from "./miniMap.module.css";
import clsx from "clsx";

const height = 25;
const chartId = "mini-map-track";

interface MiniMapProps
  extends WebGlRemountProps,
    RangeChangeSubscriberProps,
    MiniMapSetupProps,
    MarkerLinesProps {
  width: number;
}

function MiniMap({
  remount,
  subscribeRangeChange,
  getAbsoluteNs,
  getRelativeMs,
  miniMapMarkerLinesClassName,
  setUpMiniMap,
  width,
}: MiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const visibleRangeElRef = useRef<HTMLDivElement>(null);
  const leftHandleRef = useRef<HTMLDivElement>(null);
  const rightHandleRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();

  // keep the latest converter available to the WS message handler without
  // forcing a re-subscription each time it changes
  const getRelativeMsRef = useRef(getRelativeMs);
  getRelativeMsRef.current = getRelativeMs;

  const widthRef = useRef(width);
  widthRef.current = width;
  const hasWidth = width > 0;

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const query = useMiniMapQuery();

  const updateVisibleEl = useThrottledCallback(
    useCallback((visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      const el = visibleRangeElRef.current;
      if (!el) return;
      const worldRange = worldRangeMs[1] - worldRangeMs[0];
      const pct = ((visibleRangeMs[1] - visibleRangeMs[0]) / worldRange) * 100;
      el.style.width = `${pct}%`;
      const pos = 100 - (visibleRangeMs[1] / worldRange) * 100;
      el.style.right = `${pos}%`;
    }, []),
    30,
    {
      leading: true,
      trailing: true,
    },
  );

  const updateWorldEl = useCallback(
    (worldRangeMs: TsRange) => {
      if (!rendererRef.current) return;
      const granularity = getMiniMapGranularity(
        worldRangeMs[1] - worldRangeMs[0],
      );
      const worldRangeNs: NsTsRange = [
        getAbsoluteNs(worldRangeMs[0]),
        getAbsoluteNs(worldRangeMs[1]),
      ];
      query(worldRangeNs, granularity);
      moveCamera(rendererRef.current, worldRangeMs);
      render(rendererRef.current);
    },
    [getAbsoluteNs, query],
  );

  /**
   * Update camera and query data for new range
   */
  const onRangeChange = useCallback(
    (visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      if (!rendererRef.current) return;
      updateWorldEl(worldRangeMs);
      updateVisibleEl(visibleRangeMs, worldRangeMs);
    },
    [updateVisibleEl, updateWorldEl],
  );

  // set up renderer and subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    if (
      rendererRef.current ||
      !hasWidth ||
      !containerRef.current ||
      !chartContainerRef.current ||
      !visibleRangeElRef.current ||
      !leftHandleRef.current ||
      !rightHandleRef.current
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

    const unsubscribe = subscribeRangeChange(
      chartId,
      onRangeChange,
      undefined,
      onRangeChange,
    );
    const cleanUpMiniMapListeners = setUpMiniMap(
      containerRef.current,
      visibleRangeElRef.current,
      leftHandleRef.current,
      rightHandleRef.current,
    );

    // cleanup
    return () => {
      unsubscribe?.();
      rendererRef.current?.cleanUp();
      rendererRef.current = undefined;
      cleanUpMiniMapListeners?.();
    };
  }, [
    onRangeChange,
    subscribeRangeChange,
    setUpContextListeners,
    getWasContextLost,
    hasWidth,
    setUpMiniMap,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.renderer.setSize(width, height);
    render(rendererRef.current);
  }, [width]);

  const onMessage = useCallback((message: { id: number; value: AggSlots }) => {
    if (!rendererRef.current || message.id !== RequesterId.MiniMap) return;

    drawMiniMap(rendererRef.current, message.value, getRelativeMsRef.current);
    render(rendererRef.current);
  }, []);

  useTimelineServerMessage("query_agg_slots", onMessage);

  return (
    <div
      style={{ position: "relative", marginBottom: "10px" }}
      ref={containerRef}
    >
      <div
        ref={chartContainerRef}
        className={miniMapMarkerLinesClassName}
        style={{
          position: "relative",
          width: "100%",
          height: `${height}px`,
        }}
      />
      <div className={styles.visibleRangeBox} ref={visibleRangeElRef}>
        <div className={clsx(styles.handle, styles.left)} ref={leftHandleRef} />
        <div
          className={clsx(styles.handle, styles.right)}
          ref={rightHandleRef}
        />
      </div>
    </div>
  );
}

const MiniMapTrackWithRemount = withWebGlRemount(MiniMap);
export default MiniMapTrackWithRemount;
