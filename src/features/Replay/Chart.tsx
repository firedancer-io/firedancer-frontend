import { Flex, Spinner } from "@radix-ui/themes";
import { useRef, useCallback, useLayoutEffect } from "react";
import { useMeasure } from "react-use";
import styles from "./chart.module.css";
import RevenueTrack from "./RevenueTrack/RevenueTrack.tsx";
import { useExplorableChart } from "./useExplorableChart.ts";
import { getDefaultStore, useAtomValue } from "jotai";
import { initializeVisibleRangeAtom, isInitializedAtom } from "./atoms.ts";
import MiniMap from "./MiniMap/MiniMap.tsx";
import HeaderTrack from "./HeaderTrack/index.tsx";
import ShredsTrack from "./ShredsTrack/ShredsTrack.tsx";
import ResetLiveButton from "./ResetLiveButton.tsx";

const store = getDefaultStore();

/**
 * Set up Replay chart, which keeps track of a reference ts (startup time), and
 * visible and world ts ranges.
 * Informs subscribers of visible range changes.
 */
export default function Chart() {
  const isInitialized = useAtomValue(isInitializedAtom);

  const [measureRef, { width }] = useMeasure<HTMLDivElement>();

  const { setUpExploreListeners, setUpMiniMap } = useExplorableChart();

  const cleanUpExploreListenersRef = useRef<(() => void) | null>(null);
  const setTracksContainerRef = useCallback(
    (el: HTMLDivElement | null) => {
      cleanUpExploreListenersRef.current?.();
      cleanUpExploreListenersRef.current = el
        ? setUpExploreListeners(el)
        : null;
    },
    [setUpExploreListeners],
  );

  useLayoutEffect(() => {
    if (isInitialized) {
      // TODO: make sure selected ts is initialized from query param before this
      store.set(initializeVisibleRangeAtom);
    }
  }, [isInitialized]);

  if (!isInitialized) return <Spinner />;

  return (
    <div className={styles.container} ref={measureRef}>
      {!!width && (
        <>
          <MiniMap width={width} setUpMiniMap={setUpMiniMap} />
          <Flex
            ref={setTracksContainerRef}
            direction="column"
            position="relative"
          >
            <HeaderTrack width={width} />
            <ResetLiveButton />

            <Flex direction="column" gap="6px">
              <ShredsTrack width={width} />
              <RevenueTrack width={width} />
            </Flex>
          </Flex>
        </>
      )}
    </div>
  );
}
