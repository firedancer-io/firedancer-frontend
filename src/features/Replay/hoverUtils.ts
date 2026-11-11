import type { HoveredRect } from "./useHoveredPosition.ts";
import type { TsRange } from "../WebGl/webglUtils.ts";

/**
 * Map a clientY to a camera-space world Y. The camera spans
 * [`cameraTop` (top), `cameraBottom` (bottom)], matching the drawn rects' Y.
 */
export function clientYToWorldY(
  rect: HoveredRect,
  clientY: number,
  cameraTop: number,
  cameraBottom: number,
) {
  const fraction = (clientY - rect.top) / rect.height;
  return cameraTop + fraction * (cameraBottom - cameraTop);
}

export function isInRanges(ranges: TsRange[], ts: number) {
  return ranges.some(([startMs, endMs]) => ts >= startMs && ts < endMs);
}
