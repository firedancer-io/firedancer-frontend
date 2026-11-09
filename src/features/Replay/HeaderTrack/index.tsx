import { useCallback, useRef } from "react";
import { getDefaultStore } from "jotai";
import AggHeaderTrack from "./AggHeaderTrack.tsx";
import { NonAggHeaderTrack } from "./NonAggHeaderTrack.tsx";
import AggHeaderBucketHighlight from "./AggHeaderBucketHighlight.tsx";
import styles from "./headerTrack.module.css";
import { Box } from "@radix-ui/themes";
import { trackHeight, trackMarginBottom, trackMarginTop } from "./const.ts";
import { isAggHeaderVisibleAtom } from "./aggAtoms.ts";

const store = getDefaultStore();

interface HeaderTrackProps {
  width: number;
}

export default function HeaderTrack({ width }: HeaderTrackProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * trigger agg visiblity toggle on draw instead of on range change, so some data is
   * available on toggle
   */
  const setIsAggVisible = useCallback((isAggVisible: boolean) => {
    containerRef.current?.classList.toggle(styles.showAgg, isAggVisible);
    store.set(isAggHeaderVisibleAtom, isAggVisible);
  }, []);

  const showAgg = useCallback(() => setIsAggVisible(true), [setIsAggVisible]);
  const showNonAgg = useCallback(
    () => setIsAggVisible(false),
    [setIsAggVisible],
  );

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
      <AggHeaderTrack className={styles.aggContainer} showAgg={showAgg} />
      <NonAggHeaderTrack
        className={styles.nonAggContainer}
        width={width}
        showNonAgg={showNonAgg}
      />
      <AggHeaderBucketHighlight />
    </Box>
  );
}
