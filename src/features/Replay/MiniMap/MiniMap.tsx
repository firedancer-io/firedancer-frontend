import { useRef, useCallback, useLayoutEffect, useState } from "react";
import { type MarkerLinesProps, type MiniMapSetupProps } from "../const.ts";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlEventHandlers } from "../../WebGl/useWebGlEventHandlers.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import {
  drawMiniMap,
  trackHeight,
  moveCamera,
  render,
  setUpRenderer,
  type RendererObj,
} from "./utils.ts";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils.ts";
import useMiniMapQuery, { getMiniMapGranularity } from "./useMiniMapQuery.ts";
import type { AggSlots } from "../../../api/types.ts";
import { calcAbsoluteNs, useTimelineServerMessage } from "../utils.ts";
import { StartQueryId } from "../useAggSlotsQuery.ts";
import { useThrottledCallback } from "use-debounce";
import styles from "./miniMap.module.css";
import clsx from "clsx";
import { Box } from "@radix-ui/themes";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import { getDefaultStore } from "jotai";

const store = getDefaultStore();

interface MiniMapProps
  extends WebGlRemountProps,
    MiniMapSetupProps,
    MarkerLinesProps {
  width: number;
}

function MiniMap({
  remount,
  setUpMiniMap,
  miniMapMarkerLinesClassName,
  width,
}: MiniMapProps) {
  const [isInitialized, setIsInitialized] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const visibleRangeElRef = useRef<HTMLDivElement>(null);
  const leftHandleRef = useRef<HTMLDivElement>(null);
  const rightHandleRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();

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
      el.style.width = `${pct.toFixed(2)}%`;
      const rightPos =
        ((worldRangeMs[1] - visibleRangeMs[1]) / worldRange) * 100;
      el.style.right = `${rightPos}%`;
    }, []),
    30,
    {
      leading: true,
      trailing: true,
    },
  );

  const updateWorldEl = useCallback(
    (referenceNs: bigint, worldRangeMs: TsRange) => {
      if (!rendererRef.current) return;
      const granularity = getMiniMapGranularity(
        worldRangeMs[1] - worldRangeMs[0],
      );
      const worldRangeNs: NsTsRange = [
        calcAbsoluteNs(referenceNs, worldRangeMs[0]),
        calcAbsoluteNs(referenceNs, worldRangeMs[1]),
      ];
      query(worldRangeNs, granularity);
      moveCamera(rendererRef.current, worldRangeMs);
      render(rendererRef.current);
    },
    [query],
  );

  /**
   * Update camera and query data for new range
   */
  const onRangeChange = useCallback(() => {
    if (!rendererRef.current) return;

    const referenceNs = store.get(referenceNsAtom);
    const visibleRange = store.get(visibleRangeAtom);
    const worldRange = store.get(worldRangeAtom);

    if (referenceNs == null || !visibleRange || !worldRange) return;

    updateWorldEl(referenceNs, worldRange);
    updateVisibleEl(visibleRange, worldRange);
  }, [updateVisibleEl, updateWorldEl]);

  // set up renderer and subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    if (
      rendererRef.current ||
      !containerRef.current ||
      !chartContainerRef.current ||
      !visibleRangeElRef.current ||
      !leftHandleRef.current ||
      !rightHandleRef.current
    )
      return;

    const rendererObj = setUpRenderer(
      0,
      trackHeight,
      setUpContextListeners,
      getWasContextLost,
    );
    if (!rendererObj) return;

    rendererRef.current = rendererObj;
    chartContainerRef.current.replaceChildren(rendererObj.renderer.domElement);

    const unsusbscribes = [
      store.sub(visibleRangeAtom, onRangeChange),
      store.sub(worldRangeAtom, onRangeChange),
    ];

    const cleanUpMiniMapListeners = setUpMiniMap(
      containerRef.current,
      visibleRangeElRef.current,
      leftHandleRef.current,
      rightHandleRef.current,
    );

    const cleanUpRenderer = rendererRef.current.cleanUp;

    // trigger initial draw
    setIsInitialized(true);
    onRangeChange();

    // cleanup
    return () => {
      unsusbscribes.forEach((unsub) => unsub());
      cleanUpRenderer();
      rendererRef.current = undefined;
      cleanUpMiniMapListeners();
    };
  }, [onRangeChange, setUpContextListeners, getWasContextLost, setUpMiniMap]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!isInitialized || !rendererRef.current) return;
    rendererRef.current.renderer.setSize(width, trackHeight);
    render(rendererRef.current);
  }, [isInitialized, width]);

  const onMessage = useCallback((message: { id: number; value: AggSlots }) => {
    const referenceNs = store.get(referenceNsAtom);
    if (
      !rendererRef.current ||
      referenceNs == null ||
      message.id !== StartQueryId.MiniMap
    )
      return;

    drawMiniMap(rendererRef.current, message.value, referenceNs);
    render(rendererRef.current);
  }, []);

  useTimelineServerMessage("query_agg_slots", onMessage);

  return (
    <Box
      ref={containerRef}
      className={styles.miniMapContainer}
      height={`${trackHeight}px`}
    >
      <div
        ref={chartContainerRef}
        className={clsx(styles.miniMapTrack, miniMapMarkerLinesClassName)}
      />
      <div ref={visibleRangeElRef} className={styles.visibleRangeBox}>
        <div ref={leftHandleRef} className={clsx(styles.handle, styles.left)} />
        <div
          ref={rightHandleRef}
          className={clsx(styles.handle, styles.right)}
        />
      </div>
    </Box>
  );
}

const MiniMapTrackWithRemount = withWebGlRemount(MiniMap);
export default MiniMapTrackWithRemount;
