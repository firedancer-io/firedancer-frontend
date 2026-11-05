import * as THREE from "three";
import { uniq } from "lodash";
import type { AggGranularity, Tile } from "../../../api/types.ts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers.ts";
import {
  createRenderer,
  createUnitQuad,
  type TsRange,
} from "../../WebGl/webglUtils.ts";
import { msBucketSizes, nsBucketSizes } from "../const.ts";
import { calcAbsoluteNs, calcRelativeMs, getBucketIdx } from "../utils.ts";
import type { CpuUtilizationByGranularity, TilesUtilization } from "./atoms.ts";
import {
  forEachDrawnBucket,
  type BucketOverlap,
  type GetDrawTiles,
} from "../useAggQuery.ts";
import {
  getTileKey,
  rowGapPx,
  rowPaddingPx,
  strokeWidthPx,
  type CpuRow,
} from "./const.ts";
import { getRowsLayout, trackInsetPx } from "../layout.ts";
import {
  createDataTexture,
  createSparklineMaterial,
  EMPTY_UTILIZATION,
  MAX_DRAWN_POINTS,
  writeSparklineData,
} from "./sparklineMaterial.ts";
import { createSlotHighlight, type SlotHighlight } from "../slotHighlight.ts";

const tmpSize = new THREE.Vector2();

export interface RendererObj {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  geometry: THREE.InstancedBufferGeometry;
  material: THREE.RawShaderMaterial;
  highlight: SlotHighlight;
  texture: THREE.DataTexture;
  data: Float32Array;
  rows: CpuRow[];
  cameraReferenceMs: number;
  cleanUp: () => void;
}

export function setUpRenderer(
  setUpContextListeners: ContextHelpers["setUpContextListeners"],
  getWasContextLost: ContextHelpers["getWasContextLost"],
): RendererObj | undefined {
  const created = createRenderer(setUpContextListeners, getWasContextLost);
  if (!created) return;

  const { renderer, cleanUpRenderer } = created;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, 0.5, 10);
  camera.position.z = 1;

  const { data, texture } = createDataTexture();
  const highlight = createSlotHighlight();
  const material = createSparklineMaterial(texture, strokeWidthPx, highlight);

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
    if (!getWasContextLost()) {
      geometry.dispose();
      unitQuad.dispose();
      material.dispose();
      texture.dispose();
    }
    cleanUpRenderer();
  };

  return {
    renderer,
    scene,
    camera,
    geometry,
    material,
    highlight,
    texture,
    data,
    rows: [],
    cameraReferenceMs: 0,
    cleanUp,
  };
}

export function getCpuRowsLayout(heightPx: number, rowCount: number) {
  return getRowsLayout(heightPx, rowCount, {
    insetPx: trackInsetPx.cpu,
    fillWhenThin: true,
    gapPx: rowGapPx,
  });
}

export function resizeRenderer(rendererObj: RendererObj) {
  const { x: width, y: height } = rendererObj.renderer.getSize(tmpSize);
  const { topPx, rowPx, gapPx } = getCpuRowsLayout(
    height,
    rendererObj.rows.length,
  );
  const { uniforms } = rendererObj.material;
  (uniforms.uResolution.value as THREE.Vector2).set(width, height);
  uniforms.uRowStride.value = rowPx + gapPx;
  const rowPadPx = Math.min(rowPaddingPx, rowPx / 4);
  uniforms.uRowPad.value = rowPadPx;
  uniforms.uHalfWidth.value = Math.min(strokeWidthPx / 2, rowPadPx);
  uniforms.uPlotHeight.value = rowPx - 2 * rowPadPx;
  rendererObj.camera.top = topPx;
  rendererObj.camera.bottom = topPx - height;
  rendererObj.camera.updateProjectionMatrix();
}

export function moveCpuCamera(
  rendererObj: RendererObj,
  visibleRangeMs: TsRange,
) {
  const { camera } = rendererObj;

  const cameraReferenceMs = visibleRangeMs[0];
  rendererObj.cameraReferenceMs = cameraReferenceMs;
  camera.left = visibleRangeMs[0] - cameraReferenceMs;
  camera.right = visibleRangeMs[1] - cameraReferenceMs;
  camera.updateProjectionMatrix();
}

