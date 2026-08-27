import type * as THREE from "three";
import { ShredEvent } from "../../../../api/entityEnums";
import {
  delayMs,
  xRangeMs,
} from "../../../../api/worker/cache/shreds/shredsCalc";
import type {
  ShredEventTsDeltas,
  SlotsShredsView,
} from "../../../../api/worker/cache/shreds/types";
import { SHRED_ROW_STRIDE } from "../../../../api/worker/cache/shreds/types";
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

// per-row scratch, reused across calls (a first present fills ~30k rows)
const rowEvents = new Int32Array(shredEventDescPriorities.length);
const rowXs = new Float64Array(shredEventDescPriorities.length);
const rowWs = new Float64Array(shredEventDescPriorities.length);

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
  liveShreds: SlotsShredsView;
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
 * onBeforeRender runs after the mesh fill, before the GL submit: the
 * chart worker posts its label frame there so the main-thread hop
 * overlaps the render (same task, so the canvas commit is unchanged).
 */
export function drawScene(
  objs: SceneObjects,
  prevTimeDiffs: number[],
  visibleTsRangeRef: { current: TsRange | undefined },
  state: SceneState,
  onBeforeRender?: (xRange: XRange) => void,
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
    if (!slot) continue;

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
    if (slot.shreds) {
      for (let shredIdx = 0; shredIdx < slot.shreds.length; shredIdx++) {
        const shred = slot.shreds[shredIdx];
        if (!shred) continue;

        const rectanglesAdded = addEventsForRow(
          slotMesh,
          rectangleIdx,
          shred,
          slot.completionTsDelta,
          isSlotSkipped,
          -shredIdx,
          visibleTsRange,
        );
        rectangleIdx += rectanglesAdded;
        if (rectanglesAdded) {
          anythingDrawn = true;
        }
      }
    } else if (slot.evts) {
      const evts = slot.evts;
      const shredCount = slot.shredCount;
      for (let shredIdx = 0; shredIdx < shredCount; shredIdx++) {
        const rectanglesAdded = addEventsForRowFlat(
          slotMesh,
          rectangleIdx,
          evts,
          shredIdx * SHRED_ROW_STRIDE,
          slot.completionTsDelta,
          isSlotSkipped,
          -shredIdx,
          visibleTsRange,
        );
        rectangleIdx += rectanglesAdded;
        if (rectanglesAdded) {
          anythingDrawn = true;
        }
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

  onBeforeRender?.(xRange);

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

/**
 * Draw rows for shreds, with rectangles or dots for events.
 * Each row may represent partial or multiple shreds. Use the row shred priorities to determine
 * which shred to draw.
 */
function addEventsForRow(
  slotMesh: SlotMesh,
  startRectangleIdx: number,
  eventTsDeltas: ShredEventTsDeltas,
  slotCompletionTsDelta: number | undefined,
  isSlotSkipped: boolean,
  y: number,
  visibleTsRange: TsRange,
) {
  let endTs: number =
    slotCompletionTsDelta == null
      ? // event goes to max x
        visibleTsRange[1] + delayMs
      : slotCompletionTsDelta;

  // draw events from highest to lowest priority
  let count = 0;
  let eventsMask = 0;
  for (let i = 0; i < shredEventDescPriorities.length; i++) {
    const eventType = shredEventDescPriorities[i];
    const startTs = eventTsDeltas[eventType];
    if (startTs == null) continue;

    // ignore overlapping events with lower priority
    if (startTs >= endTs) continue;

    rowEvents[count] = eventType;
    rowXs[count] = startTs;
    rowWs[count] = isSlotSkipped
      ? SKIPPED_SLOT_DOT_DURATION_MS
      : endTs - startTs;
    count++;
    eventsMask |= 1 << eventType;
    endTs = startTs;
  }

  return emitRowRects(
    slotMesh,
    startRectangleIdx,
    count,
    eventsMask,
    isSlotSkipped,
    y,
  );
}

/** addEventsForRow over one flat row (evts[rowBase + event], NaN = none) */
function addEventsForRowFlat(
  slotMesh: SlotMesh,
  startRectangleIdx: number,
  evts: Float64Array,
  rowBase: number,
  slotCompletionTsDelta: number | undefined,
  isSlotSkipped: boolean,
  y: number,
  visibleTsRange: TsRange,
) {
  let endTs: number =
    slotCompletionTsDelta == null
      ? visibleTsRange[1] + delayMs
      : slotCompletionTsDelta;

  let count = 0;
  let eventsMask = 0;
  for (let i = 0; i < shredEventDescPriorities.length; i++) {
    const eventType = shredEventDescPriorities[i];
    const startTs = evts[rowBase + eventType];
    // NaN (no event) and overlapping lower-priority events both fail this
    if (!(startTs < endTs)) continue;

    rowEvents[count] = eventType;
    rowXs[count] = startTs;
    rowWs[count] = isSlotSkipped
      ? SKIPPED_SLOT_DOT_DURATION_MS
      : endTs - startTs;
    count++;
    eventsMask |= 1 << eventType;
    endTs = startTs;
  }

  return emitRowRects(
    slotMesh,
    startRectangleIdx,
    count,
    eventsMask,
    isSlotSkipped,
    y,
  );
}

function emitRowRects(
  slotMesh: SlotMesh,
  startRectangleIdx: number,
  count: number,
  eventsMask: number,
  isSlotSkipped: boolean,
  y: number,
) {
  let rectanglesAdded = 0;
  for (let i = 0; i < count; i++) {
    const eventType = rowEvents[i] as Exclude<
      ShredEvent,
      ShredEvent.slot_complete
    >;
    const color = getShredEventColor(isSlotSkipped, eventType, eventsMask);

    // unknown event type, skip it
    if (color == null) continue;

    const rectangleIdx = startRectangleIdx + rectanglesAdded;
    ensureCapacity(slotMesh, rectangleIdx + 1);
    addRectangleToMesh(slotMesh, rectangleIdx, rowXs[i], y, rowWs[i], 1, color);
    rectanglesAdded++;
  }
  return rectanglesAdded;
}

function getShredEventColor(
  isSlotSkipped: boolean,
  eventType: Exclude<ShredEvent, ShredEvent.slot_complete>,
  eventsMask: number,
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
      if (eventsMask & (1 << ShredEvent.shred_received_repair)) {
        return colors.replayedRepair;
      } else if (eventsMask & (1 << ShredEvent.shred_received_turbine)) {
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
