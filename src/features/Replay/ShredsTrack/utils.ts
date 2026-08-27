import {
  drawShreds,
  setUpRendererResources as setUpNonAggRendererResources,
  colors,
  updateCameraXRange,
  updateCameraYRange,
} from "../../Overview/ShredsProgression/WebGl/chartUtils";
import { msBucketSizes } from "../const";
import * as THREE from "three";
import { getDefaultStore } from "jotai";
import { MAX_WEBGL_PX_RATIO, nsPerMs } from "../../../consts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers";
import {
  createWebglResources,
  createRectMesh,
  disposeWebglResources,
  createRenderer,
  ensureCapacity,
  addRectangleToMesh,
  type TsRange,
  updateRectMeshCount,
} from "../../WebGl/webglUtils";
import {
  SHREDS_AGG_THRESHOLD_MS,
  type AggRendererResources,
  type RendererObj,
} from "./const";
import { omit } from "lodash";
import type { AggShreds } from "../../../api/types";
import {
  shredsTimelineReferenceTsAtom,
  timelineShredsAtoms,
  timelineShredsDataAtom,
} from "./atoms";
import { minDirtySlotByChartAtom } from "../../Overview/ShredsProgression/atoms";

const store = getDefaultStore();

/**
 * convert replay-relative ts to shreds-relative ts
 */
function convertToShredsTs(
  replayMs: number,
  getRelativeMs: (absoluteNs: bigint) => number,
) {
  const shredsReferenceTsMs = store.get(shredsTimelineReferenceTsAtom);
  if (shredsReferenceTsMs == null) return;
  return (
    replayMs - getRelativeMs(BigInt(shredsReferenceTsMs) * BigInt(nsPerMs))
  );
}

export function convertToShredsRange(
  replayRange: TsRange,
  getRelativeMs: (absoluteNs: bigint) => number,
): TsRange | undefined {
  const start = convertToShredsTs(replayRange[0], getRelativeMs);
  if (start == null) return;
  const end = convertToShredsTs(replayRange[1], getRelativeMs);
  if (end == null) return;

  return [start, end];
}

export function moveNonAggCamera(
  camera: THREE.OrthographicCamera,
  replayVisibleRange: TsRange,
  getRelativeMs: (absoluteNs: bigint) => number,
) {
  const shredsVisibleRange = convertToShredsRange(
    replayVisibleRange,
    getRelativeMs,
  );
  if (!shredsVisibleRange) return;

  return updateCameraXRange(shredsVisibleRange, camera);
}

/**
 * Move camera and and update camera and current mesh reference x
 */
export function moveAggCamera(
  resources: AggRendererResources,
  visibleRangeMs: TsRange,
) {
  const { camera, currentMesh } = resources;

  // Store a camera reference to make mesh coordinates smaller for GPU
  const cameraReferenceMs = visibleRangeMs[0];
  resources.cameraReferenceMs = cameraReferenceMs;
  camera.left = visibleRangeMs[0] - cameraReferenceMs;
  camera.right = visibleRangeMs[1] - cameraReferenceMs;
  camera.updateProjectionMatrix();

  // Mesh point coordinates are already set. Move them to match camera reference
  // by manipulating mesh position.x
  if (currentMesh.referenceX != null) {
    currentMesh.mesh.position.x = currentMesh.referenceX - cameraReferenceMs;
  }
}

export function drawNonAggShreds(
  rendererObj: RendererObj,
  shredsVisibleRange: TsRange,
  cssRange: [min: number, max: number],
  chartId: string,
) {
  const skippedSlots = store.get(timelineShredsAtoms.skippedSlots);
  const data = store.get(timelineShredsDataAtom);
  if (!data) return;

  const { renderer, cleanUp, nonAgg: micro } = rendererObj;
  if (
    drawShreds(
      data,
      [shredsVisibleRange[0], shredsVisibleRange[1]],
      cssRange,
      {
        renderer,
        cleanUp,
        ...micro,
      },
      true,
      chartId,
      skippedSlots,
    )
  ) {
    store.set(minDirtySlotByChartAtom, (prev) => {
      prev.set(chartId, Infinity);
      return prev;
    });
  }
}

