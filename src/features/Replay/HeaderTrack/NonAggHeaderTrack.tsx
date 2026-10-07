import { Box, Flex, Text } from "@radix-ui/themes";
import {
  slotBorderHeight,
  slotGroupRowHeight,
  slotNumberRowHeight,
  trackHeight,
} from "./const";
import { getDefaultStore } from "jotai";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms";
import {
  drawEventType,
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
import { memo, useCallback, useLayoutEffect, useState } from "react";

const store = getDefaultStore();

const logoSize = 8;

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

interface TilePosition {
  idx: number;
  leftPx: number;
  widthPx: number;
  slots: SlotPosition[];
  slotGroups: Map<number, SlotGroupPosition>;
}

interface DrawInfo {
  tiles: TilePosition[];
  groupTier: GroupTier;
  slotTier: SlotTier;
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
  const [drawInfo, setDrawInfo] = useState<DrawInfo | null>(null);

  const nonAggQuery = useNonAggHeaderQuery(chartId);

  const updatePositions = useCallback(
    (referenceNs: bigint, visibleRange: TsRange) => {
      const absStartNs = calcAbsoluteNs(referenceNs, visibleRange[0]);
      const absEndNs = calcAbsoluteNs(referenceNs, visibleRange[1]);
      const windowSizeNs = absEndNs - absStartNs;

      // Use estimated px width of one slot to determine amount of info to render
      const targetSlotDurationNs =
        store.get(epochAtom)?.target_slot_duration_nanos ?? 400 * nsPerMs;
      const pxPerNs = width / Number(windowSizeNs);
      const estimatedSlotPx = targetSlotDurationNs * pxPerNs;
      const slotTier: SlotTier =
        estimatedSlotPx >= SHOW_SLOT_TEXT_MIN_PX
          ? "numberStatusBar"
          : estimatedSlotPx >= SHOW_SLOT_ICON_MIN_PX
            ? "statusBar"
            : "barOnly";

      const estimatedGroupPx = estimatedSlotPx * slotsPerLeader;
      const groupTier: GroupTier =
        estimatedGroupPx >= SHOW_GROUP_NAME_MIN_PX ? "groupIcon" : "iconOnly";

      const startIdx =
        getTileIdx(absStartNs, tileSizeNs, false) - OVERSCAN_TILES_COUNT;
      const endIdx =
        getTileIdx(absEndNs, tileSizeNs, true) + OVERSCAN_TILES_COUNT;

      const timelineSlots = store.get(timelineSlotsAtom);

      const tileWidthPx = (Number(tileSizeNs) / Number(windowSizeNs)) * width;
      const tilePositions: TilePosition[] = [];

      for (let idx = startIdx; idx <= endIdx; idx++) {
        const tile = timelineSlots.get(idx);
        if (!tile) continue;

        const tileStartNs = BigInt(idx) * tileSizeNs;
        const tileLeftPx =
          (Number(tileStartNs - absStartNs) / Number(windowSizeNs)) * width;

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

        tilePositions.push({
          idx: idx,
          widthPx: tileWidthPx,
          leftPx: tileLeftPx,
          slots,
          slotGroups,
        });
      }

      setDrawInfo({
        tiles: tilePositions,
        groupTier,
        slotTier,
      });
    },
    [width],
  );

  const throttledUpdatePositions = useThrottledCallbackIfVisible(
    updatePositions,
    30,
    { leading: true, trailing: true },
  );

  const throttledRelativeTsQuery = useThrottledCallbackIfVisible(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
      nonAggQuery(referenceNs, visibleRange, worldRange);
    },
    100,
    { leading: true, trailing: true },
  );

  const onRangeChange = useCallback(() => {
    const referenceNs = store.get(referenceNsAtom);
    const worldRange = store.get(worldRangeAtom);
    const visibleRange = store.get(visibleRangeAtom);
    if (
      referenceNs == null ||
      !visibleRange ||
      !worldRange ||
      isAggregate(visibleRange)
    ) {
      return;
    }

    throttledUpdatePositions(referenceNs, visibleRange);
    throttledRelativeTsQuery(referenceNs, visibleRange, worldRange);
  }, [throttledUpdatePositions, throttledRelativeTsQuery]);

  const throttledUpdateAndShow = useThrottledCallbackIfVisible(
    useCallback(() => {
      const referenceNs = store.get(referenceNsAtom);
      const visibleRange = store.get(visibleRangeAtom);
      if (!visibleRange || referenceNs == null || isAggregate(visibleRange)) {
        return;
      }

      throttledUpdatePositions(referenceNs, visibleRange);
      showNonAgg();
    }, [showNonAgg, throttledUpdatePositions]),
    50,
    { leading: true, trailing: true },
  );

  // set up renderer and subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    const unsubscribeRange = store.sub(visibleRangeAtom, onRangeChange);

    // listen for agg slots draw events
    const emitter = store.get(timelineSlotsEmitterAtom);
    emitter.addListener(drawEventType, throttledUpdateAndShow);

    // trigger initial draw
    onRangeChange();

    // cleanup
    return () => {
      emitter.removeListener(drawEventType, throttledUpdateAndShow);
      throttledUpdateAndShow.cancel();
      throttledUpdatePositions.cancel();
      throttledRelativeTsQuery.cancel();
      unsubscribeRange();
    };
  }, [
    onRangeChange,
    throttledUpdateAndShow,
    throttledUpdatePositions,
    throttledRelativeTsQuery,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    const referenceNs = store.get(referenceNsAtom);
    const visibleRange = store.get(visibleRangeAtom);
    if (referenceNs == null || !visibleRange || isAggregate(visibleRange)) {
      return;
    }
    throttledUpdatePositions(referenceNs, visibleRange);
  }, [throttledUpdatePositions, width]);

  if (drawInfo == null) return null;

  return (
    <Box
      className={className}
      position="relative"
      width="100%"
      height="100%"
      overflowX="hidden"
    >
      {drawInfo.tiles.map((tile) => (
        <Tile
          key={tile.idx}
          tile={tile}
          groupTier={drawInfo.groupTier}
          slotTier={drawInfo.slotTier}
        />
      ))}
    </Box>
  );
}

