import type * as THREE from "three";
import { ShredEvent } from "../../../../api/entityEnums";
import {
  delayMs,
  xRangeMs,
} from "../../../../api/worker/cache/shreds/shredsCalc";
import type {
  ShredEventTsDeltas,
  SlotsShreds,
} from "../../../../api/worker/cache/shreds/types";
import { shredEventDescPriorities } from "../const";
import type { SlotMesh, WebglResources } from "../../../WebGl/webglUtils";
import {
  createSlotMesh,
  updateSlotMeshCounts,
  ensureCapacity,
  addRectangleToMesh,
  convertToWebGlColor,
} from "../../../WebGl/webglUtils";
import {
  shredPublishedColor,
  shredReceivedRepairColor,
  shredReceivedTurbineColor,
  shredRepairRequestedColor,
  shredReplayedNothingColor,
  shredReplayedRepairColor,
  shredReplayedTurbineColor,
  shredSkippedColor,
} from "../../../../colors";
import { getAdjustedNow, getDrawInfo, type XRange } from "../utils";

/**
 * DOM- and jotai-free scene drawing shared by the main-thread chart
 * (chartUtils.ts) and the OffscreenCanvas chart worker (offscreen/).
 */

const SKIPPED_SLOT_DOT_DURATION_MS = 10;

const tempEventPositions = new Map<
  Exclude<ShredEvent, ShredEvent.slot_complete>,
  { x: number; w: number }
>();

export type TsRange = [startTs: number, endTs: number];

/** Renderer world shared by main-thread RendererObj and the chart worker */
export type SceneObjects = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  meshes: Map<number, SlotMesh>;
  availableMeshes: SlotMesh[];
  // resources shared by this renderer's slot meshes
  resources: WebglResources;
};

const colors = {
  skipped: convertToWebGlColor(shredSkippedColor),
  repairRequested: convertToWebGlColor(shredRepairRequestedColor),
  receivedTurbine: convertToWebGlColor(shredReceivedTurbineColor),
  receivedRepair: convertToWebGlColor(shredReceivedRepairColor),
  replayedRepair: convertToWebGlColor(shredReplayedRepairColor),
  replayedTurbine: convertToWebGlColor(shredReplayedTurbineColor),
  replayedNothing: convertToWebGlColor(shredReplayedNothingColor),
  published: convertToWebGlColor(shredPublishedColor),
};

export interface SceneState {
  liveShreds: SlotsShreds;
  slotRange: { min: number; max: number };
  minCompletedSlot: number;
  skippedSlotsCluster: Set<number>;
  serverTimeMs: number;
  scale: number;
  /** slots >= this need redrawing; undefined redraws everything */
  minDirtySlot: number | undefined;
  cssRange: [min: number, max: number];
  forceDraw: boolean;
}

/**
 * Fill slot meshes and render. Returns the xRange used, for label layout.
 */
