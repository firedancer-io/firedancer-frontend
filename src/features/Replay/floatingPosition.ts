import { computePosition, offset, flip, shift } from "@floating-ui/dom";

// 8px minimum from the viewport edge, shared by the replay tooltips
const EDGE_MARGIN_PX = 8;

export interface Point {
  x: number;
  y: number;
}

/**
 * Position a floating element below a point (in viewport coords), flipping and
 * shifting to stay on screen.
 */
export function positionBelowPoint(
  point: Point,
  floating: HTMLElement,
  gapPx: number,
) {
  // zero-size virtual anchor at the point
  const anchor = {
    x: point.x,
    y: point.y,
    left: point.x,
    right: point.x,
    top: point.y,
    bottom: point.y,
    width: 0,
    height: 0,
  };

  return computePosition({ getBoundingClientRect: () => anchor }, floating, {
    // strategy "fixed" so x/y are viewport-relative
    strategy: "fixed",
    placement: "bottom-start",
    middleware: [offset(gapPx), flip(), shift({ padding: EDGE_MARGIN_PX })],
  });
}

/**
 * Position a floating element to the right of a horizontal span (in viewport
 * coords), top-aligned to it, flipping to the left side if there isn't room.
 * If neither side fits, or the span is off screen, it's shifted onto the screen,
 * overlapping the span.
 */
export function positionBesideSpan(
  span: { left: number; right: number; y: number },
  floating: HTMLElement,
) {
  const anchor = {
    x: span.left,
    y: span.y,
    left: span.left,
    right: span.right,
    top: span.y,
    bottom: span.y,
    width: span.right - span.left,
    height: 0,
  };

  return computePosition({ getBoundingClientRect: () => anchor }, floating, {
    strategy: "fixed",
    placement: "right-start",
    middleware: [
      flip({ fallbackPlacements: ["left-start"], crossAxis: false }),
      shift({ padding: EDGE_MARGIN_PX, crossAxis: true }),
    ],
  });
}
