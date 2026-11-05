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
import RevenueTxnTooltip from "./RevenueTrack/RevenueTxnTooltip.tsx";
import ExecrpTxnTooltip from "./TileStatesTrack/ExecrpTxnTooltip.tsx";
import ReplayTrackSlotTooltip from "./TileStatesTrack/ReplayTrackSlotTooltip.tsx";
import CpuTooltip from "./CpuTrack/CpuTooltip.tsx";

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
  // cache rect because getBoundingClientRect() forces a synchronous layout
  const containerRectRef = useRef<{ left: number; width: number }>();

  const updateHoveredTs = useCallback(() => {
    const rect = containerRectRef.current;
    const visibleRange = store.get(visibleRangeAtom);
    const clientPos = lastClientPosRef.current;

    if (clientPos == null || !rect || rect.width === 0 || !visibleRange) {
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

  // Recompute the cached container rect, then re-resolve the hovered ts so a
  // resize still shifts the spotlight under a stationary cursor.
  const refreshContainerAndHover = useCallback(() => {
    const container = tracksContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    containerRectRef.current = { left: rect.left, width: rect.width };
    updateHoveredTs();
  }, [updateHoveredTs]);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Clear hover state if over a portaled element outside this container subtree
      if (!e.currentTarget.contains(e.target as Node)) {
        lastClientPosRef.current = undefined;
        store.set(clearHoverInfoAtom, hoverOwner);
        return;
      }
      lastClientPosRef.current = { x: e.clientX, y: e.clientY };
      updateHoveredTs();
    },
    [updateHoveredTs],
  );

  const onMouseLeave = useCallback(() => {
    lastClientPosRef.current = undefined;
    store.set(clearHoverInfoAtom, hoverOwner);
  }, []);

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

      refreshContainerAndHover();
      const rectObserver = new ResizeObserver(refreshContainerAndHover);
      rectObserver.observe(el);
      window.addEventListener("resize", refreshContainerAndHover);

      cleanUpListenersRef.current = () => {
        cleanUpExplore();
        unsubscribeRange();
        rectObserver.disconnect();
        window.removeEventListener("resize", refreshContainerAndHover);
      };
    },
    [setUpExploreListeners, updateHoveredTs, refreshContainerAndHover],
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
          <RevenueTxnTooltip />
          <ExecrpTxnTooltip />
          <ReplayTrackSlotTooltip />
          <CpuTooltip />
        </>
      )}
    </div>
  );
}
