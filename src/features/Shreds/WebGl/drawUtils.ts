import type * as THREE from "three";
import { ShredEvent } from "../../../api/entities";
import { delayMs } from "../const";
import type { ShredEventTsDeltas, Slot } from "../types";
import type { DrawableSlot } from "../chartUtils";
import {
  shredEventDescPriorities,
  SKIPPED_SLOT_DOT_DURATION_MS,
  SHREDS_PER_FEC_SET,
} from "../const";
import { colors } from "./const";
import {
  updateRectMeshCounts,
  ensureRectCapacity,
  addRectangleToMesh,
  type TsRange,
  type RectMesh,
} from "../../WebGl/webglUtils";

export const tempEventPositions = new Map<
  Exclude<ShredEvent, ShredEvent.slot_complete>,
  { x: number; w: number }
>();

/**
 * Remove a mesh from the scene and return it to the pool for reuse.
 * Does not render; the next draw repaints.
 */
export function releaseMesh<MeshKey>(
  scene: THREE.Scene,
  meshes: Map<MeshKey, RectMesh>,
  availableMeshes: RectMesh[],
  key: MeshKey,
) {
  const slotMesh = meshes.get(key);
  if (!slotMesh) return;
  scene.remove(slotMesh.mesh);
  meshes.delete(key);
  availableMeshes.push(slotMesh);
}

export function drawSlotShreds(
  visibleTsRange: TsRange,
  // visible range + overscan to draw
  drawTsRange: TsRange,
  maxShreds: number,
  orderedSlots: DrawableSlot[],
  getSlotMesh: (drawSlot: DrawableSlot) => {
    isNewMesh: boolean;
    slotMesh: RectMesh;
  },
  camera: THREE.OrthographicCamera,
  // subtract offset from coordinates to make them small for GPU processing
  cameraReferenceMs = 0,
  // redraw an existing mesh only when dirty; new meshes always draw
  isSlotDirty?: (slotNumber: number) => boolean,
): boolean {
  const xChanged = updateCameraXRange(
    [
      visibleTsRange[0] - cameraReferenceMs,
      visibleTsRange[1] - cameraReferenceMs,
    ],
    camera,
  );
  const yChanged = updateCameraYRange(camera, maxShreds);
  const cameraChanged = xChanged || yChanged;

  let anythingDrawn = false;

  for (const drawSlot of orderedSlots) {
    const { slotNumber, slot, isFec, skipped } = drawSlot;
    if (!slot.shreds) continue;

    const { isNewMesh, slotMesh } = getSlotMesh(drawSlot);

    // skip drawing if the mesh already exists and the slot is not dirty
    if (!isNewMesh && !isSlotDirty?.(slotNumber)) {
      continue;
    }

    const drawn = drawSingleSlotShreds(
      slot,
      skipped,
      slotMesh,
      drawTsRange,
      isFec ? SHREDS_PER_FEC_SET : 1,
      cameraReferenceMs,
    );
    anythingDrawn ||= drawn;
  }

  return anythingDrawn || cameraChanged;
}

/**
 * Draw a single slot into the mesh
 */
export function drawSingleSlotShreds(
  slot: Slot,
  isSkipped: boolean,
  slotMesh: RectMesh,
  visibleTsRangeWithOverscan: TsRange,
  rowHeight = 1,
  cameraReferenceMs = 0,
): boolean {
  let anythingDrawn = false;

  let rectangleIdx = 0;
  for (let shredIdx = 0; shredIdx < slot.shreds.length; shredIdx++) {
    const shred = slot.shreds[shredIdx];
    if (!shred) continue;

    tempEventPositions.clear();
    const rectanglesAdded = addEventsForRow({
      tempEventPositions,
      slotMesh,
      startRectangleIdx: rectangleIdx,
      eventTsDeltas: shred,
      slotCompletionTsDelta: slot.completionTsDelta,
      isSlotSkipped: isSkipped,
      y: -(shredIdx + 1) * rowHeight,
      rowHeight,
      visibleTsRange: visibleTsRangeWithOverscan,
      cameraReferenceMs,
    });
    rectangleIdx += rectanglesAdded;
    if (rectanglesAdded) {
      anythingDrawn = true;
    }
  }
  updateRectMeshCounts(slotMesh, rectangleIdx);
  // store offset for easy updates as visible range moves
  slotMesh.referenceX = cameraReferenceMs;
  slotMesh.mesh.position.x = 0;
  return anythingDrawn;
}

