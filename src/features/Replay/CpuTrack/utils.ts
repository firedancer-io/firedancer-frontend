import * as THREE from "three";
import { uniq } from "lodash";
import { MAX_WEBGL_PX_RATIO } from "../../../consts.ts";
import type { Tile } from "../../../api/types.ts";
import type { ContextHelpers } from "../../WebGl/useWebGlEventHandlers.ts";
import {
  createRenderer,
  createUnitQuad,
  type TsRange,
} from "../../WebGl/webglUtils.ts";
import { msBucketSizes, nsBucketSizes } from "../const.ts";
import { calcAbsoluteNs, calcRelativeMs, getBucketIdx } from "../utils.ts";
import type { CpuBucketsByGranularity, TilesUtilization } from "./atoms.ts";
import { strokeWidthPx, topInsetPx, type CpuRow } from "./const.ts";
import {
  createDataTexture,
  createLineMaterial,
  EMPTY_UTILIZATION,
  MAX_DRAWN_BUCKETS,
  writeLineData,
} from "./lineMaterial.ts";
import { getAggGranularity } from "./useAggCpuQuery.ts";

export interface RendererObj {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  geometry: THREE.InstancedBufferGeometry;
  material: THREE.RawShaderMaterial;
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
  const created = createRenderer(
    0,
    0,
    MAX_WEBGL_PX_RATIO,
    setUpContextListeners,
    getWasContextLost,
  );
  if (!created) return;

  const { renderer, cleanUpRenderer } = created;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, topInsetPx, -1, 0.5, 10);
  camera.position.z = 1;

  const { data, texture } = createDataTexture();
  const material = createLineMaterial(texture, strokeWidthPx);

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
    texture,
    data,
    rows: [],
    cameraReferenceMs: 0,
    cleanUp,
  };
}

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
  rendererObj.camera.bottom = topInsetPx - height;
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
  aggCpu: CpuBucketsByGranularity,
) {
  const { rows, geometry } = rendererObj;
  const granularity = getAggGranularity(visibleRange[1] - visibleRange[0]);

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
    firstBucketIdx + MAX_DRAWN_BUCKETS - 1,
  );
  const bucketCount = lastBucketIdx - firstBucketIdx + 1;
  if (!rows.length || bucketCount <= 0) {
    geometry.instanceCount = 0;
    return;
  }

  const utilizationByBucketIdx = aggCpu.get(granularity);
  const tilesUtilizationByOffset = Array.from(
    { length: bucketCount + 2 },
    (_, i) => utilizationByBucketIdx?.get(firstBucketIdx - 1 + i),
  );

  geometry.instanceCount = writeLineData(
    rendererObj,
    rows.length,
    bucketCount,
    msBucketSizes[granularity],
    calcRelativeMs(
      referenceNs,
      BigInt(firstBucketIdx) * nsBucketSizes[granularity],
    ) - rendererObj.cameraReferenceMs,
    (row, bucketOffset) =>
      getRowUtilization(
        tilesUtilizationByOffset[bucketOffset + 1],
        rows[row].tileIdxs,
      ),
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

  tiles.forEach(({ kind, kind_id }, i) => {
    if (!selectedKinds.includes(kind)) return;

    if (splitByTile) {
      const key = `${kind}:${kind_id}`;
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
