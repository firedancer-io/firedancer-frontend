import { MAX_WEBGL_PX_RATIO } from "../../../consts.ts";
import * as THREE from "three";
import {
  createWebglResources,
  createRectMesh,
  disposeWebglResources,
  type RectMesh,
  type WebglResources,
  ensureCapacity,
  addRectangleToMesh,
  updateMeshCounts,
  type RgbColor,
  type TsRange,
  createRenderer,
} from "../../WebGl/webglUtils.ts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers.ts";
import { msBucketSizes } from "../const.ts";
import type { RevenueType } from "../../../api/entities.ts";
import type { AggRevenue } from "../../../api/types.ts";
import { omit } from "lodash";
import { clampNonZeroValue, logRatio } from "../../../mathUtils.ts";
import { revenueLogBase } from "../../Overview/SlotPerformance/TransactionBarsCard/consts.ts";

// TODO: set reasonable threshold with non-agg data
const AGGREGATE_THRESHOLD_MS = 0;

const REVENUE_COLOR: RgbColor = [116 / 255, 178 / 255, 238 / 255];
const REVENUE_OPACITY = 1;

const minY = 0;
const minNonZeroY = 0.1;
const maxY = 5;

export interface RendererObj {
  renderer: THREE.WebGLRenderer;
  aggResources: AggResources;
  // TODO: add nonAggResources
  cleanUp: () => void;
}

export interface AggResources {
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  resources: WebglResources;
  mesh: RectMesh;
  /**
   * origin ms subtracted from both the camera bounds and
   * the rectangle geometry so the GPU works with small, float32-precise coordinates
   * instead of ~3.4e8.
   * Mesh position x values must be updated when this changes
   */
  cameraReferenceMs: number;
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
): AggResources & { cleanUpResources: () => void } {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 0, maxY, minY, 0.5, 10);
  camera.position.z = 1;

  const resources = createWebglResources(REVENUE_OPACITY);
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

function getRevenueRatio(maxValue: bigint, value: bigint) {
  if (maxValue === 0n) return 0;
  const ratio = 1 / logRatio(Number(maxValue), Number(value), revenueLogBase);
  return clampNonZeroValue(ratio, minNonZeroY, maxY);
}

export function drawAggRevenue(
  rendererObj: RendererObj,
  type: RevenueType,
  aggRevenue: AggRevenue,
  getRelativeMs: (absoluteNs: bigint) => number,
) {
  const { granularity, reference_ts_ns } = aggRevenue;
  const referenceMs = getRelativeMs(reference_ts_ns);
  const bucketMs = msBucketSizes[granularity];

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

  const { cameraReferenceMs, mesh } = rendererObj.aggResources;

  /** store mesh positions relative to referenceX. This allows GPU to see small coordinates */
  if (mesh.referenceX == null) {
    mesh.referenceX = cameraReferenceMs;
  }
  mesh.mesh.position.x = mesh.referenceX - cameraReferenceMs;

  // draw nothing if max value is 0
  const dataCount = maxValue === 0n ? 0 : data.length;
  ensureCapacity(mesh, dataCount);
  updateMeshCounts(mesh, dataCount);

  for (let rectangleIdx = 0; rectangleIdx < dataCount; rectangleIdx++) {
    const [value, startMs] = data[rectangleIdx];
    const endMs = startMs + bucketMs;
    addRectangleToMesh(
      mesh,
      rectangleIdx,
      startMs - mesh.referenceX,
      minY,
      endMs - startMs,
      getRevenueRatio(maxValue, value),
      REVENUE_COLOR,
    );
  }
}

/**
 * Move camera and and update camera and mesh reference x
 */
export function moveAggCamera(
  rendererObj: RendererObj,
  visibleRangeMs: TsRange,
) {
  const { camera, mesh } = rendererObj.aggResources;

  // Store a camera reference to make mesh coordinates smaller for GPU
  const cameraReferenceMs = visibleRangeMs[0];
  rendererObj.aggResources.cameraReferenceMs = cameraReferenceMs;
  camera.left = visibleRangeMs[0] - cameraReferenceMs;
  camera.right = visibleRangeMs[1] - cameraReferenceMs;
  camera.updateProjectionMatrix();

  // Mesh point coordinates are already set. Move them to match camera reference
  // by manipulating mesh position.x
  if (mesh.referenceX != null) {
    mesh.mesh.position.x = mesh.referenceX - cameraReferenceMs;
  }
}

export function isAggregate(rangeMs: TsRange) {
  return rangeMs[1] - rangeMs[0] > AGGREGATE_THRESHOLD_MS;
}
