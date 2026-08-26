import * as THREE from "three";
import type { MutableRefObject } from "react";
import {
  delayMs,
  xRangeMs,
} from "../../../../api/worker/cache/shreds/shredsCalc";
import { serverTimeMsAtom, skippedClusterSlotsAtom } from "../../../../atoms";
import { showStartupProgressAtom } from "../../../StartupProgress/atoms";
import {
  liveShredsDataAtom,
  liveShredsPostStartupRangeAtom,
  minDirtySlotByChartAtom,
} from "../atoms";
import { updateLabels } from "../shredsProgressionPlugin";
import type { SlotMesh } from "../../../WebGl/webglUtils";
import {
  createWebglResources,
  disposeWebglResources,
} from "../../../WebGl/webglUtils";
import { getDefaultStore } from "jotai";
import type { LabelsState } from "../utils";
import { MAX_WEBGL_PX_RATIO, msPerDay } from "../../../../consts";
import type { ContextHelpers } from "../../../WebGl/useWebGlEventHandlers";
import { isWebgl2SupportedAtom } from "../../../WebGl/atoms";
import { drawScene, type SceneObjects, type TsRange } from "./drawCore";

export type { TsRange } from "./drawCore";

const store = getDefaultStore();

export type RendererObj = SceneObjects & {
  worldTsRange: TsRange;
  cleanUpRenderer: () => void;
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
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, MAX_WEBGL_PX_RATIO),
    );
    renderer.setSize(canvasWidth, canvasHeight);
    renderer.setClearColor(0x000000, 0);

    const meshes = new Map<number, SlotMesh>();
    const availableMeshes: SlotMesh[] = [];
    const resources = createWebglResources();
    renderer.render(scene, camera);
    const clearContextListeners = setUpContextListeners(renderer.domElement);

    const cleanUpRenderer = () => {
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
        // dispose this chart's own unitQuad / sharedMaterial
        disposeWebglResources(resources);

        renderer.dispose();
      }

      // release currently live context (may be the restored one)
      // make sure context listeners are removed beforehand
      clearContextListeners();
      if (!renderer.getContext().isContextLost()) {
        renderer.forceContextLoss();
      }
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

  const xRange = drawScene(
    rendererObj,
    prevTimeDiffsRef.current,
    visibleTsRangeRef,
    {
      liveShreds,
      slotRange,
      minCompletedSlot,
      skippedSlotsCluster,
      serverTimeMs,
      scale,
      minDirtySlot: store.get(minDirtySlotByChartAtom).get(chartId),
      cssRange,
      forceDraw,
    },
  );

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
