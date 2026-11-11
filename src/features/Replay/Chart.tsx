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
  referenceNsAtom,
  setHoverInfoAtom,
  visibleRangeAtom,
} from "./atoms.ts";
import { clientXToMs } from "./utils.ts";
import MiniMap from "./MiniMap/MiniMap.tsx";
import HeaderTrack from "./HeaderTrack/index.tsx";
import ResetLiveButton from "./ResetLiveButton.tsx";
import { useTileStatesCache } from "./tileStates/useTileStatesCache.ts";
import { useVotesCache } from "./VotesTrack/useVotesCache.ts";
import { useTxnMetaCache } from "./RevenueTrack/txnMeta/useTxnMetaCache.ts";
import Tracks from "./Tracks.tsx";
import SlotDividers from "./SlotDividers.tsx";
import HoveredTsLine from "./HoveredTsLine.tsx";
import EpochMarkers from "./EpochMarkers.tsx";
import { epochLabel } from "../../epochUtils.ts";
import epochLinesStyles from "./epochLines.module.css";
import {
  trackHeight as headerHeight,
  trackMarginBottom as headerMarginBottom,
  trackMarginTop as headerMarginTop,
} from "./HeaderTrack/const.ts";
import ReplayTooltip from "./ReplayTooltip.tsx";
import OverlapTooltip from "./HeaderTrack/OverlapTooltip.tsx";
import { useHoveredPosition, type HoveredRect } from "./useHoveredPosition.ts";

const store = getDefaultStore();

// sit below the non-agg header row
const EPOCH_LINE_LABEL_GAP_PX = 5;
const epochLineLabelTop =
  headerMarginTop + headerHeight + headerMarginBottom + EPOCH_LINE_LABEL_GAP_PX;

const hoverOwner = "replay-tracks";

/**
 * Set up Replay chart, which keeps track of a reference ts (startup time), and
 * visible and world ts ranges.
 * Informs subscribers of visible range changes.
 */
export default function Chart() {
  const isInitialized = useAtomValue(isInitializedAtom);
  const referenceNs = useAtomValue(referenceNsAtom);

  const [measureRef, { width }] = useMeasure<HTMLDivElement>();

  const { setUpExploreListeners, setUpMiniMap, panToTs } = useExplorableChart();

  const onHoverChange = useCallback(
    (clientX: number, clientY: number, rect: HoveredRect) => {
      const visibleRange = store.get(visibleRangeAtom);
      if (rect.width === 0 || !visibleRange) {
        store.set(clearHoverInfoAtom, hoverOwner);
        return;
      }

      const cursorMs = clientXToMs(clientX, rect, visibleRange);

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

  const renderEpochLine = useCallback(
    (epochNumber: number | undefined) => (
      <span
        className={epochLinesStyles.label}
        style={{ top: epochLineLabelTop }}
      >
        {epochLabel(epochNumber)}
      </span>
    ),
    [],
  );

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
  useTxnMetaCache();

  if (!isInitialized) return <Spinner />;

  // a validator restart remounts the tracks, dropping their renderers' meshes
  // built from the old run's data
  return (
    <div
      key={String(referenceNs)}
      className={styles.container}
      ref={measureRef}
    >
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
            <EpochMarkers
              rootClassName={epochLinesStyles.root}
              markerParentClassName={epochLinesStyles.line}
              hideWhenAggregate
              renderMarker={renderEpochLine}
            />
            <ReplayTooltip />
            <OverlapTooltip />
          </Flex>
        </>
      )}
    </div>
  );
}
