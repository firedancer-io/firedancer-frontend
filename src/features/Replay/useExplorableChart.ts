import { useCallback, useMemo, useRef } from "react";
import type { TsRange } from "../WebGl/webglUtils";
import { MIN_VISIBLE_MS } from "./const";
import { getDefaultStore } from "jotai";
import { selectedMsAtom, visibleRangeAtom, worldRangeAtom } from "./atoms";
import { clamp as minMaxClamp } from "lodash";
import styles from "./chart.module.css";
import { clampToWorld } from "./utils";

const PAN_THRESHOLD_PX = 0;
const ZOOM_INTENSITY = 0.002;

// Some elements (ex. labels, buttons) are excluded from triggering chart exploration
function isExcludedTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest(`.${styles.noChartExplore}`) != null
  );
}

const LINE_HEIGHT_PX = 40;
const PAGE_HEIGHT_PX = 800;

function deltaModeScale(e: WheelEvent) {
  switch (e.deltaMode) {
    case WheelEvent.DOM_DELTA_LINE:
      return LINE_HEIGHT_PX;
    case WheelEvent.DOM_DELTA_PAGE:
      return PAGE_HEIGHT_PX;
    default:
      return 1;
  }
}

function normalizeWheelDeltaY(e: WheelEvent) {
  return e.deltaY * deltaModeScale(e);
}

