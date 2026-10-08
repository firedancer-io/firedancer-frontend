import { MAX_WEBGL_PX_RATIO } from "../../../consts.ts";
import * as THREE from "three";
import {
  createRectResources,
  disposeRectResources,
  type RectMesh,
  type RectResources,
  addRectangleToMesh,
  ensureRectCapacity,
  updateRectMeshCounts,
  createRectMesh,
  createRenderer,
  type RgbColor,
  type TsRange,
  updateMeshRange,
  convertToWebGlColor,
} from "../../WebGl/webglUtils.ts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers.ts";
import { msBucketSizes, nsBucketSizes } from "../const.ts";
import type { AggGranularity, AggSlots } from "../../../api/types.ts";
import { epochSliderProgressColor } from "../../../colors.ts";
import { clamp } from "lodash";
import { calcRelativeMs } from "../utils.ts";

export const trackHeight = 25;
const opacity = 1;
const minY = 0;
const maxY = 1;

interface MeshReferences {
  granularity: AggGranularity;
  // start ns of the first bucket at current granularity
  bucketReferenceNs: bigint;
}

export type RendererObj = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  resources: RectResources;
  mesh: RectMesh;
  meshReferences: MeshReferences | undefined;
  cleanUp: () => void;
};

/**
 * Draw mini map into a single mesh that grows with ensureRectCapacity as needed
 */
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
  const camera = new THREE.OrthographicCamera(0, 1, maxY, minY, 0.5, 10);
  camera.position.z = 1;

  const resources = createRectResources(opacity);
  const mesh = createRectMesh(resources);
  scene.add(mesh.mesh);

  const cleanUp = () => {
    // If context was lost at some point, its GPU objects are already gone so skip objects disposal,
    // to prevent warnings e.g. WebGL: INVALID_OPERATION: delete: object does not belong to this context
    // Three doesn't restore GPU objects for restored contexts unless there's a render.
    // Remount on restore to reset the context listeners state
    if (!getWasContextLost()) {
      mesh.mesh.geometry.dispose();
      // dispose this chart's own unitQuad / sharedMaterial
      disposeRectResources(resources);
    }
    cleanUpRenderer();
  };

  return {
    renderer,
    camera,
    scene,
    resources,
    mesh,
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
  if (startSlot == null || endSlot == null || endSlot < startSlot) {
    return {
      [ColorState.Skipped]: 0,
      [ColorState.NotSkipped]: 0,
    };
  }

  const totalSlots = endSlot - startSlot + 1;
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
 * The single mesh grows via ensureCapacity as more buckets arrive.
 */
export function drawMiniMap(
  rendererObj: RendererObj,
  newData: AggSlots,
  referenceNs: bigint,
) {
  const { mesh } = rendererObj;
  const { granularity, reference_ts_ns, start_slot, end_slot, skipped } =
    newData;
  const dataReferenceMs = calcRelativeMs(referenceNs, reference_ts_ns);

  if (newData.granularity !== rendererObj.meshReferences?.granularity) {
    // reset mesh on granularity change
    updateRectMeshCounts(mesh, 0);

    // first bucket start ts
    const bucketReferenceNs =
      reference_ts_ns - (reference_ts_ns % nsBucketSizes[granularity]);

    // initialize mesh range
    rendererObj.meshReferences = {
      granularity: newData.granularity,
      bucketReferenceNs,
    };
  }

  const bucketSizeMs = msBucketSizes[granularity];
  const bucketSizeNs = nsBucketSizes[granularity];

  // min 1px
  const minHeightRatio = (maxY - minY) / trackHeight;

  // track the range of rectangle indices updated in this draw
  let minIdx = Infinity;
  let maxIdx = -Infinity;

  const startBucketIdx = Number(
    (reference_ts_ns - rendererObj.meshReferences.bucketReferenceNs) /
      bucketSizeNs,
  );

  for (let i = 0; i < start_slot.length; i++) {
    const startMs = dataReferenceMs + i * bucketSizeMs;
    const width = bucketSizeMs;

    const bucketColorRatios = getBucketColorRatios(
      start_slot[i],
      end_slot[i],
      skipped[i],
      minHeightRatio,
    );

    // each bucket reserves colorStates.length consecutive rectangles, indexed
    // from the mesh reference
    const bucketIdx = i + startBucketIdx;

    let y = minY;
    for (let colorIdx = 0; colorIdx < colorStates.length; colorIdx++) {
      const colorState = colorStates[colorIdx];
      const startY = y;
      const ratio = bucketColorRatios[colorState];
      // keep a non-zero band visible (at least 1px)
      const height = ratio * (maxY - minY);
      const color = colors[colorState];

      const rectangleIdx = bucketIdx * colorStates.length + colorIdx;

      ensureRectCapacity(mesh, rectangleIdx + 1);
      addRectangleToMesh(
        mesh,
        rectangleIdx,
        startMs,
        startY,
        width,
        height,
        color,
      );

      minIdx = Math.min(minIdx, rectangleIdx);
      maxIdx = Math.max(maxIdx, rectangleIdx);

      y = startY + height;
    }
  }

  if (maxIdx < minIdx) return;

  // update mesh count / range
  const newCount = maxIdx + 1;
  if (mesh.count < newCount) {
    updateRectMeshCounts(mesh, newCount);
  }

  updateMeshRange(mesh, [minIdx, maxIdx]);
}

export function moveCamera(rendererObj: RendererObj, worldRangeMs: TsRange) {
  const { camera } = rendererObj;

  camera.left = worldRangeMs[0];
  camera.right = worldRangeMs[1];
  camera.updateProjectionMatrix();
}
