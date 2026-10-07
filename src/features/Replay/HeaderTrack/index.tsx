import { useCallback, useLayoutEffect, useRef } from "react";
import { type ExplorableChartProps, type MarkerLinesProps } from "../const.ts";
import AggHeaderTrack from "./AggHeaderTrack.tsx";
import { NonAggHeaderTrack } from "./NonAggHeaderTrack.tsx";
import styles from "./headerTrack.module.css";
import { Box } from "@radix-ui/themes";
import { trackHeight } from "./const.ts";

interface HeaderTrackProps extends ExplorableChartProps, MarkerLinesProps {
  width: number;
}

export default function HeaderTrack({
  setUpExploreListeners,
  width,
  ...markerLinesProps
}: HeaderTrackProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * trigger agg visiblity toggle on draw instead of on range change, so some data is
   * available on toggle
   */
  const setIsAggVisible = useCallback((isAggVisible: boolean) => {
    containerRef.current?.classList.toggle(styles.showAgg, isAggVisible);
  }, []);

  const showAgg = useCallback(() => setIsAggVisible(true), [setIsAggVisible]);
  const showNonAgg = useCallback(
    () => setIsAggVisible(false),
    [setIsAggVisible],
  );

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    return setUpExploreListeners(containerRef.current);
  }, [setUpExploreListeners]);

  return (
    <Box
      ref={containerRef}
      className={styles.headerTrack}
      position="relative"
      width="100%"
      height={`${trackHeight}px`}
    >
      <AggHeaderTrack
        className={styles.aggContainer}
        width={width}
        showAgg={showAgg}
        {...markerLinesProps}
      />
      <NonAggHeaderTrack
        className={styles.nonAggContainer}
        width={width}
        showNonAgg={showNonAgg}
      />
    </Box>
  );
}
