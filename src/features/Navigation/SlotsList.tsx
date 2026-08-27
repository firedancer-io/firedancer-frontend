import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import {
  autoScrollAtom,
  currentLeaderSlotAtom,
  epochAtom,
  leaderSlotsAtom,
  nextLeaderSlotAtom,
  SlotNavFilter,
  slotNavFilterAtom,
  slotOverrideAtom,
} from "../../atoms";
import { Box, Flex, Text } from "@radix-ui/themes";
import type { ReactNode } from "react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import styles from "./slotsList.module.css";
import { slotsListPinnedSlotOffset } from "../../consts";
import throttle from "lodash/throttle";
import SlotsRenderer, { MSlotsPlaceholder } from "./SlotsRenderer";
import ResetLive from "./ResetLive";
import type { DebouncedState } from "use-debounce";
import { useDebouncedCallback } from "use-debounce";
import {
  getAllSlotsListProps,
  getMySlotsListProps,
  type SlotsIndexProps,
} from "./utils";
import { getSlotGroupTypeAtom, isScrollingAtom } from "./atoms";
import { getSlotGroupLeader } from "../../utils";

/** Rows rendered beyond each viewport edge. The row above absorbs the
 * one-row leader-rotation scroll before the window re-renders (the old
 * increaseViewportBy top: 24). */
const overscanRows = 1;

/** Row heights by group type. Groups are NOT uniform (futures are a
 * single line, the current group is enlarged), so offsets are computed
 * from the [futures | current | pasts] segment structure. Seeds below
 * are calibrated from the first layout read of each kind, and per-slot
 * deviations (my-slot borders etc.) are stored in `measuredRows`, both
 * before paint. */
type RowKind = "future" | "yourNext" | "current" | "past";
const kindHeights: Record<RowKind, number> = {
  future: 26,
  yourNext: 33,
  current: 55,
  past: 42,
};
const calibratedKinds = new Set<RowKind>();
const measuredRows = new Map<number, { kind: RowKind; h: number }>();

interface GeometryInputs extends SlotsIndexProps {
  currentLeaderSlot: number | undefined;
  nextLeaderSlot: number | null | undefined;
}

interface Geometry {
  offset: (index: number) => number;
  indexAt: (y: number) => number;
  kindAt: (index: number) => RowKind;
  total: number;
}

