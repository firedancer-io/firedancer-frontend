import { useCallback, useEffect, useRef, type RefObject } from "react";

/** Cursor position as a fraction (0 to 1) of the track from its top-left */
export interface TrackPoint {
  fracX: number;
  fracY: number;
}

/**
 * Tracks the cursor over a track element and calls onHover with its position,
 * or undefined when the cursor leaves or starts dragging to pan.
 * Returns a refresh callback to re-resolve what's under a stationary cursor,
 * e.g. after a pan/zoom or data update.
 */
export function useTrackHover(
  trackRef: RefObject<HTMLElement>,
  onHover: (point: TrackPoint | undefined) => void,
): () => void {
  const clientPosRef = useRef<{ clientX: number; clientY: number }>();
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;

  const refresh = useCallback(() => {
    const el = trackRef.current;
    const clientPos = clientPosRef.current;
    if (!el || !clientPos) {
      onHoverRef.current(undefined);
      return;
    }

    // Recompute against the current rect, in case the page scrolled
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      onHoverRef.current(undefined);
      return;
    }
    onHoverRef.current({
      fracX: (clientPos.clientX - rect.left) / rect.width,
      fracY: (clientPos.clientY - rect.top) / rect.height,
    });
  }, [trackRef]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const onMouseMove = (e: MouseEvent) => {
      // no hover while dragging to pan
      clientPosRef.current =
        e.buttons & 1 ? undefined : { clientX: e.clientX, clientY: e.clientY };
      refresh();
    };
    const onMouseLeave = () => {
      clientPosRef.current = undefined;
      refresh();
    };

    el.addEventListener("mousemove", onMouseMove);
    el.addEventListener("mouseleave", onMouseLeave);
    return () => {
      el.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("mouseleave", onMouseLeave);
      // e.g. a WebGL remount under the cursor won't get a mouseleave
      clientPosRef.current = undefined;
      onHoverRef.current(undefined);
    };
  }, [trackRef, refresh]);

  return refresh;
}
