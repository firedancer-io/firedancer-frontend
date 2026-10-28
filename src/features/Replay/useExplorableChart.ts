import { useCallback, useMemo, useRef } from "react";
import type { TsRange } from "../WebGl/webglUtils";
import { MIN_VISIBLE_MS } from "./const";
import { getDefaultStore } from "jotai";
import {
  resetToLiveAtom,
  selectedMsAtom,
  visibleRangeAtom,
  worldRangeAtom,
} from "./atoms";
import { clamp as minMaxClamp } from "lodash";
import styles from "./chart.module.css";
import { clampToWorld } from "./utils";

const PAN_THRESHOLD_PX = 8;
const ZOOM_INTENSITY = 0.002;

// Thresholds for double tap reset to live
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_MOVE_PX = 24;

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

function clientXToTsWithRect(
  trackRect: DOMRect,
  clientX: number,
  tsWindow: TsRange,
) {
  const fraction = (clientX - trackRect.left) / trackRect.width;
  return tsWindow[0] + fraction * (tsWindow[1] - tsWindow[0]);
}

function clientXToTs(
  trackEl: HTMLDivElement,
  clientX: number,
  tsWindow: TsRange,
) {
  return clientXToTsWithRect(
    trackEl.getBoundingClientRect(),
    clientX,
    tsWindow,
  );
}

