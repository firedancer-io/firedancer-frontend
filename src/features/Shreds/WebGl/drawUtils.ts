import type * as THREE from "three";
import type { MutableRefObject } from "react";
import { ShredEvent } from "../../../api/entities";
import { delayMs, xRangeMs } from "../../../api/worker/cache/shreds/shredsCalc";
import type { ShredEventTsDeltas } from "../../../api/worker/cache/shreds/types";
import { smoothedNowMsAtom, skippedClusterSlotsAtom } from "../../../atoms";
import { showStartupProgressAtom } from "../../StartupProgress/atoms";
import {
  shredsAtoms,
  liveShredsPostStartupRangeAtom,
} from "../../Overview/ShredsProgression/atoms";
import { minDirtySlotByChartAtom } from "../atoms";
import type { RendererObj, TsRange } from "../types";
import {
  shredEventDescPriorities,
  SKIPPED_SLOT_DOT_DURATION_MS,
} from "../const";
import { colors } from "./const";
import { updateLabels } from "../../Overview/ShredsProgression/shredsProgressionPlugin";
import { getDrawInfo } from "../chartUtils";
import type { SlotMesh } from "../../WebGl/webglUtils";
import {
  createSlotMesh,
  updateSlotMeshCounts,
  ensureCapacity,
  addRectangleToMesh,
} from "../../WebGl/webglUtils";
import { getDefaultStore } from "jotai";
import {
  getDelayedNow,
  type LabelsState,
} from "../../Overview/ShredsProgression/utils";

const store = getDefaultStore();

const tempEventPositions = new Map<
  Exclude<ShredEvent, ShredEvent.slot_complete>,
  { x: number; w: number }
>();

export function draw(
  chartId: string,
  rendererObj: RendererObj,
  visibleTsRangeRef: MutableRefObject<TsRange | undefined>,
  labelsRef: MutableRefObject<{
    prevLabels: LabelsState;
    tempNewLabels: LabelsState;
  }>,
  scale: number,
  forceDraw: boolean,
  cssRange: [min: number, max: number],
) {
  const liveShreds = store.get(shredsAtoms.slotsShreds);
  const slotRange = store.get(shredsAtoms.range);
  const minCompletedSlot = store.get(shredsAtoms.minCompletedSlot);
  const skippedSlotsCluster = store.get(skippedClusterSlotsAtom);
  const rangeAfterStartup = store.get(liveShredsPostStartupRangeAtom);
  const smoothedNow = store.get(smoothedNowMsAtom);

  // if startup is running, prevent drawing non-startup screen chart
  // Sometimes we've missed the completion event for the first slots
  // depending on connection time. Ignore those slots, and only draw slots
  // from min completed.
  if (
    !liveShreds ||
    !slotRange ||
    store.get(showStartupProgressAtom) ||
    minCompletedSlot == null ||
    !rangeAfterStartup ||
    smoothedNow == null
  )
    return;

  const delayedNow = getDelayedNow(smoothedNow);
  const maxReferenceTs = delayedNow - liveShreds.referenceTs;

  const visibleTsRange: TsRange = [
    maxReferenceTs - xRangeMs * scale,
    maxReferenceTs,
  ];

  const minSlot = Math.max(slotRange.min, minCompletedSlot ?? slotRange.min);
  const maxSlot = slotRange.max;

  const { maxShreds, orderedSlotNumbers } = getDrawInfo(
    minSlot,
    maxSlot,
    liveShreds,
    visibleTsRange,
  );

  const cameraChanged = updateVisibleXRange(
    visibleTsRangeRef,
    visibleTsRange,
    rendererObj.camera,
    maxShreds,
  );

  let anythingDrawn = false;
  const minDirtySlot = store.get(minDirtySlotByChartAtom).get(chartId);

  for (const slotNumber of orderedSlotNumbers) {
    const slot = liveShreds.slots.get(slotNumber);
    if (!slot?.shreds) continue;

    let slotMesh = rendererObj.meshes.get(slotNumber);
    const isNewMesh = !slotMesh;
    if (!slotMesh) {
      const lastMesh = rendererObj.availableMeshes.pop();
      slotMesh = lastMesh ?? createSlotMesh(rendererObj.resources);
      rendererObj.meshes.set(slotNumber, slotMesh);
      rendererObj.scene.add(slotMesh.mesh);
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

  store.set(minDirtySlotByChartAtom, (prev) => {
    prev.set(chartId, Infinity);
    return prev;
  });

  const orderedSet = new Set(orderedSlotNumbers);
  for (const [slotNumber, slotMesh] of rendererObj.meshes.entries()) {
    if (!orderedSet.has(slotNumber)) {
      rendererObj.scene.remove(slotMesh.mesh);
      rendererObj.meshes.delete(slotNumber);
      rendererObj.availableMeshes.push(slotMesh);
    }
  }

  if (forceDraw || anythingDrawn || cameraChanged) {
    rendererObj.renderer.render(rendererObj.scene, rendererObj.camera);
  }

  const { prevLabels, tempNewLabels } = labelsRef.current;
  updateLabels(
    rangeAfterStartup,
    liveShreds.slots,
    skippedSlotsCluster,
    visibleTsRange,
    cssRange,
    prevLabels,
    tempNewLabels,
  );
  // switch map for reuse, don't create new maps each render
  labelsRef.current = {
    prevLabels: tempNewLabels,
    tempNewLabels: prevLabels,
  };
  prevLabels.groups.clear();
  prevLabels.slots.clear();
}

function updateVisibleXRange(
  visibleTsRangeRef: MutableRefObject<TsRange | undefined>,
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
