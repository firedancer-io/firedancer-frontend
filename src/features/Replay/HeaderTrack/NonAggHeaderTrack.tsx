import { Box, Flex, Text } from "@radix-ui/themes";
import { getDefaultStore } from "jotai";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms";
import {
  drawEventType,
  type TileSlots,
  timelineSlotsAtom,
  timelineSlotsEmitterAtom,
} from "./nonAggAtoms";
import { calcAbsoluteNs, getTileIdx } from "../utils";
import {
  OVERSCAN_TILES_COUNT,
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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  aggHeaderEmitterAtom,
  drawEventType as aggDrawEventType,
} from "./aggAtoms";

const store = getDefaultStore();

const logoSize = 8;

/**
 * Get tile position relative to track width that represents the visible range
 */
function getTilePx(
  idx: number,
  absStartNs: bigint,
  absEndNs: bigint,
  width: number,
) {
  const windowSizeNs = absEndNs - absStartNs;
  const tileStartNs = BigInt(idx) * tileSizeNs;
  const widthPx = (Number(tileSizeNs) / Number(windowSizeNs)) * width;
  const leftPx =
    (Number(tileStartNs - absStartNs) / Number(windowSizeNs)) * width;
  return { widthPx, leftPx };
}

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
    getTileIdx(absStartNs, tileSizeNs, false) - OVERSCAN_TILES_COUNT;
  const endIdx = getTileIdx(absEndNs, tileSizeNs, true) + OVERSCAN_TILES_COUNT;

  return { absStartNs, absEndNs, startIdx, endIdx, slotTier, groupTier };
}

/**
 * Derive the slot and slot-group positions (as percentages of the tile) from a
 * raw tile's slot data.
 */
function getTileSlots(idx: number, tile: TileSlots) {
  const tileStartNs = BigInt(idx) * tileSizeNs;
  const slots: SlotPosition[] = [];
  const slotGroups = new Map<number, SlotGroupPosition>();
  for (let i = 0; i < tile.slotDeltas.length; i++) {
    const slotDelta = tile.slotDeltas[i];
    const slot = slotDelta + tile.referenceSlot;
    const slotStartNs = tile.startTsDeltas[i] + tile.referenceNs;
    const slotEndNs = tile.endTsDeltas[i] + tile.referenceNs;
    const leftPct =
      (Number(slotStartNs - tileStartNs) / Number(tileSizeNs)) * 100;
    const widthPct =
      (Number(slotEndNs - slotStartNs) / Number(tileSizeNs)) * 100;
    const isSkipped = tile.skippedDeltas.has(slotDelta);
    const isMine = tile.mineDeltas.has(slotDelta);

    slots.push({
      slot,
      leftPct,
      widthPct,
      isSkipped,
      isMine,
    });

    const firstSlot = slot - (slot % slotsPerLeader);
    const endPct = leftPct + widthPct;
    const isFirstSlot = slot % slotsPerLeader === 0;
    const group = slotGroups.get(firstSlot);
    if (!group) {
      slotGroups.set(firstSlot, {
        leftPct,
        endPct,
        hasFirstSlot: isFirstSlot,
        hasSkipped: isSkipped,
        hasMine: isMine,
      });
    } else {
      if (leftPct < group.leftPct) {
        group.leftPct = leftPct;
      }
      if (endPct > group.endPct) {
        group.endPct = endPct;
      }
      if (isFirstSlot) {
        group.hasFirstSlot = true;
      }
      if (isSkipped) {
        group.hasSkipped = true;
      }
      if (isMine) {
        group.hasMine = true;
      }
    }
  }

  return { slots, slotGroups };
}

const slotGroupColorClasses = [
  styles.group0,
  styles.group1,
  styles.group2,
  styles.group3,
];

const SHOW_SLOT_TEXT_MIN_PX = 40;
const SHOW_SLOT_ICON_MIN_PX = 16;
const SHOW_GROUP_NAME_MIN_PX = 22;

type GroupTier = "groupIcon" | "iconOnly";
type SlotTier = "numberStatusBar" | "statusBar" | "barOnly";

function getSlotTier(estimatedSlotPx: number): SlotTier {
  return estimatedSlotPx >= SHOW_SLOT_TEXT_MIN_PX
    ? "numberStatusBar"
    : estimatedSlotPx >= SHOW_SLOT_ICON_MIN_PX
      ? "statusBar"
      : "barOnly";
}

function getGroupTier(estimatedGroupPx: number): GroupTier {
  return estimatedGroupPx >= SHOW_GROUP_NAME_MIN_PX ? "groupIcon" : "iconOnly";
}

const slotTierClasses: Record<SlotTier, string | undefined> = {
  numberStatusBar: styles.slotTierNumberStatusBar,
  statusBar: styles.slotTierStatusBar,
  barOnly: styles.slotTierBarOnly,
};

