import { Flex, Text } from "@radix-ui/themes";
import { getDefaultStore } from "jotai";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms";
import {
  drawEventType,
  type SlotGroup,
  type SlotInfo,
  timelineSlotsAtom,
  timelineSlotsEmitterAtom,
} from "./nonAggAtoms";
import { calcAbsoluteNs, calcRelativeMs, getTileIdx } from "../utils";
import {
  OVERSCAN_DRAW_TILES_COUNT,
  tileSizeNs,
  useNonAggHeaderQuery,
} from "./useNonAggHeaderQuery";
import { isAggregate } from "./utils";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible";
import type { TsRange } from "../../WebGl/webglUtils";
import { nsPerMs, slotsPerLeader } from "../../../consts";
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
  useRef,
  useState,
  type CSSProperties,
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

  const startIdx =
    getTileIdx(absStartNs, tileSizeNs, false) - OVERSCAN_DRAW_TILES_COUNT;
  const endIdx =
    getTileIdx(absEndNs, tileSizeNs, true) + OVERSCAN_DRAW_TILES_COUNT;

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
    // ms range of container
    containerStartMs: number;
    containerDurationMs: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
      const containerDurationMs =
        Number(BigInt(endIdx + 1 - startIdx) * tileSizeNs) / nsPerMs;

      setRenderState((prev) => {
        // If zooming in, don't remove previously rendered slot groups so they are around if user zooms out
        const isSubset =
          prev != null &&
          nextSlotGroups.length > 0 &&
          nextSlotGroups.every((group) =>
            prev.slotGroups.some((g) => g.leaderSlot === group.leaderSlot),
          );

        return isSubset
          ? {
              // refresh data
              slotGroups: prev.slotGroups.map(
                (group) => slotGroupsMap.get(group.leaderSlot) ?? group,
              ),
              slotTier,
              groupTier,
              // when keeping the previous (wider) group set, keep the container range that covers it
              containerStartMs: prev.containerStartMs,
              containerDurationMs: prev.containerDurationMs,
            }
          : {
              slotGroups: nextSlotGroups,
              slotTier,
              groupTier,
              containerStartMs,
              containerDurationMs,
            };
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

      // trigger container to update position / width
      containerRef.current.style.setProperty(
        "--visible-range-start-ms",
        `${visibleStartMs}`,
      );
      containerRef.current.style.setProperty(
        "--visible-range-duration-ms",
        `${visibleEndMs - visibleStartMs}`,
      );

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

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className={styles.container}
        style={
          {
            "--container-start-ms": `${renderState?.containerStartMs ?? 0}`,
            "--container-duration-ms": `${renderState?.containerDurationMs ?? 0}`,
          } as CSSProperties
        }
      >
        {renderState?.slotGroups.map((group) => (
          <SlotGroupContainer
            key={group.leaderSlot}
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
  leaderSlot: number;
  slots: Map<number, SlotInfo>;
  groupTier: GroupTier;
  slotTier: SlotTier;
}

const SlotGroupContainer = memo(function SlotGroupContainer({
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

  return (
    <div
      className={clsx(styles.slotGroupContainer, {
        [styles.skipped]: hasSkipped,
        [styles.mine]: isMine,
      })}
      style={
        {
          height: `${trackHeight}px`,
          "--group-start-ms": `${groupStartMs}`,
          "--group-duration-ms": `${groupDurationMs}`,
        } as CSSProperties
      }
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
    <Flex
      height="13px"
      overflow="hidden"
      width="100%"
      gap="4px"
      align="center"
      justify="center"
      px={groupTier === "none" || groupTier === "icon" ? "0" : "2px"}
      className={styles.slotGroupHeader}
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
          {isMine && (
            <Text truncate className={styles.youText}>
              You
            </Text>
          )}
          <Text truncate className={styles.slotGroupName}>
            {name}
          </Text>
        </>
      )}
      {groupTier === "flag" && countryFlag && (
        <MonoText className={styles.countryFlag}>{countryFlag}</MonoText>
      )}
    </Flex>
  );
});

interface SlotProps {
  isEarliestStart: boolean;
  isLatestEnd: boolean;
  slot: number;
  startMs: number;
  endMs: number;
  isSkipped: boolean;
  slotTier: SlotTier;
}
const Slot = memo(function Slot({
  isEarliestStart,
  isLatestEnd,
  slot,
  startMs,
  endMs,
  isSkipped,
  slotTier,
}: SlotProps) {
  // prevent status render from blocking smooth zoom, etc
  const deferredSlotTier = useDeferredValue(slotTier);

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
      })}
      style={
        {
          "--slot-start-ms": `${startMs}`,
          "--slot-duration-ms": `${endMs - startMs}`,
        } as CSSProperties
      }
    >
      {!showBlock && (
        <div className={styles.slotContent}>
          {showNumber && (
            <Text truncate className={styles.slotNumber}>
              {slot}
            </Text>
          )}
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