export function setUpAggRendererResources(
  getWasContextLost: ContextHelpers["getWasContextLost"],
) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 0, 0, 0, 0.5, 10);
  camera.position.z = 1;

  const resources = createWebglResources();
  const prevMesh = createRectMesh(resources);
  const currentMesh = createRectMesh(resources);

  const cleanUpResources = () => {
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
    }
  };

  return {
    camera,
    scene,
    resources,
    prevMesh,
    currentMesh,
    cameraReferenceMs: 0,
    cleanUpResources,
  };
}

export function setUpRenderers(
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
  const nonAggResources = setUpNonAggRendererResources(getWasContextLost);
  const aggResources = setUpAggRendererResources(getWasContextLost);

  const cleanUp = () => {
    nonAggResources.cleanUpResources();
    aggResources.cleanUpResources();
    cleanUpRenderer();
  };

  return {
    renderer,
    nonAgg: omit(nonAggResources, "cleanUpResources"),
    agg: omit(aggResources, "cleanUpResources"),
    cleanUp,
  };
}

// TODO: get skipped data
export function drawAggShreds(
  renderer: RendererObj["renderer"],
  resources: AggRendererResources,
  aggShreds: AggShreds,
  getRelativeMs: (absoluteMs: bigint) => number,
) {
  const {
    granularity,
    reference_ts_ns,
    turbine,
    repair,
    reconstructed,
    published,
  } = aggShreds;
  const referenceMs = getRelativeMs(reference_ts_ns);
  const bucketMs = msBucketSizes[granularity];

  let maxShredsPerBucket = 0;
  let rectanglesCount = 0;

  const types = [
    [repair, colors.replayedRepair],
    [reconstructed, colors.replayedNothing],
    [turbine, colors.replayedTurbine],
    [published, colors.published],
  ] as const;

  for (let i = 0; i < repair.length; i++) {
    let total = 0;
    types.forEach(([t]) => {
      const count = t[i] ?? 0;
      total += count;
      if (count) {
        rectanglesCount++;
      }
    });
    maxShredsPerBucket = Math.max(total, maxShredsPerBucket);
  }

  const { camera, cameraReferenceMs, scene } = resources;
  updateCameraYRange(camera, maxShredsPerBucket);

  const mesh = resources.prevMesh;

  /** store mesh positions relative to referenceX. This allows CPU to see small coordinates */
  if (mesh.referenceX == null) {
    mesh.referenceX = cameraReferenceMs;
  }

  ensureCapacity(mesh, rectanglesCount);

  let rectangleIdx = 0;
  for (let i = 0; i < repair.length; i++) {
    const startMs = referenceMs + i * bucketMs;
    const endMs = startMs + bucketMs;
    const centerX = (startMs + endMs) / 2;
    const adjustedCenterX = centerX - mesh.referenceX;
    const width = endMs - startMs;
    let y = 0;
    for (const [type, color] of types) {
      const count = type[i];
      if (!count) continue;
      addRectangleToMesh(
        mesh,
        rectangleIdx,
        adjustedCenterX - width / 2,
        y - count,
        width,
        count,
        color,
      );
      rectangleIdx++;
      y -= count;
    }
  }

  updateRectMeshCount(mesh, rectanglesCount);
  mesh.mesh.position.x = mesh.referenceX - cameraReferenceMs;

  // switch out the prev mesh content
  const prevMesh = resources.currentMesh;
  prevMesh.referenceX = undefined;
  scene.remove(prevMesh.mesh);
  resources.prevMesh = prevMesh;

  scene.add(mesh.mesh);
  resources.currentMesh = mesh;
  renderer.render(resources.scene, resources.camera);
}

export function isAggregate(range: TsRange) {
  return range[1] - range[0] > SHREDS_AGG_THRESHOLD_MS;
}
