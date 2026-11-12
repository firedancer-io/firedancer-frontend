import { useCallback, useRef } from "react";
import { isEqual } from "lodash";
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
import { OVERSCAN_BUCKETS } from "./useAggQuery";
import {
  getCoverageDrawTiles,
  type AggDrawTile,
  type GetDrawTiles,
} from "./aggDraw";
import { msBucketSizes } from "./const";
import { calcAbsoluteNsRange, type GetAggGranularity } from "./utils";

const store = getDefaultStore();

interface DrawnAgg {
  granularity: AggGranularity;
  range: TsRange;
  drawTiles?: {
    firstBucketIdx: number;
    lastBucketIdx: number;
    tiles: AggDrawTile[];
  };
}

interface SceneResources {
  scene: THREE.Scene;
  camera: THREE.Camera;
}

interface UseModeCoverageOpts {
  /** Granularity levels ordered agg then non agg granularities from coarsest to finest */
  granularityLevels: DataLevel[];
  /** Granularity the visible range should be drawn at */
  getTargetGranularity: (visibleRange: TsRange) => string;
  /** Granularity the agg mesh is drawn at for a visible window size */
  getAggGranularity: GetAggGranularity;
}

/** Visible ranges each mode draws falling back to the other mode's data */
export function useModeCoverage({
  granularityLevels,
  getTargetGranularity,
  getAggGranularity,
}: UseModeCoverageOpts) {
  const modeRangesRef = useRef<ModeRanges>({ agg: [], nonAgg: [] });
  const drawnAggRef = useRef<DrawnAgg>();

  const isTargetAgg = useCallback(
    (targetGranularity: string) =>
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
    const visibleRangeNs = calcAbsoluteNsRange(referenceNs, visibleRange);
    const worldRangeNs = calcAbsoluteNsRange(referenceNs, worldRange);
    const spans = resolveCoverage(
      granularityLevels,
      targetGranularity,
      visibleRangeNs,
      getAggGranularity(visibleRange[1] - visibleRange[0], {
        ignoreMinimum: true,
      }),
      worldRangeNs,
    );
    modeRangesRef.current = getModeRanges(
      spans,
      isTargetAgg(targetGranularity),
      referenceNs,
    );
    return modeRangesRef.current;
  }, [getAggGranularity, getTargetGranularity, granularityLevels, isTargetAgg]);

  const startAggDraw = useCallback(() => {
    const referenceNs = store.get(referenceNsAtom);
    const visibleRange = store.get(visibleRangeAtom);
    const worldRange = store.get(worldRangeAtom);
    if (referenceNs == null || !visibleRange || !worldRange) return;

    const granularity = getAggGranularity(visibleRange[1] - visibleRange[0]);
    const worldRangeNs = calcAbsoluteNsRange(referenceNs, worldRange);
    const targetGranularity = getTargetGranularity(visibleRange);
    const viewAggGranularity = getAggGranularity(
      visibleRange[1] - visibleRange[0],
      { ignoreMinimum: true },
    );
    const overscanMs = OVERSCAN_BUCKETS * msBucketSizes[granularity];
    const drawn: DrawnAgg = {
      granularity,
      range: [visibleRange[0] - overscanMs, visibleRange[1] + overscanMs],
    };
    drawnAggRef.current = drawn;
    const getDrawTiles: GetDrawTiles = (
      drawGranularity,
      firstBucketIdx,
      lastBucketIdx,
    ) => {
      const tiles = getCoverageDrawTiles(
        granularityLevels,
        targetGranularity,
        viewAggGranularity,
        worldRangeNs,
        drawGranularity,
        firstBucketIdx,
        lastBucketIdx,
      );
      drawn.drawTiles = { firstBucketIdx, lastBucketIdx, tiles };
      return tiles;
    };
    return { referenceNs, visibleRange, granularity, getDrawTiles };
  }, [getAggGranularity, getTargetGranularity, granularityLevels]);

  const shouldDrawAgg = useCallback(() => {
    const referenceNs = store.get(referenceNsAtom);
    const visibleRange = store.get(visibleRangeAtom);
    const worldRange = store.get(worldRangeAtom);
    if (
      !modeRangesRef.current.agg.length ||
      referenceNs == null ||
      !visibleRange ||
      !worldRange
    ) {
      return false;
    }

    const drawn = drawnAggRef.current;
    if (
      !drawn?.drawTiles ||
      drawn.granularity !==
        getAggGranularity(visibleRange[1] - visibleRange[0]) ||
      visibleRange[0] < drawn.range[0] ||
      visibleRange[1] > drawn.range[1]
    ) {
      return true;
    }

    // redraw if the coverage the mesh was drawn from has changed
    const { firstBucketIdx, lastBucketIdx, tiles } = drawn.drawTiles;
    return !isEqual(
      getCoverageDrawTiles(
        granularityLevels,
        getTargetGranularity(visibleRange),
        getAggGranularity(visibleRange[1] - visibleRange[0], {
          ignoreMinimum: true,
        }),
        calcAbsoluteNsRange(referenceNs, worldRange),
        drawn.granularity,
        firstBucketIdx,
        lastBucketIdx,
      ),
      tiles,
    );
  }, [getAggGranularity, getTargetGranularity, granularityLevels]);

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
      if (!ranges.nonAgg.length) {
        renderer.render(agg.scene, agg.camera);
      } else if (!ranges.agg.length) {
        renderer.render(nonAgg.scene, nonAgg.camera);
      } else {
        // non agg has the most draw calls, so it's the base
        renderInRanges(renderer, visibleRange, nonAgg, {
          ...agg,
          rangesMs: ranges.agg,
        });
      }
    },
    [],
  );

  return {
    modeRangesRef,
    resolveModeRanges,
    startAggDraw,
    shouldDrawAgg,
    renderModes,
  };
}