/**
 * Mean of the row's tiles with samples
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

export function drawCpuData(
  rendererObj: RendererObj,
  referenceNs: bigint,
  visibleRange: TsRange,
  aggCpu: CpuUtilizationByGranularity,
  granularity: AggGranularity,
  getDrawTiles: GetDrawTiles,
) {
  const { rows, geometry } = rendererObj;

  const firstBucketIdx = getBucketIdx(
    calcAbsoluteNs(referenceNs, visibleRange[0]),
    granularity,
    false,
  );
  // the bucket after the visible end has a segment crossing the edge
  const lastBucketIdx = Math.min(
    getBucketIdx(
      calcAbsoluteNs(referenceNs, visibleRange[1]),
      granularity,
      true,
    ) + 1,
    firstBucketIdx + MAX_DRAWN_POINTS - 1,
  );
  const drawnBucketCount = lastBucketIdx - firstBucketIdx + 1;
  if (!rows.length || drawnBucketCount <= 0) {
    geometry.instanceCount = 0;
    return;
  }

  // one point per drawn bucket + the one before
  const pointsTilesUtilization = new Array<TilesUtilization | undefined>(
    drawnBucketCount + 1,
  );
  forEachDrawnBucket(
    getDrawTiles(granularity, firstBucketIdx - 1, lastBucketIdx),
    granularity,
    aggCpu,
    resampleTilesUtilization,
    (bucketIdx, tilesUtilization) => {
      pointsTilesUtilization[bucketIdx - firstBucketIdx + 1] = tilesUtilization;
    },
  );

  geometry.instanceCount = writeSparklineData(
    rendererObj,
    rows.length,
    drawnBucketCount,
    msBucketSizes[granularity],
    calcRelativeMs(
      referenceNs,
      BigInt(firstBucketIdx) * nsBucketSizes[granularity],
    ) - rendererObj.cameraReferenceMs,
    (row, pointIdx) =>
      getRowUtilization(
        pointsTilesUtilization[pointIdx + 1],
        rows[row].tileIdxs,
      ),
  );
}

/**
 * Average each tile's utilization, weighted by overlap
 */
function resampleTilesUtilization(
  overlaps: BucketOverlap<TilesUtilization>[],
): TilesUtilization {
  const sums: number[] = [];
  const weights: number[] = [];
  for (const { value, overlapMs } of overlaps) {
    value.forEach((utilization, tileIdx) => {
      if (utilization == null) return;
      sums[tileIdx] = (sums[tileIdx] ?? 0) + utilization * overlapMs;
      weights[tileIdx] = (weights[tileIdx] ?? 0) + overlapMs;
    });
  }
  return Array.from({ length: weights.length }, (_, tileIdx) =>
    weights[tileIdx] ? sums[tileIdx] / weights[tileIdx] : null,
  );
}

export function getTileKinds(tiles: Tile[]) {
  return uniq(tiles.map(({ kind }) => kind)).sort((a, b) => a.localeCompare(b));
}

/**
 * One row per selected tile kind, or per tile if split
 */
export function getCpuRows(
  tiles: Tile[],
  selectedKinds: string[],
  splitByTile: boolean,
): CpuRow[] {
  const rows: CpuRow[] = [];
  const rowByKind = new Map<string, CpuRow>();

  tiles.forEach((tile, i) => {
    const { kind } = tile;
    if (!selectedKinds.includes(kind)) return;

    if (splitByTile) {
      const key = getTileKey(tile);
      rows.push({ key, label: key, tileIdxs: [i] });
      return;
    }

    const row = rowByKind.get(kind);
    if (row) {
      row.tileIdxs.push(i);
    } else {
      const newRow = { key: kind, label: kind, tileIdxs: [i] };
      rowByKind.set(kind, newRow);
      rows.push(newRow);
    }
  });

  return rows;
}