function makeGeometry({
  itemsCount,
  getSlotAtIndex,
  getIndexForSlot,
  currentLeaderSlot,
  nextLeaderSlot,
}: GeometryInputs): Geometry {
  // index of the current leader group; everything above is future,
  // everything below is past
  let boundaryIdx = itemsCount;
  let boundaryKind: RowKind = "past";
  if (currentLeaderSlot !== undefined) {
    const idx = getIndexForSlot(currentLeaderSlot);
    if (idx !== undefined) {
      const slot = getSlotAtIndex(idx);
      if (slot !== undefined && slot > currentLeaderSlot) {
        // my-slots list positioned on a future group: no past segment
        boundaryIdx = itemsCount;
      } else {
        boundaryIdx = idx;
        boundaryKind =
          slot !== undefined &&
          getSlotGroupLeader(currentLeaderSlot) === getSlotGroupLeader(slot)
            ? "current"
            : "past";
      }
    }
  }

  let yourNextIdx: number | undefined;
  if (nextLeaderSlot != null) {
    const idx = getIndexForSlot(nextLeaderSlot);
    const slot = idx === undefined ? undefined : getSlotAtIndex(idx);
    if (
      idx !== undefined &&
      idx < boundaryIdx &&
      slot !== undefined &&
      getSlotGroupLeader(nextLeaderSlot) === getSlotGroupLeader(slot)
    ) {
      yourNextIdx = idx;
    }
  }

  const kindAt = (index: number): RowKind => {
    if (index === boundaryIdx) return boundaryKind;
    if (index === yourNextIdx) return "yourNext";
    return index < boundaryIdx ? "future" : "past";
  };

  // per-slot deviations from the kind model, sorted by index
  const deltas: { index: number; delta: number }[] = [];
  for (const [slot, m] of measuredRows) {
    const idx = getIndexForSlot(slot);
    if (idx === undefined || getSlotAtIndex(idx) !== slot) continue;
    if (m.kind !== kindAt(idx)) continue; // rotated since measured
    const delta = m.h - kindHeights[m.kind];
    if (Math.abs(delta) < 0.5) continue;
    deltas.push({ index: idx, delta });
  }
  deltas.sort((a, b) => a.index - b.index);
  const deltaPrefix: number[] = [0];
  for (const d of deltas)
    deltaPrefix.push(deltaPrefix[deltaPrefix.length - 1] + d.delta);
  const deltaBefore = (index: number) => {
    let lo = 0,
      hi = deltas.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (deltas[mid].index < index) lo = mid + 1;
      else hi = mid;
    }
    return deltaPrefix[lo];
  };

  const offset = (index: number) => {
    const i = Math.max(0, Math.min(index, itemsCount));
    const futures = Math.min(i, boundaryIdx);
    let y = futures * kindHeights.future;
    if (yourNextIdx !== undefined && yourNextIdx < i)
      y += kindHeights.yourNext - kindHeights.future;
    if (i > boundaryIdx) {
      y += kindHeights[boundaryKind];
      y += (i - boundaryIdx - 1) * kindHeights.past;
    }
    return y + deltaBefore(i);
  };

  const total = offset(itemsCount);

  const indexAt = (y: number) => {
    if (y <= 0) return 0;
    let lo = 0,
      hi = itemsCount - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offset(mid) <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  return { offset, indexAt, kindAt, total };
}

interface SlotsListProps {
  width: number;
  height: number;
}

export default function SlotsList({ width, height }: SlotsListProps) {
  const navFilter = useAtomValue(slotNavFilterAtom);
  const epoch = useAtomValue(epochAtom);

  if (!epoch) return null;

  return navFilter === SlotNavFilter.MySlots ? (
    <MySlotsList key={epoch.epoch} width={width} height={height} />
  ) : (
    <AllSlotsList key={epoch.epoch} width={width} height={height} />
  );
}

/**
 * Hand-rolled variable-height window over the slot groups: a native
 * scroll container with a full-height spacer and the visible rows
 * absolutely positioned at their segment-model offsets. The initial
 * window renders at the followed leader group synchronously, so the
 * real rows are in the mounting commit itself -- no async init, no
 * static-overlay swap. Heights the model gets wrong are corrected from
 * a pre-paint layout read of the rendered window.
 */
