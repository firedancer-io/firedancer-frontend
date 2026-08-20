import { useMemo, useRef, type RefObject } from "react";
import type { TsRange } from "../WebGl/webglUtils";
import { MIN_VISIBLE_MS, type ExplorableChartProps } from "./const";

const PAN_THRESHOLD_PX = 0;
const ZOOM_INTENSITY = 0.002;

interface UseExplorableChartProps {
  rangeRef: RefObject<
    | {
        referenceNs: bigint;
        worldEndMs: number;
        visibleRangeMs: TsRange;
      }
    | undefined
  >;
  setSelectedMs: (ts: number | undefined) => void;
  setVisibleRange: (unclampedNewRange: TsRange) => void;
}

export function useExplorableChart({
  rangeRef,
  setSelectedMs,
  setVisibleRange,
}: UseExplorableChartProps): ExplorableChartProps {
  const dragStartRef = useRef<{
    clientX: number;
    ts: number;
    draggableWindow: TsRange;
    startVisibleRange: TsRange;
  }>();
  const isPanningRef = useRef(false);

  return useMemo(() => {
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

    return { setUpExploreListeners };
  }, [rangeRef, setSelectedMs, setVisibleRange]);
}
