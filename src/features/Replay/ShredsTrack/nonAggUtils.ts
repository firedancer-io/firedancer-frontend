import { getDefaultStore } from "jotai";
import type { RectMesh, TsRange } from "../../WebGl/webglUtils";
import {
  convertToWebGlColor,
  createRectMesh,
  updateRectMeshCounts,
} from "../../WebGl/webglUtils";
import {
  updateEdgeViewWidth,
  EDGE_RENDER_ORDER_OFFSET,
} from "../../Shreds/WebGl/edgeUtils";
import { shredHoverHighlightColor } from "../../../colors";
import {
  FEC_MESH_CAPACITY,
  SHRED_MESH_CAPACITY,
} from "../../Shreds/WebGl/const";
import {
  SHREDS_PER_FEC_SET,
  SKIPPED_SLOT_DOT_DURATION_MS,
  shredEventDescPriorities,
} from "../../Shreds/const";
import type { ShredEventTsDeltas } from "../../Shreds/types";
import { getDrawInfo } from "../../Shreds/chartUtils";
import {
  addEventsForRow,
  drawSlotShreds,
  getIncompleteSlotRightEdge,
  releaseMesh,
  tempEventPositions,
  updateCameraXRange,
} from "../../Shreds/WebGl/drawUtils";
import type { ShredsGranularity } from "../../../api/types";
import { ShredsGranularityEnum } from "../../../api/entities";
import {
  calcAbsoluteNs,
  calcRelativeMs,
  getTileIdxRangeWithOverscan,
} from "../utils";
import type { HoveredShred } from "../atoms";
import { CHART_NOW_DELAY_MS } from "../const";
import { getNonAggAtoms } from "./atoms";
import { OVERSCAN_TILES_COUNT, tileSizeNs } from "./useNonAggShredsQuery";
import {
  SHREDS_AGG_THRESHOLD_MS,
  MAX_HEIGHT_RATIO,
  type NonAggRendererResources,
  type RendererObj,
} from "./const";
import type { DrawableSlot } from "../../Shreds/chartUtils";

const store = getDefaultStore();

const HIGHLIGHT_COLOR = convertToWebGlColor(shredHoverHighlightColor);

const NON_AGG_FEC_THRESHOLD_MS = 30_000;

// alpha = 1 at the FEC<->shred boundary, alpha = 0 at the FEC<->agg boundary.
// drop off exponentially, faster near shred boundary
const SHRED_EDGE_OPACITY = 1;
const FEC_EDGE_FALLOFF = 3;

function getFecEdgeOpacity(windowSizeMs: number): number {
  const t =
    (windowSizeMs - NON_AGG_FEC_THRESHOLD_MS) /
    (SHREDS_AGG_THRESHOLD_MS - NON_AGG_FEC_THRESHOLD_MS);
  const clamped = Math.min(1, Math.max(0, t));
  return Math.pow(1 - clamped, FEC_EDGE_FALLOFF);
}

/**
 * Hide slots that we know will be complete but we don't
 * have the completion event for, if they are behind by this threshold.
 * The threshold prevents live data from flashing in late.
 */
const STALE_INCOMPLETE_THRESHOLD_MS = 3_000;

export function getNonAggGranularity(windowSizeMs: number) {
  return windowSizeMs > NON_AGG_FEC_THRESHOLD_MS
    ? ShredsGranularityEnum.fec
    : ShredsGranularityEnum.shred;
}