const groupTierClasses: Record<GroupTier, string | undefined> = {
  groupIcon: styles.groupTierGroupIcon,
  iconOnly: styles.groupTierIconOnly,
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

const chartId = "non-agg-header-track";

interface SlotPosition {
  slot: number;
  leftPct: number;
  widthPct: number;
  isSkipped: boolean;
  isMine: boolean;
}

interface SlotGroupPosition {
  leftPct: number;
  endPct: number;
  hasFirstSlot: boolean;
  hasSkipped: boolean;
  hasMine: boolean;
}

interface RenderTiles {
  idx: number;
  tileSlots: TileSlots;
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
  const [tiles, setTiles] = useState<{
    tiles: RenderTiles[];
    groupTier: GroupTier;
    slotTier: SlotTier;
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
   * Update which tiles are renderered
   */
  const throttledUpdateTiles = useThrottledCallbackIfVisible(
    (referenceNs: bigint, visibleRange: TsRange) => {
      const timelineSlots = store.get(timelineSlotsAtom);
      const { startIdx, endIdx, slotTier, groupTier } = getRangeInfo(
        referenceNs,
        visibleRange,
        width,
      );

      const tiles: RenderTiles[] = [];
      for (let idx = startIdx; idx <= endIdx; idx++) {
        const tileSlots = timelineSlots.get(idx);
        if (!tileSlots) continue;

        tiles.push({ idx, tileSlots });
      }

      setTiles({
        tiles,
        groupTier,
        slotTier,
      });
    },
    30,
    { leading: true, trailing: true },
  );

  /**
   * Update all renderer tiles' positions and widths
   */
  const updateTilePositionsOnly = useCallback(
    (referenceNs: bigint, visibleRange: TsRange) => {
      const { absStartNs, absEndNs, slotTier, groupTier } = getRangeInfo(
        referenceNs,
        visibleRange,
        width,
      );

      for (const child of containerRef.current?.children ?? []) {
        const el = child as HTMLElement;
        const idx = Number(el.dataset.tileidx);
        if (Number.isNaN(idx)) continue;

        const { widthPx, leftPx } = getTilePx(idx, absStartNs, absEndNs, width);
        el.style.width = `${widthPx}px`;
        el.style.transform = `translateX(${leftPx}px)`;
        // temporarily hide elements for this tier on pan / zoom, until react renders the updated tile props
        applyTierClasses(el, slotTier, groupTier);
      }
    },
    [width],
  );

  /**
   * Update tile positions and query for data
   */
  const onRangeChange = useCallback(() => {
    const referenceNs = store.get(referenceNsAtom);
    const worldRange = store.get(worldRangeAtom);
    const visibleRange = store.get(visibleRangeAtom);
    if (referenceNs == null || !visibleRange || !worldRange) {
      return;
    }

    updateTilePositionsOnly(referenceNs, visibleRange);

    if (isAggregate(visibleRange)) return;

    throttledRelativeTsQuery(referenceNs, visibleRange, worldRange);
  }, [updateTilePositionsOnly, throttledRelativeTsQuery]);

  /**
   * Update tiles that are renderered and switch to showing non-agg
   */
  const throttledUpdateTilesAndShow = useThrottledCallbackIfVisible(
    useCallback(() => {
      const referenceNs = store.get(referenceNsAtom);
      const visibleRange = store.get(visibleRangeAtom);
      if (!visibleRange || referenceNs == null || isAggregate(visibleRange)) {
        return;
      }

      throttledUpdateTiles(referenceNs, visibleRange);
      showNonAgg();
    }, [showNonAgg, throttledUpdateTiles]),
    70,
    { leading: true, trailing: true },
  );

  // set up renderer and subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    const unsubscribeRange = store.sub(visibleRangeAtom, onRangeChange);

    // listen for agg slots draw events
    const emitter = store.get(timelineSlotsEmitterAtom);
    emitter.addListener(drawEventType, throttledUpdateTilesAndShow);

    const aggEmitter = store.get(aggHeaderEmitterAtom);
    const clearTilesIfAgg = () => {
      const visibleRange = store.get(visibleRangeAtom);
      if (!visibleRange || !isAggregate(visibleRange)) return;
      setTiles(null);
    };
    aggEmitter.addListener(aggDrawEventType, clearTilesIfAgg);

    // trigger initial draw
    onRangeChange();

    // cleanup
    return () => {
      emitter.removeListener(drawEventType, throttledUpdateTilesAndShow);
      aggEmitter.removeListener(aggDrawEventType, clearTilesIfAgg);
      throttledUpdateTilesAndShow.cancel();
      throttledUpdateTiles.cancel();
      throttledRelativeTsQuery.cancel();
      unsubscribeRange();
    };
  }, [
    onRangeChange,
    throttledUpdateTilesAndShow,
    throttledUpdateTiles,
    throttledRelativeTsQuery,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    const referenceNs = store.get(referenceNsAtom);
    const visibleRange = store.get(visibleRangeAtom);
    if (referenceNs == null || !visibleRange) {
      return;
    }
    throttledUpdateTiles(referenceNs, visibleRange);
  }, [throttledUpdateTiles, width]);

  // position freshly rendered tiles before paint
  useLayoutEffect(() => {
    const referenceNs = store.get(referenceNsAtom);
    const visibleRange = store.get(visibleRangeAtom);
    if (referenceNs == null || !visibleRange) {
      return;
    }
    updateTilePositionsOnly(referenceNs, visibleRange);
  }, [tiles, updateTilePositionsOnly]);

  if (tiles == null) return null;

  return (
    <Box
      ref={containerRef}
      className={className}
      position="relative"
      width="100%"
      height="100%"
      overflowX="hidden"
    >
      {tiles.tiles.map(({ idx, tileSlots }) => (
        <Tile
          key={idx}
          idx={idx}
          tileSlots={tileSlots}
          groupTier={tiles.groupTier}
          slotTier={tiles.slotTier}
        />
      ))}
    </Box>
  );
}

