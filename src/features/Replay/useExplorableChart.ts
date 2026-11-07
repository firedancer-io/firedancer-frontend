import { useCallback, useMemo, useRef } from "react";
import type { TsRange } from "../WebGl/webglUtils";
import { MIN_VISIBLE_MS } from "./const";
import { getDefaultStore } from "jotai";
import {
  pauseAtom,
  resetToLiveAtom,
  visibleRangeAtom,
  worldRangeAtom,
} from "./atoms";
import { clamp as minMaxClamp } from "lodash";
import styles from "./chart.module.css";
import { clampToWorld, clientXToMs } from "./utils";

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

// A group of window-level listeners attached only for the duration of a gesture
function createWindowListenerGroup(adders: (() => () => void)[]) {
  let removeAll: (() => void) | undefined;

  const attach = () => {
    if (removeAll) return;

    const removers = adders.map((add) => add());
    removeAll = () => removers.forEach((remove) => remove());
  };

  const detach = () => {
    removeAll?.();
    removeAll = undefined;
  };

  return { attach, detach };
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
  const hasPendingClickPan = useRef(false);
  const lastTapRef = useRef<{ time: number; x: number; y: number }>();
  const gestureOwnerRef = useRef<GestureOwner>();
  // Identifier of the touch that started the active gesture. The gesture is
  // ended by that finger only. Lifting a different finger (one that
  // started elsewhere on the page) will not terminate the in-progress gesture
  const activeTouchIdRef = useRef<number>();
  const touchGestureTeardownRef = useRef<
    Partial<Record<GestureOwner, () => void>>
  >({});

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
      // Recover a stuck lock: if the prior gesture's finger is gone but its lock
      // is still set, its touchend never arrived (e.g. its element was removed
      // mid-gesture). Tear it down.
      const clearStaleTouchLock = (currentTouches: TouchList) => {
        if (activeTouchIdRef.current == null) return;
        if (findTouch(currentTouches, activeTouchIdRef.current)) return;
        const staleOwner = gestureOwnerRef.current;
        const teardown = staleOwner
          ? touchGestureTeardownRef.current[staleOwner]
          : undefined;
        if (teardown) {
          teardown();
        } else {
          // no registered teardown: clear the shared lock as a fallback
          gestureOwnerRef.current = undefined;
          activeTouchIdRef.current = undefined;
        }
      };

      const startDrag = (clientX: number) => {
        // one gesture at a time: ignore a new start if another gesture is in progress
        if (gestureOwnerRef.current) return;
        store.set(pauseAtom);
        const worldRange = store.get(worldRangeAtom);
        const visibleRange = store.get(visibleRangeAtom);
        if (!worldRange || !visibleRange) return;

        const window = isWorldTrack ? worldRange : visibleRange;
        const trackRect = trackEl.getBoundingClientRect();
        const ts = clientXToMs(clientX, trackRect, window);

        dragStartRef.current = {
          clientX,
          ts,
          draggableWindow: [...window],
          startVisibleRange: [...visibleRange],
          trackRect,
        };

        gestureOwnerRef.current = owner;
        isPanningRef.current = false;
        repositionListeners.attach();
        refreshCursor();
      };

      // The track rect is cached at gesture start to avoid a layout reflow per
      // move. If the page scrolls or resizes mid-drag, refresh the rect and
      // re-derive the anchor ts from the start cursor against the new rect
      // so the content under the cursor doesn't jump.
      const refreshDragRect = () => {
        const drag = dragStartRef.current;
        if (!drag) return;
        const newRect = trackEl.getBoundingClientRect();
        if (newRect.width === 0) return;
        drag.ts = clientXToMs(drag.clientX, newRect, drag.draggableWindow);
        drag.trackRect = newRect;
      };

      // Keep the cached rect fresh while a drag is in progress
      const repositionListeners = createWindowListenerGroup([
        () => addWindowListener("scroll", refreshDragRect, { capture: true }),
        () => addWindowListener("resize", refreshDragRect),
      ]);

      const moveDrag = (clientX: number) => {
        if (
          !dragStartRef.current ||
          Math.abs(clientX - dragStartRef.current.clientX) < PAN_THRESHOLD_PX
        ) {
          return;
        }
        isPanningRef.current = true;
        refreshCursor();
        const xTs = clientXToMs(
          clientX,
          dragStartRef.current.trackRect,
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
            clientXToMs(clientX, trackEl.getBoundingClientRect(), visibleRange);
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

      const ownsGesture = () => gestureOwnerRef.current === owner;

      const endDrag = () => {
        // tear down if owner of current gesture
        if (!ownsGesture()) return;
        dragStartRef.current = undefined;
        isPanningRef.current = false;
        gestureOwnerRef.current = undefined;
        activeTouchIdRef.current = undefined;
        repositionListeners.detach();
        refreshCursor();
      };

      return {
        ownsGesture,
        endDrag,
        moveDrag,
        clearStaleTouchLock,
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
          // recover a stale lock: if a prior gesture's finger is no longer down
          // (its element was removed mid-gesture, so its touchend never fired),
          // the refs are stuck set
          clearStaleTouchLock(e.touches);
          // don't adopt this finger into a gesture already in progress
          // (e.g. a mouse pan), which startDrag() will reject
          const hadActiveGesture = gestureOwnerRef.current != null;
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

      const endMouseGesture = () => {
        lastMouseUpWasPan = isPanningRef.current;
        endDrag();
        windowMouseListeners.detach();
      };

      const onMouseUp = () => {
        if (!ownsGesture()) return;
        // ignore mouse events while a touch gesture is in progress
        if (activeTouchIdRef.current != null) return;
        endMouseGesture();
      };

      // the button was released off-window (or during a context menu) and we
      // missed the mouseup: recover the stuck lock
      const onRecoverMouseMove = (e: MouseEvent) => {
        if (!ownsGesture()) return;
        // ignore mouse events while a touch gesture is in progress
        if (activeTouchIdRef.current != null) return;
        if (!(e.buttons & 1)) {
          endMouseGesture();
          return;
        }
        moveDrag(e.clientX);
      };

      // losing window focus mid-drag (alt-tab, OS dialog) means the mouseup will
      // be missed. End the gesture.
      const onWindowBlur = () => {
        if (!ownsGesture()) return;
        if (activeTouchIdRef.current != null) return;
        endMouseGesture();
      };

      // window mouse listeners live only while a mouse gesture is active
      const windowMouseListeners = createWindowListenerGroup([
        () => addWindowListener("mousemove", onRecoverMouseMove),
        () => addWindowListener("mouseup", onMouseUp),
        () => addWindowListener("blur", onWindowBlur),
      ]);

      const onMouseDownStartGesture = (e: MouseEvent) => {
        onMouseDown(e);
        if (ownsGesture()) windowMouseListeners.attach();
      };

      /**
       * Reset if the second click of the double-click was not a drag/pan
       */
      const onDblClick = (e: MouseEvent) => {
        if (isExcludedTarget(e.target)) return;
        if (lastMouseUpWasPan) return;
        store.set(resetToLiveAtom);
      };

      // Whether a chart touch gesture is in progress. A multi-touch gesture is
      // abandoned, so onTouchEnd only ever evaluates a tap for the single-finger gesture it started.
      let isTouchGestureActive = false;
      const onTouchStartWithTapTracking = (e: TouchEvent) => {
        onTouchStart(e);
        // only track as a touch gesture if this touch actually started it
        // (onTouchStart captured its identifier)
        if (ownsGesture() && activeTouchIdRef.current != null) {
          isTouchGestureActive = true;
          windowTouchListeners.attach();
        }
      };

      // A second finger landing anywhere (even outside the chart) while a chart
      // touch gesture is active cancels the pan: a single-finger pan must not
      // continue as a multi-touch gesture.
      const onWindowTouchStart = (e: TouchEvent) => {
        if (isTouchGestureActive && e.touches.length > 1) {
          abandonTouchGesture();
        }
      };

      // Stop the in-progress touch gesture and release the window touch
      // listeners. Does not touch tap-tracking state. The
      // normal end path (onTouchEnd) still needs it to evaluate a double-tap.
      const endTouchGesture = () => {
        isTouchGestureActive = false;
        endDrag();
        windowTouchListeners.detach();
      };

      // Abandon the gesture and discard any pending tap candidate. Unlike
      // endTouchGesture, no double-tap is evaluated.
      const abandonTouchGesture = () => {
        endTouchGesture();
        lastTapRef.current = undefined;
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

        // get pan state before endTouchGesture clears it
        const wasPanning = isPanningRef.current;
        endTouchGesture();

        // only evaluate a tap for a gesture that wasn't a pan
        if (wasPanning || isExcludedTarget(e.target)) {
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
        abandonTouchGesture();
      };

      const windowTouchListeners = createWindowListenerGroup([
        () => addWindowListener("touchstart", onWindowTouchStart),
        () => addWindowListener("touchmove", onTouchMove, { passive: false }),
        () => addWindowListener("touchend", onTouchEnd),
        () => addWindowListener("touchcancel", onTouchCancel),
      ]);

      // Register teardown so a stale lock can be cleared from the other path's touchstart
      touchGestureTeardownRef.current.explore = abandonTouchGesture;

      const cleanups = [
        addListener(trackEl, "mousedown", onMouseDownStartGesture),
        addListener(trackEl, "dblclick", onDblClick),
        addListener(trackEl, "touchstart", onTouchStartWithTapTracking, {
          passive: false,
        }),
        addListener(trackEl, "wheel", onWheel, { passive: false }),
      ];

      return () => {
        cleanups.forEach((off) => off());
        windowTouchListeners.detach();
        windowMouseListeners.detach();
        isTouchGestureActive = false;
        endDrag();
        delete touchGestureTeardownRef.current.explore;
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
        clearStaleTouchLock,
        onMouseDown,
        onMouseMove,
        onTouchStart,
        onTouchMove,
        onWheel,
      } = createCallbacks(trackEl, refreshCursor, true, "miniMap");

      // Refresh the stale rect if the page scrolls/resizes mid-gesture
      // so the handle keeps tracking the cursor.
      const refreshResizeRect = () => {
        if (!resizeEdgeRef.current) return;
        resizeRectRef.current = trackEl.getBoundingClientRect();
      };

      // Keep the cached rect fresh while a resize is in progress.
      const repositionListeners = createWindowListenerGroup([
        () => addWindowListener("scroll", refreshResizeRect, { capture: true }),
        () => addWindowListener("resize", refreshResizeRect),
      ]);

      const startResize = (edge: "start" | "end") => {
        // one gesture at a time
        if (gestureOwnerRef.current) return;
        resizeEdgeRef.current = edge;
        resizeRectRef.current = trackEl.getBoundingClientRect();
        gestureOwnerRef.current = "miniMap";
        repositionListeners.attach();
        refreshCursor();
      };

      const moveResizeHandle = (clientX: number) => {
        const edge = resizeEdgeRef.current;
        const rect = resizeRectRef.current;
        const worldRange = store.get(worldRangeAtom);
        const visibleRange = store.get(visibleRangeAtom);
        if (!edge || !rect || !worldRange || !visibleRange) return;

        const cursorTs = minMaxClamp(
          clientXToMs(clientX, rect, worldRange),
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
        gestureOwnerRef.current = undefined;
        activeTouchIdRef.current = undefined;
        repositionListeners.detach();
        refreshCursor();
      };

      const endDrag = () => {
        if (!ownsGesture()) return;
        if (isPanningRef.current) {
          hasPendingClickPan.current = false;
        }
        _endDrag();
      };

      let isTouchGestureActive = false;

      // Stop the in-progress touch gesture and release window listeners
      const endTouchGesture = () => {
        isTouchGestureActive = false;
        endResize();
        endDrag();
        windowTouchListeners.detach();
      };

      const onWindowTouchMove = (e: TouchEvent) => {
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
      };

      const onWindowTouchEnd = (e: TouchEvent) => {
        if (!isTouchGestureActive) return;
        // only end when the initiating finger lifts
        if (!findTouch(e.changedTouches, activeTouchIdRef.current)) return;
        endTouchGesture();
      };

      const onWindowTouchCancel = (e: TouchEvent) => {
        if (!isTouchGestureActive) return;
        if (!findTouch(e.changedTouches, activeTouchIdRef.current)) return;
        endTouchGesture();
      };

      // a second finger landing mid-gesture cancels the pan/resize
      const onWindowTouchStart = (e: TouchEvent) => {
        if (isTouchGestureActive && e.touches.length > 1) {
          endTouchGesture();
        }
      };

      const windowTouchListeners = createWindowListenerGroup([
        () => addWindowListener("touchstart", onWindowTouchStart),
        () =>
          addWindowListener("touchmove", onWindowTouchMove, { passive: false }),
        () => addWindowListener("touchend", onWindowTouchEnd),
        () => addWindowListener("touchcancel", onWindowTouchCancel),
      ]);

      const beginTouchGesture = () => {
        if (ownsGesture() && activeTouchIdRef.current != null) {
          isTouchGestureActive = true;
          windowTouchListeners.attach();
        }
      };

      // Register teardown
      touchGestureTeardownRef.current.miniMap = () => {
        endTouchGesture();
      };

      const endMouseGesture = () => {
        endResize();
        endDrag();
        windowMouseListeners.detach();
      };

      const onWindowMouseMove = (e: MouseEvent) => {
        if (!ownsGesture()) return;
        // ignore mouse events while a touch gesture is in progress
        if (activeTouchIdRef.current != null) return;
        // missed the mouseup (released off-window / during a context menu):
        // recover the stuck gesture lock
        if (!(e.buttons & 1)) {
          endMouseGesture();
          return;
        }
        if (resizeEdgeRef.current) {
          moveResizeHandle(e.clientX);
        } else {
          onMouseMove(e);
        }
      };

      const onWindowMouseUp = () => {
        if (!ownsGesture()) return;
        // ignore mouse events while a touch gesture is in progress
        if (activeTouchIdRef.current != null) return;
        endMouseGesture();
      };

      // losing window focus mid-gesture (alt-tab, OS dialog) means the mouseup
      // will be missed; end the gesture now so its lock can't stay stuck
      const onWindowBlur = () => {
        if (!ownsGesture()) return;
        if (activeTouchIdRef.current != null) return;
        endMouseGesture();
      };

      // only listen to window events while a mouse gesture is active
      const windowMouseListeners = createWindowListenerGroup([
        () => addWindowListener("mousemove", onWindowMouseMove),
        () => addWindowListener("mouseup", onWindowMouseUp),
        () => addWindowListener("blur", onWindowBlur),
      ]);

      // attach window mouse listeners once a mouse gesture (pan or resize) starts
      const attachMouseGesture = () => {
        if (ownsGesture()) windowMouseListeners.attach();
      };

      const panToCursorPoint = (clientX: number) => {
        const worldRange = store.get(worldRangeAtom);
        if (!worldRange) return;

        const cursorTs = clientXToMs(
          clientX,
          trackEl.getBoundingClientRect(),
          worldRange,
        );
        panToTs(cursorTs);
      };

      const onHandleMouseDown = (edge: "start" | "end") => (e: MouseEvent) => {
        if (e.button !== 0) return;
        startResize(edge);
        attachMouseGesture();
        e.stopPropagation();
        e.preventDefault();
      };

      // visibleRange mouse pan start
      const onVisibleRangeMouseDown = (e: MouseEvent) => {
        onMouseDown(e);
        attachMouseGesture();
      };
      const onHandleTouchStart = (edge: "start" | "end") => (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        // recover a stale lock from a gesture whose finger is already gone
        clearStaleTouchLock(e.touches);
        // don't adopt this finger into a gesture already in progress
        // (e.g. a mouse pan), which startResize() will reject
        const hadActiveGesture = gestureOwnerRef.current != null;
        startResize(edge);
        if (!hadActiveGesture && ownsGesture()) {
          activeTouchIdRef.current = e.touches[0].identifier;
        }
        beginTouchGesture();
        e.stopPropagation();
        e.preventDefault();
      };

      // visibleRange pan start
      const onVisibleRangeTouchStart = (e: TouchEvent) => {
        onTouchStart(e);
        beginTouchGesture();
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

        addListener(visibleRangeEl, "mousedown", onVisibleRangeMouseDown),
        addListener(visibleRangeEl, "touchstart", onVisibleRangeTouchStart, {
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

        addListener(trackEl, "wheel", onWheel, { passive: false }),
      ];

      return () => {
        cleanups.forEach((off) => off());
        windowTouchListeners.detach();
        windowMouseListeners.detach();
        endResize();
        endDrag();
        delete touchGestureTeardownRef.current.miniMap;
      };
    };

    return {
      setUpExploreListeners,
      setUpMiniMap,
      panToTs,
    };
  }, [createCallbacks, setClampedVisibleRange, panToTs]);
}
