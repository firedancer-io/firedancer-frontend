import type { VotesGeometry } from "./curvesGeometry";

export const HOVER_TOLERANCE_PX = 6;

interface HoverPoint {
  ms: number;
  y: number;
  pxPerMs: number;
}

function segmentDistSq(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  const t =
    lenSq === 0
      ? 0
      : Math.min(1, Math.max(0, ((px - x0) * dx + (py - y0) * dy) / lenSq));
  const ex = px - (x0 + t * dx);
  const ey = py - (y0 + t * dy);
  return ex * ex + ey * ey;
}

export function getDrawnSlotAtPoint(
  geometries: Iterable<VotesGeometry>,
  { ms, y, pxPerMs }: HoverPoint,
): number | undefined {
  let markerSlot: number | undefined;
  let bestMarkerDistSq = Infinity;
  let segmentSlot: number | undefined;
  let bestSegmentDistSq = Infinity;

  const checkMarkers = (markers: VotesGeometry["markers"]) => {
    for (const marker of markers) {
      if (marker.slot === undefined) continue;
      // markers are centered on their point
      const dx = (marker.x - ms) * pxPerMs;
      const dy = y - marker.y;
      if (
        Math.abs(dx) > marker.widthPx / 2 ||
        Math.abs(dy) > marker.heightPx / 2
      ) {
        continue;
      }
      const distSq = dx * dx + dy * dy;
      if (distSq <= bestMarkerDistSq) {
        bestMarkerDistSq = distSq;
        markerSlot = marker.slot;
      }
    }
  };

  for (const { strokes, markers, triangles } of geometries) {
    // markers are drawn over triangles, so they're checked last to win ties
    checkMarkers(triangles);
    checkMarkers(markers);

    // strokes are drawn in order, so later ones are on top
    for (const { segments, slots } of strokes) {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (slot === undefined) continue;
        const x0 = (segments[i * 4] - ms) * pxPerMs;
        const x1 = (segments[i * 4 + 2] - ms) * pxPerMs;
        if (
          Math.max(x0, x1) < -HOVER_TOLERANCE_PX ||
          Math.min(x0, x1) > HOVER_TOLERANCE_PX
        ) {
          continue;
        }
        const distSq = segmentDistSq(
          0,
          y,
          x0,
          segments[i * 4 + 1],
          x1,
          segments[i * 4 + 3],
        );
        if (distSq <= bestSegmentDistSq) {
          bestSegmentDistSq = distSq;
          segmentSlot = slot;
        }
      }
    }
  }

  return markerSlot ?? segmentSlot;
}
