import { Flex, Spinner } from "@radix-ui/themes";
import { useRef, useCallback, useLayoutEffect } from "react";
import { useMeasure } from "react-use";
import styles from "./chart.module.css";
import RevenueTrack from "./RevenueTrack/RevenueTrack.tsx";
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
import ShredsTrack from "./ShredsTrack/ShredsTrack.tsx";
import ResetLiveButton from "./ResetLiveButton.tsx";
import TileStatesTrack from "./TileStatesTrack/TileStatesTrack.tsx";
import { useTileStatesCache } from "./TileStatesTrack/useTileStatesCache.ts";
import CpuTrack from "./CpuTrack/CpuTrack.tsx";
import HoverOverlay from "./HoverOverlay.tsx";
import HoveredTsLine from "./HoveredTsLine.tsx";

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

  // Track the cursor over the whole tracks container and report its ms position
  // as the hovered ts. Re-resolve when the visible range shifts (e.g. live mode)
  // or the container resizes, even if the cursor doesn't move.
  const tracksContainerRef = useRef<HTMLDivElement | null>(null);
  const lastClientPosRef = useRef<{ x: number; y: number }>();

  const updateHoveredTs = useCallback(() => {
    const clientPos = lastClientPosRef.current;
    const container = tracksContainerRef.current;
    const visibleRange = store.get(visibleRangeAtom);
    if (!clientPos || !container || !visibleRange) {
      store.set(clearHoverInfoAtom, hoverOwner);
      return;
    }

    const rect = container.getBoundingClientRect();
    if (rect.width === 0) {
      store.set(clearHoverInfoAtom, hoverOwner);
      return;
    }

    const fraction = (clientPos.x - rect.left) / rect.width;
    const cursorMs =
      visibleRange[0] + fraction * (visibleRange[1] - visibleRange[0]);

    store.set(setHoverInfoAtom, {
      owner: hoverOwner,
      cursorMs,
      clientPos,
    });
  }, []);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      lastClientPosRef.current = { x: e.clientX, y: e.clientY };
      updateHoveredTs();
    },
    [updateHoveredTs],
  );

  const onMouseLeave = useCallback(() => {
    lastClientPosRef.current = undefined;
    store.set(clearHoverInfoAtom, hoverOwner);
  }, []);

  // update hovered ts on resize, which shifts slot positions under the cursor
  useLayoutEffect(() => {
    updateHoveredTs();
  }, [updateHoveredTs, width]);

  const cleanUpListenersRef = useRef<(() => void) | null>(null);
  const setTracksContainerRef = useCallback(
    (el: HTMLDivElement | null) => {
      tracksContainerRef.current = el;
      cleanUpListenersRef.current?.();

      if (!el) {
        cleanUpListenersRef.current = null;
        return;
      }

      // update hovered ts if visible range shifts, even if cursor doesn't move
      const unsubscribeRange = store.sub(visibleRangeAtom, updateHoveredTs);
      const cleanUpExplore = setUpExploreListeners(el);

      cleanUpListenersRef.current = () => {
        cleanUpExplore();
        unsubscribeRange();
      };
    },
    [setUpExploreListeners, updateHoveredTs],
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
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
          >
            <HeaderTrack width={width} />
            <ResetLiveButton />

            <Flex direction="column" gap="6px">
              <ShredsTrack width={width} />
              <RevenueTrack width={width} />
              <TileStatesTrack kind="execrp" />
              <TileStatesTrack kind="replay" />
              <CpuTrack width={width} />
            </Flex>

            <HoverOverlay />
            <HoveredTsLine />
          </Flex>
        </>
      )}
    </div>
  );
}