interface TileProps {
  tile: TilePosition;
  groupTier: GroupTier;
  slotTier: SlotTier;
}

/**
 * Render slot groups and slots that fall within this tile.
 * Translate tile X position on pan.
 */
function Tile({ tile, groupTier, slotTier }: TileProps) {
  // When slots collapse to bars, give the reclaimed height to the group row.
  const isBarOnly = slotTier === "barOnly";
  const groupRowPx = isBarOnly
    ? trackHeight - slotBorderHeight
    : slotGroupRowHeight;
  const slotRowPx = isBarOnly ? slotBorderHeight : slotNumberRowHeight;

  return (
    <Box
      position="absolute"
      top="0"
      left="0"
      bottom="0"
      style={{
        width: `${tile.widthPx}px`,
        transform: `translateX(${tile.leftPx}px)`,
      }}
    >
      <Box position="relative" width="100%" height={`${groupRowPx}px`}>
        {[...tile.slotGroups.entries()].map(([leaderSlot, group]) => (
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
      <Box position="relative" width="100%" height={`${slotRowPx}px`}>
        {tile.slots.map((slot) => (
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
}

interface SlotGroupProps {
  leaderSlot: number;
  // left/width as percent of the parent tile.
  leftPct: number;
  widthPct: number;
  showName: boolean;
  hasSkipped: boolean;
  hasMine: boolean;
}
// Styling copied from ShredsProgression's SlotGroupLabel (minus the slot bars);
// the row height lives in the .slotGroupLabel class.
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
      {slotTier !== "barOnly" && <SlotStatus slot={slot} skipped={skipped} />}
    </Flex>
  );
});