export function drawScene(
  objs: SceneObjects,
  prevTimeDiffs: number[],
  visibleTsRangeRef: { current: TsRange | undefined },
  state: SceneState,
): XRange {
  const {
    liveShreds,
    slotRange,
    minCompletedSlot,
    skippedSlotsCluster,
    serverTimeMs,
    scale,
    minDirtySlot,
    cssRange,
    forceDraw,
  } = state;

  const adjustedNow = getAdjustedNow(serverTimeMs, prevTimeDiffs);
  const maxReferenceTs = adjustedNow - liveShreds.referenceTs;

  const visibleTsRange: TsRange = [
    maxReferenceTs - xRangeMs * scale,
    maxReferenceTs,
  ];

  // for now, use this xRange to be able to reuse the canvas helper functions
  const xRange: XRange = {
    minDeltaTs: visibleTsRange[0],
    maxDeltaTs: visibleTsRange[1],
    minCanvasPos: 0,
    maxCanvasPos: 0,
    minCssPos: cssRange[0],
    maxCssPos: cssRange[1],
  };

  const minSlot = Math.max(slotRange.min, minCompletedSlot);
  const maxSlot = slotRange.max;

  const { maxShreds, orderedSlotNumbers } = getDrawInfo(
    minSlot,
    maxSlot,
    liveShreds,
    xRange,
  );

  const cameraChanged = updateVisibleXRange(
    visibleTsRangeRef,
    visibleTsRange,
    objs.camera,
    maxShreds,
  );

  let anythingDrawn = false;

  for (const slotNumber of orderedSlotNumbers) {
    const slot = liveShreds.slots.get(slotNumber);
    if (!slot?.shreds) continue;

    let slotMesh = objs.meshes.get(slotNumber);
    const isNewMesh = !slotMesh;
    if (!slotMesh) {
      const lastMesh = objs.availableMeshes.pop();
      slotMesh = lastMesh ?? createSlotMesh(objs.resources);
      objs.meshes.set(slotNumber, slotMesh);
      objs.scene.add(slotMesh.mesh);
    }

    // skip drawing if not dirty slot
    if (!isNewMesh && minDirtySlot != null && slotNumber < minDirtySlot) {
      continue;
    }

    const isSlotSkipped = skippedSlotsCluster.has(slotNumber);

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
        isSlotSkipped,
        y: -shredIdx,
        visibleTsRange,
      });
      rectangleIdx += rectanglesAdded;
      if (rectanglesAdded) {
        anythingDrawn = true;
      }
    }
    updateSlotMeshCounts(slotMesh, rectangleIdx);
  }

  const orderedSet = new Set(orderedSlotNumbers);
  for (const [slotNumber, slotMesh] of objs.meshes.entries()) {
    if (!orderedSet.has(slotNumber)) {
      objs.scene.remove(slotMesh.mesh);
      objs.meshes.delete(slotNumber);
      objs.availableMeshes.push(slotMesh);
    }
  }

  if (forceDraw || anythingDrawn || cameraChanged) {
    objs.renderer.render(objs.scene, objs.camera);
  }

  return xRange;
}

function updateVisibleXRange(
  visibleTsRangeRef: { current: TsRange | undefined },
  newVisibleTsRange: TsRange,
  camera: THREE.OrthographicCamera,
  maxShredCount: number,
): boolean {
  const prev = visibleTsRangeRef.current;
  if (
    prev &&
    prev[0] === newVisibleTsRange[0] &&
    prev[1] === newVisibleTsRange[1] &&
    camera.bottom === -maxShredCount
  ) {
    return false;
  }
  visibleTsRangeRef.current = newVisibleTsRange;
  camera.left = newVisibleTsRange[0];
  camera.right = newVisibleTsRange[1];
  camera.top = 0;
  camera.bottom = -maxShredCount;
  camera.updateProjectionMatrix();
  return true;
}

interface AddEventsForRowArgs {
  tempEventPositions: Map<
    Exclude<ShredEvent, ShredEvent.slot_complete>,
    { x: number; w: number }
  >;
  slotMesh: SlotMesh;
  startRectangleIdx: number;
  eventTsDeltas: ShredEventTsDeltas;
  slotCompletionTsDelta: number | undefined;
  isSlotSkipped: boolean;
  y: number;
  visibleTsRange: TsRange;
}

/**
 * Draw rows for shreds, with rectangles or dots for events.
 * Each row may represent partial or multiple shreds. Use the row shred priorities to determine
 * which shred to draw.
 */
function addEventsForRow({
  tempEventPositions,
  slotMesh,
  startRectangleIdx,
  eventTsDeltas,
  slotCompletionTsDelta,
  isSlotSkipped,
  y,
  visibleTsRange,
}: AddEventsForRowArgs) {
  let endTs: number =
    slotCompletionTsDelta == null
      ? // event goes to max x
        visibleTsRange[1] + delayMs
      : slotCompletionTsDelta;

  // draw events from highest to lowest priority
  for (const eventType of shredEventDescPriorities) {
    const startTs = eventTsDeltas[eventType];
    if (startTs == null) continue;

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
    ensureCapacity(slotMesh, rectangleIdx + 1);
    addRectangleToMesh(slotMesh, rectangleIdx, x, y, w, 1, color);
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
