import { MAX_WEBGL_PX_RATIO } from "../../../consts.ts";
import * as THREE from "three";
import {
  createWebglResources,
  disposeWebglResources,
  type RectMesh,
  type WebglResources,
  addRectangleToMesh,
  updateRectMeshCounts,
  createRectMesh,
  createRenderer,
  type RgbColor,
  type TsRange,
  updateMeshRange,
  convertToWebGlColor,
} from "../../WebGl/webglUtils.ts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers.ts";
import { msBucketSizes } from "../const.ts";
import type { AggGranularity, AggSlots } from "../../../api/types.ts";
import { epochSliderProgressColor } from "../../../colors.ts";
import { clamp } from "lodash";

export const trackHeight = 25;
const opacity = 1;
const minY = 0;
const maxY = 1;
const MAX_RECTANGLES_PER_MESH = 8000;

interface MeshReferences {
  granularity: AggGranularity;
  referenceMs: number;
}

export type RendererObj = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  /* resources shared by this renderer's meshes */
  resources: WebglResources;
  meshes: RectMesh[];
  meshReferences: MeshReferences | undefined;
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

  const resources = createWebglResources(opacity);
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
    meshReferences: undefined,
    cleanUp,
  };
}

export function render(rendererObj: RendererObj) {
  const { renderer, scene, camera } = rendererObj;
  renderer.render(scene, camera);
}

enum ColorState {
  Skipped = "Skipped",
  NotSkipped = "NotSkipped",
}

const colorStates = Object.values(ColorState);

const colors: Record<ColorState, RgbColor> = {
  [ColorState.Skipped]: [235 / 255, 64 / 255, 52 / 255],
  [ColorState.NotSkipped]: convertToWebGlColor(epochSliderProgressColor),
};

function getBucketColorRatios(
  startSlot: number | null,
  endSlot: number | null,
  skippedCount: number | null,
  minHeightRatio: number,
): Record<ColorState, number> {
  if (startSlot == null || endSlot == null) {
    return {
      [ColorState.Skipped]: 0,
      [ColorState.NotSkipped]: 0,
    };
  }

  const totalSlots = endSlot - startSlot + 1;
  if (totalSlots === 0) {
    return {
      [ColorState.Skipped]: 0,
      [ColorState.NotSkipped]: 0,
    };
  }

  const skippedRatio = skippedCount
    ? clamp(skippedCount / totalSlots, minHeightRatio, maxY)
    : 0;
  return {
    [ColorState.Skipped]: skippedRatio,
    [ColorState.NotSkipped]: maxY - skippedRatio,
  };
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
  const { granularity, reference_ts_ns, start_slot, end_slot, skipped } =
    newData;
  const referenceMs = getRelativeMs(reference_ts_ns);

  if (newData.granularity !== rendererObj.meshReferences?.granularity) {
    // reset meshes on granularity change
    for (const mesh of rendererObj.meshes) {
      updateRectMeshCounts(mesh, 0);
    }

    // initialize mesh range
    rendererObj.meshReferences = {
      granularity: newData.granularity,
      referenceMs,
    };
  }

  // track ranges that were updated within each mesh
  const meshUpdates: { minIdx: number; maxIdx: number }[] = [];
  const bucketSizeMs = msBucketSizes[granularity];

  // min 1px
  const minHeightRatio = (maxY - minY) / trackHeight;

  for (let i = 0; i < start_slot.length; i++) {
    const startMs = referenceMs + i * bucketSizeMs;
    const width = bucketSizeMs;

    const bucketColorRatios = getBucketColorRatios(
      start_slot[i],
      end_slot[i],
      skipped[i],
      minHeightRatio,
    );

    let y = minY;
    for (let colorIdx = 0; colorIdx < colorStates.length; colorIdx++) {
      const colorState = colorStates[colorIdx];
      const startY = y;
      const ratio = bucketColorRatios[colorState];
      // keep a non-zero band visible (at least 1px)
      const height = ratio * (maxY - minY);
      const color = colors[colorState];

      const { meshIdx, rectangleIdx } = getPositionInMesh(
        rendererObj.meshReferences,
        startMs,
        bucketSizeMs,
        colorIdx,
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
        startMs,
        startY,
        width,
        height,
        color,
      );

      // keep track of update range for each mesh
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

      y = startY + height;
    }
  }

  // update mesh counts / ranges
  for (let i = 0; i < meshUpdates.length; i++) {
    const mesh = meshes[i];
    if (!mesh || !meshUpdates[i]) continue;

    const newCount = meshUpdates[i].maxIdx + 1;
    if (mesh.count !== newCount) {
      updateRectMeshCounts(mesh, newCount);
    }

    updateMeshRange(mesh, [meshUpdates[i].minIdx, meshUpdates[i].maxIdx]);
  }
}

/**
 * Get mesh idx and rectangle idx within mesh. Each bucket reserves colorState.length
 * consecutive rectangles. Each mesh holds MAX_RECTANGLES_PER_MESH rectangles.
 */
function getPositionInMesh(
  lastDraw: MeshReferences,
  tsMs: number,
  bucketSizeMs: number,
  colorIdx: number,
) {
  const bucketIdx = Math.trunc((tsMs - lastDraw.referenceMs) / bucketSizeMs);
  const overallRectangleIdx = bucketIdx * colorStates.length + colorIdx;
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
