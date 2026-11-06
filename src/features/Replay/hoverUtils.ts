import type { HoveredRect } from "./useHoveredPosition.ts";
import type { TsRange } from "../WebGl/webglUtils.ts";

/** Map a clientX to a timestamp within `range`, using the hovered rect bounds. */
export function clientXToTs(
  rect: HoveredRect,
  clientX: number,
  range: TsRange,
) {
  const fraction = (clientX - rect.left) / rect.width;
  return range[0] + fraction * (range[1] - range[0]);
}

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
