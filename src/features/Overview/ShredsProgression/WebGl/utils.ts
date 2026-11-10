import type { MutableRefObject } from "react";
import type { RendererObj } from "../../../Shreds/types";
import type { LabelsState } from "../utils";
import { skippedClusterSlotsAtom } from "../../../../atoms";
import { getDrawInfo } from "../../../Shreds/chartUtils";
import { delayMs } from "../../../Shreds/const";
import { SHRED_MESH_CAPACITY } from "../../../Shreds/WebGl/const";
import {
  createSlotEdgeMaterial,
  createSlotMaterial,
} from "../../../Shreds/WebGl/slotMaterials";
import { createRectMesh } from "../../../WebGl/webglUtils";
import {
  getLeaderSlotsRange,
  overviewHoveredShredAtom,
  overviewHoveredSlotAtom,
} from "../atoms";
import { updateLabels } from "../shredsProgressionPlugin";
import { drawSlotShreds, releaseMesh } from "../../../Shreds/WebGl/drawUtils";
import { minDirtySlotByChartAtom } from "../../../Shreds/atoms";
import {
  getShredsState,
  getVisibleTsRange,
  isShredsPausedAtom,
} from "../pauseAtoms";
import { getDefaultStore } from "jotai";
import {
  updateEdgeViewWidth,
  EDGE_RENDER_ORDER_OFFSET,
} from "../../../Shreds/WebGl/edgeUtils";
import { drawHoveredShred } from "../../../Shreds/WebGl/shredHover";
import {
  setMeshSlot,
  updateSlotHighlightForSlots,
} from "../../../Replay/slotHighlight";

const store = getDefaultStore();

const EMPTY_INCOMPLETE_RIGHT_EDGES: ReadonlyMap<string, number> = new Map();

export function drawLive(
  chartId: string,
  rendererObj: RendererObj,
  labelsRef: MutableRefObject<{
    prevLabels: LabelsState;
    tempNewLabels: LabelsState;
  }>,
  scale: number,
  forceDraw: boolean,
  cssRange: [min: number, max: number],
) {
  // frozen while hovered. Not drawn during startup; we may have missed completion
  // events for the first slots, so only draw from min completed.
  const isPaused = store.get(isShredsPausedAtom);
  // paused frames only change on forced draws (pause, hover, resize)
  if (isPaused && !forceDraw) return;

  const state = getShredsState(store.get);
  if (!state) return;
  const { liveShreds, slotRange, minCompletedSlot, rangeAfterStartup } = state;
  const skippedSlotsCluster = store.get(skippedClusterSlotsAtom);
  const visibleTsRange = getVisibleTsRange(state, scale);

  const minSlot = Math.max(slotRange.min, minCompletedSlot);
  const maxSlot = slotRange.max;

  const { maxShreds, slots: drawSlots } = getDrawInfo(
    minSlot,
    maxSlot,
    { isFec: false, slotsShreds: liveShreds },
    undefined,
    visibleTsRange,
    // no draw overscan
    visibleTsRange,
    (_slot, slotNumber) => skippedSlotsCluster.has(slotNumber),
  );

  // for hit-testing. Incomplete slots are drawn to the live edge, so no right edges
  rendererObj.lastDrawInfo = {
    slots: drawSlots,
    incompleteRightEdges: EMPTY_INCOMPLETE_RIGHT_EDGES,
  };

  // keep the edge mark 1px wide as the canvas resizes
  const viewportWidthPx = rendererObj.renderer.domElement.width;
  if (viewportWidthPx > 0) {
    updateEdgeViewWidth(
      rendererObj.edgeResources.rectMaterial,
      viewportWidthPx,
    );
  }

  // release unused meshes
  const orderedSet = new Set(drawSlots.map((d) => d.slotNumber));
  for (const slotNumber of rendererObj.meshes.keys()) {
    if (!orderedSet.has(slotNumber)) {
      releaseMesh(
        rendererObj.scene,
        rendererObj.meshes,
        rendererObj.availableMeshes,
        slotNumber,
      );
      releaseMesh(
        rendererObj.scene,
        rendererObj.edgeMeshes,
        rendererObj.availableEdgeMeshes,
        slotNumber,
      );
    }
  }

  // a paused draw redraws every slot from the snapshot
  const minDirtySlot = isPaused
    ? undefined
    : store.get(minDirtySlotByChartAtom).get(chartId);
  const needsRender = drawSlotShreds(
    visibleTsRange,
    // Overview draws exactly the visible range (no overscan padding)
    visibleTsRange,
    maxShreds,
    drawSlots,
    ({ slotNumber }) => getLiveSlotMesh(rendererObj, slotNumber),
    rendererObj.camera,
    undefined,
    (slotNumber) => minDirtySlot == null || slotNumber >= minDirtySlot,
    ({ slotNumber }) => getEdgeMesh(rendererObj, slotNumber),
  );

  if (needsRender || forceDraw) {
    rendererObj.renderer.render(rendererObj.scene, rendererObj.camera);
  }

  // consumed the dirty slots; reset until the next update
  store.set(minDirtySlotByChartAtom, (prev) => {
    prev.set(chartId, Infinity);
    return prev;
  });

  const { prevLabels, tempNewLabels } = labelsRef.current;
  updateLabels(
    rangeAfterStartup,
    liveShreds.slots,
    skippedSlotsCluster,
    visibleTsRange,
    cssRange,
    prevLabels,
    tempNewLabels,
    getLeaderSlotsRange(rangeAfterStartup),
  );
  // switch map for reuse, don't create new maps each render
  labelsRef.current = {
    prevLabels: tempNewLabels,
    tempNewLabels: prevLabels,
  };
  prevLabels.groups.clear();
  prevLabels.slots.clear();
}

