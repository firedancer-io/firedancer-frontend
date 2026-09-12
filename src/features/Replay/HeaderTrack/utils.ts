import { msBucketSizes, nsBucketSizes } from "../const";
import * as THREE from "three";
import { MAX_WEBGL_PX_RATIO, nsPerMs } from "../../../consts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers";
import {
  createWebglResources,
  createRectMesh,
  disposeWebglResources,
  createRenderer,
  ensureCapacity,
  addRectangleToMesh,
  updateRectMeshCounts,
  type TsRange,
  type NsTsRange,
} from "../../WebGl/webglUtils";
import {
  HEADER_AGG_THRESHOLD_MS,
  type AggRendererResources,
  type RendererObj,
} from "./const";
import { omit } from "lodash";
import type { SlotBucketsByGranularity } from "./atoms";
import { getAggGranularity, OVERSCAN_BUCKETS } from "./useAggHeaderQuery";
import { colors, colorStates, getBucketColorRatios } from "../MiniMap/utils";

export const trackHeight = 25;
const minY = 0;
const maxY = 1;

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
  const aggResources = setUpAggResources(getWasContextLost);
  // TODO: set up non-agg resources

  const cleanUp = () => {
    aggResources.cleanUpResources();
    // TODO: add non-agg clean up
    cleanUpRenderer();
  };

  return {
    renderer,
    aggResources: omit(aggResources, "cleanUpResources"),
    cleanUp,
  };
}

export function setUpAggResources(
  getWasContextLost: ContextHelpers["getWasContextLost"],
) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 0, maxY, minY, 0.5, 10);
  camera.position.z = 1;

  const resources = createWebglResources(1);
  const mesh = createRectMesh(resources);

  scene.add(mesh.mesh);

  const cleanUpResources = () => {
    // If context was lost at some point, its GPU objects are already gone so skip objects disposal,
    // to prevent warnings e.g. WebGL: INVALID_OPERATION: delete: object does not belong to this context
    // Three doesn't restore GPU objects for restored contexts unless there's a render.
    // Remount on restore to reset the context listeners state
    if (!getWasContextLost()) {
      mesh.mesh.geometry.dispose();
      // dispose this chart's own unitQuad / sharedMaterial
      disposeWebglResources(resources);
    }
  };

  return {
    camera,
    scene,
    resources,
    mesh,
    cameraReferenceMs: 0,
    cleanUpResources,
  };
}

/**
 * Redraw all available data in the visible range at the appropriate granularity level
 */
export function drawAggSlots(
  rendererObj: RendererObj,
  absoluteVisibleRange: NsTsRange,
  getRelativeMs: (absoluteNs: bigint) => number,
  aggSlots: SlotBucketsByGranularity,
) {
  const granularity = getAggGranularity(
    absoluteVisibleRange[1] - absoluteVisibleRange[0],
  );

  const slotsByBucketIdx = aggSlots.get(granularity);
  if (!slotsByBucketIdx) return;

  const { cameraReferenceMs, mesh } = rendererObj.aggResources;
  const bucketSizeNs = nsBucketSizes[granularity];
  const startIdx = Number(absoluteVisibleRange[0] / bucketSizeNs);
  // don't include next bucket if on boundary
  const endIdx = Number((absoluteVisibleRange[1] - 1n) / bucketSizeNs);
  const width = msBucketSizes[granularity];

  // min 1px
  const minHeightRatio = (maxY - minY) / trackHeight;

  let rectIdx = 0;
  for (
    let bucketIdx = startIdx - OVERSCAN_BUCKETS;
    bucketIdx <= endIdx + OVERSCAN_BUCKETS;
    bucketIdx++
  ) {
    const slotCounts = slotsByBucketIdx.get(bucketIdx);
    if (!slotCounts) continue;

    const startNs = BigInt(bucketIdx) * bucketSizeNs;
    // shift start by camera reference to keep coordinates small
    const x = getRelativeMs(startNs) - cameraReferenceMs;

    const bucketColorRatios = getBucketColorRatios(
      slotCounts.start_slot,
      slotCounts.end_slot,
      slotCounts.skipped,
      minHeightRatio,
    );

    let y = minY;
    for (const state of colorStates) {
      const startY = y;
      const ratio = bucketColorRatios[state];
      // keep a non-zero band visible (at least 1px)
      const height = ratio * (maxY - minY);
      const color = colors[state];

      addRectangleToMesh(mesh, rectIdx, x, startY, width, height, color);

      y = startY + height;
      rectIdx++;
    }
  }

  ensureCapacity(mesh, rectIdx);
  updateRectMeshCounts(mesh, rectIdx);

  /** store mesh positions relative to referenceX. This allows GPU to see small coordinates */
  mesh.referenceX = cameraReferenceMs;
  mesh.mesh.position.x = 0;
}

/**
 * Move camera and update mesh reference x
 */
export function moveAggCamera(
  resources: AggRendererResources,
  visibleRangeMs: TsRange,
) {
  const { camera, mesh } = resources;

  // Store a camera reference to make mesh coordinates smaller for GPU
  const cameraReferenceMs = visibleRangeMs[0];
  resources.cameraReferenceMs = cameraReferenceMs;
  camera.left = visibleRangeMs[0] - cameraReferenceMs;
  camera.right = visibleRangeMs[1] - cameraReferenceMs;
  camera.updateProjectionMatrix();

  // Mesh point coordinates are already set. Move them to match camera reference
  // by manipulating mesh position.x
  if (mesh.referenceX != null) {
    mesh.mesh.position.x = mesh.referenceX - cameraReferenceMs;
  }
}

export function isAggregate(range: NsTsRange) {
  return (
    range[1] - range[0] > BigInt(HEADER_AGG_THRESHOLD_MS) * BigInt(nsPerMs)
  );
}
