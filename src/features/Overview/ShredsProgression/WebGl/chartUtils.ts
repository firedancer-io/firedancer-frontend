import * as THREE from "three";
import type { MutableRefObject } from "react";
import { ShredEvent } from "../../../../api/entities";
import {
  delayMs,
  xRangeMs,
} from "../../../../api/worker/cache/shreds/shredsCalc";
import type { ShredEventTsDeltas } from "../../../../api/worker/cache/shreds/types";
import { serverTimeMsAtom, skippedClusterSlotsAtom } from "../../../../atoms";
import { showStartupProgressAtom } from "../../../StartupProgress/atoms";
import {
  liveShredsDataAtom,
  liveShredsPostStartupRangeAtom,
  minDirtySlotByChartAtom,
  isWebgl2SupportedAtom,
} from "../atoms";
import { shredEventDescPriorities } from "../const";
import { updateLabels } from "../shredsProgressionPlugin";
import type { SlotMesh } from "../webglUtils";
import {
  createSlotMesh,
  updateSlotMeshCounts,
  ensureCapacity,
  addRectangleToMesh,
  convertToWebGlColor,
} from "../webglUtils";
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
import { getDefaultStore } from "jotai";
import {
  getAdjustedNow,
  getDrawInfo,
  type LabelsState,
  type XRange,
} from "../utils";

const store = getDefaultStore();

const SKIPPED_SLOT_DOT_DURATION_MS = 10;
const msPerDay = 24 * 60 * 60 * 1000;

export type RendererObj = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  meshes: Map<number, SlotMesh>;
  availableMeshes: SlotMesh[];
  worldTsRange: TsRange;
};

const MAX_PIXEL_RATIO = 2;

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

/**
 * Set up renderer world, setup according to shred reference ts
 */
export function setUpRenderer(canvasWidth: number, canvasHeight: number) {
  const serverTimeMs = store.get(serverTimeMsAtom);
  if (serverTimeMs == null) return;

  const referenceTs = store.get(liveShredsDataAtom)?.slotsShreds?.referenceTs;
  if (referenceTs == null) return;

  const worldStartTs = serverTimeMs - xRangeMs - delayMs - referenceTs;
  const worldEndTs = worldStartTs + 365 * msPerDay;
  // store world range for future pause / pan
  const worldTsRange: TsRange = [worldStartTs, worldEndTs];

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 0, 0, 0, 0.5, 10);
  camera.position.z = 1;

  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setSize(canvasWidth, canvasHeight);
    renderer.setClearColor(0x000000, 0);

    const meshes = new Map<number, SlotMesh>();
    const availableMeshes: SlotMesh[] = [];
    renderer.render(scene, camera);

    return {
      renderer,
      camera,
      scene,
      meshes,
      availableMeshes,
      worldTsRange,
    };
  } catch {
    // context creation can still fail despite the probe (e.g. too many live
    // contexts, driver crash). Mark as unsupported to trigger fallback to canvas chart
    store.set(isWebgl2SupportedAtom, false);
  }
}

export function draw(
  chartId: string,
  prevTimeDiffsRef: MutableRefObject<number[]>,
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
  const {
    slotsShreds: liveShreds,
    range: slotRange,
    minCompletedSlot,
  } = store.get(liveShredsDataAtom) ?? {};
  const skippedSlotsCluster = store.get(skippedClusterSlotsAtom);
  const rangeAfterStartup = store.get(liveShredsPostStartupRangeAtom);
  const serverTimeMs = store.get(serverTimeMsAtom);

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
    serverTimeMs == null
  )
    return;

  const adjustedNow = getAdjustedNow(serverTimeMs, prevTimeDiffsRef.current);
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

  const minSlot = Math.max(slotRange.min, minCompletedSlot ?? slotRange.min);
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
    rendererObj.camera,
    maxShreds,
  );

  const minDirtySlot = store.get(minDirtySlotByChartAtom).get(chartId);
  const tempEventPositions = new Map<
    Exclude<ShredEvent, ShredEvent.slot_complete>,
    { x: number; w: number }
  >();

  for (const slotNumber of orderedSlotNumbers) {
    const slot = liveShreds.slots.get(slotNumber);
    if (!slot?.shreds) continue;

    let slotMesh = rendererObj.meshes.get(slotNumber);
    const isNewMesh = !slotMesh;
    if (!slotMesh) {
      const lastMesh = rendererObj.availableMeshes.pop();
      slotMesh = lastMesh ?? createSlotMesh();
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

  const anythingDrawn = minDirtySlot != null;

  if (forceDraw || anythingDrawn || cameraChanged) {
    rendererObj.renderer.render(rendererObj.scene, rendererObj.camera);
  }

  const { prevLabels, tempNewLabels } = labelsRef.current;
  updateLabels(
    rangeAfterStartup,
    liveShreds.slots,
    skippedSlotsCluster,
    xRange,
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

export type TsRange = [startTs: number, endTs: number];

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
  tempEventPositions.clear();

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