function InnerSlotsList({
  width,
  height,
  itemsCount,
  getSlotAtIndex,
  getIndexForSlot,
}: SlotsIndexProps & SlotsListProps) {
  const listContainerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);

  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);
  const nextLeaderSlot = useAtomValue(nextLeaderSlotAtom);
  const getSlotGroupType = useAtomValue(getSlotGroupTypeAtom);
  const isScrolling = useAtomValue(isScrollingAtom);
  const [, bumpCalibration] = useReducer((c: number) => c + 1, 0);

  const geometry = makeGeometry({
    itemsCount,
    getSlotAtIndex,
    getIndexForSlot,
    currentLeaderSlot,
    nextLeaderSlot,
  });
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;

  // Rows render in the mounting commit itself, already positioned at
  // the live slot: the whole first frame pays for the rows, accepted so
  // the page pops in as one piece
  const [scrollTop, setScrollTop] = useState(() => {
    const store = getDefaultStore();
    const g = makeGeometry({
      itemsCount,
      getSlotAtIndex,
      getIndexForSlot,
      currentLeaderSlot: store.get(currentLeaderSlotAtom),
      nextLeaderSlot: store.get(nextLeaderSlotAtom),
    });
    const slot = store.get(currentLeaderSlotAtom);
    const slotIndex = slot === undefined ? undefined : getIndexForSlot(slot);
    const index = slotIndex
      ? Math.max(0, slotIndex - slotsListPinnedSlotOffset)
      : 0;
    return Math.min(g.offset(index), Math.max(0, g.total - height));
  });

  // position the scroller before first paint; the paint already shows
  // the matching window
  useLayoutEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollTop;
    // initial position only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Programmatic move: position the scroller AND render the target
  // window in the same commit, so far jumps (epoch slider) never paint
  // a blank frame. The follow-up native scroll event is a no-op render.
  const scrollToIndex = useCallback((index: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = geometryRef.current.offset(index);
    setScrollTop(scroller.scrollTop); // browser-clamped
  }, []);

  const handleScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    setScrollTop(scroller.scrollTop);
  }, []);

  const setSlotOverride = useSetAtom(slotOverrideAtom);

  const debouncedScroll = useDebouncedCallback(() => {}, 100);

  // User scrolls (wheel/touch only -- native scrolls from follows don't
  // count) pin the list: override = slot at the pinned offset below the
  // first visible row
  useEffect(() => {
    const container = listContainerRef.current;
    if (!container) return;

    const handleSlotOverride = throttle(
      () => {
        const scroller = scrollerRef.current;
        if (!scroller) return;

        debouncedScroll();

        const slotIndex = Math.min(
          geometryRef.current.indexAt(scroller.scrollTop) +
            slotsListPinnedSlotOffset,
          itemsCount - 1,
        );

        const slot = getSlotAtIndex(slotIndex);
        setSlotOverride(slot);
      },
      50,
      { leading: true, trailing: true },
    );

    container.addEventListener("wheel", handleSlotOverride);
    container.addEventListener("touchmove", handleSlotOverride);

    return () => {
      handleSlotOverride.cancel();
      container.removeEventListener("wheel", handleSlotOverride);
      container.removeEventListener("touchmove", handleSlotOverride);
    };
  }, [getSlotAtIndex, debouncedScroll, setSlotOverride, itemsCount]);

  const winStart = Math.max(0, geometry.indexAt(scrollTop) - overscanRows);
  const winEnd = Math.min(
    itemsCount,
    geometry.indexAt(scrollTop + height) + 1 + overscanRows,
  );
  const rows: ReactNode[] = [];
  const renderedSlots: number[] = [];
  for (let i = winStart; i < winEnd; i++) {
    const slot = getSlotAtIndex(i);
    if (slot == null) continue;
    renderedSlots.push(slot);
    rows.push(
      <div key={slot}>
        <SlotsRenderer leaderSlotForGroup={slot} />
      </div>,
    );
  }

  // Pre-paint height correction: read the rendered rows once, calibrate
  // the kind seeds on first sight and remember per-slot deviations
  // (my-slot borders add 2px). Skipped while rows render as scroll
  // placeholders. Converges: once model matches layout, nothing updates.
  useLayoutEffect(() => {
    if (isScrolling || !getSlotGroupType) return;
    const win = windowRef.current;
    if (!win) return;
    const g = geometryRef.current;
    let changed = false;
    const children = win.children;
    for (let c = 0; c < children.length && c < renderedSlots.length; c++) {
      const slot = renderedSlots[c];
      const idx = getIndexForSlot(slot);
      if (idx === undefined || getSlotAtIndex(idx) !== slot) continue;
      const kind = g.kindAt(idx);
      const h = (children[c] as HTMLElement).offsetHeight;
      if (h === 0) continue;
      const prev = measuredRows.get(slot);
      const modeled = prev && prev.kind === kind ? prev.h : kindHeights[kind];
      if (Math.abs(h - modeled) < 0.5) continue;
      if (!calibratedKinds.has(kind)) {
        kindHeights[kind] = h;
        calibratedKinds.add(kind);
      } else {
        measuredRows.set(slot, { kind, h });
      }
      changed = true;
    }
    if (changed) bumpCalibration();
  });

  const showPlaceholder = geometry.total >= height;

  return (
    <Box
      ref={listContainerRef}
      position="relative"
      width={`${width}px`}
      height={`${height}px`}
    >
      <MRtAutoScroll
        scrollToIndex={scrollToIndex}
        getIndexForSlot={getIndexForSlot}
      />
      <MSlotOverrideScroll
        scrollToIndex={scrollToIndex}
        getIndexForSlot={getIndexForSlot}
        debouncedScroll={debouncedScroll}
      />
      {showPlaceholder && <MSlotsPlaceholder width={width} height={height} />}
      <ResetLive />
      <div
        ref={scrollerRef}
        className={styles.slotsList}
        data-testid="slots-scroller"
        onScroll={handleScroll}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            height: `${geometry.total}px`,
            position: "relative",
          }}
        >
          <div
            ref={windowRef}
            style={{
              position: "absolute",
              top: `${geometry.offset(winStart)}px`,
              left: 0,
              right: 0,
            }}
          >
            {rows}
          </div>
        </div>
      </div>
    </Box>
  );
}

