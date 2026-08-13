import { Flex } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useRef, useState, useLayoutEffect, useMemo, useCallback } from "react";
import { useMeasure } from "react-use";
import styles from "./chart.module.css";
import {
  type ExplorableChartProps,
  type MarkerLinesProps,
  type RangeChangeHandler,
  type RangeChangeSubscriberProps,
  type TsRange,
} from "./const.ts";
import { nsPerMs } from "../../consts.ts";
import { clamp } from "../../uplotReact/utils.ts";
import SlotsTrack from "./SlotsTrack/SlotsTrack.tsx";
import {
  calcRelativeMs,
  getInitVisibleRange,
  calcAbsoluteMs,
  getUpdatedLiveVisibleRange,
} from "./utils.ts";
import clsx from "clsx";
import VisibleRange from "./VisibleRangeInfo.tsx";
import ResetLiveButton from "./ResetLiveButton.tsx";
import { currentSlotAtom } from "../../atoms.ts";
import RevenueTrack from "./RevenueTrack/RevenueTrack.tsx";
import { RevenueType } from "../../api/entities.ts";
import ShredsTrack from "./ShredsTrack/ShredsTrack.tsx";
import MiniMap from "./MiniMap/MiniMap.tsx";

const PAN_THRESHOLD_PX = 0;
// Zoom scales by exp(deltaY * intensity): symmetric (in/out are exact inverses)
// and proportional to scroll magnitude so trackpad and mouse feel consistent.
const ZOOM_INTENSITY = 0.002;
const MIN_VISIBLE_MS = 600;

const DELAY_MS = 500;

interface ChartProps {
  /**
   * use reference ts so we can convert bigints to number without losing precision
   */
  startupTimeNs: bigint;
}

/**
 * Setup Replay chart, which keeps track of a reference ts (startup time), and
 * visible and world ts ranges.
 * Informs subscribers of visible range changes.
 */
