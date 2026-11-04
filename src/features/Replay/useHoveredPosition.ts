import { getDefaultStore } from "jotai";
import { useCallback, useRef } from "react";
import { visibleRangeAtom } from "./atoms";

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
}: {
  onHoverChange: (clientX: number, clientY: number, rect: HoveredRect) => void;
  onHoverLeave: () => void;
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

  // Replay the hover at an explicit cursor position (e.g. after a pinned tooltip
  // dismisses, where no mousemove fires but we know where the cursor is). Seeds
  // lastClientPosRef so later range-shift replays stay anchored there too.
  const replayHoverAt = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    rectRef.current = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    lastClientPosRef.current = { x: clientX, y: clientY };
    onHoverChangeRef.current(clientX, clientY, rectRef.current);
  }, []);

  const setContainer = useCallback(
    (el: HTMLElement | null) => {
      containerRef.current = el;
      cleanUpRef.current?.();

      if (!el) {
        cleanUpRef.current = null;
        return;
      }

      const onMove = (e: MouseEvent) => {
        const rect = rectRef.current;
        if (!rect) return;
        lastClientPosRef.current = { x: e.clientX, y: e.clientY };
        onHoverChangeRef.current(e.clientX, e.clientY, rect);
      };

      const onLeave = () => {
        lastClientPosRef.current = undefined;
        onHoverLeaveRef.current();
      };

      // NOTE: native event handling: inner containers will see the event before ancestors
      el.addEventListener("mousemove", onMove);
      el.addEventListener("mouseleave", onLeave);

      // replay the hover if the visible range shifts, even if the cursor doesn't move
      const unsubscribeRange = store.sub(visibleRangeAtom, notifyChange);
      const rectObserver = new ResizeObserver(refreshContainerAndNotify);
      rectObserver.observe(el);
      window.addEventListener("resize", refreshContainerAndNotify);
      // Scrolling moves the viewport-relative rect without resizing it; capture
      // so we also see scrolls on nested ancestor scroll containers.
      window.addEventListener("scroll", refreshContainerAndNotify, true);

      refreshContainerAndNotify();

      cleanUpRef.current = () => {
        el.removeEventListener("mousemove", onMove);
        el.removeEventListener("mouseleave", onLeave);
        unsubscribeRange();
        rectObserver.disconnect();
        window.removeEventListener("resize", refreshContainerAndNotify);
        window.removeEventListener("scroll", refreshContainerAndNotify, true);
      };
    },
    [notifyChange, refreshContainerAndNotify],
  );

  return { setContainer, refreshContainerAndNotify, replayHoverAt };
}
