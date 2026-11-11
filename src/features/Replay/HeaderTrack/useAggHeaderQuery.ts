import { useCallback } from "react";
import {
  calcAbsoluteNsRange,
  getAggSlotsGranularity,
  getVisibleWorldRangeNs,
  getWindowNs,
} from "../utils";
import type { AggSlots } from "../../../api/types";
import type { TsRange } from "../../WebGl/webglUtils";
import { useAggQuery } from "../useAggQuery";
import { isRangeCovered } from "../coverage";
import { AGG_SLOTS_QUERY_KEY } from "../useSlotsQuery";
import {
  addAggSlotsAtom,
  deleteAggSlotsBucketsAtom,
  aggHeaderEmitterAtom,
  aggSlotsDrawTilesAtom,
} from "./aggAtoms";

export function useAggHeaderQuery(chartId: string) {
  const aggQuery = useAggQuery<AggSlots>({
    chartId,
    queryKey: AGG_SLOTS_QUERY_KEY,
    addAtom: addAggSlotsAtom,
    deleteBucketsAtom: deleteAggSlotsBucketsAtom,
    emitterAtom: aggHeaderEmitterAtom,
    drawTilesAtom: aggSlotsDrawTilesAtom,
    getGranularity: getAggSlotsGranularity,
  });
  const { granularityLevels } = aggQuery;

  /**
   * Whether every in world visible tile can be drawn from some granularity
   */
  const isVisibleDrawable = useCallback(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) =>
      isRangeCovered(
        granularityLevels,
        getAggSlotsGranularity(visibleRange[1] - visibleRange[0]),
        getVisibleWorldRangeNs(referenceNs, visibleRange, worldRange),
        getWindowNs(visibleRange),
        calcAbsoluteNsRange(referenceNs, worldRange),
      ),
    [granularityLevels],
  );

  return { ...aggQuery, isVisibleDrawable };
}
