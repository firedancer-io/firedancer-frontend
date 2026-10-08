import * as THREE from "three";
import type { MutableRefObject } from "react";
import { ShredEvent, SHRED_EVENT_TYPES_COUNT } from "../../../../api/entities";
import {
  delayMs,
  xRangeMs,
} from "../../../../api/worker/cache/shreds/shredsCalc";
import type { ShredEventTsDeltas } from "../../../../api/worker/cache/shreds/types";
import { smoothedNowMsAtom, skippedClusterSlotsAtom } from "../../../../atoms";
import { showStartupProgressAtom } from "../../../StartupProgress/atoms";
import {
  liveShredsDataAtom,
  liveShredsPostStartupRangeAtom,
  minDirtySlotByChartAtom,
  type LiveShredsData,
} from "../atoms";
import { shredEventDescPriorities } from "../const";
import { updateLabels } from "../shredsProgressionPlugin";
import type {
  RectMesh,
  TsRange,
  RectResources,
} from "../../../WebGl/webglUtils";
import {
  createRectMesh,
  updateRectMeshCounts,
  ensureRectCapacity,
  addRectangleToMesh,
  convertToWebGlColor,
  createRectResources,
  disposeRectResources,
  createRenderer,
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
import { getDefaultStore } from "jotai";
import {
  getDelayedNow,
  getDrawInfo,
  type LabelsState,
  type XRange,
} from "../utils";
import { MAX_WEBGL_PX_RATIO, msPerDay } from "../../../../consts";
import type { ContextHelpers } from "../../../WebGl/useWebGlEventHandlers";

const store = getDefaultStore();

// 700 shreds, all events except completion could have a rectangle
const SHRED_MESH_CAPACITY = 700 * (SHRED_EVENT_TYPES_COUNT - 1);
export const SHREDS_OPACITY = 0.8;
const SKIPPED_SLOT_DOT_DURATION_MS = 10;

const tempEventPositions = new Map<
  Exclude<ShredEvent, ShredEvent.slot_complete>,
  { x: number; w: number }
>();

export interface NonAggRendererResources {
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  // keyed by slot number (Overview) or a granularity-qualified key (Replay
  // non-agg shared pool, so a slot's shred and fec meshes coexist). See
  // meshKeyForSlot in drawShreds.
  meshes: Map<string | number, RectMesh>;
  availableMeshes: RectMesh[];
  // resources shared by this renderer's slot meshes
  resources: RectResources;
}

export type RendererObj = NonAggRendererResources & {
  renderer: THREE.WebGLRenderer;
  worldTsRange: TsRange;
  cleanUpRenderer: () => void;
};

export const colors = {
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
  canvasWidth: number,
  canvasHeight: number,
  setUpContextListeners: ContextHelpers["setUpContextListeners"],
  getWasContextLost: ContextHelpers["getWasContextLost"],
): RendererObj | undefined {
  const smoothedNowMs = store.get(smoothedNowMsAtom);
  if (smoothedNowMs == null) return;

  const delayedNow = getDelayedNow(smoothedNowMs);

  const referenceTs = store.get(liveShredsDataAtom)?.slotsShreds?.referenceTs;
  if (referenceTs == null) return;

  const worldStartTs = delayedNow - xRangeMs - referenceTs;
  const worldEndTs = worldStartTs + 365 * msPerDay;
  // store world range for future pause / pan
  const worldTsRange: TsRange = [worldStartTs, worldEndTs];

  const rendererObj = createRenderer(
    canvasWidth,
    canvasHeight,
    MAX_WEBGL_PX_RATIO,
    setUpContextListeners,
    getWasContextLost,
  );
  if (!rendererObj) return;

  const { renderer, cleanUpRenderer: cleanUpRendererOnly } = rendererObj;
  const {
    camera,
    scene,
    meshes,
    availableMeshes,
    resources,
    cleanUpResources,
  } = setUpRendererResources(getWasContextLost);

  // render once so the context is initialized before context listeners run
  renderer.render(scene, camera);

  const cleanUpRenderer = () => {
    cleanUpResources();
    cleanUpRendererOnly();
  };

  return {
    renderer,
    camera,
    scene,
    meshes,
    availableMeshes,
    worldTsRange,
    resources,
    cleanUpRenderer,
  };
}

export function setUpRendererResources(
  getWasContextLost: ContextHelpers["getWasContextLost"],
) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 0, 0, 0, 0.5, 10);
  camera.position.z = 1;

  const meshes = new Map<string | number, RectMesh>();
  const availableMeshes: RectMesh[] = [];
  const resources = createRectResources(SHREDS_OPACITY);
  const cleanUpResources = () => {
    // If context was lost at some point, its GPU objects are already gone so skip objects disposal,
    // to prevent warnings e.g. WebGL: INVALID_OPERATION: delete: object does not belong to this context
    // Three doesn't restore GPU objects for restored contexts unless there's a render.
    // Remount on restore to reset the context listeners state
    if (!getWasContextLost()) {
      for (const slotMesh of meshes.values()) {
        slotMesh.mesh.geometry.dispose();
      }
      for (const slotMesh of availableMeshes) {
        slotMesh.mesh.geometry.dispose();
      }
      disposeRectResources(resources);
    }
  };

  return {
    camera,
    scene,
    meshes,
    availableMeshes,
    resources,
    cleanUpResources,
  };
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

