import { useCallback, useRef } from "react";
import { getDefaultStore } from "jotai";
import AggHeaderTrack from "./AggHeaderTrack.tsx";
import { NonAggHeaderTrack } from "./NonAggHeaderTrack.tsx";
import AggHeaderBucketHighlight from "./AggHeaderBucketHighlight.tsx";
import styles from "./headerTrack.module.css";
import { Box } from "@radix-ui/themes";
import { trackHeight } from "./const.ts";
import { isAggregate } from "./utils.ts";
import { visibleRangeAtom } from "../atoms.ts";
import { resolveHeldDraw } from "../useAggQuery.ts";

const store = getDefaultStore();

interface HeaderTrackProps {
  width: number;
}

export default function HeaderTrack({ width }: HeaderTrackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAggShownRef = useRef<boolean>();
  /** whether each mode can draw all of the visible range */
  const isDrawableRef = useRef({ agg: false, nonAgg: false });

  /**
   * Keep showing the previous mode on a mode change until the new mode can
   * draw all of the visible range. Toggled on draw instead of on range change,
   * so data is available on toggle.
   */
  const updateShownMode = useCallback(() => {
    const visibleRange = store.get(visibleRangeAtom);
    if (!visibleRange) return;

    const isAggShown = resolveHeldDraw(
      isAggShownRef.current,
      isAggregate(visibleRange),
      (agg) => isDrawableRef.current[agg ? "agg" : "nonAgg"],
    );
    isAggShownRef.current = isAggShown;
    containerRef.current?.classList.toggle(styles.showAgg, isAggShown);
  }, []);

  const setAggDrawable = useCallback(
    (isDrawable: boolean) => {
      isDrawableRef.current.agg = isDrawable;
      updateShownMode();
    },
    [updateShownMode],
  );
  const setNonAggDrawable = useCallback(
    (isDrawable: boolean) => {
      isDrawableRef.current.nonAgg = isDrawable;
      updateShownMode();
    },
    [updateShownMode],
  );
  const getIsAggShown = useCallback(() => !!isAggShownRef.current, []);

  return (
    <Box
      mt="6px"
      mb="4px"
      ref={containerRef}
      className={styles.headerTrack}
      position="relative"
      width="100%"
      height={`${trackHeight}px`}
    >
      <AggHeaderTrack
        className={styles.aggContainer}
        setAggDrawable={setAggDrawable}
      />
      <NonAggHeaderTrack
        className={styles.nonAggContainer}
        width={width}
        setNonAggDrawable={setNonAggDrawable}
        getIsAggShown={getIsAggShown}
      />
      <AggHeaderBucketHighlight />
    </Box>
  );
}
