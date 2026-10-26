import * as THREE from "three";
import type { AggGranularity } from "../../../api/types";
import { MAX_WEBGL_PX_RATIO } from "../../../consts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers";
import {
  createRenderer,
  createUnitQuad,
  type TsRange,
} from "../../WebGl/webglUtils";
import { msBucketSizes, nsBucketSizes } from "../const";
import { calcAbsoluteNs, calcRelativeMs, getBucketIdx } from "../utils";
import type { CpuBucketsByGranularity, TilesUtilization } from "./atoms";
import { strokeWidthPx, type CpuRow } from "./const";
import {
  createDataTexture,
  createLineMaterial,
  EMPTY_UTILIZATION,
  MAX_TEXTURE_ROWS,
  RING_SIZE,
} from "./lineMaterial";
import { getAggGranularity } from "./useAggCpuQuery";

/** values per ring column (texture row) */
const COLUMN_STRIDE = MAX_TEXTURE_ROWS;

/**
 * Past this many pending ranges (e.g. updates while the tab is hidden and
 * nothing renders), upload the whole texture instead
 */
const MAX_PENDING_UPDATE_RANGES = RING_SIZE;

export interface RendererObj {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  geometry: THREE.InstancedBufferGeometry;
  material: THREE.RawShaderMaterial;
  texture: THREE.DataTexture;
  data: Float32Array;
  /** bucket idx held by each ring column, NaN if none */
  columnBuckets: Float64Array;
  /**
   * The whole texture uploads on the next render, so writes don't need to
   * queue ranges. Queuing one would limit the upload to that range.
   */
  isFullUploadPending: boolean;
  /** granularity and rows the texture was filled for */
  granularity: AggGranularity | undefined;
  rows: CpuRow[];
  /** buckets loaded into the texture: the drawn buckets plus one on each side */
  loadedRange: [startIdx: number, endIdx: number] | undefined;
  /**
   * origin ms subtracted from the camera bounds so the GPU works with small,
   * float32-precise coordinates
   */
  cameraReferenceMs: number;
  cleanUp: () => void;
}

export function setUpRenderer(
  canvasWidth: number,
  canvasHeight: number,
  setUpContextListeners: ContextHelpers["setUpContextListeners"],
  getWasContextLost: ContextHelpers["getWasContextLost"],
): RendererObj | undefined {
  const created = createRenderer(
    canvasWidth,
    canvasHeight,
    MAX_WEBGL_PX_RATIO,
    setUpContextListeners,
    getWasContextLost,
  );
  if (!created) return;

  const { renderer, cleanUpRenderer } = created;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, 0.5, 10);
  camera.position.z = 1;

  const { data, texture } = createDataTexture();
  const material = createLineMaterial(texture, strokeWidthPx);
  texture.onUpdate = () => {
    rendererObj.isFullUploadPending = false;
  };

  // no instance attributes: instances are addressed by gl_InstanceID
  const unitQuad = createUnitQuad();
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = unitQuad.index;
  geometry.setAttribute("position", unitQuad.getAttribute("position"));
  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const cleanUp = () => {
    // If context was lost at some point, its GPU objects are already gone so skip objects disposal,
    // to prevent warnings e.g. WebGL: INVALID_OPERATION: delete: object does not belong to this context
    if (!getWasContextLost()) {
      geometry.dispose();
      unitQuad.dispose();
      material.dispose();
      texture.dispose();
    }
    cleanUpRenderer();
  };

  const rendererObj: RendererObj = {
    renderer,
    scene,
    camera,
    geometry,
    material,
    texture,
    data,
    columnBuckets: new Float64Array(RING_SIZE).fill(NaN),
    // the first upload sends the whole texture
    isFullUploadPending: true,
    granularity: undefined,
    rows: [],
    loadedRange: undefined,
    cameraReferenceMs: 0,
    cleanUp,
  };
  return rendererObj;
}

/**
 * Match the canvas and camera to the track size
 */
export function resizeRenderer(
  rendererObj: RendererObj,
  width: number,
  height: number,
) {
  rendererObj.renderer.setSize(width, height);
  (rendererObj.material.uniforms.uResolution.value as THREE.Vector2).set(
    width,
    height,
  );
  rendererObj.camera.bottom = -height;
  rendererObj.camera.updateProjectionMatrix();
}

/**
 * Move camera to the visible range
 */
export function moveCpuCamera(
  rendererObj: RendererObj,
  visibleRangeMs: TsRange,
) {
  const { camera } = rendererObj;

  // Store a camera reference to make coordinates smaller for GPU
  const cameraReferenceMs = visibleRangeMs[0];
  rendererObj.cameraReferenceMs = cameraReferenceMs;
  camera.left = visibleRangeMs[0] - cameraReferenceMs;
  camera.right = visibleRangeMs[1] - cameraReferenceMs;
  camera.updateProjectionMatrix();
}

function getColumn(bucketIdx: number) {
  return ((bucketIdx % RING_SIZE) + RING_SIZE) % RING_SIZE;
}

/**
 * Mean utilization of the row's tiles, ignoring tiles without samples
 */