export function render(rendererObj: {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
}) {
  const { renderer, scene, camera } = rendererObj;
  renderer.render(scene, camera);
}

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
  const data = store.get(liveShredsDataAtom) ?? {};
  const { slotsShreds: liveShreds, minCompletedSlot } = data;
  const skippedSlotsCluster = store.get(skippedClusterSlotsAtom);
  const rangeAfterStartup = store.get(liveShredsPostStartupRangeAtom);
  const smoothedNow = store.get(smoothedNowMsAtom);

  // if startup is running, prevent drawing non-startup screen chart
  // Sometimes we've missed the completion event for the first slots
  // depending on connection time. Ignore those slots, and only draw slots
  // from min completed.
  if (
    !liveShreds ||
    !data.range ||
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

  // update visible range
  visibleTsRangeRef.current = visibleTsRange;
  const cameraUpdated = updateCameraXRange(visibleTsRange, rendererObj.camera);

  const xRange = drawShreds(
    data,
    visibleTsRange,
    cssRange,
    rendererObj,
    forceDraw || cameraUpdated,
    chartId,
    skippedSlotsCluster,
  );

  if (!xRange) return;

  store.set(minDirtySlotByChartAtom, (prev) => {
    prev.set(chartId, Infinity);
    return prev;
  });

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

/**
 * Assumes camera x values were already updated.
 * Returns the drawn XRange when a render happened (so callers can update labels /
 * dirty-slot state), or undefined when there was nothing to draw.
 */
export function drawShreds(
  data: LiveShredsData,
  visibleTsRange: TsRange,
  cssRange: [min: number, max: number],
  rendererObj: NonAggRendererResources & {
    renderer: THREE.WebGLRenderer;
  },
  forceDraw: boolean,
  chartId: string,
  skippedSlots: Set<number>,
  // Optional wider range (visible + extra tiles each side) that controls which
  // slots are drawn/resident. Camera Y still scales to visibleTsRange only.
  // Defaults to visibleTsRange (no padding).
  drawTsRange: TsRange = visibleTsRange,
  // Whether any tile is still in flight for the active granularity (non-agg
  // path). While true, trailing incomplete+unskipped slots are hidden so they
  // don't stretch a bar to the edge before their data settles. Omitted/false for
  // the Overview live chart, which never hides.
  hasPendingTiles?: boolean,
  // Per-slot row height (in shred-index units). Defaults to 1 for every slot.
  // The Replay fec path returns SHREDS_PER_FEC_SET for fec-sourced slots so each
  // fec-set row fills its full band; those slots' shreds arrays are pre-scaled so
  // shreds.length (== camera-Y extent) already reflects the stacked height. Row
  // height is per-slot because per-slot fallback can mix granularities in one draw.
  rowHeightForSlot: (slotNumber: number) => number = () => 1,
  // Maps a slot number to the key its mesh is stored under. Defaults to the slot
  // number itself (Overview). The Replay non-agg shared pool folds the slot's
  // source granularity into the key so a slot's shred and fec meshes are distinct
  // objects and a granularity switch draws into the correct one instead of
  // reusing the other's geometry.
  meshKeyForSlot: (slotNumber: number) => string | number = (s) => s,
  // Tag recorded on each (re)assigned mesh describing the source it holds.
  // Defaults to undefined (Overview). Paired with meshKeyForSlot for the non-agg
  // shared pool.
  meshSourceForSlot: (slotNumber: number) => string | undefined = () =>
    undefined,
): XRange | undefined {
  const { slotsShreds: liveShreds, range: slotRange, minCompletedSlot } = data;

  if (!liveShreds || !slotRange || minCompletedSlot == null) return;

  // for now, use this xRange to be able to reuse the canvas helper functions.
  // Use the (possibly padded) draw range so extra tiles on each side are drawn.
  const xRange: XRange = {
    minDeltaTs: drawTsRange[0],
    maxDeltaTs: drawTsRange[1],
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
    skippedSlots,
    // camera Y scales to the visible range only, not the padded draw range
    { minDeltaTs: visibleTsRange[0], maxDeltaTs: visibleTsRange[1] },
    hasPendingTiles,
  );

  const cameraChanged = updateCameraYRange(rendererObj.camera, maxShreds);

  let anythingDrawn = false;
  const minDirtySlot = store.get(minDirtySlotByChartAtom).get(chartId);

  for (const slotNumber of orderedSlotNumbers) {
    const slot = liveShreds.slots.get(slotNumber);
    if (!slot?.shreds) continue;

    const meshKey = meshKeyForSlot(slotNumber);
    let slotMesh = rendererObj.meshes.get(meshKey);
    const isNewMesh = !slotMesh;
    if (!slotMesh) {
      const lastMesh = rendererObj.availableMeshes.pop();

      slotMesh =
        lastMesh ?? createRectMesh(rendererObj.resources, SHRED_MESH_CAPACITY);
      slotMesh.slotNumber = slotNumber;
      slotMesh.meshSource = meshSourceForSlot(slotNumber);
      rendererObj.meshes.set(meshKey, slotMesh);
      rendererObj.scene.add(slotMesh.mesh);
    }

    // skip drawing if not dirty slot
    if (!isNewMesh && minDirtySlot != null && slotNumber < minDirtySlot) {
      continue;
    }

    const isSlotSkipped = skippedSlots.has(slotNumber);
    const rowHeight = rowHeightForSlot(slotNumber);

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
        rowHeight,
        visibleTsRange: drawTsRange,
      });
      rectangleIdx += rectanglesAdded;
      if (rectanglesAdded) {
        anythingDrawn = true;
      }
    }
    updateRectMeshCounts(slotMesh, rectangleIdx);
  }

  const orderedSet = new Set(orderedSlotNumbers.map(meshKeyForSlot));
  for (const [meshKey, slotMesh] of rendererObj.meshes.entries()) {
    if (!orderedSet.has(meshKey)) {
      rendererObj.scene.remove(slotMesh.mesh);
      rendererObj.meshes.delete(meshKey);
      rendererObj.availableMeshes.push(slotMesh);
    }
  }

  if (forceDraw || anythingDrawn || cameraChanged) {
    render(rendererObj);
    return xRange;
  }
}

interface AddEventsForRowArgs {
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
  // height of each drawn row rect. Defaults to 1 (raw shreds). Fec rows pass
  // SHREDS_PER_FEC_SET so a fec set fills its full band on the shred-index axis.
  rowHeight: number;
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
  rowHeight,
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