export default function Chart({ startupTimeNs }: ChartProps) {
  const currentSlot = useAtomValue(currentSlotAtom);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [measureRef, { width }] = useMeasure<HTMLDivElement>();
  const setContainerRefs = useCallback(
    (el: HTMLDivElement | null) => {
      containerRef.current = el;
      if (el) {
        measureRef(el);
      }
    },
    [measureRef],
  );

  const prevWidthRef = useRef(width);
  const selectedMsRef = useRef<number | undefined>();
  const [isLive, setIsLive] = useState(true);

  const rangeRef = useRef<
    | {
        referenceNs: bigint;
        worldEndMs: number;
        visibleRangeMs: TsRange;
      }
    | undefined
  >();
  const rangeHandlersRef = useRef<Map<string, RangeChangeHandler>>(new Map());

  const dragStartRef = useRef<{
    clientX: number;
    ts: number;
    draggableWindow: TsRange;
    startVisibleRange: TsRange;
  }>();
  const isPanningRef = useRef(false);

  const {
    switchToLive,
    broadcastRangeChange,
    setVisibleRange,
    subscriberProps,
    explorableChartProps,
    markerLinesProps,
    setUpMiniMapListeners,
  } = useMemo(() => {
    const setMarkerLinePosition = (pct: number) => {
      if (!containerRef.current) return;
      containerRef.current.style.setProperty("--marker-lines-pct", `${pct}%`);
    };

    const refreshSelectedMarkerLine = () => {
      if (selectedMsRef.current == null) {
        // off screen
        setMarkerLinePosition(-300);
        return;
      }

      if (!rangeRef.current) return;
      const [start, end] = rangeRef.current.visibleRangeMs;
      const pct = (100 * (selectedMsRef.current - start)) / (end - start);
      setMarkerLinePosition(pct);
    };

    const setSelectedMs = (ts: number | undefined) => {
      selectedMsRef.current = ts;
      if (ts != null) {
        setIsLive(false);
        refreshSelectedMarkerLine();
      }
    };

    const switchToLive = () => {
      setIsLive(true);
      setSelectedMs(undefined);
    };

    const broadcastRangeChange = () => {
      if (!rangeRef.current) return;
      for (const onRangeChange of rangeHandlersRef.current.values()) {
        onRangeChange(
          rangeRef.current.visibleRangeMs,
          [0, rangeRef.current.worldEndMs],
          selectedMsRef.current,
        );
      }
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
      broadcastRangeChange();
      refreshSelectedMarkerLine();
    };

    const subscribeRangeChange: RangeChangeSubscriberProps["subscribeRangeChange"] =
      (chartId, onRangeChange) => {
        rangeHandlersRef.current.set(chartId, onRangeChange);
        if (!rangeRef.current) return;
        onRangeChange(
          rangeRef.current.visibleRangeMs,
          [0, rangeRef.current.worldEndMs],
          selectedMsRef.current,
        );
      };

    const unsubscribeRangeChange: RangeChangeSubscriberProps["unsubscribeRangeChange"] =
      (chartId) => {
        rangeHandlersRef.current.delete(chartId);
      };

    const getAbsoluteMs = (relativeMs: number) => {
      if (!rangeRef.current) return 0;
      return calcAbsoluteMs(rangeRef.current.referenceNs, relativeMs);
    };

    const getRelativeMs = (absoluteNs: bigint) => {
      if (!rangeRef.current) return 0;
      return calcRelativeMs(rangeRef.current.referenceNs, absoluteNs);
    };

    const subscriberProps: RangeChangeSubscriberProps = {
      subscribeRangeChange,
      unsubscribeRangeChange,
      getAbsoluteMs,
      getRelativeMs,
    };

    // helpers for chart exploration

    const setIsPanning = (trackEl: HTMLDivElement, isPanning: boolean) => {
      isPanningRef.current = isPanning;
      trackEl.style.cursor = isPanning ? "grabbing" : "grab";
    };

    const clientXToTs = (
      trackEl: HTMLDivElement,
      clientX: number,
      tsWindow: TsRange,
    ) => {
      const rect = trackEl.getBoundingClientRect();
      const fraction = (clientX - rect.left) / rect.width;
      return tsWindow[0] + fraction * (tsWindow[1] - tsWindow[0]);
    };

    const startDrag = (
      trackEl: HTMLDivElement,
      draggingEl: HTMLDivElement,
      clientX: number,
      isWorld: boolean,
    ) => {
      if (!rangeRef.current) return;

      const window = isWorld
        ? ([0, rangeRef.current.worldEndMs] satisfies TsRange)
        : rangeRef.current.visibleRangeMs;
      const ts = clientXToTs(trackEl, clientX, window);

      dragStartRef.current = {
        clientX,
        ts,
        draggableWindow: [...window],
        startVisibleRange: [...rangeRef.current.visibleRangeMs],
      };

      setIsPanning(draggingEl, false);
      setSelectedMs(dragStartRef.current.ts);
      setIsLive(false);
    };

    const moveDrag = (
      trackEl: HTMLDivElement,
      draggingEl: HTMLDivElement,
      clientX: number,
      isWorld: boolean,
    ) => {
      if (
        !dragStartRef.current ||
        Math.abs(clientX - dragStartRef.current.clientX) < PAN_THRESHOLD_PX
      ) {
        return;
      }
      setIsPanning(draggingEl, true);
      const xTs = clientXToTs(
        trackEl,
        clientX,
        dragStartRef.current.draggableWindow,
      );
      const diff = (isWorld ? -1 : 1) * (xTs - dragStartRef.current.ts);
      setVisibleRange([
        dragStartRef.current.startVisibleRange[0] - diff,
        dragStartRef.current.startVisibleRange[1] - diff,
      ]);
    };

    const zoom = (trackEl: HTMLDivElement, clientX: number, deltaY: number) => {
      const prevWindow = rangeRef.current?.visibleRangeMs;
      if (!prevWindow) return;

      const [startTs, endTs] = prevWindow;
      const span = endTs - startTs;
      const isZoomingOut = deltaY > 0;

      const cursorTs = clientXToTs(trackEl, clientX, prevWindow);
      // exp keeps in/out symmetric and reversible; larger deltaY = faster zoom
      let scale = Math.exp(deltaY * ZOOM_INTENSITY);
      // don't zoom in past the minimum span (clamp to it instead of overshooting)
      if (!isZoomingOut && span * scale < MIN_VISIBLE_MS) {
        scale = MIN_VISIBLE_MS / span;
      }
      setVisibleRange([
        cursorTs - (cursorTs - startTs) * scale,
        cursorTs + (endTs - cursorTs) * scale,
      ]);
      setIsLive(false);
    };

    const setUpExploreListeners = (trackEl: HTMLDivElement) => {
      trackEl.style.cursor = "grab";

      const endDrag = () => {
        dragStartRef.current = undefined;
        setIsPanning(trackEl, false);
      };

      const onMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return;
        startDrag(trackEl, trackEl, e.clientX, false);
        e.preventDefault();
      };
      const onMouseMove = (e: MouseEvent) => {
        if (!(e.buttons & 1)) return;
        moveDrag(trackEl, trackEl, e.clientX, false);
      };
      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        startDrag(trackEl, trackEl, e.touches[0].clientX, false);
        e.preventDefault();
      };
      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        moveDrag(trackEl, trackEl, e.touches[0].clientX, false);
        e.preventDefault();
      };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        zoom(trackEl, e.clientX, e.deltaY);
      };

      trackEl.addEventListener("mousedown", onMouseDown);
      trackEl.addEventListener("mousemove", onMouseMove);
      trackEl.addEventListener("mouseup", endDrag);
      trackEl.addEventListener("mouseleave", endDrag);
      trackEl.addEventListener("touchstart", onTouchStart, { passive: false });
      trackEl.addEventListener("touchmove", onTouchMove, { passive: false });
      trackEl.addEventListener("touchend", endDrag);
      trackEl.addEventListener("touchcancel", endDrag);
      trackEl.addEventListener("wheel", onWheel, { passive: false });

      return () => {
        trackEl.removeEventListener("mousedown", onMouseDown);
        trackEl.removeEventListener("mousemove", onMouseMove);
        trackEl.removeEventListener("mouseup", endDrag);
        trackEl.removeEventListener("mouseleave", endDrag);
        trackEl.removeEventListener("touchstart", onTouchStart);
        trackEl.removeEventListener("touchmove", onTouchMove);
        trackEl.removeEventListener("touchend", endDrag);
        trackEl.removeEventListener("touchcancel", endDrag);
        trackEl.removeEventListener("wheel", onWheel);
      };
    };

    const explorableChartProps: ExplorableChartProps = {
      setUpExploreListeners,
    };

    const markerLinesProps: MarkerLinesProps = {
      markerLinesClassName: styles.withMarkerLines,
    };

    const setUpMiniMapListeners = (
      trackEl: HTMLDivElement,
      visibleRangeEl: HTMLDivElement,
    ) => {
      visibleRangeEl.style.cursor = "grab";

      const endDrag = (e: Event) => {
        dragStartRef.current = undefined;
        setIsPanning(visibleRangeEl, false);
        trackEl.style.cursor = "auto";
      };

      const onMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return;
        startDrag(trackEl, visibleRangeEl, e.clientX, true);
        trackEl.style.cursor = "grabbing";
        e.preventDefault();
      };
      const onMouseMove = (e: MouseEvent) => {
        if (!(e.buttons & 1)) return;
        moveDrag(trackEl, visibleRangeEl, e.clientX, true);
      };
      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        startDrag(trackEl, visibleRangeEl, e.touches[0].clientX, true);
        trackEl.style.cursor = "grabbing";
        e.preventDefault();
      };
      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        moveDrag(trackEl, visibleRangeEl, e.touches[0].clientX, true);
        e.preventDefault();
      };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        zoom(trackEl, e.clientX, e.deltaY);
      };

      visibleRangeEl.addEventListener("mousedown", onMouseDown);
      trackEl.addEventListener("mousemove", onMouseMove);
      trackEl.addEventListener("mouseup", endDrag);
      trackEl.addEventListener("mouseleave", endDrag);
      visibleRangeEl.addEventListener("touchstart", onTouchStart, {
        passive: false,
      });
      trackEl.addEventListener("touchmove", onTouchMove, { passive: false });
      trackEl.addEventListener("touchend", endDrag);
      trackEl.addEventListener("touchcancel", endDrag);
      trackEl.addEventListener("wheel", onWheel, { passive: false });

      return () => {
        visibleRangeEl.removeEventListener("mousedown", onMouseDown);
        trackEl.removeEventListener("mousemove", onMouseMove);
        trackEl.removeEventListener("mouseup", endDrag);
        trackEl.removeEventListener("mouseleave", endDrag);
        visibleRangeEl.removeEventListener("touchstart", onTouchStart);
        trackEl.removeEventListener("touchmove", onTouchMove);
        trackEl.removeEventListener("touchend", endDrag);
        trackEl.removeEventListener("touchcancel", endDrag);
        trackEl.removeEventListener("wheel", onWheel);
      };
    };

    return {
      setSelectedMs,
      switchToLive,
      broadcastRangeChange,
      setVisibleRange,
      subscriberProps,
      explorableChartProps,
      markerLinesProps,
      setUpMiniMapListeners,
    };
  }, []);

  // refresh range
  useLayoutEffect(() => {
    const newWorldEndNs =
      BigInt(new Date().getTime() - DELAY_MS) * BigInt(nsPerMs);
    const referenceNs = rangeRef.current?.referenceNs ?? startupTimeNs;
    const newWorldEndMs = calcRelativeMs(referenceNs, newWorldEndNs);

    if (!rangeRef.current) {
      // initialize range
      const referenceNs = startupTimeNs;
      const visibleRangeMs = getInitVisibleRange(
        selectedMsRef.current,
        newWorldEndMs,
      );
      rangeRef.current = {
        referenceNs,
        worldEndMs: newWorldEndMs,
        visibleRangeMs,
      };
      broadcastRangeChange();
      return;
    }

    const { worldEndMs: prevWorldEndMs, visibleRangeMs } = rangeRef.current;
    if (prevWorldEndMs === newWorldEndMs) return;
    rangeRef.current.worldEndMs = newWorldEndMs;

    if (!isLive) return;
    setVisibleRange(getUpdatedLiveVisibleRange(visibleRangeMs, newWorldEndMs));
  }, [
    currentSlot,
    startupTimeNs,
    isLive,
    setVisibleRange,
    broadcastRangeChange,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!width || !rangeRef.current || prevWidthRef.current === 0) return;

    const zoom = width / prevWidthRef.current;
    const [start, end] = rangeRef.current.visibleRangeMs;
    const center = (start + end) / 2;
    const newSpan = (end - start) * zoom;
    setVisibleRange([center - newSpan / 2, center + newSpan / 2]);
  }, [width, setVisibleRange]);

  return (
    <div
      className={clsx(styles.container, { [styles.live]: isLive })}
      ref={setContainerRefs}
    >
      {!!width && rangeRef.current && (
        <>
          <VisibleRange {...subscriberProps} />
          <MiniMap
            width={width}
            {...subscriberProps}
            {...markerLinesProps}
            setUpMiniMapListeners={setUpMiniMapListeners}
            selectedMs={selectedMsRef.current}
            worldEndMs={rangeRef.current.worldEndMs}
          />
          <Flex direction="column" gapY="4" position="relative">
            {!isLive && <ResetLiveButton onClick={switchToLive} />}
            <SlotsTrack
              width={width}
              {...subscriberProps}
              {...explorableChartProps}
              {...markerLinesProps}
            />
            <ShredsTrack
              width={width}
              {...subscriberProps}
              {...explorableChartProps}
              {...markerLinesProps}
            />
            <RevenueTrack
              type={RevenueType.TxnFees}
              width={width}
              {...subscriberProps}
              {...explorableChartProps}
              {...markerLinesProps}
            />
          </Flex>
        </>
      )}
    </div>
  );
}
