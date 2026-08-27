import { Flex } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useRef, useLayoutEffect, useMemo, useState, useCallback } from "react";
import styles from "./chart.module.css";
import type { MarkerLinesProps } from "./const.ts";
import { nsPerMs } from "../../consts.ts";
import { clamp } from "../../uplotReact/utils.ts";
import { calcRelativeMs, getInitVisibleRange } from "./utils.ts";
import VisibleRange from "./VisibleRangeInfo.tsx";
import { currentSlotAtom } from "../../atoms.ts";
import RevenueTrack from "./RevenueTrack/RevenueTrack.tsx";
import ExecrpTrack from "./ExecrpTrack/ExecrpTrack.tsx";
import { RevenueType } from "../../api/entities.ts";
import type { TsRange } from "../WebGl/webglUtils.ts";
import { useExplorableChart } from "./useExplorableChart.ts";
import { useVisibleRangeSubscribers } from "./useVisibleRangeSubscribers.ts";
import MiniMap from "./MiniMap/MiniMap.tsx";
import ShredsTrack from "./ShredsTrack/ShredsTrack.tsx";

const LIVE_CHART_DELAY_MS = 500;
const MARKER_PCT_VAR = "--marker-lines-pct";
const WORLD_MARKER_PCT_VAR = "--world-marker-lines-pct";

const markerLinesProps: MarkerLinesProps = {
  markerLinesClassName: styles.withMarkerLines,
  miniMapMarkerLinesClassName: styles.withWorldMarkerLines,
};

interface ChartProps {
  /**
   * use reference ts so we can convert bigints to number without losing precision
   */
  startupTimeNs: bigint;
}

/**
 * Set up Replay chart, which keeps track of a reference ts (startup time), and
 * visible and world ts ranges.
 * Informs subscribers of visible range changes.
 */
export default function Chart({ startupTimeNs }: ChartProps) {
  const currentSlot = useAtomValue(currentSlotAtom);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Measure the scrollable tracks region via clientWidth (which excludes the
  // vertical scrollbar). ResizeObserver's contentRect keeps the scrollbar's
  // width, so using it would size the canvases wider than the space they're
  // shown in and clip their right edge.
  const [width, setWidth] = useState(0);
  const tracksRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useCallback((el: HTMLDivElement | null) => {
    tracksRef.current = el;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    measureCleanupRef.current = () => observer.disconnect();
  }, []);
  const measureCleanupRef = useRef<(() => void) | undefined>();
  useLayoutEffect(() => () => measureCleanupRef.current?.(), []);

  const rangeRef = useRef<
    | {
        referenceNs: bigint;
        worldEndMs: number;
        visibleRangeMs: TsRange;
      }
    | undefined
  >();
  const [isRangeInitialized, setIsRangeInitialized] = useState(false);
  const selectedMsRef = useRef<number | undefined>();

  const {
    broadcastVisibleRangeChange,
    broadcastSelectedMsChange,
    broadcastWorldRangeChange,
    visibleRangeSubscriberProps,
  } = useVisibleRangeSubscribers({ rangeRef, selectedMsRef });

  const { refreshSelectedMarkerLine, setVisibleRange, setSelectedMs } =
    useMemo(() => {
      const refreshSelectedMarkerLine = () => {
        if (!containerRef.current) return;
        if (selectedMsRef.current == null) {
          // off screen
          containerRef.current.style.setProperty(MARKER_PCT_VAR, "-300%");
          containerRef.current.style.setProperty(WORLD_MARKER_PCT_VAR, "-300%");
          return;
        }

        if (!rangeRef.current) return;
        const [start, end] = rangeRef.current.visibleRangeMs;
        const pct = (100 * (selectedMsRef.current - start)) / (end - start);
        containerRef.current.style.setProperty(MARKER_PCT_VAR, `${pct}%`);

        const worldPct =
          (100 * selectedMsRef.current) / rangeRef.current.worldEndMs;
        containerRef.current.style.setProperty(
          WORLD_MARKER_PCT_VAR,
          `${worldPct}%`,
        );
      };

      const setSelectedMs = (ts: number | undefined) => {
        broadcastSelectedMsChange();
        selectedMsRef.current = ts;
        refreshSelectedMarkerLine();
      };

      const setVisibleRange = (unclampedNewRange: TsRange) => {
        if (!rangeRef.current) return;

        const { worldEndMs, visibleRangeMs } = rangeRef.current;
        const newRange = clamp(
          unclampedNewRange[1] - unclampedNewRange[0],
          unclampedNewRange[0],
          unclampedNewRange[1],
          worldEndMs,
          0,
          worldEndMs,
        );

        if (
          visibleRangeMs[0] === newRange[0] &&
          visibleRangeMs[1] === newRange[1]
        ) {
          return;
        }

        rangeRef.current.visibleRangeMs = newRange;
        broadcastVisibleRangeChange();
        refreshSelectedMarkerLine();
      };

      return {
        refreshSelectedMarkerLine,
        setSelectedMs,
        setVisibleRange,
      };
    }, [broadcastSelectedMsChange, broadcastVisibleRangeChange]);

  const { explorableChartProps, miniMapProps } = useExplorableChart({
    rangeRef,
    setSelectedMs,
    setVisibleRange,
  });

  // refresh world size
  useLayoutEffect(() => {
    const referenceNs = rangeRef.current?.referenceNs ?? startupTimeNs;
    const newWorldEndNs =
      BigInt(new Date().getTime() - LIVE_CHART_DELAY_MS) * BigInt(nsPerMs);
    const newWorldEndMs = calcRelativeMs(referenceNs, newWorldEndNs);

    // delay if too soon after startup
    if (newWorldEndMs < 0) return;

    if (rangeRef.current) {
      rangeRef.current.worldEndMs = newWorldEndMs;
      broadcastWorldRangeChange();
      return;
    }

    // initialize ranges
    const visibleRangeMs = getInitVisibleRange(
      selectedMsRef.current,
      newWorldEndMs,
    );
    rangeRef.current = {
      referenceNs,
      worldEndMs: newWorldEndMs,
      visibleRangeMs,
    };
    broadcastVisibleRangeChange();
    refreshSelectedMarkerLine();
    setIsRangeInitialized(true);
  }, [
    currentSlot,
    startupTimeNs,
    broadcastVisibleRangeChange,
    refreshSelectedMarkerLine,
    broadcastWorldRangeChange,
  ]);

  return (
    <div className={styles.container} ref={containerRef}>
      {isRangeInitialized && <VisibleRange {...visibleRangeSubscriberProps} />}
      {!!width && isRangeInitialized && (
        <MiniMap
          width={width}
          {...visibleRangeSubscriberProps}
          {...miniMapProps}
          {...markerLinesProps}
        />
      )}
      <Flex
        ref={measureRef}
        direction="column"
        gapY="4"
        position="relative"
        className={styles.tracks}
      >
        {!!width && isRangeInitialized && (
          <>
            <ShredsTrack
              width={width}
              {...visibleRangeSubscriberProps}
              {...explorableChartProps}
              {...markerLinesProps}
            />
            <RevenueTrack
              type={RevenueType.TxnFees}
              width={width}
              {...visibleRangeSubscriberProps}
              {...explorableChartProps}
              {...markerLinesProps}
            />
            <ExecrpTrack
              width={width}
              {...visibleRangeSubscriberProps}
              {...explorableChartProps}
              {...markerLinesProps}
            />
          </>
        )}
      </Flex>
    </div>
  );
}
