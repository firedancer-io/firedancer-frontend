import { useCallback, useRef } from "react";
import AggHeaderTrack from "./AggHeaderTrack.tsx";
import { NonAggHeaderTrack } from "./NonAggHeaderTrack.tsx";
import HoveredSlotTooltip from "./HoveredSlotTooltip.tsx";
import styles from "./headerTrack.module.css";
import { Box } from "@radix-ui/themes";
import { trackHeight } from "./const.ts";

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
  }, []);

  const showAgg = useCallback(() => setIsAggVisible(true), [setIsAggVisible]);
  const showNonAgg = useCallback(
    () => setIsAggVisible(false),
    [setIsAggVisible],
  );

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
        width={width}
        showAgg={showAgg}
      />
      <NonAggHeaderTrack
        className={styles.nonAggContainer}
        width={width}
        showNonAgg={showNonAgg}
      />
      <HoveredSlotTooltip />
    </Box>
  );
}