function getOtherGranularity(
  granularity: ShredsGranularity,
): ShredsGranularity {
  return granularity === ShredsGranularityEnum.fec
    ? ShredsGranularityEnum.shred
    : ShredsGranularityEnum.fec;
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
 * Find the shred at the given position with the largest slot number. Returns undefined if no shred is found.
 */
export function getShredAtPosition(
  ts: number,
  worldY: number,
  resources: NonAggRendererResources,
): HoveredShred | undefined {
  const drawInfo = resources.lastDrawInfo;
  if (!drawInfo) return undefined;

  const { slots, incompleteRightEdges } = drawInfo;

  // higher slot numbers paint on top so check in desc order
  for (let i = slots.length - 1; i >= 0; i--) {
    const drawSlot = slots[i];
    const { slotNumber, slot, isFec, skipped } = drawSlot;
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

    return {
      slot: slotNumber,
      isFec,
      idx,
      maxIdx: slot.shreds.length - 1,
      shred,
      completeTs: slot.completionTsDelta,
      skipped,
    };
  }

  return undefined;
}

/**
 * Repaint the highlight mesh to cover the hovered shred's drawn segments in white,
 * or clear it when nothing is hovered. Uses the same segment layout as the real draw
 * (via addEventsForRow) so the white rects line up exactly with the painted bars.
 */
export function drawHoveredShred(
  resources: NonAggRendererResources,
  hovered: HoveredShred | undefined,
  visibleRange: TsRange,
) {
  const { highlightMesh, cameraReferenceMs } = resources;

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
    delayMs: CHART_NOW_DELAY_MS,
    colorOverride: HIGHLIGHT_COLOR,
  });

  updateRectMeshCounts(highlightMesh, rectanglesAdded);
  highlightMesh.mesh.renderOrder = hovered.slot + 0.5;
  highlightMesh.referenceX = cameraReferenceMs;
  highlightMesh.mesh.position.x = 0;
}

export function moveNonAggCamera(
  resources: NonAggRendererResources,
  visibleRange: TsRange,
) {
  const { camera } = resources;

  const cameraReferenceMs = visibleRange[0];
  resources.cameraReferenceMs = cameraReferenceMs;

  const changed = updateCameraXRange(
    [visibleRange[0] - cameraReferenceMs, visibleRange[1] - cameraReferenceMs],
    camera,
  );

  // Move meshes to match camera reference change
  for (const mesh of resources.meshes.values()) {
    mesh.mesh.position.x =
      (mesh.referenceX ?? cameraReferenceMs) - cameraReferenceMs;
  }
  for (const mesh of resources.edgeMeshes.values()) {
    mesh.mesh.position.x =
      (mesh.referenceX ?? cameraReferenceMs) - cameraReferenceMs;
  }

  resources.highlightMesh.mesh.position.x =
    (resources.highlightMesh.referenceX ?? cameraReferenceMs) -
    cameraReferenceMs;

  return changed;
}

export function getSlotMeshKey(
  granularity: ShredsGranularity,
  slotNumber: number,
): string {
  return `${granularity}:${slotNumber}`;
}

/**
 * Get min and max slot numbers whose rendered span intersects the draw range.
 */
function getSlotRangeForDrawRange(
  granularity: ShredsGranularity,
  [drawStart, drawEnd]: TsRange,
): { min: number; max: number } | undefined {
  let min = Infinity;
  let max = -Infinity;
  for (const g of [granularity, getOtherGranularity(granularity)]) {
    const slotsShreds = store.get(getNonAggAtoms(g).slotsShreds);
    if (!slotsShreds) continue;
    for (const [slotNumber, slot] of slotsShreds.slots) {
      if (slot.minEventTsDelta == null || slot.minEventTsDelta > drawEnd) {
        continue;
      }
      if (
        slot.completionTsDelta != null &&
        slot.completionTsDelta < drawStart
      ) {
        continue;
      }
      if (slotNumber < min) min = slotNumber;
      if (slotNumber > max) max = slotNumber;
    }
  }

  if (min === Infinity) return undefined;
  return { min, max };
}

/**
 * Draw shreds at active granularity, or the fallback if available.
 */
