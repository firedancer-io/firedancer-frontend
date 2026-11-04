import { getDefaultStore } from "jotai";
import type { RectMesh, TsRange } from "../../WebGl/webglUtils";
import { createRectMesh } from "../../WebGl/webglUtils";
import { updateEdgeViewWidth } from "./edgeUtils";
import {
  FEC_MESH_CAPACITY,
  SHRED_MESH_CAPACITY,
} from "../../Shreds/WebGl/const";
import { getDrawInfo } from "../../Shreds/chartUtils";
import {
  drawSlotShreds,
  releaseMesh,
  updateCameraXRange,
} from "../../Shreds/WebGl/drawUtils";
import type { ShredsGranularity } from "../../../api/types";
import { ShredsGranularityEnum } from "../../../api/entities";
import {
  calcAbsoluteNs,
  calcRelativeMs,
  getTileIdxRangeWithOverscan,
} from "../utils";
import { getNonAggAtoms } from "./atoms";
import { OVERSCAN_TILES_COUNT, tileSizeNs } from "./useNonAggShredsQuery";
import {
  SHREDS_AGG_THRESHOLD_MS,
  type NonAggRendererResources,
  type RendererObj,
} from "./const";

const store = getDefaultStore();

const NON_AGG_FEC_THRESHOLD_MS = 30_000;

// alpha = 1 at the FEC<->shred boundary, alpha = 0 at the FEC<->agg boundary.
// drop off exponentially, faster near shred boundary
const SHRED_EDGE_OPACITY = 1;
const FEC_EDGE_FALLOFF = 3;

function getFecEdgeOpacity(windowSizeMs: number): number {
  const t =
    (windowSizeMs - NON_AGG_FEC_THRESHOLD_MS) /
    (SHREDS_AGG_THRESHOLD_MS - NON_AGG_FEC_THRESHOLD_MS);
  const clamped = Math.min(1, Math.max(0, t));
  return Math.pow(1 - clamped, FEC_EDGE_FALLOFF);
}

/**
 * Hide slots that we know will be complete but we don't
 * have the completion event for, if they are behind by this threshold.
 * The threshold prevents live data from flashing in late.
 */
const STALE_INCOMPLETE_THRESHOLD_MS = 3_000;

export function getNonAggGranularity(windowSizeMs: number) {
  return windowSizeMs > NON_AGG_FEC_THRESHOLD_MS
    ? ShredsGranularityEnum.fec
    : ShredsGranularityEnum.shred;
}

function getOtherGranularity(
  granularity: ShredsGranularity,
): ShredsGranularity {
  return granularity === ShredsGranularityEnum.fec
    ? ShredsGranularityEnum.shred
    : ShredsGranularityEnum.fec;
}

export function moveNonAggCamera(
  resources: NonAggRendererResources,
  visibleRange: TsRange,
) {
  const { camera } = resources;

  const cameraReferenceMs = visibleRange[0];
  resources.cameraReferenceMs = cameraReferenceMs;

  const changed = updateCameraXRange(
    [visibleRange[0] - cameraReferenceMs, visibleRange[1] - cameraReferenceMs],
    camera,
  );

  // Move meshes to match camera reference change
  for (const mesh of resources.meshes.values()) {
    mesh.mesh.position.x =
      (mesh.referenceX ?? cameraReferenceMs) - cameraReferenceMs;
  }
  for (const mesh of resources.edgeMeshes.values()) {
    mesh.mesh.position.x =
      (mesh.referenceX ?? cameraReferenceMs) - cameraReferenceMs;
  }

  return changed;
}

export function getSlotMeshKey(
  granularity: ShredsGranularity,
  slotNumber: number,
): string {
  return `${granularity}:${slotNumber}`;
}

/**
 * Get min and max slot numbers whose rendered span intersects the draw range.
 */
function getSlotRangeForDrawRange(
  granularity: ShredsGranularity,
  [drawStart, drawEnd]: TsRange,
): { min: number; max: number } | undefined {
  let min = Infinity;
  let max = -Infinity;
  for (const g of [granularity, getOtherGranularity(granularity)]) {
    const slotsShreds = store.get(getNonAggAtoms(g).slotsShreds);
    if (!slotsShreds) continue;
    for (const [slotNumber, slot] of slotsShreds.slots) {
      if (slot.minEventTsDelta == null || slot.minEventTsDelta > drawEnd) {
        continue;
      }
      if (
        slot.completionTsDelta != null &&
        slot.completionTsDelta < drawStart
      ) {
        continue;
      }
      if (slotNumber < min) min = slotNumber;
      if (slotNumber > max) max = slotNumber;
    }
  }

  if (min === Infinity) return undefined;
  return { min, max };
}

/**
 * Draw shreds at active granularity, or the fallback if available.
 */
