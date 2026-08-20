import { useCallback, useMemo, useRef } from "react";
import type { TsRange } from "../WebGl/webglUtils";
import { MIN_VISIBLE_MS, type ExplorableChartProps } from "./const";
import { getDefaultStore } from "jotai";
import { selectedMsAtom, visibleRangeAtom, worldRangeAtom } from "./atoms";
import { clamp } from "../../uplotReact/utils";

const PAN_THRESHOLD_PX = 0;
const ZOOM_INTENSITY = 0.002;

const LINE_HEIGHT_PX = 40;
const PAGE_HEIGHT_PX = 800;

function normalizeWheelDeltaY(e: WheelEvent) {
  switch (e.deltaMode) {
    case WheelEvent.DOM_DELTA_LINE:
      return e.deltaY * LINE_HEIGHT_PX;
    case WheelEvent.DOM_DELTA_PAGE:
      return e.deltaY * PAGE_HEIGHT_PX;
    default:
      return e.deltaY;
  }
}

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

const store = getDefaultStore();

export function useExplorableChart(): ExplorableChartProps {
  const dragStartRef = useRef<{
    clientX: number;
    ts: number;
    draggableWindow: TsRange;
    startVisibleRange: TsRange;
  }>();
  const isPanningRef = useRef(false);

  const setClampedVisibleRange = useCallback((unclampedNewRange: TsRange) => {
    const worldRange = store.get(worldRangeAtom);
    if (!worldRange) return;

    store.set(
      visibleRangeAtom,
      clamp(
        unclampedNewRange[1] - unclampedNewRange[0],
        unclampedNewRange[0],
        unclampedNewRange[1],
        worldRange[1] - worldRange[0],
        worldRange[0],
        worldRange[1],
      ),
    );
  }, []);

  const createCallbacks = useCallback(
    (
      trackEl: HTMLDivElement,
      refreshCursor: () => void,
      isWorldTrack: boolean,
    ) => {
      const startDrag = (clientX: number) => {
        const worldRange = store.get(worldRangeAtom);
        const visibleRange = store.get(visibleRangeAtom);
        if (!worldRange || !visibleRange) return;

        const window = isWorldTrack ? worldRange : visibleRange;
        const ts = clientXToTs(trackEl, clientX, window);

        dragStartRef.current = {
          clientX,
          ts,
          draggableWindow: [...window],
          startVisibleRange: [...visibleRange],
        };

        isPanningRef.current = false;
        refreshCursor();
        store.set(selectedMsAtom, dragStartRef.current.ts);
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

        setClampedVisibleRange([
          dragStartRef.current.startVisibleRange[0] - diff,
          dragStartRef.current.startVisibleRange[1] - diff,
        ]);
      };

      const zoom = (clientX: number, deltaY: number) => {
        const prevWindow = store.get(visibleRangeAtom);
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
        setClampedVisibleRange([
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
          zoom(e.clientX, normalizeWheelDeltaY(e));
        },
      };
    },
    [setClampedVisibleRange],
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
