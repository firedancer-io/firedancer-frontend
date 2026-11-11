import { useCallback, useLayoutEffect, useRef } from "react";
import { getDefaultStore } from "jotai";
import AggHeaderTrack from "./AggHeaderTrack.tsx";
import { NonAggHeaderTrack } from "./NonAggHeaderTrack.tsx";
import AggHeaderBucketHighlight from "./AggHeaderBucketHighlight.tsx";
import styles from "./headerTrack.module.css";
import { Box } from "@radix-ui/themes";
import { trackHeight, trackMarginBottom, trackMarginTop } from "./const.ts";
import { aggHeaderEmitterAtom, isAggHeaderVisibleAtom } from "./aggAtoms.ts";
import { timelineSlotsEmitterAtom } from "./nonAggAtoms.ts";
import { isAggregate, resolveHeldDraw } from "./utils.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import { drawEventType } from "../const.ts";
import { useAggHeaderQuery } from "./useAggHeaderQuery.ts";
import { useNonAggHeaderQuery } from "./useNonAggHeaderQuery.ts";

const store = getDefaultStore();

interface HeaderTrackProps {
  width: number;
}

export default function HeaderTrack({ width }: HeaderTrackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const aggQuery = useAggHeaderQuery("agg-header-track");
  const nonAggQuery = useNonAggHeaderQuery("non-agg-header-track");
  const { isVisibleDrawable } = aggQuery;
  const { isVisibleFetched } = nonAggQuery;

  /**
   * Keep showing the previous mode on a mode change until the new mode can
   * draw all of the visible range.
   */
  const updateShownMode = useCallback(() => {
    const referenceNs = store.get(referenceNsAtom);
    const visibleRange = store.get(visibleRangeAtom);
    const worldRange = store.get(worldRangeAtom);
    if (referenceNs == null || !visibleRange || !worldRange) return;

    const isAggShown = resolveHeldDraw(
      store.get(isAggHeaderVisibleAtom),
      isAggregate(visibleRange),
      (agg) =>
        (agg ? isVisibleDrawable : isVisibleFetched)(
          referenceNs,
          visibleRange,
          worldRange,
        ),
    );
    containerRef.current?.classList.toggle(styles.showAgg, isAggShown);
    store.set(isAggHeaderVisibleAtom, isAggShown);
  }, [isVisibleDrawable, isVisibleFetched]);

  useLayoutEffect(() => {
    const unsubscribeRange = store.sub(visibleRangeAtom, updateShownMode);
    const aggEmitter = store.get(aggHeaderEmitterAtom);
    const nonAggEmitter = store.get(timelineSlotsEmitterAtom);
    aggEmitter.addListener(drawEventType, updateShownMode);
    nonAggEmitter.addListener(drawEventType, updateShownMode);
    updateShownMode();

    return () => {
      unsubscribeRange();
      aggEmitter.removeListener(drawEventType, updateShownMode);
      nonAggEmitter.removeListener(drawEventType, updateShownMode);
    };
  }, [updateShownMode]);

  return (
    <Box
      mt={`${trackMarginTop}px`}
      mb={`${trackMarginBottom}px`}
      ref={containerRef}
      className={styles.headerTrack}
      position="relative"
      width="100%"
      height={`${trackHeight}px`}
    >
      <AggHeaderTrack className={styles.aggContainer} aggQuery={aggQuery} />
      <NonAggHeaderTrack
        className={styles.nonAggContainer}
        width={width}
        nonAggQuery={nonAggQuery}
      />
      <AggHeaderBucketHighlight />
    </Box>
  );
}