interface TileProps {
  idx: number;
  tileSlots: TileSlots;
  groupTier: GroupTier;
  slotTier: SlotTier;
}

/**
 * Render slot groups and slots that fall within this tile.
 * Width and positions are set separately
 */
const Tile = memo(function Tile({
  idx,
  tileSlots,
  groupTier,
  slotTier,
}: TileProps) {
  const { slots, slotGroups } = useMemo(
    () => getTileSlots(idx, tileSlots),
    [idx, tileSlots],
  );

  return (
    <Box
      data-tileidx={idx}
      className={clsx(slotTierClasses[slotTier], groupTierClasses[groupTier])}
      position="absolute"
      top="0"
      left="0"
      bottom="0"
    >
      <Box className={styles.groupRow} position="relative" width="100%">
        {[...slotGroups.entries()].map(([leaderSlot, group]) => (
          <SlotGroup
            key={leaderSlot}
            leaderSlot={leaderSlot}
            leftPct={group.leftPct}
            widthPct={group.endPct - group.leftPct}
            showName={groupTier === "groupIcon"}
            hasSkipped={group.hasSkipped}
            hasMine={group.hasMine}
          />
        ))}
      </Box>
      <Box className={styles.slotRow} position="relative" width="100%">
        {slots.map((slot) => (
          <Slot
            key={slot.slot}
            slot={slot.slot}
            leftPct={slot.leftPct}
            widthPct={slot.widthPct}
            slotTier={slotTier}
            skipped={slot.isSkipped}
          />
        ))}
      </Box>
    </Box>
  );
});

interface SlotGroupProps {
  leaderSlot: number;
  // left/width as percent of the parent tile.
  leftPct: number;
  widthPct: number;
  showName: boolean;
  hasSkipped: boolean;
  hasMine: boolean;
}
const SlotGroup = memo(function SlotGroup({
  leaderSlot: firstSlot,
  leftPct,
  widthPct,
  showName,
  hasSkipped,
  hasMine,
}: SlotGroupProps) {
  const { peer, name, isLeader } = useSlotInfo(firstSlot);

  return (
    <Flex
      minHeight="0"
      direction="column"
      gap="2px"
      position="absolute"
      top="0"
      bottom="0"
      width={`${widthPct}%`}
      px="2px"
      overflow="hidden"
      className={clsx(styles.slotGroupLabel, {
        [styles.skipped]: hasSkipped,
        [styles.mine]: hasMine,
      })}
      style={{ left: `${leftPct}%` }}
    >
      <Flex justify="center" flexGrow="1" minHeight="0" minWidth="0" px="2px">
        <Flex align="center" gap="4px" minWidth="0">
          <PeerIcon
            url={peer?.info?.icon_url}
            size={logoSize}
            isYou={isLeader}
            hideTooltip
          />
          {showName && (
            <Text truncate className={styles.slotGroupName}>
              {name}
            </Text>
          )}
        </Flex>
      </Flex>
    </Flex>
  );
});

interface SlotProps {
  slot: number;
  // left/width as percent of the parent tile.
  leftPct: number;
  widthPct: number;
  slotTier: SlotTier;
  skipped: boolean;
}
const Slot = memo(function Slot({
  slot,
  leftPct,
  widthPct,
  slotTier,
  skipped,
}: SlotProps) {
  return (
    <Flex
      align="center"
      justify="center"
      gap="2"
      position="absolute"
      top="0"
      bottom="0"
      width={`${widthPct}%`}
      className={clsx(
        styles.slot,
        skipped ? styles.skipped : slotGroupColorClasses[slot % 4],
      )}
      style={{
        left: `${leftPct}%`,
      }}
    >
      {slotTier === "numberStatusBar" && (
        <Text truncate className={styles.slotNumber}>
          {slot}
        </Text>
      )}
      {slotTier !== "barOnly" && (
        <Flex className={styles.slotStatus} align="center">
          <SlotStatus slot={slot} skipped={skipped} />
        </Flex>
      )}
    </Flex>
  );
});
