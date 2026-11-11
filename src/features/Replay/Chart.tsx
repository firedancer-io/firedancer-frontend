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
import TrackEventMarkers, {
  EPOCH_LABEL_WIDTH_PX,
} from "./TrackEventMarkers.tsx";
import { epochLabel, useGetEpochForSlot } from "../../epochUtils.ts";
import { TimelineEventType } from "../../api/entities.ts";
import epochLinesStyles from "./epochLines.module.css";
import {
  trackHeight as headerHeight,
  trackMarginTop as headerMarginTop,
} from "./HeaderTrack/const.ts";
import ReplayTooltip from "./ReplayTooltip.tsx";
import OverlapTooltip from "./HeaderTrack/OverlapTooltip.tsx";
import { useHoveredPosition, type HoveredRect } from "./useHoveredPosition.ts";

const store = getDefaultStore();

const epochLineCullMarginPx = { left: 4 + EPOCH_LABEL_WIDTH_PX, right: 1 };

// below the non-agg header's bottom
const EPOCH_LINE_LABEL_GAP_PX = 10;
const epochLineLabelTop =
  headerMarginTop + headerHeight + EPOCH_LINE_LABEL_GAP_PX;

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

  const getEpochForSlot = useGetEpochForSlot();
  const renderEpochLine = useCallback(
    (slot: number) => (
      <>
        <div
          className={epochLinesStyles.stroke}
          // starts at the non-agg header's top
          style={{ top: headerMarginTop }}
        />
        <span
          className={epochLinesStyles.label}
          style={{ top: epochLineLabelTop }}
        >
          {epochLabel(getEpochForSlot?.(slot))}
        </span>
      </>
    ),
    [getEpochForSlot],
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
            <TrackEventMarkers
              eventType={TimelineEventType.EpochStart}
              rootClassName={epochLinesStyles.root}
              markerParentClassName={epochLinesStyles.line}
              showIn="nonAgg"
              cullMarginPx={epochLineCullMarginPx}
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