export function updateCameraXRange(
  newVisibleTsRange: TsRange,
  camera: THREE.OrthographicCamera,
): boolean {
  if (
    camera.left === newVisibleTsRange[0] &&
    camera.right === newVisibleTsRange[1]
  ) {
    return false;
  }
  camera.left = newVisibleTsRange[0];
  camera.right = newVisibleTsRange[1];
  camera.updateProjectionMatrix();
  return true;
}

export function updateCameraYRange(
  camera: THREE.OrthographicCamera,
  maxShredCount: number,
): boolean {
  if (camera.bottom === -maxShredCount) return false;
  camera.top = 0;
  camera.bottom = -maxShredCount;
  camera.updateProjectionMatrix();
  return true;
}

export interface AddEventsForRowArgs {
  tempEventPositions: Map<
    Exclude<ShredEvent, ShredEvent.slot_complete>,
    { x: number; w: number }
  >;
  slotMesh: RectMesh;
  startRectangleIdx: number;
  eventTsDeltas: ShredEventTsDeltas;
  slotCompletionTsDelta: number | undefined;
  isSlotSkipped: boolean;
  y: number;
  rowHeight: number;
  visibleTsRange: TsRange;
  cameraReferenceMs?: number;
}

/**
 * Draw rows for shreds, with rectangles or dots for events.
 * Each row may represent partial or multiple shreds. Use the row shred priorities to determine
 * which shred to draw.
 */
export function addEventsForRow({
  tempEventPositions,
  slotMesh,
  startRectangleIdx,
  eventTsDeltas,
  slotCompletionTsDelta,
  isSlotSkipped,
  y,
  rowHeight,
  visibleTsRange,
  cameraReferenceMs = 0,
}: AddEventsForRowArgs) {
  let endTs: number =
    slotCompletionTsDelta == null
      ? // event goes to max x
        visibleTsRange[1] + delayMs - cameraReferenceMs
      : slotCompletionTsDelta - cameraReferenceMs;

  // draw events from highest to lowest priority
  for (const eventType of shredEventDescPriorities) {
    const rawStartTs = eventTsDeltas[eventType];
    if (rawStartTs == null) continue;
    const startTs = rawStartTs - cameraReferenceMs;

    // ignore overlapping events with lower priority
    if (startTs >= endTs) continue;

    tempEventPositions.set(eventType, {
      x: startTs,
      w: isSlotSkipped ? SKIPPED_SLOT_DOT_DURATION_MS : endTs - startTs,
    });
    endTs = startTs;
  }

  let rectanglesAdded = 0;
  for (const [eventType, { x, w }] of tempEventPositions.entries()) {
    const color = getShredEventColor(
      isSlotSkipped,
      eventType,
      tempEventPositions,
    );

    // unknown event type, skip it
    if (color == null) continue;

    const rectangleIdx = startRectangleIdx + rectanglesAdded;
    ensureRectCapacity(slotMesh, rectangleIdx + 1);
    addRectangleToMesh(slotMesh, rectangleIdx, x, y, w, rowHeight, color);
    rectanglesAdded++;
  }
  return rectanglesAdded;
}

function getShredEventColor(
  isSlotSkipped: boolean,
  eventType: Exclude<ShredEvent, ShredEvent.slot_complete>,
  eventPositions: Map<
    Exclude<ShredEvent, ShredEvent.slot_complete>,
    { x: number; w: number }
  >,
): [number, number, number] | undefined {
  if (isSlotSkipped) return colors.skipped;
  switch (eventType) {
    case ShredEvent.shred_repair_request: {
      return colors.repairRequested;
    }
    case ShredEvent.shred_received_turbine: {
      return colors.receivedTurbine;
    }
    case ShredEvent.shred_received_repair: {
      return colors.receivedRepair;
    }
    case ShredEvent.shred_replayed: {
      if (eventPositions.has(ShredEvent.shred_received_repair)) {
        return colors.replayedRepair;
      } else if (eventPositions.has(ShredEvent.shred_received_turbine)) {
        return colors.replayedTurbine;
      } else {
        return colors.replayedNothing;
      }
    }
    case ShredEvent.shred_published: {
      return colors.published;
    }
  }
}
