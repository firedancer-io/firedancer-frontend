import { Flex, Spinner } from "@radix-ui/themes";
import { useRef, useCallback, useLayoutEffect } from "react";
import { useMeasure } from "react-use";
import styles from "./chart.module.css";
import type { MarkerLinesProps } from "./const.ts";
import VisibleRangeInfo from "./VisibleRangeInfo.tsx";
import RevenueTrack from "./RevenueTrack/RevenueTrack.tsx";
import { RevenueType } from "../../api/entities.ts";
import { useExplorableChart } from "./useExplorableChart.ts";
import { getDefaultStore, useAtomValue } from "jotai";
import {
  initializeVisibleRangeAtom,
  isInitializedAtom,
  selectedMsAtom,
  visibleRangeAtom,
  worldRangeAtom,
} from "./atoms.ts";
import MiniMap from "./MiniMap/MiniMap.tsx";
import useAggRevenueQuery from "./RevenueTrack/useAggRevenueQuery.ts";
import HeaderTrack from "./HeaderTrack/index.tsx";
import ShredsTrack from "./ShredsTrack/ShredsTrack.tsx";
import ResetLiveButton from "./ResetLiveButton.tsx";

const store = getDefaultStore();

const MARKER_PCT_VAR = "--marker-lines-pct";
const WORLD_MARKER_PCT_VAR = "--world-marker-lines-pct";

const markerLinesProps: MarkerLinesProps = {
  markerLinesClassName: styles.withMarkerLines,
  miniMapMarkerLinesClassName: styles.withWorldMarkerLines,
};

/**
 * Set up Replay chart, which keeps track of a reference ts (startup time), and
 * visible and world ts ranges.
 * Informs subscribers of visible range changes.
 */
export default function Chart() {
  const isInitialized = useAtomValue(isInitializedAtom);

  const [measureRef, { width }] = useMeasure<HTMLDivElement>();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const refreshSelectedMarker = useCallback((isWorld: boolean) => {
    if (!containerRef.current) return;

    const cssVar = isWorld ? WORLD_MARKER_PCT_VAR : MARKER_PCT_VAR;

    const selectedMs = store.get(selectedMsAtom);
    if (selectedMs == null) {
      // off screen
      containerRef.current.style.setProperty(cssVar, "-300%");
      return;
    }

    const range = store.get(isWorld ? worldRangeAtom : visibleRangeAtom);
    if (!range) return;

    const pct = (100 * (selectedMs - range[0])) / (range[1] - range[0]);
    containerRef.current.style.setProperty(cssVar, `${pct}%`);
  }, []);

  const setContainerRefs = useCallback(
    (el: HTMLDivElement | null) => {
      containerRef.current = el;
      if (el) {
        measureRef(el);
        refreshSelectedMarker(true);
        refreshSelectedMarker(false);
      }
    },
    [measureRef, refreshSelectedMarker],
  );

  useLayoutEffect(() => {
    const unsubs = [
      // world end advances continuously, so the world marker's percentage
      // must be recomputed as the world range grows
      store.sub(worldRangeAtom, () => refreshSelectedMarker(true)),
      store.sub(visibleRangeAtom, () => refreshSelectedMarker(false)),
      store.sub(selectedMsAtom, () => {
        refreshSelectedMarker(true);
        refreshSelectedMarker(false);
      }),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [refreshSelectedMarker]);

  useLayoutEffect(() => {
    if (isInitialized) {
      // TODO: make sure selected ts is initialized from query param before this
      store.set(initializeVisibleRangeAtom);
    }
  }, [isInitialized]);

  const { explorableChartProps, miniMapProps } = useExplorableChart();

  // shared query cache if there are multiple revenue tracks
  const aggRevenueQuery = useAggRevenueQuery();

  if (!isInitialized) return <Spinner />;

  return (
    <div className={styles.container} ref={setContainerRefs}>
      {!!width && (
        <>
          <VisibleRangeInfo />
          <MiniMap width={width} {...miniMapProps} {...markerLinesProps} />
          <Flex direction="column" gapY="4" position="relative">
            <HeaderTrack
              width={width}
              {...explorableChartProps}
              {...markerLinesProps}
            />
            <ResetLiveButton />
            <ShredsTrack
              width={width}
              {...explorableChartProps}
              {...markerLinesProps}
            />

            <RevenueTrack
              aggQuery={aggRevenueQuery}
              type={RevenueType.TxnFees}
              width={width}
              {...explorableChartProps}
              {...markerLinesProps}
            />
          </Flex>
        </>
      )}
    </div>
  );
}