export function drawNonAggShreds(
  rendererObj: RendererObj,
  granularity: ShredsGranularity,
  referenceNs: bigint,
  visibleRange: TsRange,
  worldRange: TsRange,
) {
  const { firstTile, lastTile } = getTileIdxRangeWithOverscan(
    [
      calcAbsoluteNs(referenceNs, visibleRange[0]),
      calcAbsoluteNs(referenceNs, visibleRange[1]),
    ],
    [
      calcAbsoluteNs(referenceNs, worldRange[0]),
      calcAbsoluteNs(referenceNs, worldRange[1]),
    ],
    tileSizeNs,
    OVERSCAN_TILES_COUNT,
  );

  const resources = rendererObj.nonAggResources;

  const viewportWidthPx = rendererObj.renderer.domElement.width;
  if (viewportWidthPx > 0) {
    updateEdgeViewWidth(resources.edgeResources.rectMaterial, viewportWidthPx);
  }

  const edgeOpacity =
    granularity === ShredsGranularityEnum.fec
      ? getFecEdgeOpacity(visibleRange[1] - visibleRange[0])
      : SHRED_EDGE_OPACITY;
  resources.edgeResources.rectMaterial.uniforms.uOpacity.value = edgeOpacity;

  const releaseSlot = (key: string) => {
    releaseMesh(
      resources.scene,
      resources.meshes,
      resources.availableMeshes,
      key,
    );
    releaseMesh(
      resources.scene,
      resources.edgeMeshes,
      resources.availableEdgeMeshes,
      key,
    );
  };

  const shredsDrawRange: TsRange = [
    calcRelativeMs(referenceNs, BigInt(firstTile) * tileSizeNs),
    calcRelativeMs(referenceNs, BigInt(lastTile + 1) * tileSizeNs),
  ];

  const slotRange = getSlotRangeForDrawRange(granularity, shredsDrawRange);
  if (!slotRange) {
    // nothing to draw: drop the previous window's meshes
    for (const key of resources.meshes.keys()) {
      releaseSlot(key);
    }
    resources.lastDrawInfo = undefined;
    return;
  }

  const isFecActive = granularity === ShredsGranularityEnum.fec;

  const otherGranularity = getOtherGranularity(granularity);
  const activeShreds = store.get(getNonAggAtoms(granularity).slotsShreds);
  const otherShreds = store.get(getNonAggAtoms(otherGranularity).slotsShreds);

  // draw active, or if unavailable, fallback granularity data
  const otherData = otherShreds
    ? { isFec: !isFecActive, slotsShreds: otherShreds }
    : undefined;

  const primary = activeShreds
    ? { isFec: isFecActive, slotsShreds: activeShreds }
    : otherData;

  const fallback = activeShreds ? otherData : undefined;

  if (!primary) {
    for (const key of resources.meshes.keys()) {
      releaseSlot(key);
    }
    resources.lastDrawInfo = undefined;
    return;
  }

  const shouldHideStaleIncompleteSlot = (minEventTs: number) => {
    return worldRange[1] - minEventTs >= STALE_INCOMPLETE_THRESHOLD_MS;
  };

  const { maxShreds, slots: drawSlots } = getDrawInfo(
    slotRange.min,
    slotRange.max,
    primary,
    fallback,
    visibleRange,
    shredsDrawRange,
    (slot) => !!slot.skipped,
    undefined,
    shouldHideStaleIncompleteSlot,
  );

  const orderedSet = new Set(drawSlots.map(getDrawSlotKey));
  // release meshes that are no longer drawn
  for (const key of resources.meshes.keys()) {
    if (!orderedSet.has(key)) {
      releaseSlot(key);
    }
  }

  const currentIncompleteRightEdge = getIncompleteSlotRightEdge(
    shredsDrawRange[1],
    CHART_NOW_DELAY_MS,
  );

  const prevIncompleteEdges =
    resources.lastDrawInfo?.incompleteRightEdges ?? new Map<string, number>();

  // get new set of incomplete right edges
  // extend previous incomplete slots if needed
  const newIncompleteRightEdges = new Map<string, number>();
  const dirtySlots = new Set<number>();
  for (const drawSlot of drawSlots) {
    const { slot, slotNumber, skipped } = drawSlot;
    if (slot.completionTsDelta != null || skipped) continue;

    // incomplete unskipped slot, check if right edge needs to be extended
    const key = getDrawSlotKey(drawSlot);
    const prevEdge = prevIncompleteEdges.get(key);

    if (prevEdge == null || prevEdge < currentIncompleteRightEdge) {
      dirtySlots.add(slotNumber);
      newIncompleteRightEdges.set(key, currentIncompleteRightEdge);
    } else {
      // keep previous edge and skip redraw
      newIncompleteRightEdges.set(key, prevEdge);
    }
  }
  resources.lastDrawInfo = {
    slots: drawSlots,
    incompleteRightEdges: newIncompleteRightEdges,
  };

  drawSlotShreds(
    visibleRange,
    shredsDrawRange,
    // pad bottom so the tallest column lands at MAX_HEIGHT_RATIO
    maxShreds > 0 ? maxShreds / MAX_HEIGHT_RATIO : maxShreds,
    drawSlots,
    ({ slotNumber, isFec }) =>
      getSlotMesh(
        resources,
        slotNumber,
        isFec ? ShredsGranularityEnum.fec : ShredsGranularityEnum.shred,
      ),
    resources.camera,
    resources.cameraReferenceMs,
    (slotNumber) => dirtySlots.has(slotNumber),
    ({ slotNumber, isFec }) =>
      getEdgeMesh(
        resources,
        slotNumber,
        isFec ? ShredsGranularityEnum.fec : ShredsGranularityEnum.shred,
      ),
    CHART_NOW_DELAY_MS,
  );
}