// Returns the Touch with the given identifier from a TouchList
function findTouch(touches: TouchList, id: number | undefined) {
  if (id == null) return undefined;
  for (let i = 0; i < touches.length; i++) {
    if (touches[i].identifier === id) return touches[i];
  }
  return undefined;
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

function addWindowListener<K extends keyof WindowEventMap>(
  type: K,
  listener: (event: WindowEventMap[K]) => void,
  options?: AddEventListenerOptions,
): () => void {
  window.addEventListener(type, listener, options);
  return () => window.removeEventListener(type, listener, options);
}

// who started the in-progress gesture
type GestureOwner = "explore" | "miniMap";

const store = getDefaultStore();

export function useExplorableChart() {
  const dragStartRef = useRef<{
    clientX: number;
    ts: number;
    draggableWindow: TsRange;
    startVisibleRange: TsRange;
    // track rect captured at gesture start
    trackRect: DOMRect;
  }>();
  const isPanningRef = useRef(false);
  const resizeEdgeRef = useRef<"start" | "end">();
  // track rect captured at resize start, to avoid a layout reflow per move
  const resizeRectRef = useRef<DOMRect>();
  const hasPendingClickPan = useRef(true);
  const lastTapRef = useRef<{ time: number; x: number; y: number }>();
  const activeGestureRef = useRef<GestureOwner>();
  // Identifier of the touch that started the active gesture. The gesture is
  // ended by that finger only. Lifting a different finger (one that
  // started elsewhere on the page) will not terminate the in-progress gesture
  const activeTouchIdRef = useRef<number>();

  const setClampedVisibleRange = useCallback((unclampedNewRange: TsRange) => {
    const worldRange = store.get(worldRangeAtom);
    if (!worldRange) return;

    store.set(visibleRangeAtom, clampToWorld(unclampedNewRange, worldRange));
  }, []);

  const panToTs = useCallback(
    (ts: number) => {
      const visibleRange = store.get(visibleRangeAtom);
      if (!visibleRange) return;

      const span = visibleRange[1] - visibleRange[0];
      setClampedVisibleRange([ts - span / 2, ts + span / 2]);
    },
    [setClampedVisibleRange],
  );

  const createCallbacks = useCallback(
    (
      trackEl: HTMLDivElement,
      refreshCursor: () => void,
      isWorldTrack: boolean,
      owner: GestureOwner,
    ) => {
      const startDrag = (clientX: number) => {
        // one gesture at a time: ignore a new start if another gesture is in progress
        if (activeGestureRef.current) return;
        const worldRange = store.get(worldRangeAtom);
        const visibleRange = store.get(visibleRangeAtom);
        if (!worldRange || !visibleRange) return;

        const window = isWorldTrack ? worldRange : visibleRange;
        const trackRect = trackEl.getBoundingClientRect();
        const ts = clientXToTsWithRect(trackRect, clientX, window);

        dragStartRef.current = {
          clientX,
          ts,
          draggableWindow: [...window],
          startVisibleRange: [...visibleRange],
          trackRect,
        };

        activeGestureRef.current = owner;
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
        const xTs = clientXToTsWithRect(
          dragStartRef.current.trackRect,
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

      const ownsGesture = () => activeGestureRef.current === owner;

      const endDrag = () => {
        // tear down if owner of current gesture
        if (!ownsGesture()) return;
        dragStartRef.current = undefined;
        isPanningRef.current = false;
        activeGestureRef.current = undefined;
        activeTouchIdRef.current = undefined;
        refreshCursor();
      };

      return {
        ownsGesture,
        endDrag,
        moveDrag,
        onMouseDown: (e: MouseEvent) => {
          if (e.button !== 0) return;
          // keep native behavior for excluded elements
          if (isExcludedTarget(e.target)) return;
          startDrag(e.clientX);
          e.preventDefault();
        },
        onMouseMove: (e: MouseEvent) => {
          if (!ownsGesture()) return;
          // the button was released off-window (or during a context menu) and
          // we missed the mouseup: recover the stuck gesture lock
          if (!(e.buttons & 1)) {
            endDrag();
            return;
          }
          moveDrag(e.clientX);
        },
        onTouchStart: (e: TouchEvent) => {
          if (e.touches.length !== 1) return;
          if (isExcludedTarget(e.target)) return;
          // don't adopt this finger into a gesture already in progress
          // (e.g. a mouse pan), which startDrag() will reject
          const hadActiveGesture = activeGestureRef.current != null;
          startDrag(e.touches[0].clientX);
          if (!hadActiveGesture && ownsGesture()) {
            activeTouchIdRef.current = e.touches[0].identifier;
          }
          e.preventDefault();
        },
        onTouchMove: (e: TouchEvent) => {
          if (!ownsGesture()) return;
          // follow only the initiating finger. Ignore other touches
          const touch = findTouch(e.touches, activeTouchIdRef.current);
          if (!touch) return;
          moveDrag(touch.clientX);
          e.preventDefault();
        },
        onWheel: (e: WheelEvent) => {
          e.preventDefault();

          // shift + wheel => pan
          if (e.shiftKey) {
            wheelPan(normalizeWheelPanDelta(e));
            return;
          }

          // wheel => zoom
          zoom(e.clientX, normalizeWheelDeltaY(e));
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
        ownsGesture,
        endDrag,
        moveDrag,
        onMouseDown,
        onTouchStart,
        onTouchMove,
        onWheel,
      } = createCallbacks(trackEl, refreshCursor, false, "explore");

      /**
       * Store if last mouse up panned for dblclick later
       */
      let lastMouseUpWasPan = false;
      const onMouseUp = () => {
        if (!ownsGesture()) return;
        // ignore mouse events while a touch gesture is in progress
        if (activeTouchIdRef.current != null) return;
        lastMouseUpWasPan = isPanningRef.current;
        endDrag();
      };

      // the button was released off-window (or during a context menu) and we
      // missed the mouseup: recover the stuck lock
      const onRecoverMouseMove = (e: MouseEvent) => {
        if (!ownsGesture()) return;
        // ignore mouse events while a touch gesture is in progress
        if (activeTouchIdRef.current != null) return;
        if (!(e.buttons & 1)) {
          lastMouseUpWasPan = isPanningRef.current;
          endDrag();
          return;
        }
        moveDrag(e.clientX);
      };

      /**
       * Reset if the second click of the double-click was not a drag/pan
       */
      const onDblClick = (e: MouseEvent) => {
        if (isExcludedTarget(e.target)) return;
        if (lastMouseUpWasPan) return;
        store.set(resetToLiveAtom);
      };

      /**
       * Track if more than one finger ever touched during the current gesture
       * for double tap handling
       */
      let gestureHadMultipleTouches = false;
      // Gate the window-level touchend/cancel handlers. The
      // gesture-owner ref is cleared when the first finger lifts and can't
      // track the remaining fingers of a multi-touch gesture.
      let isTouchGestureActive = false;
      const onTouchStartWithTapTracking = (e: TouchEvent) => {
        onTouchStart(e);
        // only track as a touch gesture if this touch actually started it
        // (onTouchStart captured its identifier)
        if (ownsGesture() && activeTouchIdRef.current != null) {
          isTouchGestureActive = true;
        }
      };

      // An extra finger that lands anywhere (even outside the chart)
      // while a chart touch gesture is active makes this a multi-touch gesture.
      const onWindowTouchStart = (e: TouchEvent) => {
        if (isTouchGestureActive && e.touches.length > 1) {
          gestureHadMultipleTouches = true;
        }
      };

      /**
       * End drag, then check double-tap for reset to live
       */
      const onTouchEnd = (e: TouchEvent) => {
        if (!isTouchGestureActive) return;
        // only end the gesture when the finger that started it lifts; lifting
        // some other finger must not terminate the in-progress gesture
        const endedTouch = findTouch(
          e.changedTouches,
          activeTouchIdRef.current,
        );
        if (!endedTouch) return;

        isTouchGestureActive = false;
        // get pan state before endDrag clears it
        const wasPanning = isPanningRef.current;
        endDrag();

        const wasMultiTouch = gestureHadMultipleTouches;
        gestureHadMultipleTouches = false;

        // only evaluate a tap for a single-finger gesture that wasn't a pan
        if (wasMultiTouch || wasPanning || isExcludedTarget(e.target)) {
          lastTapRef.current = undefined;
          return;
        }

        const touch = endedTouch;
        const now = performance.now();
        const lastTap = lastTapRef.current;

        if (
          lastTap &&
          now - lastTap.time < DOUBLE_TAP_MS &&
          Math.abs(touch.clientX - lastTap.x) < DOUBLE_TAP_MOVE_PX &&
          Math.abs(touch.clientY - lastTap.y) < DOUBLE_TAP_MOVE_PX
        ) {
          store.set(resetToLiveAtom);
          lastTapRef.current = undefined;
          return;
        }

        lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };
      };

      /**
       * drop in-progress drag and tap candidates
       */
      const onTouchCancel = (e: TouchEvent) => {
        if (!isTouchGestureActive) return;
        // only drop the gesture if the initiating finger is the one cancelled
        if (!findTouch(e.changedTouches, activeTouchIdRef.current)) return;
        isTouchGestureActive = false;
        endDrag();
        gestureHadMultipleTouches = false;
        lastTapRef.current = undefined;
      };

      const cleanups = [
        addListener(trackEl, "mousedown", onMouseDown),
        addListener(trackEl, "dblclick", onDblClick),
        addListener(trackEl, "touchstart", onTouchStartWithTapTracking, {
          passive: false,
        }),
        addListener(trackEl, "wheel", onWheel, { passive: false }),

        // end gestures on window
        addWindowListener("mousemove", onRecoverMouseMove),
        addWindowListener("mouseup", onMouseUp),
        addWindowListener("touchstart", onWindowTouchStart),
        addWindowListener("touchmove", onTouchMove, { passive: false }),
        addWindowListener("touchend", onTouchEnd),
        addWindowListener("touchcancel", onTouchCancel),
      ];

      return () => {
        cleanups.forEach((off) => off());
        isTouchGestureActive = false;
        endDrag();
      };
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
        ownsGesture,
        endDrag: _endDrag,
        onMouseDown,
        onMouseMove,
        onTouchStart,
        onTouchMove,
        onWheel,
      } = createCallbacks(trackEl, refreshCursor, true, "miniMap");

      const startResize = (edge: "start" | "end") => {
        // one gesture at a time
        if (activeGestureRef.current) return;
        resizeEdgeRef.current = edge;
        resizeRectRef.current = trackEl.getBoundingClientRect();
        activeGestureRef.current = "miniMap";
        refreshCursor();
      };

      const moveResizeHandle = (clientX: number) => {
        const edge = resizeEdgeRef.current;
        const rect = resizeRectRef.current;
        const worldRange = store.get(worldRangeAtom);
        const visibleRange = store.get(visibleRangeAtom);
        if (!edge || !rect || !worldRange || !visibleRange) return;

        const cursorTs = minMaxClamp(
          clientXToTsWithRect(rect, clientX, worldRange),
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
        resizeRectRef.current = undefined;
        activeGestureRef.current = undefined;
        activeTouchIdRef.current = undefined;
        refreshCursor();
      };

      const endDrag = () => {
        if (!ownsGesture()) return;
        if (isPanningRef.current) {
          hasPendingClickPan.current = false;
        }
        _endDrag();
      };

      const panToCursorPoint = (clientX: number) => {
        const worldRange = store.get(worldRangeAtom);
        if (!worldRange) return;

        const cursorTs = clientXToTs(trackEl, clientX, worldRange);
        panToTs(cursorTs);
      };

      const onHandleMouseDown = (edge: "start" | "end") => (e: MouseEvent) => {
        if (e.button !== 0) return;
        startResize(edge);
        e.stopPropagation();
        e.preventDefault();
      };
      const onHandleTouchStart = (edge: "start" | "end") => (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        // don't adopt this finger into a gesture already in progress
        // (e.g. a mouse pan), which startResize() will reject
        const hadActiveGesture = activeGestureRef.current != null;
        startResize(edge);
        if (!hadActiveGesture && ownsGesture()) {
          activeTouchIdRef.current = e.touches[0].identifier;
        }
        e.stopPropagation();
        e.preventDefault();
      };

      const cleanups = [
        addListener(
          trackEl,
          "pointerdown",
          (e) => {
            if (isExcludedTarget(e.target)) return;
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
          if (isExcludedTarget(e.target)) return;
          if (!hasPendingClickPan.current) return;
          panToCursorPoint(e.clientX);
        }),
        addWindowListener("mousemove", (e) => {
          if (!ownsGesture()) return;
          // ignore mouse events while a touch gesture is in progress
          if (activeTouchIdRef.current != null) return;
          // missed the mouseup (released off-window / during a context menu):
          // recover the stuck gesture lock
          if (!(e.buttons & 1)) {
            endResize();
            endDrag();
            return;
          }
          if (resizeEdgeRef.current) {
            moveResizeHandle(e.clientX);
          } else {
            onMouseMove(e);
          }
        }),
        addWindowListener("mouseup", () => {
          if (!ownsGesture()) return;
          // ignore mouse events while a touch gesture is in progress
          if (activeTouchIdRef.current != null) return;
          endResize();
          endDrag();
        }),
        addWindowListener(
          "touchmove",
          (e) => {
            if (!ownsGesture()) return;
            if (resizeEdgeRef.current) {
              // follow only the finger that started the resize
              const touch = findTouch(e.touches, activeTouchIdRef.current);
              if (!touch) return;
              moveResizeHandle(touch.clientX);
              e.preventDefault();
            } else {
              onTouchMove(e);
            }
          },
          { passive: false },
        ),
        addWindowListener(
          "touchend",
          (e) => {
            if (!ownsGesture()) return;
            // only end when the initiating finger lifts
            if (!findTouch(e.changedTouches, activeTouchIdRef.current)) return;
            endResize();
            endDrag();
          },
          { passive: false },
        ),
        addWindowListener("touchcancel", (e) => {
          if (!ownsGesture()) return;
          if (!findTouch(e.changedTouches, activeTouchIdRef.current)) return;
          endResize();
          endDrag();
        }),
        addListener(trackEl, "wheel", onWheel, { passive: false }),
      ];

      return () => {
        cleanups.forEach((off) => off());
        endResize();
        endDrag();
      };
    };

    return {
      setUpExploreListeners,
      setUpMiniMap,
      panToTs,
    };
  }, [createCallbacks, setClampedVisibleRange, panToTs]);
}
