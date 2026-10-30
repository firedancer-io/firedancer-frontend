import { atom, getDefaultStore, useAtomValue } from "jotai";
import {
  hoveredSlotAtom,
  referenceNsAtom,
  visibleRangeAtom,
  worldRangeAtom,
} from "../atoms";
import {
  drawEventType,
  type SlotGroup,
  type SlotInfo,
  timelineSlotsAtom,
  timelineSlotsEmitterAtom,
} from "./nonAggAtoms";
import { calcAbsoluteNs, calcRelativeMs, getSlotDrawTileIdxs } from "../utils";
import { tileSizeNs, useNonAggHeaderQuery } from "./useNonAggHeaderQuery";
import { isAggregate } from "./utils";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible";
import type { TsRange } from "../../WebGl/webglUtils";
import { nsPerMs, slotsPerLeader } from "../../../consts";
import { getSlotGroupLeader } from "../../../utils";
import { epochAtom } from "../../../atoms";
import clsx from "clsx";
import PeerIcon from "../../../components/PeerIcon";
import { SlotStatus } from "./SlotStatus";
import { useSlotInfo } from "../../../hooks/useSlotInfo";
import styles from "./headerTrack.module.css";
import {
  memo,
  useCallback,
  useDeferredValue,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  aggHeaderEmitterAtom,
  drawEventType as aggDrawEventType,
} from "./aggAtoms";
import MonoText from "../../../components/MonoText";
import { trackHeight } from "./const";

const store = getDefaultStore();
const logoSize = 8;
const chartId = "non-agg-header-track";
const containerWindowMs = Number(tileSizeNs) / nsPerMs;

/**
 * Shared range math: resolve the absolute visible window, the overscanned tile
 * index range to render, and the slot/group tiers for the current zoom level.
 */
function getRangeInfo(
  referenceNs: bigint,
  visibleRange: TsRange,
  width: number,
) {
  const absStartNs = calcAbsoluteNs(referenceNs, visibleRange[0]);
  const absEndNs = calcAbsoluteNs(referenceNs, visibleRange[1]);
  const windowSizeNs = absEndNs - absStartNs;

  // Use estimated px width of one slot to determine amount of info to render
  const targetSlotDurationNs =
    store.get(epochAtom)?.target_slot_duration_nanos ?? 400 * nsPerMs;
  const estimatedSlotPx = targetSlotDurationNs * (width / Number(windowSizeNs));
  const slotTier = getSlotTier(estimatedSlotPx);
  const groupTier = getGroupTier(estimatedSlotPx * slotsPerLeader);

  const { startIdx, endIdx } = getSlotDrawTileIdxs(referenceNs, visibleRange);

  return {
    visibleStartMs: visibleRange[0],
    visibleEndMs: visibleRange[1],
    startIdx,
    endIdx,
    slotTier,
    groupTier,
  };
}

type GroupTier = "flag" | "name" | "icon" | "none";
type SlotTier = "number" | "status" | "block" | "narrowBlock" | "none";

function getSlotTier(estimatedSlotPx: number): SlotTier {
  return estimatedSlotPx >= 104
    ? "number"
    : estimatedSlotPx >= 17
      ? "status"
      : estimatedSlotPx >= 4
        ? "block"
        : estimatedSlotPx >= 2
          ? "narrowBlock"
          : "none";
}

function getGroupTier(estimatedGroupPx: number): GroupTier {
  return estimatedGroupPx >= 58
    ? "flag"
    : estimatedGroupPx >= 39
      ? "name"
      : estimatedGroupPx >= 10
        ? "icon"
        : "none";
}

const slotTierClasses: Record<SlotTier, string | undefined> = {
  number: styles.slotTierNumber,
  status: styles.slotTierStatus,
  block: styles.slotTierBlock,
  narrowBlock: styles.slotTierNarrowBlock,
  none: styles.slotTierNone,
};

const groupTierClasses: Record<GroupTier, string | undefined> = {
  flag: styles.groupTierFlag,
  name: styles.groupTierName,
  icon: styles.groupTierIcon,
  none: styles.groupTierNone,
};

const allTierClasses = [
  ...Object.values(slotTierClasses),
  ...Object.values(groupTierClasses),
].filter((cls): cls is string => cls != null);

