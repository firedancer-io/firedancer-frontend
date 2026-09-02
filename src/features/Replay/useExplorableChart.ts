import { useCallback, useMemo, useRef, type RefObject } from "react";
import type { TsRange } from "../WebGl/webglUtils";
import { MIN_VISIBLE_MS, type ExplorableChartProps } from "./const";

const PAN_THRESHOLD_PX = 0;
const ZOOM_INTENSITY = 0.002;

function clientXToTs(
  trackEl: HTMLDivElement,
  clientX: number,
  tsWindow: TsRange,
) {
  const trackRect = trackEl.getBoundingClientRect();
  const fraction = (clientX - trackRect.left) / trackRect.width;
  return tsWindow[0] + fraction * (tsWindow[1] - tsWindow[0]);
}

function addListener<K extends keyof HTMLElementEventMap>(
  el: HTMLElement,
  type: K,
  listener: (event: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
): () => void {
  el.addEventListener(type, listener, options);
  return () => el.removeEventListener(type, listener, options);
}

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

  const createCallbacks = useCallback(
    (
      trackEl: HTMLDivElement,
      refreshCursor: () => void,
      isWorldTrack: boolean,
    ) => {
      const startDrag = (clientX: number) => {
        if (!rangeRef.current) return;

        const window = isWorldTrack
          ? ([0, rangeRef.current.worldEndMs] satisfies TsRange)
          : rangeRef.current.visibleRangeMs;
        const ts = clientXToTs(trackEl, clientX, window);

        dragStartRef.current = {
          clientX,
          ts,
          draggableWindow: [...window],
          startVisibleRange: [...rangeRef.current.visibleRangeMs],
        };

        isPanningRef.current = false;
        refreshCursor();
        setSelectedMs(dragStartRef.current.ts);
      };

      const moveDrag = (clientX: number) => {
        if (
          !dragStartRef.current ||
          Math.abs(clientX - dragStartRef.current.clientX) < PAN_THRESHOLD_PX
        ) {
          return;
        }
        isPanningRef.current = true;
        refreshCursor();
        const xTs = clientXToTs(
          trackEl,
          clientX,
          dragStartRef.current.draggableWindow,
        );
        const diff = (isWorldTrack ? -1 : 1) * (xTs - dragStartRef.current.ts);
        setVisibleRange([
          dragStartRef.current.startVisibleRange[0] - diff,
          dragStartRef.current.startVisibleRange[1] - diff,
        ]);
      };

      const zoom = (clientX: number, deltaY: number) => {
        const prevWindow = rangeRef.current?.visibleRangeMs;
        if (!prevWindow) return;

        const [startTs, endTs] = prevWindow;
        const span = endTs - startTs;
        const isZoomingOut = deltaY > 0;

        const cursorTs = clientXToTs(trackEl, clientX, prevWindow);
        // larger deltaY = faster zoom
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

      return {
        endDrag: () => {
          dragStartRef.current = undefined;
          isPanningRef.current = false;
          refreshCursor();
        },
        onMouseDown: (e: MouseEvent) => {
          if (e.button !== 0) return;
          startDrag(e.clientX);
          e.preventDefault();
        },
        onMouseMove: (e: MouseEvent) => {
          if (!(e.buttons & 1)) return;
          moveDrag(e.clientX);
        },
        onTouchStart: (e: TouchEvent) => {
          if (e.touches.length !== 1) return;
          startDrag(e.touches[0].clientX);
          e.preventDefault();
        },
        onTouchMove: (e: TouchEvent) => {
          if (e.touches.length !== 1) return;
          moveDrag(e.touches[0].clientX);
          e.preventDefault();
        },
        onWheel: (e: WheelEvent) => {
          e.preventDefault();
          zoom(e.clientX, e.deltaY);
        },
      };
    },
    [rangeRef, setSelectedMs, setVisibleRange],
  );

  return useMemo(() => {
    const setUpExploreListeners = (trackEl: HTMLDivElement) => {
      const refreshCursor = () => {
        const cursor = isPanningRef.current ? "grabbing" : "grab";
        trackEl.style.cursor = cursor;
      };

      refreshCursor();

      const {
        endDrag,
        onMouseDown,
        onMouseMove,
        onTouchStart,
        onTouchMove,
        onWheel,
      } = createCallbacks(trackEl, refreshCursor, false);

      const cleanups = [
        addListener(trackEl, "mousedown", onMouseDown),
        addListener(trackEl, "mousemove", onMouseMove),
        addListener(trackEl, "mouseup", endDrag),
        addListener(trackEl, "mouseleave", endDrag),
        addListener(trackEl, "touchstart", onTouchStart, { passive: false }),
        addListener(trackEl, "touchmove", onTouchMove, { passive: false }),
        addListener(trackEl, "touchend", endDrag),
        addListener(trackEl, "touchcancel", endDrag),
        addListener(trackEl, "wheel", onWheel, { passive: false }),
      ];

      return () => cleanups.forEach((off) => off());
    };
    return { setUpExploreListeners };
  }, [createCallbacks]);
}
