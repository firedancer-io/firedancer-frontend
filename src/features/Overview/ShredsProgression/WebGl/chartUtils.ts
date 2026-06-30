import * as THREE from "three";
import { sum } from "lodash";
import type { MutableRefObject } from "react";
import { MAX_SHRED_EVENT_IDX, ShredEvent } from "../../../../api/entities";
import {
  delayMs,
  xRangeMs,
} from "../../../../api/worker/cache/shreds/shredsCalc";
import type {
  SlotsShreds,
  ShredEventTsDeltas,
} from "../../../../api/worker/cache/shreds/types";
import { serverTimeMsAtom, skippedClusterSlotsAtom } from "../../../../atoms";
import { showStartupProgressAtom } from "../../../StartupProgress/atoms";
import {
  liveShredsDataAtom,
  liveShredsPostStartupRangeAtom,
  minDirtySlotByChartAtom,
} from "../atoms";
import { shredEventDescPriorities } from "../const";
import type { SlotMesh } from "../webglUtils";
import {
  createSlotMesh,
  flushSlotMesh,
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

export type RendererObj = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  meshes: Map<number, SlotMesh>;
  availableMeshes: SlotMesh[];
  worldTsRange: TsRange;
};

const store = getDefaultStore();

export const MAX_SHREDS_PER_SLOT = 32_768;
export const MAX_EVENTS_PER_SLOT =
  (MAX_SHRED_EVENT_IDX + 1) * MAX_SHREDS_PER_SLOT;

const msPerDay = 24 * 60 * 60 * 1000;

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
export function setUpRenderer(
  isOnStartupScreen: boolean,
  canvasWidth: number,
  canvasHeight: number,
) {
  const serverTimeMs = store.get(serverTimeMsAtom);
  if (serverTimeMs == null) return;

  const referenceTs = store.get(liveShredsDataAtom)?.slotsShreds?.referenceTs;
  if (referenceTs == null) return;

  const worldStartTs = serverTimeMs - xRangeMs - delayMs - referenceTs;
  const worldEndTs = worldStartTs + 365 * msPerDay;
  const worldTsRange: TsRange = [worldStartTs, worldEndTs];

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 0, 0, 0, 0.5, 10);
  camera.position.z = 1;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
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
}

export function draw(
  chartId: string,
  isOnStartupScreen: boolean,
  prevTimeDiffsRef: MutableRefObject<number[]>,
  rendererObj: RendererObj,
  visibleTsRangeRef: MutableRefObject<TsRange | undefined>,
  scale: number,
  forceDraw: boolean,
) {
  const {
    slotsShreds: liveShreds,
    range: slotRange,
    minCompletedSlot,
  } = store.get(liveShredsDataAtom) ?? {};
  const skippedSlotsCluster = store.get(skippedClusterSlotsAtom);
  const rangeAfterStartup = store.get(liveShredsPostStartupRangeAtom);

  if (!liveShreds || !slotRange) {
    return;
  }

  if (!isOnStartupScreen) {
    // if startup is running, prevent drawing non-startup screen chart
    if (store.get(showStartupProgressAtom)) return;
    // Sometimes we've missed the completion event for the first slots
    // depending on connection time. Ignore those slots, and only draw slots
    // from min completed.
    if (minCompletedSlot == null) return;

    if (!rangeAfterStartup) return;
  }

  const adjustedNow = getAdjustedNow(prevTimeDiffsRef.current);
  const maxReferenceTs = adjustedNow - liveShreds.referenceTs;

  const visibleTsRange: TsRange = [
    maxReferenceTs - xRangeMs * scale,
    maxReferenceTs,
  ];

  const minSlot = isOnStartupScreen
    ? slotRange.min
    : Math.max(slotRange.min, minCompletedSlot ?? slotRange.min);
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
    isOnStartupScreen ? maxShreds * 3 : maxShreds,
  );

  //   const getYOffset = isOnStartupScreen
  //     ? (eventType: Exclude<ShredEvent, ShredEvent.slot_complete>) => {
  //         switch (eventType) {
  //           case ShredEvent.shred_received_turbine:
  //           case ShredEvent.shred_published: {
  //             return 0;
  //           }
  //           case ShredEvent.shred_repair_request:
  //           case ShredEvent.shred_received_repair: {
  //             return maxY;
  //           }
  //           case ShredEvent.shred_replayed: {
  //             return maxY * 2;
  //           }
  //         }
  //       }
  //     : undefined;

  const minDirty = store.get(minDirtySlotByChartAtom).get(chartId);
  const tempEventPositions = new Map<
    Exclude<ShredEvent, ShredEvent.slot_complete>,
    { x: number; w: number }
  >();

  let drawn = 0;
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

    const minDirtyIdx = isNewMesh
      ? 0 // new mesh — draw everything
      : minDirty == null
        ? null // nothing dirty since last draw — skip
        : slotNumber < minDirty.slot
          ? null // slot is clean — skip
          : slotNumber === minDirty.slot
            ? minDirty.idx // partially dirty — draw from this shred index
            : 0; // slot is at or past the dirty boundary — redraw all

    // if (minDirty && slotNumber === minDirty.slot) {
    //   console.log(
    //     `slot ${slotNumber}: minDirtyIdx=${minDirtyIdx} totalShreds=${slot.shreds.length}`,
    //   );
    // }

    if (minDirtyIdx === null) continue;

    const isSlotSkipped = skippedSlotsCluster.has(slotNumber);

    let rectangleIdx = 0;
    for (let shredIdx = 0; shredIdx < slot.shreds.length; shredIdx++) {
      const shred = slot.shreds[shredIdx];
      if (!shred) continue;

      // // for shreds before the dirty idx, reuse the existing rectangle count
      // if (shredIdx < minDirtyIdx) {
      //   rectangleIdx += countEventsForShred(shred);
      //   continue;
      // }

      const rectanglesAdded = addEventsForRow({
        tempEventPositions,
        slotMesh,
        startRectangleIdx: rectangleIdx,
        eventTsDeltas: shred,
        slotCompletionTsDelta: slot.completionTsDelta,
        isSlotSkipped,
        drawOnlyDots: isOnStartupScreen,
        y: -shredIdx,
        visibleTsRange,
      });
      rectangleIdx += rectanglesAdded;
      drawn += rectanglesAdded;
    }
    flushSlotMesh(slotMesh, rectangleIdx);
  }

  // console.log("drawn", drawn);

  const orderedSet = new Set(orderedSlotNumbers);
  for (const [slotNumber, slotMesh] of rendererObj.meshes.entries()) {
    if (!orderedSet.has(slotNumber)) {
      rendererObj.scene.remove(slotMesh.mesh);
      rendererObj.meshes.delete(slotNumber);
      rendererObj.availableMeshes.push(slotMesh);
    }
  }

  const anythingDrawn = minDirty != null;

  store.set(minDirtySlotByChartAtom, (prev) => {
    prev.set(chartId, null);
    return prev;
  });

  if (forceDraw || anythingDrawn || cameraChanged) {
    rendererObj.renderer.render(rendererObj.scene, rendererObj.camera);
  }
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