function getRowUtilization(
  tilesUtilization: TilesUtilization | undefined,
  tileIdxs: number[],
) {
  if (!tilesUtilization) return EMPTY_UTILIZATION;

  let sum = 0;
  let count = 0;
  for (const tileIdx of tileIdxs) {
    const value = tilesUtilization[tileIdx];
    if (value == null) continue;
    sum += value;
    count++;
  }
  return count ? sum / count : EMPTY_UTILIZATION;
}

/**
 * Write a bucket's row values into its ring column and queue the column for upload
 */
function writeColumn(
  rendererObj: RendererObj,
  bucketIdx: number,
  utilizationByBucketIdx: Map<number, TilesUtilization> | undefined,
) {
  const { data, rows, texture, columnBuckets } = rendererObj;
  const col = getColumn(bucketIdx);
  const tilesUtilization = utilizationByBucketIdx?.get(bucketIdx);

  const offset = col * COLUMN_STRIDE;
  for (let row = 0; row < rows.length; row++) {
    data[offset + row] = getRowUtilization(
      tilesUtilization,
      rows[row].tileIdxs,
    );
  }
  columnBuckets[col] = bucketIdx;

  if (!rendererObj.isFullUploadPending) {
    if (texture.updateRanges.length >= MAX_PENDING_UPDATE_RANGES) {
      // upload everything instead
      texture.clearUpdateRanges();
      rendererObj.isFullUploadPending = true;
    } else {
      texture.addUpdateRange(offset, COLUMN_STRIDE);
    }
  }
  texture.needsUpdate = true;
}

/**
 * Discard texture contents for a new row layout. The drawn buckets are
 * refilled on the next sync.
 */
export function setRows(rendererObj: RendererObj, rows: CpuRow[]) {
  if (rendererObj.rows === rows) return;
  rendererObj.rows = rows;
  rendererObj.columnBuckets.fill(NaN);
}

/**
 * Load buckets entering the drawn range into the texture, and point the
 * shader at them. Only columns not already holding their bucket are written,
 * so panning writes just the newly visible buckets.
 */
export function syncCpuData(
  rendererObj: RendererObj,
  referenceNs: bigint,
  visibleRange: TsRange,
  aggCpu: CpuBucketsByGranularity,
) {
  const { rows, material, geometry, columnBuckets } = rendererObj;
  const granularity = getAggGranularity(visibleRange[1] - visibleRange[0]);
  if (granularity !== rendererObj.granularity) {
    rendererObj.granularity = granularity;
    columnBuckets.fill(NaN);
  }

  const firstBucketIdx = getBucketIdx(
    calcAbsoluteNs(referenceNs, visibleRange[0]),
    granularity,
    false,
  );
  // Each bucket's segment ends at its center, so also draw the bucket after
  // the visible end: its segment crosses the right edge. Without it the line
  // stops short of the edge by up to a bucket, then jumps when a bucket starts.
  // The ring must hold the drawn buckets plus a neighbor on each side.
  const lastBucketIdx = Math.min(
    getBucketIdx(
      calcAbsoluteNs(referenceNs, visibleRange[1]),
      granularity,
      true,
    ) + 1,
    firstBucketIdx + RING_SIZE - 3,
  );
  const bucketCount = lastBucketIdx - firstBucketIdx + 1;
  if (!rows.length || bucketCount <= 0) {
    geometry.instanceCount = 0;
    rendererObj.loadedRange = undefined;
    return;
  }

  const utilizationByBucketIdx = aggCpu.get(granularity);
  const loadedStart = firstBucketIdx - 1;
  const loadedEnd = lastBucketIdx + 1;
  for (let bucketIdx = loadedStart; bucketIdx <= loadedEnd; bucketIdx++) {
    if (columnBuckets[getColumn(bucketIdx)] === bucketIdx) continue;
    writeColumn(rendererObj, bucketIdx, utilizationByBucketIdx);
  }
  rendererObj.loadedRange = [loadedStart, loadedEnd];

  const { uniforms } = material;
  uniforms.uStartCol.value = getColumn(firstBucketIdx);
  uniforms.uBucketCount.value = bucketCount;
  uniforms.uBucketMs.value = msBucketSizes[granularity];
  uniforms.uStartXMs.value =
    // use bigint to prevent ms rounding imprecision
    calcRelativeMs(
      referenceNs,
      BigInt(firstBucketIdx) * nsBucketSizes[granularity],
    ) - rendererObj.cameraReferenceMs;
  geometry.instanceCount = rows.length * bucketCount;
}

/**
 * Rewrite loaded buckets in [startBucketIdx, endBucketIdx] whose data changed.
 * Buckets outside the loaded range are written when they're scrolled into view.
 */
export function updateCpuData(
  rendererObj: RendererObj,
  granularity: AggGranularity,
  startBucketIdx: number,
  endBucketIdx: number,
  aggCpu: CpuBucketsByGranularity,
) {
  const { loadedRange } = rendererObj;
  if (granularity !== rendererObj.granularity || !loadedRange) return;

  const utilizationByBucketIdx = aggCpu.get(granularity);
  const start = Math.max(startBucketIdx, loadedRange[0]);
  const end = Math.min(endBucketIdx, loadedRange[1]);
  for (let bucketIdx = start; bucketIdx <= end; bucketIdx++) {
    writeColumn(rendererObj, bucketIdx, utilizationByBucketIdx);
  }
}