export function drawNonAggShreds(
  rendererObj: RendererObj,
  granularity: ShredsGranularity,
  referenceNs: bigint,
  visibleRange: TsRange,
  worldRange: TsRange,
) {
  const { firstTile, lastTile } = getTileIdxRangeWithOverscan(
    [
      calcAbsoluteNs(referenceNs, visibleRange[0]),
      calcAbsoluteNs(referenceNs, visibleRange[1]),
    ],
    [
      calcAbsoluteNs(referenceNs, worldRange[0]),
      calcAbsoluteNs(referenceNs, worldRange[1]),
    ],
    tileSizeNs,
    OVERSCAN_TILES_COUNT,
  );

  const resources = rendererObj.nonAggResources;

  const viewportWidthPx = rendererObj.renderer.domElement.width;
  if (viewportWidthPx > 0) {
    updateEdgeViewWidth(resources.edgeResources.rectMaterial, viewportWidthPx);
  }

  const edgeOpacity =
    granularity === ShredsGranularityEnum.fec
      ? getFecEdgeOpacity(visibleRange[1] - visibleRange[0])
      : SHRED_EDGE_OPACITY;
  resources.edgeResources.rectMaterial.uniforms.uOpacity.value = edgeOpacity;

  const releaseSlot = (key: string) => {
    releaseMesh(
      resources.scene,
      resources.meshes,
      resources.availableMeshes,
      key,
    );
    releaseMesh(
      resources.scene,
      resources.edgeMeshes,
      resources.availableEdgeMeshes,
      key,
    );
  };

  const shredsDrawRange: TsRange = [
    calcRelativeMs(referenceNs, BigInt(firstTile) * tileSizeNs),
    calcRelativeMs(referenceNs, BigInt(lastTile + 1) * tileSizeNs),
  ];

  const slotRange = getSlotRangeForDrawRange(granularity, shredsDrawRange);
  if (!slotRange) {
    // nothing to draw: drop the previous window's meshes
    for (const key of resources.meshes.keys()) {
      releaseSlot(key);
    }
    return;
  }

  const isFecActive = granularity === ShredsGranularityEnum.fec;

  const otherGranularity = getOtherGranularity(granularity);
  const activeShreds = store.get(getNonAggAtoms(granularity).slotsShreds);
  const otherShreds = store.get(getNonAggAtoms(otherGranularity).slotsShreds);

  // draw active, or if unavailable, fallback granularity data
  const otherData = otherShreds
    ? { isFec: !isFecActive, slotsShreds: otherShreds }
    : undefined;

  const primary = activeShreds
    ? { isFec: isFecActive, slotsShreds: activeShreds }
    : otherData;

  const fallback = activeShreds ? otherData : undefined;

  if (!primary) {
    for (const key of resources.meshes.keys()) {
      releaseSlot(key);
    }
    return;
  }

  const shouldHideStaleIncompleteSlot = (minEventTs: number) => {
    return worldRange[1] - minEventTs >= STALE_INCOMPLETE_THRESHOLD_MS;
  };

  const { maxShreds, slots: drawSlots } = getDrawInfo(
    slotRange.min,
    slotRange.max,
    primary,
    fallback,
    visibleRange,
    shredsDrawRange,
    (slot) => !!slot.skipped,
    undefined,
    shouldHideStaleIncompleteSlot,
  );

  // release meshes that are no longer drawn
  const orderedSet = new Set(
    drawSlots.map((s) =>
      getSlotMeshKey(
        s.isFec ? ShredsGranularityEnum.fec : ShredsGranularityEnum.shred,
        s.slotNumber,
      ),
    ),
  );
  for (const key of resources.meshes.keys()) {
    if (!orderedSet.has(key)) {
      releaseSlot(key);
    }
  }

  drawSlotShreds(
    visibleRange,
    shredsDrawRange,
    maxShreds,
    drawSlots,
    ({ slotNumber, isFec }) =>
      getSlotMesh(
        resources,
        slotNumber,
        isFec ? ShredsGranularityEnum.fec : ShredsGranularityEnum.shred,
      ),
    resources.camera,
    resources.cameraReferenceMs,
    undefined,
    ({ slotNumber, isFec }) =>
      getEdgeMesh(
        resources,
        slotNumber,
        isFec ? ShredsGranularityEnum.fec : ShredsGranularityEnum.shred,
      ),
  );
}

/**
 * Get existing mesh for slot, or set up a new one
 */
function getSlotMesh(
  resources: NonAggRendererResources,
  slotNumber: number,
  granularity: ShredsGranularity,
) {
  const meshKey = getSlotMeshKey(granularity, slotNumber);
  let slotMesh = resources.meshes.get(meshKey);
  const isNewMesh = !slotMesh;
  if (!slotMesh) {
    const lastMesh = resources.availableMeshes.pop();

    slotMesh =
      lastMesh ??
      createRectMesh(
        resources.resources,
        granularity === ShredsGranularityEnum.fec
          ? FEC_MESH_CAPACITY
          : SHRED_MESH_CAPACITY,
      );
    resources.meshes.set(meshKey, slotMesh);
    resources.scene.add(slotMesh.mesh);
    // paint bigger slot numbers on top of smaller numbers
    slotMesh.mesh.renderOrder = slotNumber;
  }
  return { isNewMesh, slotMesh };
}

// Marks appear above other events for that slot, but below bigger slot numbers' events
const EDGE_RENDER_ORDER_OFFSET = 0.5;

function getEdgeMesh(
  resources: NonAggRendererResources,
  slotNumber: number,
  granularity: ShredsGranularity,
): RectMesh {
  const meshKey = getSlotMeshKey(granularity, slotNumber);
  let edgeMesh = resources.edgeMeshes.get(meshKey);
  if (!edgeMesh) {
    const lastMesh = resources.availableEdgeMeshes.pop();

    edgeMesh =
      lastMesh ??
      createRectMesh(
        resources.edgeResources,
        granularity === ShredsGranularityEnum.fec
          ? FEC_MESH_CAPACITY
          : SHRED_MESH_CAPACITY,
      );
    resources.edgeMeshes.set(meshKey, edgeMesh);
    resources.scene.add(edgeMesh.mesh);
    edgeMesh.mesh.renderOrder = slotNumber + EDGE_RENDER_ORDER_OFFSET;
  }
  return edgeMesh;
}
