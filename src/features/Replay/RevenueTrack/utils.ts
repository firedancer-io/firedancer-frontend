import { getDefaultStore } from "jotai";
import { MAX_WEBGL_PX_RATIO } from "../../../consts.ts";
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
import { msBucketSizes, type RgbColor, type TsRange } from "../const.ts";
import { isWebgl2SupportedAtom } from "../../WebGl/atoms.ts";
import type { RevenueType } from "../../../api/entities.ts";
import type { AggRevenue } from "../../../api/types.ts";
import { getBigIntFrac } from "../utils.ts";

const store = getDefaultStore();

const minY = 0;
const maxY = 1;
const FEE_COLOR: RgbColor = [116 / 255, 178 / 255, 238 / 255];

export type RendererObj = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
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
    // contexts, driver crash). Mark as unsupported to trigger fallback to canvas chart
    store.set(isWebgl2SupportedAtom, false);
  }
}

export function render(rendererObj: RendererObj) {
  const { renderer, scene, camera } = rendererObj;
  renderer.render(scene, camera);
}

export function drawRevenue(
  rendererObj: RendererObj,
  type: RevenueType,
  aggRevenue: AggRevenue,
  getRelativeMs: (absoluteMs: bigint) => number,
) {
  const { granularity, reference_ts_ns } = aggRevenue;
  const referenceMs = getRelativeMs(reference_ts_ns);
  const bucketMs = msBucketSizes[granularity];

  // TODO: store max value on mesh
  let maxValue = 0n;
  const data = aggRevenue[type].reduce<[value: bigint, startMs: number][]>(
    (acc, value, i) => {
      if (value != null) {
        const startMs = referenceMs + i * bucketMs;
        acc.push([value, startMs]);

        if (value > maxValue) {
          maxValue = value;
        }
      }
      return acc;
    },
    [],
  );

  const { cameraReferenceMs, scene } = rendererObj;

  const mesh = rendererObj.prevMesh;

  /** store mesh positions relative to referenceX. This allows CPU to see small coordinates */
  if (mesh.referenceX == null) {
    mesh.referenceX = cameraReferenceMs;
  }

  ensureCapacity(mesh, data.length);
  for (let rectangleIdx = 0; rectangleIdx < data.length; rectangleIdx++) {
    const [value, startMs] = data[rectangleIdx];
    const endMs = startMs + bucketMs;
    addRectangleToMesh(
      mesh,
      rectangleIdx,
      startMs - mesh.referenceX,
      minY,
      endMs - startMs,
      getBigIntFrac(value, maxValue),
      FEE_COLOR,
    );
  }
  updateSlotMeshCounts(mesh, data.length);
  mesh.mesh.position.x = mesh.referenceX - cameraReferenceMs;

  // switch out the prev mesh content
  const prevMesh = rendererObj.currentMesh;
  prevMesh.referenceX = undefined;
  scene.remove(prevMesh.mesh);
  rendererObj.prevMesh = prevMesh;

  scene.add(mesh.mesh);
  rendererObj.currentMesh = mesh;
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
