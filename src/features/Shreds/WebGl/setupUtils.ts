import * as THREE from "three";
import { getDefaultStore } from "jotai";
import { smoothedNowMsAtom } from "../../../atoms";
import { xRangeMs } from "../../../api/worker/cache/shreds/shredsCalc";
import { shredsAtoms } from "../../Overview/ShredsProgression/atoms";
import { getDelayedNow } from "../../Overview/ShredsProgression/utils";
import { MAX_WEBGL_PX_RATIO, msPerDay } from "../../../consts";
import type { RectMesh, TsRange } from "../../WebGl/webglUtils";
import {
  createRectResources,
  disposeRectResources,
} from "../../WebGl/webglUtils";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers";
import { isWebgl2SupportedAtom } from "../../WebGl/atoms";
import type { RendererObj } from "../types";
import { SHREDS_OPACITY } from "./const";

const store = getDefaultStore();

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

  const referenceTs = store.get(shredsAtoms.slotsShreds)?.referenceTs;
  if (referenceTs == null) return;

  const worldStartTs = delayedNow - xRangeMs - referenceTs;
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

    const meshes = new Map<number, RectMesh>();
    const availableMeshes: RectMesh[] = [];
    const resources = createRectResources(SHREDS_OPACITY);
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
        disposeRectResources(resources);

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
