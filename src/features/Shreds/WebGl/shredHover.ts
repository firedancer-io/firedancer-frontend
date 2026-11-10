import type { RectMesh, TsRange } from "../../WebGl/webglUtils";
import {
  convertToWebGlColor,
  updateRectMeshCounts,
} from "../../WebGl/webglUtils";
import { shredHoverHighlightColor } from "../../../colors";
import {
  SHREDS_PER_FEC_SET,
  SKIPPED_SLOT_DOT_DURATION_MS,
  shredEventDescPriorities,
} from "../const";
import type { ShredEventTsDeltas } from "../types";
import type { DrawableSlot } from "../chartUtils";
import { addEventsForRow, tempEventPositions } from "./drawUtils";

const HIGHLIGHT_COLOR = convertToWebGlColor(shredHoverHighlightColor);

export interface HoveredShred {
  slot: number;
  isFec: boolean;
  idx: number;
  maxIdx: number;
  shred: ShredEventTsDeltas;
  completeTs: number | undefined;
  skipped: boolean;
}

export interface DrawInfo {
  slots: DrawableSlot[];
  incompleteRightEdges: ReadonlyMap<string, number>;
}

export function isSameHoveredShred(a: HoveredShred, b: HoveredShred): boolean {
  return (
    a.slot === b.slot &&
    a.isFec === b.isFec &&
    a.idx === b.idx &&
    a.maxIdx === b.maxIdx &&
    a.completeTs === b.completeTs &&
    a.skipped === b.skipped &&
    a.shred.length === b.shred.length &&
    a.shred.every((d, i) => d === b.shred[i])
  );
}

/**
 * Check if any shred event would have been drawn at ts
 */
function hasShredEventAtTs(
  shred: ShredEventTsDeltas,
  ts: number,
  rightEdge: number,
  skipped: boolean,
): boolean {
  let endTs = rightEdge;
  for (const eventType of shredEventDescPriorities) {
    const startTs = shred[eventType];
    if (startTs == null || startTs >= endTs) continue;

    const segmentEnd = skipped ? startTs + SKIPPED_SLOT_DOT_DURATION_MS : endTs;
    if (ts >= startTs && ts <= segmentEnd) return true;

    endTs = startTs;
  }
  return false;
}

/**
 * Find the topmost drawn shred at the given position.
 * getDrawSlotKey must match the renderer's incompleteRightEdges keys;
 * getDrawOrder is higher on top.
 */
export function getShredAtPosition(
  ts: number,
  worldY: number,
  drawInfo: DrawInfo,
  getDrawSlotKey: (drawSlot: DrawableSlot) => string,
  getDrawOrder: (slotNumber: number) => number = (slotNumber) => slotNumber,
): HoveredShred | undefined {
  const { slots, incompleteRightEdges } = drawInfo;

  // the hit drawn on top, without sorting every slot
  let top: HoveredShred | undefined;
  let topOrder = -Infinity;
  for (const drawSlot of slots) {
    const { slotNumber, slot, isFec, skipped } = drawSlot;
    const order = getDrawOrder(slotNumber);
    if (order <= topOrder) continue;
    if (slot.minEventTsDelta == null || ts < slot.minEventTsDelta) continue;

    const rightEdge =
      incompleteRightEdges.get(getDrawSlotKey(drawSlot)) ??
      slot.completionTsDelta ??
      Infinity;

    // Skipped slots draw a fixed-width dot that can extend past completion, so
    // check specific event times
    if (!skipped && ts > rightEdge) continue;

    // rows are drawn at y = -(idx + 1) * rowHeight, so a point at worldY falls
    // in the row floor(-worldY / rowHeight). idx is a shred index, or a FEC-set
    // index when isFec.
    const rowHeight = isFec ? SHREDS_PER_FEC_SET : 1;
    const idx = Math.floor(-worldY / rowHeight);
    const shred = slot.shreds[idx];
    if (!shred) continue;
    if (!hasShredEventAtTs(shred, ts, rightEdge, skipped)) continue;

    topOrder = order;
    top = {
      slot: slotNumber,
      isFec,
      idx,
      maxIdx: slot.shreds.length - 1,
      // create copy so we can compare this moment when shred is mutated later
      shred: [...shred],
      completeTs: slot.completionTsDelta,
      skipped,
    };
  }

  return top;
}

/**
 * Cover the hovered shred's segments in white, or clear when none.
 * delayMs must match the renderer's so the incomplete right edge lines up.
 */
export function drawHoveredShred(
  highlightMesh: RectMesh,
  cameraReferenceMs: number,
  hovered: HoveredShred | undefined,
  visibleRange: TsRange,
  delayMs: number,
) {
  if (!hovered) {
    updateRectMeshCounts(highlightMesh, 0);
    return;
  }

  const rowHeight = hovered.isFec ? SHREDS_PER_FEC_SET : 1;

  tempEventPositions.clear();
  const rectanglesAdded = addEventsForRow({
    tempEventPositions,
    slotMesh: highlightMesh,
    startRectangleIdx: 0,
    eventTsDeltas: hovered.shred,
    slotCompletionTsDelta: hovered.completeTs,
    isSlotSkipped: hovered.skipped,
    y: -(hovered.idx + 1) * rowHeight,
    rowHeight,
    visibleTsRange: visibleRange,
    cameraReferenceMs,
    delayMs,
    colorOverride: HIGHLIGHT_COLOR,
  });

  updateRectMeshCounts(highlightMesh, rectanglesAdded);
  highlightMesh.referenceX = cameraReferenceMs;
  highlightMesh.mesh.position.x = 0;
}
