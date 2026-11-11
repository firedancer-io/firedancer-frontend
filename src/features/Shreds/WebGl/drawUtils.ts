import type * as THREE from "three";
import { ShredEvent } from "../../../api/entities";
import type { ShredEventTsDeltas, Slot } from "../types";
import type { DrawableSlot } from "../chartUtils";
import {
  shredEventDescPriorities,
  SKIPPED_SLOT_DOT_DURATION_MS,
  SHREDS_PER_FEC_SET,
  delayMs as defaultDelayMs,
} from "../const";
import { colors } from "./const";
import {
  updateRectMeshCounts,
  ensureRectCapacity,
  addRectangleToMesh,
  type TsRange,
  type RectMesh,
  type RgbColor,
} from "../../WebGl/webglUtils";

const EDGE_MARK_COLOR: RgbColor = [1, 1, 1];

interface EdgeMeshCount {
  mesh: RectMesh;
  count: number;
}

export const tempEventPositions = new Map<
  Exclude<ShredEvent, ShredEvent.slot_complete>,
  { x: number; w: number }
>();

export function getIncompleteSlotRightEdge(
  drawRangeEndMs: number,
  delayMs: number,
): number {
  return drawRangeEndMs + delayMs;
}

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

// for renderers whose slot/edge meshes each own a material
export function disposeSlotMaterials<MeshKey>(collections: {
  meshes: Map<MeshKey, RectMesh>;
  availableMeshes: RectMesh[];
  edgeMeshes: Map<MeshKey, RectMesh>;
  availableEdgeMeshes: RectMesh[];
}) {
  for (const slotMesh of [
    ...collections.meshes.values(),
    ...collections.availableMeshes,
    ...collections.edgeMeshes.values(),
    ...collections.availableEdgeMeshes,
  ]) {
    (slotMesh.mesh.material as THREE.RawShaderMaterial).dispose();
  }
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
  // optionally add a left-edge mark on each row
  getEdgeMesh?: (drawSlot: DrawableSlot) => RectMesh,
  // ms an incomplete slot extends past the draw range's right edge
  delayMs = defaultDelayMs,
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
      getEdgeMesh?.(drawSlot),
      delayMs,
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
  // optionally add a left-edge mark on each row
  edgeMesh?: RectMesh,
  delayMs = defaultDelayMs,
): boolean {
  let anythingDrawn = false;

  const edgeMeshCount: EdgeMeshCount | undefined = edgeMesh
    ? { mesh: edgeMesh, count: 0 }
    : undefined;

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
      edgeMeshCount,
      delayMs,
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

  if (edgeMeshCount) {
    updateRectMeshCounts(edgeMeshCount.mesh, edgeMeshCount.count);
    edgeMeshCount.mesh.referenceX = cameraReferenceMs;
    edgeMeshCount.mesh.mesh.position.x = 0;
  }
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
  // optionally add a left-edge mark on each row
  edgeMeshCount?: EdgeMeshCount;
  /** ms an incomplete slot extends past the draw range's right edge */
  delayMs?: number;
  colorOverride?: RgbColor;
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
  edgeMeshCount,
  delayMs = defaultDelayMs,
  colorOverride,
}: AddEventsForRowArgs) {
  let endTs: number =
    slotCompletionTsDelta == null
      ? // event goes to max x
        getIncompleteSlotRightEdge(visibleTsRange[1], delayMs) -
        cameraReferenceMs
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
  // left x of the earliest drawn event rectangle in this row, for the edge mark
  let firstEventX = Infinity;
  for (const [eventType, { x, w }] of tempEventPositions.entries()) {
    const color =
      colorOverride ??
      getShredEventColor(isSlotSkipped, eventType, tempEventPositions);

    // unknown event type, skip it
    if (color == null) continue;

    const rectangleIdx = startRectangleIdx + rectanglesAdded;
    ensureRectCapacity(slotMesh, rectangleIdx + 1);
    addRectangleToMesh(slotMesh, rectangleIdx, x, y, w, rowHeight, color);
    rectanglesAdded++;

    if (x < firstEventX) {
      firstEventX = x;
    }
  }

  // add edge mark for non-skipped slots
  if (edgeMeshCount && !isSlotSkipped && rectanglesAdded > 0) {
    ensureRectCapacity(edgeMeshCount.mesh, edgeMeshCount.count + 1);
    // width is ignored by the edge shader; height matches the event row
    addRectangleToMesh(
      edgeMeshCount.mesh,
      edgeMeshCount.count,
      firstEventX,
      y,
      0,
      rowHeight,
      EDGE_MARK_COLOR,
    );
    edgeMeshCount.count++;
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
        return colors.reconstructed;
      }
    }
    case ShredEvent.shred_published: {
      return colors.published;
    }
  }
}