function getDrawSlotKey(drawSlot: DrawableSlot): string {
  return getSlotMeshKey(
    drawSlot.isFec ? ShredsGranularityEnum.fec : ShredsGranularityEnum.shred,
    drawSlot.slotNumber,
  );
}

/**
 * Get existing mesh for slot, or set up a new one
 */
function getSlotMesh(
  resources: NonAggRendererResources,
  slotNumber: number,
  granularity: ShredsGranularity,
) {
  const meshKey = getSlotMeshKey(granularity, slotNumber);
  let slotMesh = resources.meshes.get(meshKey);
  const isNewMesh = !slotMesh;
  if (!slotMesh) {
    const lastMesh = resources.availableMeshes.pop();

    slotMesh =
      lastMesh ??
      createRectMesh(
        resources.resources,
        granularity === ShredsGranularityEnum.fec
          ? FEC_MESH_CAPACITY
          : SHRED_MESH_CAPACITY,
      );
    resources.meshes.set(meshKey, slotMesh);
    resources.scene.add(slotMesh.mesh);
    // paint bigger slot numbers on top of smaller numbers
    slotMesh.mesh.renderOrder = slotNumber;
  }
  return { isNewMesh, slotMesh };
}

function getEdgeMesh(
  resources: NonAggRendererResources,
  slotNumber: number,
  granularity: ShredsGranularity,
): RectMesh {
  const meshKey = getSlotMeshKey(granularity, slotNumber);
  let edgeMesh = resources.edgeMeshes.get(meshKey);
  if (!edgeMesh) {
    const lastMesh = resources.availableEdgeMeshes.pop();

    edgeMesh =
      lastMesh ??
      createRectMesh(
        resources.edgeResources,
        granularity === ShredsGranularityEnum.fec
          ? FEC_MESH_CAPACITY
          : SHRED_MESH_CAPACITY,
      );
    resources.edgeMeshes.set(meshKey, edgeMesh);
    resources.scene.add(edgeMesh.mesh);
    edgeMesh.mesh.renderOrder = slotNumber + EDGE_RENDER_ORDER_OFFSET;
  }
  return edgeMesh;
}
