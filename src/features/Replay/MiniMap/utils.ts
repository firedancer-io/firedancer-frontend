import { getDefaultStore } from "jotai";
import { MAX_WEBGL_PX_RATIO, nsPerMs } from "../../../consts.ts";
import * as THREE from "three";
import {
  createWebglResources,
  createSlotMesh,
  disposeWebglResources,
  type SlotMesh,
  type WebglResources,
  ensureCapacity,
  addRectangleToMesh,
  updateSlotMeshCounts,
} from "../../WebGl/webglUtils.ts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers.ts";
import type { ReplaySlot } from "../../../atoms.ts";
import type { RgbColor, TsRange } from "../const.ts";
import { isWebgl2SupportedAtom } from "../../WebGl/atoms.ts";
import { getSlotColor } from "../SlotsTrack/mockUtils.ts";

const store = getDefaultStore();

const minY = 0;
const maxY = 1;
const SLOT_PADDING_MS = 100;

export type RendererObj = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  /* resources shared by this renderer's slot meshes */
  resources: WebglResources;
  prevMesh: SlotMesh;
  currentMesh: SlotMesh;
  /**
   * origin ms subtracted from both the camera bounds and
   * the rectangle geometry so the GPU works with small, float32-precise coordinates
   * instead of ~3.4e8.
   * Mesh position x values must be updated when this changes
   */
  cameraReferenceMs: number;
  cleanUpRenderer: () => void;
};

export function setUpRenderer(
  canvasWidth: number,
  canvasHeight: number,
  setUpContextListeners: ContextHelpers["setUpContextListeners"],
  getWasContextLost: ContextHelpers["getWasContextLost"],
): RendererObj | undefined {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 0, maxY, minY, 0.5, 10);
  camera.position.z = 1;

  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, MAX_WEBGL_PX_RATIO),
    );
    renderer.setSize(canvasWidth, canvasHeight);
    renderer.setClearColor(0x000000, 0);

    const resources = createWebglResources();
    const prevMesh = createSlotMesh(resources);
    const currentMesh = createSlotMesh(resources);

    const clearContextListeners = setUpContextListeners(renderer.domElement);

    const cleanUpRenderer = () => {
      // If context was lost at some point, its GPU objects are already gone so skip objects disposal,
      // to prevent warnings e.g. WebGL: INVALID_OPERATION: delete: object does not belong to this context
      // Three doesn't restore GPU objects for restored contexts unless there's a render.
      // Remount on restore to reset the context listeners state
      if (!getWasContextLost()) {
        for (const slotMesh of [prevMesh, currentMesh]) {
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
      resources,
      prevMesh,
      currentMesh,
      cameraReferenceMs: 0,
      cleanUpRenderer,
    };
  } catch {
    // context creation can still fail despite the probe (e.g. too many live
    // contexts, driver crash). Mark as unsupported to trigger fallback
    store.set(isWebgl2SupportedAtom, false);
  }
}

export function render(rendererObj: RendererObj) {
  const { renderer, scene, camera } = rendererObj;
  renderer.render(scene, camera);
}

export function drawSlots(
  lastDrawnIdx: number,
  rendererObj: RendererObj,
  replaySlots: ReplaySlot[],
  getRelativeMs: (absoluteMs: bigint) => number,
) {
  const data: { id: number; startTsMs: number; endTsMs: number }[] =
    replaySlots.map((e) => ({
      id: e.slot,
      startTsMs: getRelativeMs(BigInt(e.startTsMs) * BigInt(nsPerMs)),
      endTsMs: getRelativeMs(BigInt(e.endTsMs) * BigInt(nsPerMs)),
    }));

  return draw(lastDrawnIdx, rendererObj, data, getSlotColor);
}

export function draw(
  lastDrawnIdx: number,
  rendererObj: RendererObj,
  data: { id: number; startTsMs: number; endTsMs: number }[],
  getColor: (id: number) => RgbColor,
) {
  const { scene } = rendererObj;

  const mesh = rendererObj.currentMesh;

  ensureCapacity(mesh, data.length);
  const startIdx = lastDrawnIdx + 1;
  for (
    let rectangleIdx = startIdx;
    rectangleIdx < data.length;
    rectangleIdx++
  ) {
    const { id, startTsMs, endTsMs } = data[rectangleIdx];
    const centerX = (startTsMs + endTsMs) / 2;
    const w = endTsMs - startTsMs;
    const paddedWidth = Math.max(0, w - SLOT_PADDING_MS);
    const color = getColor(id);

    addRectangleToMesh(
      mesh,
      rectangleIdx,
      centerX - paddedWidth / 2,
      minY,
      paddedWidth,
      maxY - minY,
      color,
    );
  }
  const drewNewRects = startIdx < data.length;
  const countChanged = mesh.count !== data.length;
  if (drewNewRects || countChanged) {
    updateSlotMeshCounts(
      mesh,
      data.length,
      drewNewRects ? { startIdx, endIdx: data.length - 1 } : undefined,
    );
  }

  scene.add(mesh.mesh);

  return data.length - 1;
}

/**
 * Move camera and and update camera and current mesh reference x
 */
export function moveCamera(rendererObj: RendererObj, visibleRangeMs: TsRange) {
  const { camera, currentMesh } = rendererObj;

  // Store a camera reference to make mesh coordinates smaller for GPU
  const cameraReferenceMs = visibleRangeMs[0];
  rendererObj.cameraReferenceMs = cameraReferenceMs;
  camera.left = visibleRangeMs[0] - cameraReferenceMs;
  camera.right = visibleRangeMs[1] - cameraReferenceMs;
  camera.updateProjectionMatrix();

  // Mesh point coordinates are already set. Move them to match camera reference
  // by manipulating mesh position.x
  if (currentMesh.referenceX != null) {
    currentMesh.mesh.position.x = currentMesh.referenceX - cameraReferenceMs;
  }
}
