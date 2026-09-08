import { Flex, Spinner } from "@radix-ui/themes";
import { useRef, useCallback, useLayoutEffect } from "react";
import { useMeasure, useRafLoop } from "react-use";
import styles from "./chart.module.css";
import type { MarkerLinesProps } from "./const.ts";
import { nsPerMs } from "../../consts.ts";
import { calcRelativeMs, getInitVisibleRange } from "./utils.ts";
import VisibleRangeInfo from "./VisibleRangeInfo.tsx";
import RevenueTrack from "./RevenueTrack/RevenueTrack.tsx";
import { RevenueType } from "../../api/entities.ts";
import { useExplorableChart } from "./useExplorableChart.ts";
import { getDefaultStore, useAtomValue } from "jotai";
import {
  referenceNsAtom,
  selectedMsAtom,
  visibleRangeAtom,
  worldRangeAtom,
} from "./atoms.ts";
import { startupTimeAtom } from "../../api/atoms.ts";
import MiniMap from "./MiniMap/MiniMap.tsx";

const store = getDefaultStore();

const WORLD_UPDATE_INTERVAL_MS = 10;
// const LIVE_CHART_DELAY_NS = BigInt(500 * nsPerMs);

const LIVE_CHART_DELAY_MS = 500;
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
  const hasReferenceTs = useAtomValue(referenceNsAtom) != null;
  const lastWorldUpdateTsRef = useRef(-Infinity);

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

  // refresh world size
  useRafLoop((time: number) => {
    if (time - lastWorldUpdateTsRef.current < WORLD_UPDATE_INTERVAL_MS) return;
    lastWorldUpdateTsRef.current = time;

    const newWorldEndNs =
      BigInt(new Date().getTime() - LIVE_CHART_DELAY_MS) * BigInt(nsPerMs);
    const referenceNs = store.get(referenceNsAtom);

    if (referenceNs != null) {
      const newWorldEndMs = calcRelativeMs(referenceNs, newWorldEndNs);
      store.set(worldRangeAtom, [0, newWorldEndMs]);
      return;
    }

    /**
     *  use reference ts so we can convert bigints to number without losing precision
     */
    const newReferenceNs = store.get(startupTimeAtom)?.startupTimeNanos;
    if (!newReferenceNs) return;

    // initialize ranges
    const newWorldEndMs = calcRelativeMs(newReferenceNs, newWorldEndNs);

    // delay if too soon after startup
    if (newWorldEndMs < 0) return;

    const visibleRangeMs = getInitVisibleRange(
      store.get(selectedMsAtom),
      newWorldEndMs,
    );

    store.set(referenceNsAtom, newReferenceNs);
    store.set(worldRangeAtom, [0, newWorldEndMs]);
    store.set(visibleRangeAtom, visibleRangeMs);
  });

  const { explorableChartProps, miniMapProps } = useExplorableChart();

  if (!hasReferenceTs) return <Spinner />;

  return (
    <div className={styles.container} ref={setContainerRefs}>
      {!!width && (
        <>
          <VisibleRangeInfo />
          <MiniMap width={width} {...miniMapProps} {...markerLinesProps} />
          <Flex direction="column" gapY="4" position="relative">
            <RevenueTrack
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
