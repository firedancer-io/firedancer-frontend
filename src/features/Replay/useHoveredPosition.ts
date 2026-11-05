import { getDefaultStore } from "jotai";
import { useCallback, useRef } from "react";
import { visibleRangeAtom } from "./atoms";
import { isExcludedTarget, isTap, type ClientPoint } from "./gestureUtils";

const store = getDefaultStore();

export interface HoveredRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Track the cursor over a container.
 * Calls callbacks when cursor moves / leaves, the container resizes, or the visible range shifts.
 */
export function useHoveredPosition({
  onHoverChange,
  onHoverLeave,
  followsVisibleRange = true,
}: {
  onHoverChange: (clientX: number, clientY: number, rect: HoveredRect) => void;
  onHoverLeave?: () => void;
  // false for charts outside Replay
  followsVisibleRange?: boolean;
}) {
  const containerRef = useRef<HTMLElement | null>(null);
  const lastClientPosRef = useRef<{ x: number; y: number }>();

  // cache container bounds because getBoundingClientRect() forces a synchronous layout.
  const rectRef = useRef<HoveredRect>();

  const cleanUpRef = useRef<(() => void) | null>(null);

  const onHoverChangeRef = useRef(onHoverChange);
  onHoverChangeRef.current = onHoverChange;
  const onHoverLeaveRef = useRef(onHoverLeave);
  onHoverLeaveRef.current = onHoverLeave;

  // notify owner the cursor position or ts may have changed
  const notifyChange = useCallback(() => {
    const pos = lastClientPosRef.current;
    const rect = rectRef.current;
    if (!pos || !rect) return;
    onHoverChangeRef.current(pos.x, pos.y, rect);
  }, []);

  const refreshContainerAndNotify = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    rectRef.current = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    notifyChange();
  }, [notifyChange]);

  const setContainer = useCallback(
    (el: HTMLElement | null) => {
      containerRef.current = el;
      cleanUpRef.current?.();

      if (!el) {
        cleanUpRef.current = null;
        return;
      }

      const hover = ({ clientX, clientY }: ClientPoint) => {
        const rect = rectRef.current;
        if (!rect) return;
        lastClientPosRef.current = { x: clientX, y: clientY };
        onHoverChangeRef.current(clientX, clientY, rect);
      };

      const leave = () => {
        lastClientPosRef.current = undefined;
        onHoverLeaveRef.current?.();
      };

      // touch has no hover: a one-finger tap hovers the tapped point, any touch clears it
      let tapPress: (ClientPoint & { pointerId: number }) | undefined;
      const onWindowTouchDown = (e: PointerEvent) => {
        if (e.pointerType === "mouse") return;
        leave();
        const startsTap =
          !tapPress &&
          el.contains(e.target as Node) &&
          !isExcludedTarget(e.target);
        tapPress = startsTap ? e : undefined;
      };
      const onMove = (e: PointerEvent) => {
        if (e.pointerType === "mouse") hover(e);
        else if (tapPress && !isTap(tapPress, e)) tapPress = undefined;
      };
      const onMouseLeave = (e: PointerEvent) => {
        if (e.pointerType === "mouse") leave();
      };
      const onTouchUp = (e: PointerEvent) => {
        if (e.pointerType === "mouse" || e.pointerId !== tapPress?.pointerId) {
          return;
        }
        if (isTap(tapPress, e)) hover(e);
        tapPress = undefined;
      };
      const onTouchCancel = () => {
        tapPress = undefined;
      };

      // NOTE: native event handling: inner containers will see the event before ancestors
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onMouseLeave);
      el.addEventListener("pointerup", onTouchUp);
      el.addEventListener("pointercancel", onTouchCancel);
      window.addEventListener("pointerdown", onWindowTouchDown);

      // replay the hover if the visible range shifts, even if the cursor doesn't move
      const unsubscribeRange = followsVisibleRange
        ? store.sub(visibleRangeAtom, notifyChange)
        : () => {};
      const rectObserver = new ResizeObserver(refreshContainerAndNotify);
      rectObserver.observe(el);
      window.addEventListener("resize", refreshContainerAndNotify);
      // Scrolling moves the viewport-relative rect without resizing it; capture
      // so we also see scrolls on nested ancestor scroll containers.
      window.addEventListener("scroll", refreshContainerAndNotify, true);

      refreshContainerAndNotify();

      cleanUpRef.current = () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerleave", onMouseLeave);
        el.removeEventListener("pointerup", onTouchUp);
        el.removeEventListener("pointercancel", onTouchCancel);
        window.removeEventListener("pointerdown", onWindowTouchDown);
        unsubscribeRange();
        rectObserver.disconnect();
        window.removeEventListener("resize", refreshContainerAndNotify);
        window.removeEventListener("scroll", refreshContainerAndNotify, true);
      };
    },
    [notifyChange, refreshContainerAndNotify, followsVisibleRange],
  );

  return { setContainer, notifyChange };
}