function applyTierClasses(
  el: HTMLElement,
  slotTier: SlotTier,
  groupTier: GroupTier,
) {
  const active = new Set(
    [slotTierClasses[slotTier], groupTierClasses[groupTier]].filter(
      (cls): cls is string => cls != null,
    ),
  );
  for (const cls of allTierClasses) {
    el.classList.toggle(cls, active.has(cls));
  }
}

export interface NonAggHeaderTrackProps {
  className: string;
  width: number;
  showNonAgg: () => void;
}

export function NonAggHeaderTrack({
  className,
  width,
  showNonAgg,
}: NonAggHeaderTrackProps) {
  const [renderState, setRenderState] = useState<{
    slotGroups: SlotGroup[];
    slotTier: SlotTier;
    groupTier: GroupTier;
    containerStartMs: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerStartMsRef = useRef(0);

  const nonAggQuery = useNonAggHeaderQuery(chartId);

  const throttledRelativeTsQuery = useThrottledCallbackIfVisible(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
      nonAggQuery(referenceNs, visibleRange, worldRange);
    },
    100,
    { leading: true, trailing: true },
  );

  /**
   * Update which slot groups are rendered
   */
  const throttledUpdateGroups = useThrottledCallbackIfVisible(
    (referenceNs: bigint, visibleRange: TsRange) => {
      const { slotGroups, tileSlotGroups } = store.get(timelineSlotsAtom);
      const { startIdx, endIdx, slotTier, groupTier } = getRangeInfo(
        referenceNs,
        visibleRange,
        width,
      );

      const slotGroupsMap = new Map<number, SlotGroup>();
      for (let idx = startIdx; idx <= endIdx; idx++) {
        const tileGroups = tileSlotGroups.get(idx);
        if (!tileGroups) continue;

        for (const leaderSlot of tileGroups) {
          if (slotGroupsMap.has(leaderSlot)) continue;

          const group = slotGroups.get(leaderSlot);
          if (!group) continue;

          slotGroupsMap.set(leaderSlot, group);
        }
      }

      const nextSlotGroups = [...slotGroupsMap.values()].sort(
        (a, b) => a.leaderSlot - b.leaderSlot,
      );

      const containerStartMs = calcRelativeMs(
        referenceNs,
        BigInt(startIdx) * tileSizeNs,
      );

      setRenderState({
        slotGroups: nextSlotGroups,
        slotTier,
        groupTier,
        containerStartMs,
      });
    },
    30,
    { leading: true, trailing: true },
  );

  /**
   * Update container position and width. This will auto-scale slot groups.
   */
  const updateGroupPositionsOnly = useCallback(
    (referenceNs: bigint, visibleRange: TsRange) => {
      const { visibleStartMs, visibleEndMs, slotTier, groupTier } =
        getRangeInfo(referenceNs, visibleRange, width);

      if (!containerRef.current) return;

      // Set container width / position
      // NOTE: don't use css var here, as it will restyle dependents
      const pxPerMs = width / (visibleEndMs - visibleStartMs);
      const containerWidth = `${containerWindowMs * pxPerMs}px`;
      if (containerRef.current.style.width !== containerWidth) {
        containerRef.current.style.width = containerWidth;
      }
      containerRef.current.style.transform = `translateX(${(containerStartMsRef.current - visibleStartMs) * pxPerMs}px)`;

      // temporarily hide elements for this tier on pan / zoom, until react renders the updated tile props
      applyTierClasses(containerRef.current, slotTier, groupTier);
    },
    [width],
  );

  /**
   * Update positions and query for data
   */
  const onRangeChange = useCallback(() => {
    const referenceNs = store.get(referenceNsAtom);
    const worldRange = store.get(worldRangeAtom);
    const visibleRange = store.get(visibleRangeAtom);
    if (referenceNs == null || !visibleRange || !worldRange) {
      return;
    }

    updateGroupPositionsOnly(referenceNs, visibleRange);

    if (isAggregate(visibleRange)) return;

    throttledRelativeTsQuery(referenceNs, visibleRange, worldRange);
  }, [updateGroupPositionsOnly, throttledRelativeTsQuery]);

  /**
   * Update groups that are rendered and switch to showing non-agg
   */
  const throttledUpdateGroupsAndShow = useThrottledCallbackIfVisible(
    useCallback(() => {
      const referenceNs = store.get(referenceNsAtom);
      const visibleRange = store.get(visibleRangeAtom);
      if (!visibleRange || referenceNs == null || isAggregate(visibleRange)) {
        return;
      }

      throttledUpdateGroups(referenceNs, visibleRange);
      showNonAgg();
    }, [showNonAgg, throttledUpdateGroups]),
    70,
    { leading: true, trailing: true },
  );

  // set up renderer and subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    const unsubscribeRange = store.sub(visibleRangeAtom, onRangeChange);

    // listen for non-agg slots draw events
    const emitter = store.get(timelineSlotsEmitterAtom);
    emitter.addListener(drawEventType, throttledUpdateGroupsAndShow);

    const aggEmitter = store.get(aggHeaderEmitterAtom);
    const clearIfAgg = () => {
      const visibleRange = store.get(visibleRangeAtom);
      if (!visibleRange || !isAggregate(visibleRange)) return;
      setRenderState(null);
    };
    aggEmitter.addListener(aggDrawEventType, clearIfAgg);

    // trigger initial draw
    onRangeChange();

    // cleanup
    return () => {
      emitter.removeListener(drawEventType, throttledUpdateGroupsAndShow);
      aggEmitter.removeListener(aggDrawEventType, clearIfAgg);
      throttledUpdateGroupsAndShow.cancel();
      throttledUpdateGroups.cancel();
      throttledRelativeTsQuery.cancel();
      unsubscribeRange();
    };
  }, [
    onRangeChange,
    throttledUpdateGroupsAndShow,
    throttledUpdateGroups,
    throttledRelativeTsQuery,
  ]);

  // handle chart resize, which may trigger tier changes depending on new width
  useLayoutEffect(() => {
    const referenceNs = store.get(referenceNsAtom);
    const visibleRange = store.get(visibleRangeAtom);
    if (referenceNs == null || !visibleRange) {
      return;
    }
    throttledUpdateGroups(referenceNs, visibleRange);
  }, [throttledUpdateGroups, width]);

  const containerStartMs = renderState?.containerStartMs ?? 0;

  // reposition container before paint on anchor changes
  useLayoutEffect(() => {
    containerStartMsRef.current = containerStartMs;
    const referenceNs = store.get(referenceNsAtom);
    const visibleRange = store.get(visibleRangeAtom);
    if (referenceNs == null || !visibleRange) return;

    updateGroupPositionsOnly(referenceNs, visibleRange);
  }, [containerStartMs, updateGroupPositionsOnly]);

  return (
    <div className={className}>
      <div ref={containerRef} className={styles.container}>
        {renderState?.slotGroups.map((group) => (
          <SlotGroupContainer
            key={group.leaderSlot}
            containerStartMs={containerStartMs}
            leaderSlot={group.leaderSlot}
            slots={group.slots}
            groupTier={renderState.groupTier}
            slotTier={renderState.slotTier}
          />
        ))}
      </div>
    </div>
  );
}

