import { useCallback, useRef } from "react";
import { getDefaultStore } from "jotai";
import type * as THREE from "three";
import type { AggGranularity } from "../../api/types";
import { renderInRanges, type TsRange } from "../WebGl/webglUtils";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "./atoms";
import {
  getModeRanges,
  resolveCoverage,
  type DataLevel,
  type ModeRanges,
} from "./coverage";
import {
  getCoverageDrawTiles,
  OVERSCAN_BUCKETS,
  type GetDrawTiles,
} from "./useAggQuery";
import { msBucketSizes } from "./const";
import { calcAbsoluteNsRange } from "./utils";

const store = getDefaultStore();

interface SceneResources {
  scene: THREE.Scene;
  camera: THREE.Camera;
}

interface UseModeCoverageOpts<Id extends string> {
  /** agg then non agg granularities, from coarsest to finest */
  granularityLevels: DataLevel<Id>[];
  /** granularity the visible range should be drawn at */
  getTargetGranularity: (visibleRange: TsRange) => Id;
  /** granularity the agg mesh is drawn at, for a visible window size */
  getAggGranularity: (windowSizeMs: number) => AggGranularity;
}

/**
 * Resolve the visible ranges drawn by agg and by non agg, for tracks that draw
 * both modes. Ranges the target mode has no data for yet are drawn by the
 * other mode if it has them.
 */
export function useModeCoverage<Id extends string>({
  granularityLevels,
  getTargetGranularity,
  getAggGranularity,
}: UseModeCoverageOpts<Id>) {
  /** visible ms ranges drawn by each mode */
  const modeRangesRef = useRef<ModeRanges>({ agg: [], nonAgg: [] });

  /**
   * What the agg mesh was drawn for. Its ms range includes overscan. Partial
   * if non agg was drawn in some of the visible range, so the agg mesh leaves
   * it out.
   */
  const drawnAggRef = useRef<{
    targetGranularity: Id;
    range: TsRange;
    isPartial: boolean;
  }>();

  const isTargetAgg = useCallback(
    (targetGranularity: Id) =>
      granularityLevels.find(({ id }) => id === targetGranularity)?.isAgg ??
      true,
    [granularityLevels],
  );

  const resolveModeRanges = useCallback(() => {
    const referenceNs = store.get(referenceNsAtom);
    const visibleRange = store.get(visibleRangeAtom);
    const worldRange = store.get(worldRangeAtom);
    if (referenceNs == null || !visibleRange || !worldRange) {
      return modeRangesRef.current;
    }

    const targetGranularity = getTargetGranularity(visibleRange);
    const spans = resolveCoverage(
      granularityLevels,
      targetGranularity,
      calcAbsoluteNsRange(referenceNs, visibleRange),
      calcAbsoluteNsRange(referenceNs, worldRange),
    );
    modeRangesRef.current = getModeRanges(
      spans,
      isTargetAgg(targetGranularity),
      referenceNs,
    );
    return modeRangesRef.current;
  }, [getTargetGranularity, granularityLevels, isTargetAgg]);

  /**
   * Agg granularity and draw tiles to draw the agg mesh for the agg spans.
   * Records what the agg mesh is drawn for.
   */
  const startAggDraw = useCallback(() => {
    const referenceNs = store.get(referenceNsAtom);
    const visibleRange = store.get(visibleRangeAtom);
    const worldRange = store.get(worldRangeAtom);
    if (referenceNs == null || !visibleRange || !worldRange) return;

    const granularity = getAggGranularity(visibleRange[1] - visibleRange[0]);
    const targetGranularity = getTargetGranularity(visibleRange);
    const worldRangeNs = calcAbsoluteNsRange(referenceNs, worldRange);
    const getDrawTiles: GetDrawTiles = (
      drawGranularity,
      firstBucketIdx,
      lastBucketIdx,
    ) =>
      getCoverageDrawTiles(
        granularityLevels,
        targetGranularity,
        worldRangeNs,
        drawGranularity,
        firstBucketIdx,
        lastBucketIdx,
      );

    const overscanMs = OVERSCAN_BUCKETS * msBucketSizes[granularity];
    drawnAggRef.current = {
      targetGranularity,
      range: [visibleRange[0] - overscanMs, visibleRange[1] + overscanMs],
      isPartial:
        !isTargetAgg(targetGranularity) ||
        modeRangesRef.current.nonAgg.length > 0,
    };
    return { referenceNs, visibleRange, granularity, getDrawTiles };
  }, [getAggGranularity, getTargetGranularity, granularityLevels, isTargetAgg]);

  /**
   * Whether agg is drawn and its mesh was drawn for a different target
   * granularity, doesn't cover the visible range, or leaves out non agg spans
   */
  const shouldDrawAgg = useCallback(() => {
    const { agg, nonAgg } = modeRangesRef.current;
    const visibleRange = store.get(visibleRangeAtom);
    if (!agg.length || !visibleRange) return false;

    const drawn = drawnAggRef.current;
    return (
      nonAgg.length > 0 ||
      !drawn ||
      drawn.isPartial ||
      drawn.targetGranularity !== getTargetGranularity(visibleRange) ||
      visibleRange[0] < drawn.range[0] ||
      visibleRange[1] > drawn.range[1]
    );
  }, [getTargetGranularity]);

  /**
   * Whether agg is drawn and its mesh leaves out spans non agg drew, which
   * fall back to agg after non agg data changes, e.g. on eviction
   */
  const shouldDrawAggAfterNonAgg = useCallback(
    () =>
      modeRangesRef.current.agg.length > 0 && !!drawnAggRef.current?.isPartial,
    [],
  );

  /**
   * Render each mode's scene within its visible ranges
   */
  const renderModes = useCallback(
    (
      renderer: THREE.WebGLRenderer,
      agg: SceneResources,
      nonAgg: SceneResources,
    ) => {
      const visibleRange = store.get(visibleRangeAtom);
      if (!visibleRange) return;

      const ranges = modeRangesRef.current;
      renderInRanges(renderer, visibleRange, [
        { scene: agg.scene, camera: agg.camera, rangesMs: ranges.agg },
        { scene: nonAgg.scene, camera: nonAgg.camera, rangesMs: ranges.nonAgg },
      ]);
    },
    [],
  );

  return {
    modeRangesRef,
    resolveModeRanges,
    startAggDraw,
    shouldDrawAgg,
    shouldDrawAggAfterNonAgg,
    renderModes,
  };
}
