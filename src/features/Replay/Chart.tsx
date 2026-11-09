import { Flex, Spinner } from "@radix-ui/themes";
import { useRef, useCallback, useLayoutEffect } from "react";
import { useMeasure } from "react-use";
import styles from "./chart.module.css";
import { useExplorableChart } from "./useExplorableChart.ts";
import { getDefaultStore, useAtomValue } from "jotai";
import {
  clearHoverInfoAtom,
  initializeVisibleRangeAtom,
  isInitializedAtom,
  setHoverInfoAtom,
  visibleRangeAtom,
} from "./atoms.ts";
import MiniMap from "./MiniMap/MiniMap.tsx";
import HeaderTrack from "./HeaderTrack/index.tsx";
import ResetLiveButton from "./ResetLiveButton.tsx";
import { useTileStatesCache } from "./TileStatesTrack/useTileStatesCache.ts";
import { useVotesCache } from "./VotesTrack/useVotesCache.ts";
import Tracks from "./Tracks.tsx";
import SlotDividers from "./SlotDividers.tsx";
import HoveredTsLine from "./HoveredTsLine.tsx";
import ReplayTooltip from "./ReplayTooltip.tsx";
import { useHoveredPosition, type HoveredRect } from "./useHoveredPosition.ts";

const store = getDefaultStore();

const hoverOwner = "replay-tracks";

/**
 * Set up Replay chart, which keeps track of a reference ts (startup time), and
 * visible and world ts ranges.
 * Informs subscribers of visible range changes.
 */
export default function Chart() {
  const isInitialized = useAtomValue(isInitializedAtom);

  const [measureRef, { width }] = useMeasure<HTMLDivElement>();

  const { setUpExploreListeners, setUpMiniMap, panToTs } = useExplorableChart();

  const onHoverChange = useCallback(
    (clientX: number, clientY: number, rect: HoveredRect) => {
      const visibleRange = store.get(visibleRangeAtom);
      if (rect.width === 0 || !visibleRange) {
        store.set(clearHoverInfoAtom, hoverOwner);
        return;
      }

      const fraction = (clientX - rect.left) / rect.width;
      const cursorMs =
        visibleRange[0] + fraction * (visibleRange[1] - visibleRange[0]);

      store.set(setHoverInfoAtom, {
        owner: hoverOwner,
        cursorMs,
        clientPos: { x: clientX, y: clientY },
      });
    },
    [],
  );

  const onHoverLeave = useCallback(() => {
    store.set(clearHoverInfoAtom, hoverOwner);
  }, []);

  const { setContainer: setHoverContainer } = useHoveredPosition({
    onHoverChange,
    onHoverLeave,
  });

  const cleanUpExploreRef = useRef<(() => void) | null>(null);
  const setTracksContainerRef = useCallback(
    (el: HTMLDivElement | null) => {
      setHoverContainer(el);
      cleanUpExploreRef.current?.();
      cleanUpExploreRef.current = el ? setUpExploreListeners(el) : null;
    },
    [setUpExploreListeners, setHoverContainer],
  );

  useLayoutEffect(() => {
    if (isInitialized) {
      // TODO: make sure selected ts is initialized from query param before this
      store.set(initializeVisibleRangeAtom);
    }
  }, [isInitialized]);

  useVotesCache();
  // Drive the tile states caches used by the tile states tracks
  useTileStatesCache();

  if (!isInitialized) return <Spinner />;

  return (
    <div className={styles.container} ref={measureRef}>
      {!!width && (
        <>
          <MiniMap
            width={width}
            setUpMiniMap={setUpMiniMap}
            panToTs={panToTs}
          />
          <Flex
            ref={setTracksContainerRef}
            direction="column"
            position="relative"
            flexGrow="1"
            minHeight="0"
          >
            <HeaderTrack width={width} />
            <ResetLiveButton />

            <Tracks />

            <SlotDividers />
            <HoveredTsLine />
            <ReplayTooltip />
          </Flex>
        </>
      )}
    </div>
  );
}