interface SlotGroupContainerProps {
  containerStartMs: number;
  leaderSlot: number;
  slots: Map<number, SlotInfo>;
  groupTier: GroupTier;
  slotTier: SlotTier;
}

const SlotGroupContainer = memo(function SlotGroupContainer({
  containerStartMs,
  leaderSlot,
  slots,
  groupTier,
  slotTier,
}: SlotGroupContainerProps) {
  const sortedSlots = [...slots.values()].sort((a, b) => a.slot - b.slot);

  const hasSkipped = sortedSlots.some((s) => s.isSkipped);
  const isMine = sortedSlots.some((s) => s.isMine);

  const groupStartMs = Math.min(...sortedSlots.map((s) => s.startMs));
  const groupEndMs = Math.max(...sortedSlots.map((s) => s.endMs));
  const groupDurationMs = groupEndMs - groupStartMs;

  const isHovered = useAtomValue(
    useMemo(
      () =>
        atom((get) => {
          const hoveredSlot = get(hoveredSlotAtom);
          return (
            hoveredSlot != null &&
            getSlotGroupLeader(hoveredSlot) === leaderSlot
          );
        }),
      [leaderSlot],
    ),
  );

  return (
    <div
      className={clsx(styles.slotGroupContainer, {
        [styles.skipped]: hasSkipped,
        [styles.mine]: isMine,
        [styles.hovered]: isHovered,
      })}
      style={{
        height: `${trackHeight}px`,
        left: `${((groupStartMs - containerStartMs) / containerWindowMs) * 100}%`,
        width: `${(groupDurationMs / containerWindowMs) * 100}%`,
      }}
    >
      <SlotGroupHeader
        leaderSlot={leaderSlot}
        isMine={isMine}
        groupTier={groupTier}
      />
      <div className={styles.slotRow}>
        {sortedSlots.map((slotInfo) => {
          return (
            <Slot
              key={slotInfo.slot}
              isEarliestStart={groupStartMs === slotInfo.startMs}
              isLatestEnd={groupEndMs === slotInfo.endMs}
              groupStartMs={groupStartMs}
              groupDurationMs={groupDurationMs}
              {...slotInfo}
              slotTier={slotTier}
            />
          );
        })}
      </div>
    </div>
  );
});

