import * as THREE from "three";
import { getDefaultStore } from "jotai";
import { smoothedNowNsAtom } from "../../../atoms";
import { xRangeMs } from "../const";
import { shredsAtoms } from "../../Overview/ShredsProgression/atoms";
import { getDelayedNowNs } from "../../Overview/ShredsProgression/utils";
import { calcRelativeMs } from "../../Replay/utils";
import { MAX_WEBGL_PX_RATIO, msPerDay } from "../../../consts";
import type { RectMesh, TsRange } from "../../WebGl/webglUtils";
import {
  createRectResources,
  createRenderer,
  disposeRectResources,
} from "../../WebGl/webglUtils";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers";
import type { RendererObj } from "../types";
import { SHREDS_OPACITY } from "./const";

const store = getDefaultStore();

export function setUpRendererResources<MeshKey extends string | number>(
  getWasContextLost: ContextHelpers["getWasContextLost"],
) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, 1, 0.5, 10);
  camera.position.z = 1;

  const meshes = new Map<MeshKey, RectMesh>();
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
      // dispose this chart's own unitQuad / sharedMaterial
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

/**
 * Set up renderer world, setup according to shred reference ts
 */
export function setUpLiveRenderer(
  canvasWidth: number,
  canvasHeight: number,
  setUpContextListeners: ContextHelpers["setUpContextListeners"],
  getWasContextLost: ContextHelpers["getWasContextLost"],
): RendererObj | undefined {
  const smoothedNowNs = store.get(smoothedNowNsAtom);
  if (smoothedNowNs == null) return;

  const delayedNowNs = getDelayedNowNs(smoothedNowNs);

  const referenceTs = store.get(shredsAtoms.slotsShreds)?.referenceTs;
  if (referenceTs == null) return;

  const worldStartTs = calcRelativeMs(referenceTs, delayedNowNs) - xRangeMs;
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

  const { renderer, cleanUpRenderer: cleanUpRendererContext } = rendererObj;
  const {
    camera,
    scene,
    meshes,
    availableMeshes,
    resources,
    cleanUpResources,
  } = setUpRendererResources<number>(getWasContextLost);

  renderer.render(scene, camera);

  const cleanUpRenderer = () => {
    cleanUpResources();
    cleanUpRendererContext();
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
