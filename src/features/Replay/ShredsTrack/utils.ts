import {
  drawShreds,
  updateCameraXRange,
  type RendererObj,
} from "../../Overview/ShredsProgression/WebGl/chartUtils";
import type { TsRange } from "../const";
import type * as THREE from "three";
import {
  shredsTimelineReferenceTsAtom,
  timelineShredsDataAtom,
} from "../../Overview/ShredsProgression/atoms";
import { getDefaultStore } from "jotai";
import { nsPerMs } from "../../../consts";

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

export function moveCamera(
  camera: THREE.OrthographicCamera,
  replayVisibleRange: TsRange,
  getRelativeMs: (absoluteNs: bigint) => number,
) {
  const shredsVisibleRange = convertToShredsRange(
    replayVisibleRange,
    getRelativeMs,
  );
  if (!shredsVisibleRange) return;

  updateCameraXRange(shredsVisibleRange, camera);
}

export function drawHistoricalShreds(
  rendererObj: RendererObj,
  shredsVisibleRange: TsRange,
  cssRange: [min: number, max: number],
) {
  const data = store.get(timelineShredsDataAtom);
  if (!data) return;
  return drawShreds(data, shredsVisibleRange, cssRange, rendererObj, true);
}
