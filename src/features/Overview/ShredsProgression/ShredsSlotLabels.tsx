import { useAtomValue } from "jotai";
import { Flex, Text } from "@radix-ui/themes";
import {
  getSlotGroupLabelId,
  getSlotGroupNameId,
  getSlotLabelId,
} from "./utils";
import styles from "./shreds.module.css";
import { memo, useLayoutEffect, useMemo, useState } from "react";
import { slotsPerLeader } from "../../../consts";
import { useSlotInfo } from "../../../hooks/useSlotInfo";
import clsx from "clsx";
import PeerIcon from "../../../components/PeerIcon";
import { isStartupProgressVisibleAtom } from "../../StartupProgress/atoms";
import { liveShredsPostStartupLeaderSlotsAtom } from "./atoms";

const extraGroups = 20;

/**
 * Add extra leaders to reduce update frequency
 */
function getRangeWithExtraLeaders(
  range:
    | {
        min: number;
        max: number;
      }
    | undefined,
) {
  if (!range) return;
  return {
    min: range.min,
    max: range.max + extraGroups * slotsPerLeader,
  };
}

/**
 * Labels for shreds slots.
 * Don't render during startup, because there will be multiple overlapping slots
 * during the catching up phase.
 */
export default function ShredsSlotLabels() {
  const isStartup = useAtomValue(isStartupProgressVisibleAtom);
  const leaderSlotsRange = useAtomValue(liveShredsPostStartupLeaderSlotsAtom);
  const [renderSlotRange, setRenderSlotRange] = useState(
    getRangeWithExtraLeaders(leaderSlotsRange),
  );

  useLayoutEffect(() => {
    if (!leaderSlotsRange) {
      // reset
      setRenderSlotRange(undefined);
      return;
    }

    setRenderSlotRange((prev) => {
      if (!prev || prev.max < leaderSlotsRange.max) {
        // need to render more groups
        return getRangeWithExtraLeaders(leaderSlotsRange);
      }
      return prev;
    });
  }, [leaderSlotsRange]);

  if (isStartup) return;

  return (
    <SlotGroupContainer
      firstLeader={renderSlotRange?.min}
      lastLeader={renderSlotRange?.max}
    />
  );
}

interface SlotGroupContainerProps {
  firstLeader?: number;
  lastLeader?: number;
}
const SlotGroupContainer = memo(function SlotGroupContainer({
  firstLeader,
  lastLeader,
}: SlotGroupContainerProps) {
  const leaderSlots = useMemo(() => {
    if (firstLeader == null || lastLeader == null) return;

    const result = [];
    for (let slot = firstLeader; slot <= lastLeader; slot += slotsPerLeader) {
      result.push(slot);
    }
    return result;
  }, [firstLeader, lastLeader]);

  return (
    <Flex flexShrink="0" overflowX="hidden" position="relative" height="15px">
      {leaderSlots?.map((slot) => (
        <SlotGroupLabel key={slot} firstSlot={slot} />
      ))}
    </Flex>
  );
});

interface SlotGroupLabelProps {
  firstSlot: number;
}
const SlotGroupLabel = memo(function SlotGroupLabel({
  firstSlot,
}: SlotGroupLabelProps) {
  const { peer, name, isLeader } = useSlotInfo(firstSlot);
  const slots = useMemo(() => {
    return Array.from({ length: slotsPerLeader }, (_, i) => firstSlot + i);
  }, [firstSlot]);

  return (
    <Flex
      height="100%"
      minHeight="0"
      direction="column"
      gap="2px"
      position="absolute"
      id={getSlotGroupLabelId(firstSlot)}
      className={clsx(styles.slotGroupLabel, {
        [styles.you]: isLeader,
      })}
    >
      <Flex
        justify="center"
        flexGrow="1"
        minHeight="0"
        minWidth="0"
        px="2px"
        className={styles.slotGroupTopContainer}
      >
        <Flex
          align="center"
          gap="4px"
          minWidth="0"
          id={getSlotGroupNameId(firstSlot)}
          className={styles.slotGroupNameContainer}
        >
          <PeerIcon
            url={peer?.info?.icon_url}
            size={10}
            isYou={isLeader}
            hideTooltip
          />
          <Text className={styles.name}>{name}</Text>
        </Flex>
      </Flex>

      <Flex
        height="2px"
        position="relative"
        className={styles.slotBarsContainer}
      >
        {slots.map((slot) => (
          <div
            key={slot}
            className={styles.slotBar}
            id={getSlotLabelId(slot)}
          />
        ))}
      </Flex>
    </Flex>
  );
});