/**
 * Get timestamp for "now", which is the ts at x = 0 (right-most in chart).
 * "now" is adjusted using an avg diff of server time and real now ts to smooth out server msg delays.
 * We also delay "now" by one data update interval to prevent instability of right-most data.
 */
function getAdjustedNow(prevTimeDiffs: number[]) {
  // Use server time for chart axis
  // Use a rolling avg of the server time and client now diff.
  // If we get ws messages buffered and it results in a temporary high
  // diff, shred still move smoothly by using the avg
  const now = Date.now();
  const serverTimeMs = store.get(serverTimeMsAtom);

  if (serverTimeMs) {
    const timeDiff = now - serverTimeMs;
    prevTimeDiffs.push(timeDiff);
    while (prevTimeDiffs.length > 100) {
      prevTimeDiffs.shift();
    }
  }

  const timeDiffAvg = prevTimeDiffs.length
    ? sum(prevTimeDiffs) / prevTimeDiffs.length
    : undefined;
  const adjustedTimeMs =
    timeDiffAvg == null ? (serverTimeMs ?? now) : now - timeDiffAvg;
  return adjustedTimeMs - delayMs;
}

/**
 * Get slots in draw order
 * and max shreds count per slot for scaling
 */
function getDrawInfo(
  minSlotNumber: number,
  maxSlotNumber: number,
  liveShreds: SlotsShreds,
  visibleTsRange: TsRange,
) {
  const orderedSlotNumbers = [];
  let maxShreds = 0;

  for (
    let slotNumber = minSlotNumber;
    slotNumber <= maxSlotNumber;
    slotNumber++
  ) {
    const slot = liveShreds.slots.get(slotNumber);
    if (!slot?.shreds.length || slot.minEventTsDelta == null) {
      // slot has no events
      continue;
    }

    if (slot.minEventTsDelta > visibleTsRange[1]) {
      // slot started after chart max X
      continue;
    }

    if (
      slot.completionTsDelta != null &&
      slot.completionTsDelta < visibleTsRange[0]
    ) {
      // slot completed before chart min X
      continue;
    }

    orderedSlotNumbers.push(slotNumber);
    maxShreds = Math.max(maxShreds, slot.shreds.length);
  }

  return {
    maxShreds,
    orderedSlotNumbers,
  };
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
  drawOnlyDots: boolean;
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
  drawOnlyDots,
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

    // const yOffset = getYOffset?.(eventType) ?? 0;

    tempEventPositions.set(eventType, {
      x: startTs,
      w: drawOnlyDots || isSlotSkipped ? 1 : endTs - startTs,
    });
    endTs = startTs;
  }

  let i = 0;
  for (const [eventType, { x, w }] of tempEventPositions.entries()) {
    const color = getShredEventColor(
      isSlotSkipped,
      eventType,
      tempEventPositions,
    );
    const rectangleIdx = startRectangleIdx + i;
    ensureCapacity(slotMesh, rectangleIdx + 1);
    addRectangleToMesh(slotMesh, rectangleIdx, x, y, w, 1, color);
    i++;
  }
  return tempEventPositions.size;
}

function countEventsForShred(eventTsDeltas: ShredEventTsDeltas): number {
  let count = 0;
  for (const eventType of shredEventDescPriorities) {
    if (eventTsDeltas[eventType] != null) count++;
  }
  return count;
}

function getShredEventColor(
  isSlotSkipped: boolean,
  eventType: Exclude<ShredEvent, ShredEvent.slot_complete>,
  eventPositions: Map<
    Exclude<ShredEvent, ShredEvent.slot_complete>,
    { x: number; w: number }
  >,
) {
  // return colors.replayedTurbine;
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