interface RTAutoScrollProps {
  scrollToIndex: (index: number) => void;
  getIndexForSlot: (slot: number) => number | undefined;
}
const MRtAutoScroll = memo(function RTAutoScroll({
  scrollToIndex,
  getIndexForSlot,
}: RTAutoScrollProps) {
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);
  const autoScroll = useAtomValue(autoScrollAtom);

  useEffect(() => {
    if (!autoScroll || currentLeaderSlot === undefined) return;

    // scroll to new current leader slot
    const slotIndex = getIndexForSlot(currentLeaderSlot);
    const visibleStartIndex = slotIndex
      ? Math.max(0, slotIndex - slotsListPinnedSlotOffset)
      : 0;

    scrollToIndex(visibleStartIndex);
  }, [autoScroll, currentLeaderSlot, getIndexForSlot, scrollToIndex]);

  return null;
});

interface SlotOverrideScrollProps {
  scrollToIndex: (index: number) => void;
  getIndexForSlot: (slot: number) => number | undefined;
  debouncedScroll: DebouncedState<() => void>;
}
const MSlotOverrideScroll = memo(function SlotOverrideScroll({
  scrollToIndex,
  getIndexForSlot,
  debouncedScroll,
}: SlotOverrideScrollProps) {
  const rafIdRef = useRef<number | null>(null);
  const slotOverride = useAtomValue(slotOverrideAtom);

  useEffect(() => {
    if (slotOverride === undefined || debouncedScroll.isPending()) {
      return;
    }

    const slotIndex = getIndexForSlot(slotOverride);
    const targetIndex = slotIndex
      ? Math.max(0, slotIndex - slotsListPinnedSlotOffset)
      : 0;

    const prevRafId = rafIdRef.current;
    rafIdRef.current = requestAnimationFrame(() => {
      if (prevRafId !== null) {
        cancelAnimationFrame(prevRafId);
      }

      scrollToIndex(targetIndex);
    });

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [getIndexForSlot, slotOverride, scrollToIndex, debouncedScroll]);

  return null;
});

function AllSlotsList({ width, height }: SlotsListProps) {
  const epoch = useAtomValue(epochAtom);

  const slotsListProps = useMemo(() => getAllSlotsListProps(epoch), [epoch]);

  if (!slotsListProps) return null;

  return <InnerSlotsList width={width} height={height} {...slotsListProps} />;
}

function MySlotsList({ width, height }: SlotsListProps) {
  const mySlots = useAtomValue(leaderSlotsAtom);

  const slotsListProps = useMemo(() => getMySlotsListProps(mySlots), [mySlots]);

  if (!slotsListProps) return null;

  if (slotsListProps.itemsCount === 0) {
    return (
      <Flex
        width={`${width}px`}
        height={`${height}px`}
        justify="center"
        align="center"
      >
        <Text className={styles.noSlotsText}>
          No Slots
          <br />
          Available
        </Text>
      </Flex>
    );
  }

  return <InnerSlotsList width={width} height={height} {...slotsListProps} />;
}
