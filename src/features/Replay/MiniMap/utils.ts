import { MAX_WEBGL_PX_RATIO } from "../../../consts.ts";
import * as THREE from "three";
import {
  createWebglResources,
  disposeWebglResources,
  type RectMesh,
  type WebglResources,
  addRectangleToMesh,
  updateRectMeshCount,
  createRectMesh,
  createRenderer,
  type RgbColor,
  type TsRange,
  updateMeshRange,
} from "../../WebGl/webglUtils.ts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers.ts";
import { msBucketSizes } from "../const.ts";
import type { AggGranularity, AggSlots } from "../../../api/types.ts";

const minY = 0;
const maxY = 1;
const SLOT_PADDING_MS = 100;
const MAX_RECTANGLES_PER_MESH = 8000;

interface LastDraw {
  granularity: AggGranularity;
  firstRectMs: number;
}

export type RendererObj = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  /* resources shared by this renderer's meshes */
  resources: WebglResources;
  meshes: RectMesh[];
  lastDraw: LastDraw | undefined;
  cleanUp: () => void;
};

export function setUpRenderer(
  canvasWidth: number,
  canvasHeight: number,
  setUpContextListeners: ContextHelpers["setUpContextListeners"],
  getWasContextLost: ContextHelpers["getWasContextLost"],
): RendererObj | undefined {
  const rendererObj = createRenderer(
    canvasWidth,
    canvasHeight,
    MAX_WEBGL_PX_RATIO,
    setUpContextListeners,
    getWasContextLost,
  );
  if (!rendererObj) return;

  const { renderer, cleanUpRenderer } = rendererObj;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 0, maxY, minY, 0.5, 10);
  camera.position.z = 1;

  const resources = createWebglResources();
  const mesh = createRectMesh(resources, MAX_RECTANGLES_PER_MESH);
  const meshes = [mesh];
  scene.add(mesh.mesh);

  const cleanUp = () => {
    // If context was lost at some point, its GPU objects are already gone so skip objects disposal,
    // to prevent warnings e.g. WebGL: INVALID_OPERATION: delete: object does not belong to this context
    // Three doesn't restore GPU objects for restored contexts unless there's a render.
    // Remount on restore to reset the context listeners state
    if (!getWasContextLost()) {
      for (const mesh of meshes) {
        mesh.mesh.geometry.dispose();
      }
      // dispose this chart's own unitQuad / sharedMaterial
      disposeWebglResources(resources);
    }
    cleanUpRenderer();
  };

  return {
    renderer,
    camera,
    scene,
    resources,
    meshes,
    lastDraw: undefined,
    cleanUp,
  };
}

export function render(rendererObj: RendererObj) {
  const { renderer, scene, camera } = rendererObj;
  renderer.render(scene, camera);
}

export function getSlotColor(isSkipped: boolean): RgbColor {
  // TODO: add colors for leader
  return isSkipped
    ? [235 / 255, 64 / 255, 52 / 255]
    : [84 / 255, 188 / 255, 160 / 255];
}

/**
 * Draw rectangles. Appends data if granularity is the same as in the last draw.
 * Create new meshes as needed.
 */
export function drawMiniMap(
  rendererObj: RendererObj,
  newData: AggSlots,
  getRelativeMs: (absoluteNs: bigint) => number,
) {
  const { scene, meshes } = rendererObj;
  const { granularity, reference_ts_ns, start_slot, skipped } = newData;
  const referenceMs = getRelativeMs(reference_ts_ns);

  if (newData.granularity !== rendererObj.lastDraw?.granularity) {
    // reset meshes
    for (const mesh of rendererObj.meshes) {
      updateRectMeshCount(mesh, 0);
    }

    // initialize mesh range
    rendererObj.lastDraw = {
      granularity: newData.granularity,
      firstRectMs: referenceMs,
    };
  }
  const lastDraw = rendererObj.lastDraw;

  // draw new data
  const bucketMs = msBucketSizes[granularity];
  const meshUpdates: { minIdx: number; maxIdx: number }[] = [];

  for (let i = 0; i < start_slot.length; i++) {
    const startMs = referenceMs + i * bucketMs;
    const endMs = startMs + bucketMs;
    const isSkipped = skipped[i] ?? 0;
    const centerX = (startMs + endMs) / 2;
    const w = endMs - startMs;
    const width = Math.max(0, w - SLOT_PADDING_MS);
    const color = getSlotColor(!!isSkipped);

    const { meshIdx, rectangleIdx } = getMeshPosition(
      lastDraw,
      startMs,
      bucketMs,
    );

    if (!rendererObj.meshes[meshIdx]) {
      const newMesh = createRectMesh(
        rendererObj.resources,
        MAX_RECTANGLES_PER_MESH,
      );
      rendererObj.meshes[meshIdx] = newMesh;
      scene.add(newMesh.mesh);
    }

    const mesh = meshes[meshIdx];

    addRectangleToMesh(
      mesh,
      rectangleIdx,
      centerX - width / 2,
      minY,
      width,
      maxY - minY,
      color,
    );

    if (meshUpdates[meshIdx]) {
      meshUpdates[meshIdx] = {
        minIdx: Math.min(rectangleIdx, meshUpdates[meshIdx].minIdx),
        maxIdx: Math.max(rectangleIdx, meshUpdates[meshIdx].maxIdx),
      };
    } else {
      meshUpdates[meshIdx] = {
        minIdx: rectangleIdx,
        maxIdx: rectangleIdx,
      };
    }
  }

  for (let i = 0; i < meshUpdates.length; i++) {
    const mesh = meshes[i];
    if (!mesh || !meshUpdates[i]) continue;

    const newCount = meshUpdates[i].maxIdx + 1;
    if (mesh.count !== newCount) {
      updateRectMeshCount(mesh, newCount);
    }

    updateMeshRange(mesh, [meshUpdates[i].minIdx, meshUpdates[i].maxIdx]);
  }
}

/**
 * Get mesh idx and rectangle idx within mesh, given each mesh contains MAX_MESH_RECTANGLES each spanning the bucket size ms
 */
function getMeshPosition(
  lastDraw: LastDraw,
  tsMs: number,
  bucketSizeMs: number,
) {
  const overallRectangleIdx = Math.trunc(
    (tsMs - lastDraw.firstRectMs) / bucketSizeMs,
  );
  const meshIdx = Math.trunc(overallRectangleIdx / MAX_RECTANGLES_PER_MESH);
  const meshRectangleIdx = overallRectangleIdx % MAX_RECTANGLES_PER_MESH;

  return { meshIdx, rectangleIdx: meshRectangleIdx };
}

export function moveCamera(rendererObj: RendererObj, worldRangeMs: TsRange) {
  const { camera } = rendererObj;

  camera.left = worldRangeMs[0];
  camera.right = worldRangeMs[1];
  camera.updateProjectionMatrix();
}
