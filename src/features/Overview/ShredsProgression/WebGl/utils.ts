import type { MutableRefObject } from "react";
import type { RendererObj } from "../../../Shreds/types";
import { getDelayedNowNs, type LabelsState } from "../utils";
import { skippedClusterSlotsAtom } from "../../../../atoms";
import { smoothedNowNsAtom } from "../../../../nowAtoms";
import { getDrawInfo } from "../../../Shreds/chartUtils";
import { xRangeMs } from "../../../Shreds/const";
import { SHRED_MESH_CAPACITY } from "../../../Shreds/WebGl/const";
import { showStartupProgressAtom } from "../../../StartupProgress/atoms";
import { type TsRange, createRectMesh } from "../../../WebGl/webglUtils";
import { calcRelativeMs } from "../../../Replay/utils";
import { shredsAtoms, liveShredsPostStartupRangeAtom } from "../atoms";
import { updateLabels } from "../shredsProgressionPlugin";
import { drawSlotShreds, releaseMesh } from "../../../Shreds/WebGl/drawUtils";
import { minDirtySlotByChartAtom } from "../../../Shreds/atoms";
import { getDefaultStore } from "jotai";
import {
  updateEdgeViewWidth,
  EDGE_RENDER_ORDER_OFFSET,
} from "../../../Shreds/WebGl/edgeUtils";

const store = getDefaultStore();

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
  const liveShreds = store.get(shredsAtoms.slotsShreds);
  const slotRange = store.get(shredsAtoms.range);
  const minCompletedSlot = store.get(shredsAtoms.minCompletedSlot);
  const skippedSlotsCluster = store.get(skippedClusterSlotsAtom);
  const rangeAfterStartup = store.get(liveShredsPostStartupRangeAtom);
  const smoothedNowNs = store.get(smoothedNowNsAtom);

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
    smoothedNowNs == null
  )
    return;

  const delayedNowNs = getDelayedNowNs(smoothedNowNs);
  const maxReferenceTs = calcRelativeMs(liveShreds.referenceTs, delayedNowNs);

  const visibleTsRange: TsRange = [
    maxReferenceTs - xRangeMs * scale,
    maxReferenceTs,
  ];

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

  const minDirtySlot = store.get(minDirtySlotByChartAtom).get(chartId);
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
      lastMesh ?? createRectMesh(rendererObj.resources, SHRED_MESH_CAPACITY);
    rendererObj.meshes.set(slotNumber, slotMesh);
    rendererObj.scene.add(slotMesh.mesh);
    // paint bigger slot numbers on top of smaller numbers
    slotMesh.mesh.renderOrder = slotNumber;
  }

  return { isNewMesh, slotMesh };
}

function getEdgeMesh(rendererObj: RendererObj, slotNumber: number) {
  const { edgeResources, edgeMeshes, availableEdgeMeshes } = rendererObj;

  let edgeMesh = edgeMeshes.get(slotNumber);
  if (!edgeMesh) {
    const lastMesh = availableEdgeMeshes.pop();
    edgeMesh = lastMesh ?? createRectMesh(edgeResources, SHRED_MESH_CAPACITY);
    edgeMeshes.set(slotNumber, edgeMesh);
    rendererObj.scene.add(edgeMesh.mesh);
    edgeMesh.mesh.renderOrder = slotNumber + EDGE_RENDER_ORDER_OFFSET;
  }

  return edgeMesh;
}
