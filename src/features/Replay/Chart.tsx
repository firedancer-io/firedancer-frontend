import { Flex, Spinner } from "@radix-ui/themes";
import { useRef, useCallback, useLayoutEffect, useEffect } from "react";
import { useMeasure } from "react-use";
import styles from "./chart.module.css";
import { useExplorableChart } from "./useExplorableChart.ts";
import { getDefaultStore, useAtomValue } from "jotai";
import {
  clearHoverInfoAtom,
  hoverInfoAtom,
  initializeVisibleRangeAtom,
  isInitializedAtom,
  isPinnedAtom,
  pinnedDismissCursorAtom,
  setHoverInfoAtom,
  visibleRangeAtom,
} from "./atoms.ts";
import { clientXToMs } from "./utils.ts";
import MiniMap from "./MiniMap/MiniMap.tsx";
import HeaderTrack from "./HeaderTrack/index.tsx";
import ResetLiveButton from "./ResetLiveButton.tsx";
import { useTileStatesCache } from "./TileStatesTrack/useTileStatesCache.ts";
import Tracks from "./Tracks.tsx";
import HoverOverlay from "./HoverOverlay.tsx";
import HoveredTsLine from "./HoveredTsLine.tsx";
import ReplayTooltip from "./ReplayTooltip.tsx";
import OverlapTooltip from "./HeaderTrack/OverlapTooltip.tsx";
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
      // While pinned, the overlap tooltip owns hover/spotlight; don't let the
      // chart-wide hover write over it (and don't show the cursor tooltip).
      if (store.get(isPinnedAtom)) return;

      const visibleRange = store.get(visibleRangeAtom);
      if (rect.width === 0 || !visibleRange) {
        store.set(clearHoverInfoAtom, hoverOwner);
        return;
      }

      // Another track (e.g. shreds) already owns this hover for this exact
      // cursor position — its inner native listener fired first during bubbling
      // and set richer hover info. Don't overwrite it.
      const hoverInfo = store.get(hoverInfoAtom);
      if (
        hoverInfo != null &&
        hoverInfo.owner !== hoverOwner &&
        hoverInfo.clientPos.x === clientX &&
        hoverInfo.clientPos.y === clientY
      ) {
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

  const { setContainer: setHoverContainer, replayHoverAt } = useHoveredPosition({
    onHoverChange,
    onHoverLeave,
  });

  // When the pinned overlap tooltip dismisses (click-away / Esc), the cursor is
  // still over the chart but no mousemove fired — replay the hover at the cursor
  // position captured at dismiss time so the regular tooltip reappears instantly.
  useEffect(() => {
    let wasPinned = store.get(isPinnedAtom);
    return store.sub(isPinnedAtom, () => {
      const isPinned = store.get(isPinnedAtom);
      if (wasPinned && !isPinned) {
        const cursor = store.get(pinnedDismissCursorAtom);
        store.set(pinnedDismissCursorAtom, undefined);
        if (cursor) replayHoverAt(cursor.x, cursor.y);
      }
      wasPinned = isPinned;
    });
  }, [replayHoverAt]);

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

            <HoverOverlay />
            <HoveredTsLine />
            <ReplayTooltip />
            <OverlapTooltip />
          </Flex>
        </>
      )}
    </div>
  );
}