// Use larger of x or y delta
function normalizeWheelPanDelta(e: WheelEvent) {
  const dominant =
    Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  return dominant * deltaModeScale(e);
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

export function useExplorableChart() {
  const dragStartRef = useRef<{
    clientX: number;
    ts: number;
    draggableWindow: TsRange;
    startVisibleRange: TsRange;
  }>();
  const isPanningRef = useRef(false);
  const resizeEdgeRef = useRef<"start" | "end">();
  const hasPendingClickPan = useRef(true);

  const setClampedVisibleRange = useCallback((unclampedNewRange: TsRange) => {
    const worldRange = store.get(worldRangeAtom);
    if (!worldRange) return;

    store.set(visibleRangeAtom, clampToWorld(unclampedNewRange, worldRange));
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
        if (!isWorldTrack) {
          store.set(selectedMsAtom, dragStartRef.current.ts);
        }
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

      const wheelPan = (deltaPx: number) => {
        const visibleRange = store.get(visibleRangeAtom);
        const window = isWorldTrack ? store.get(worldRangeAtom) : visibleRange;
        if (!window || !visibleRange) return;

        const trackWidth = trackEl.getBoundingClientRect().width;
        if (!trackWidth) return;

        const span = window[1] - window[0];

        // scrolling down/right pans forward in time
        const diff = (deltaPx / trackWidth) * span;
        setClampedVisibleRange([
          visibleRange[0] + diff,
          visibleRange[1] + diff,
        ]);
      };

      const zoom = (clientX: number, deltaY: number) => {
        const visibleRange = store.get(visibleRangeAtom);
        if (!visibleRange) return;

        const [startTs, endTs] = visibleRange;
        const span = endTs - startTs;
        const isZoomingOut = deltaY > 0;

        const zoomPointTs = isWorldTrack
          ? // mini map zoom centers on middle of visible range
            (visibleRange[0] + visibleRange[1]) / 2
          : // other track zoom centers on cursor
            clientXToTs(trackEl, clientX, visibleRange);
        // larger deltaY = faster zoom
        let scale = Math.exp(deltaY * ZOOM_INTENSITY);
        // don't zoom in past the minimum span (clamp to it instead of overshooting)
        if (!isZoomingOut && span * scale < MIN_VISIBLE_MS) {
          scale = MIN_VISIBLE_MS / span;
        }
        setClampedVisibleRange([
          zoomPointTs - (zoomPointTs - startTs) * scale,
          zoomPointTs + (endTs - zoomPointTs) * scale,
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
          // keep native behavior for excluded elements
          if (isExcludedTarget(e.target)) return;
          startDrag(e.clientX);
          e.preventDefault();
        },
        onMouseMove: (e: MouseEvent) => {
          if (!(e.buttons & 1)) return;
          moveDrag(e.clientX);
        },
        onTouchStart: (e: TouchEvent) => {
          if (e.touches.length !== 1) return;
          if (isExcludedTarget(e.target)) return;
          startDrag(e.touches[0].clientX);
          e.preventDefault();
        },
        onTouchMove: (e: TouchEvent) => {
          if (e.touches.length !== 1) return;
          // let excluded elements keep native touch scrolling/selection
          if (isExcludedTarget(e.target)) return;
          moveDrag(e.touches[0].clientX);
          e.preventDefault();
        },
        onWheel: (e: WheelEvent) => {
          if (isExcludedTarget(e.target)) return;
          // ctrl (or cmd on mac) + wheel => zoom
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoom(e.clientX, normalizeWheelDeltaY(e));
            return;
          }
          // shift + wheel => pan
          if (e.shiftKey) {
            e.preventDefault();
            wheelPan(normalizeWheelPanDelta(e));
            return;
          }
        },
      };
    },
    [setClampedVisibleRange],
  );

  return useMemo(() => {
    const setUpExploreListeners = (trackEl: HTMLDivElement) => {
      const refreshCursor = () => {
        trackEl.classList.toggle(styles.grabbingCursor, isPanningRef.current);
      };

      // default cursor
      trackEl.classList.add(styles.grabCursor);
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

    const setUpMiniMap = (
      trackEl: HTMLDivElement,
      visibleRangeEl: HTMLDivElement,
      leftHandleEl: HTMLDivElement,
      rightHandleEl: HTMLDivElement,
    ) => {
      const refreshCursor = () => {
        if (resizeEdgeRef.current) {
          trackEl.classList.add(styles.resizingCursor);
          trackEl.classList.remove(styles.grabbingCursor);
          return;
        }

        trackEl.classList.remove(styles.resizingCursor);
        trackEl.classList.toggle(styles.grabbingCursor, isPanningRef.current);
      };

      refreshCursor();

      const {
        endDrag: _endDrag,
        onMouseDown,
        onMouseMove,
        onTouchStart,
        onTouchMove,
        onWheel,
      } = createCallbacks(trackEl, refreshCursor, true);

      const startResize = (edge: "start" | "end") => {
        resizeEdgeRef.current = edge;
        refreshCursor();
      };

      const moveResizeHandle = (clientX: number) => {
        const edge = resizeEdgeRef.current;
        const worldRange = store.get(worldRangeAtom);
        const visibleRange = store.get(visibleRangeAtom);
        if (!edge || !worldRange || !visibleRange) return;

        const cursorTs = minMaxClamp(
          clientXToTs(trackEl, clientX, worldRange),
          worldRange[0],
          worldRange[1],
        );
        const [start, end] = visibleRange;

        if (edge === "start") {
          setClampedVisibleRange([
            Math.min(cursorTs, end - MIN_VISIBLE_MS),
            end,
          ]);
        } else {
          setClampedVisibleRange([
            start,
            Math.max(cursorTs, start + MIN_VISIBLE_MS),
          ]);
        }
      };

      const endResize = () => {
        if (!resizeEdgeRef.current) return;
        hasPendingClickPan.current = false;
        resizeEdgeRef.current = undefined;
        refreshCursor();
      };

      const endDrag = () => {
        if (isPanningRef.current) {
          hasPendingClickPan.current = false;
        }
        _endDrag();
      };

      const panToPoint = (clientX: number) => {
        const worldRange = store.get(worldRangeAtom);
        const visibleRange = store.get(visibleRangeAtom);
        if (!worldRange || !visibleRange) return;

        const cursorTs = clientXToTs(trackEl, clientX, worldRange);
        const span = visibleRange[1] - visibleRange[0];
        setClampedVisibleRange([cursorTs - span / 2, cursorTs + span / 2]);
      };

      const onHandleMouseDown = (edge: "start" | "end") => (e: MouseEvent) => {
        if (e.button !== 0) return;
        startResize(edge);
        e.stopPropagation();
        e.preventDefault();
      };
      const onHandleTouchStart = (edge: "start" | "end") => (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        startResize(edge);
        e.stopPropagation();
        e.preventDefault();
      };

      const cleanups = [
        addListener(
          trackEl,
          "pointerdown",
          () => {
            // track if action is for zoom / drag to pan, or a click to pan
            hasPendingClickPan.current = true;
          },
          { capture: true },
        ),
        addListener(leftHandleEl, "mousedown", onHandleMouseDown("start")),
        addListener(rightHandleEl, "mousedown", onHandleMouseDown("end")),
        addListener(leftHandleEl, "touchstart", onHandleTouchStart("start"), {
          passive: false,
        }),
        addListener(rightHandleEl, "touchstart", onHandleTouchStart("end"), {
          passive: false,
        }),

        addListener(visibleRangeEl, "mousedown", onMouseDown),
        addListener(visibleRangeEl, "touchstart", onTouchStart, {
          passive: false,
        }),
        addListener(visibleRangeEl, "click", (e) =>
          // prevent track click
          e.stopPropagation(),
        ),
        addListener(trackEl, "click", (e) => {
          if (!hasPendingClickPan.current) return;
          panToPoint(e.clientX);
        }),
        addListener(trackEl, "mousemove", (e) => {
          if (!(e.buttons & 1)) return;
          if (resizeEdgeRef.current) {
            moveResizeHandle(e.clientX);
          } else {
            onMouseMove(e);
          }
        }),
        addListener(trackEl, "mouseup", () => {
          endResize();
          endDrag();
        }),
        addListener(trackEl, "mouseleave", () => {
          endResize();
          endDrag();
        }),
        addListener(
          trackEl,
          "touchmove",
          (e) => {
            if (resizeEdgeRef.current) {
              if (e.touches.length === 1) {
                moveResizeHandle(e.touches[0].clientX);
                e.preventDefault();
              }
            } else {
              onTouchMove(e);
            }
          },
          { passive: false },
        ),
        addListener(
          trackEl,
          "touchend",
          () => {
            endResize();
            endDrag();
          },
          { passive: false },
        ),
        addListener(trackEl, "touchcancel", () => {
          endResize();
          endDrag();
        }),
        addListener(trackEl, "wheel", onWheel, { passive: false }),
      ];

      return () => cleanups.forEach((off) => off());
    };

    return {
      setUpExploreListeners,
      setUpMiniMap,
    };
  }, [createCallbacks, setClampedVisibleRange]);
}