interface SlotGroupHeaderProps {
  leaderSlot: number;
  isMine: boolean;
  groupTier: GroupTier;
}

const SlotGroupHeader = memo(function SlotGroupHeader({
  leaderSlot,
  isMine,
  groupTier,
}: SlotGroupHeaderProps) {
  const { peer, name, countryFlag } = useSlotInfo(leaderSlot);

  return (
    <div
      className={clsx(styles.slotGroupHeader, {
        [styles.noPad]: groupTier === "none" || groupTier === "icon",
      })}
    >
      {(groupTier === "flag" ||
        groupTier === "name" ||
        groupTier === "icon") && (
        <PeerIcon
          url={peer?.info?.icon_url}
          size={logoSize}
          isYou={isMine}
          hideTooltip
        />
      )}
      {(groupTier === "flag" || groupTier === "name") && (
        <>
          {isMine && <span className={styles.youText}>You</span>}
          <span className={styles.slotGroupName}>{name}</span>
        </>
      )}
      {groupTier === "flag" && countryFlag && (
        <MonoText className={styles.countryFlag}>{countryFlag}</MonoText>
      )}
    </div>
  );
});

interface SlotProps {
  isEarliestStart: boolean;
  isLatestEnd: boolean;
  groupStartMs: number;
  groupDurationMs: number;
  slot: number;
  startMs: number;
  endMs: number;
  isSkipped: boolean;
  slotTier: SlotTier;
}
const Slot = memo(function Slot({
  isEarliestStart,
  isLatestEnd,
  groupStartMs,
  groupDurationMs,
  slot,
  startMs,
  endMs,
  isSkipped,
  slotTier,
}: SlotProps) {
  // prevent status render from blocking smooth zoom, etc
  const deferredSlotTier = useDeferredValue(slotTier);

  const isHovered = useAtomValue(
    useMemo(() => atom((get) => get(hoveredSlotAtom) === slot), [slot]),
  );

  if (slotTier === "none") return null;

  const idx = slot % slotsPerLeader;
  const liveIsBlock = slotTier === "block" || slotTier === "narrowBlock";
  const showNumber = deferredSlotTier === "number";
  const showStatus =
    deferredSlotTier === "number" || deferredSlotTier === "status";

  const showBlock = liveIsBlock || !showStatus;

  return (
    <div
      className={clsx(styles.slot, {
        [styles.earliestStart]: isEarliestStart,
        [styles.latestEnd]: isLatestEnd,
        [styles.leftBorder]: !isEarliestStart && !showBlock,
        [styles.hoverSlot]: isHovered,
      })}
      style={{
        left: `${((startMs - groupStartMs) / groupDurationMs) * 100}%`,
        width: `${((endMs - startMs) / groupDurationMs) * 100}%`,
      }}
    >
      {!showBlock && (
        <div className={styles.slotContent}>
          {showNumber && <span className={styles.slotNumber}>{slot}</span>}
          {showStatus && (
            <div className={styles.slotStatus}>
              <SlotStatus slot={slot} skipped={isSkipped} />
            </div>
          )}
        </div>
      )}

      <div
        className={clsx(styles.slotBar, {
          [styles.slotBarBlock]: showBlock,
          [styles.slotBarNarrow]: slotTier === "narrowBlock",
          [styles.skipped]: isSkipped,
          [styles[`slotBar${idx}`]]: !isSkipped,
        })}
      />
    </div>
  );
});