function getLiveSlotMesh(rendererObj: RendererObj, slotNumber: number) {
  let slotMesh = rendererObj.meshes.get(slotNumber);
  const isNewMesh = !slotMesh;
  if (!slotMesh) {
    const lastMesh = rendererObj.availableMeshes.pop();
    slotMesh =
      lastMesh ??
      createRectMesh(
        rendererObj.resources,
        SHRED_MESH_CAPACITY,
        createSlotMaterial(rendererObj.highlight),
      );
    rendererObj.meshes.set(slotNumber, slotMesh);
    rendererObj.scene.add(slotMesh.mesh);
    // paint bigger slot numbers on top of smaller numbers
    slotMesh.mesh.renderOrder = slotNumber;
    setMeshSlot(rendererObj.highlight, slotMesh, slotNumber);
  }

  return { isNewMesh, slotMesh };
}

function getEdgeMesh(rendererObj: RendererObj, slotNumber: number) {
  const { edgeResources, edgeMeshes, availableEdgeMeshes } = rendererObj;

  let edgeMesh = edgeMeshes.get(slotNumber);
  if (!edgeMesh) {
    const lastMesh = availableEdgeMeshes.pop();
    edgeMesh =
      lastMesh ??
      createRectMesh(
        edgeResources,
        SHRED_MESH_CAPACITY,
        createSlotEdgeMaterial(rendererObj.highlight, edgeResources),
      );
    edgeMeshes.set(slotNumber, edgeMesh);
    rendererObj.scene.add(edgeMesh.mesh);
    edgeMesh.mesh.renderOrder = slotNumber + EDGE_RENDER_ORDER_OFFSET;
    setMeshSlot(rendererObj.highlight, edgeMesh, slotNumber);
  }

  return edgeMesh;
}

// like Replay's shreds track, hover doesn't redraw slot geometry
export function renderOverviewHover(rendererObj: RendererObj, scale: number) {
  const state = getShredsState(store.get);
  if (!state) return;

  const hovered = store.get(overviewHoveredShredAtom);
  // above its own slot but below newer slots, like Replay's updateSlotMeshes
  if (hovered) {
    rendererObj.highlightMesh.mesh.renderOrder =
      hovered.slot + EDGE_RENDER_ORDER_OFFSET;
  }
  // Overview draws in absolute ts deltas, so camera reference is 0
  drawHoveredShred(
    rendererObj.highlightMesh,
    0,
    hovered,
    getVisibleTsRange(state, scale),
    delayMs,
  );
  updateSlotHighlightForSlots(
    rendererObj.highlight,
    store.get(overviewHoveredSlotAtom),
  );
  rendererObj.renderer.render(rendererObj.scene, rendererObj.camera);
}
