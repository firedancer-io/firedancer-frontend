import { useAtomValue } from "jotai";
import { Flex, Text } from "@radix-ui/themes";
import { getSlotGroupLabelId, getSlotLabelId } from "./utils";
import styles from "./shreds.module.css";
import { useMemo } from "react";
import { slotsPerLeader } from "../../../consts";
import { shredsAtoms } from "./atoms";
import { useSlotInfo } from "../../../hooks/useSlotInfo";
import clsx from "clsx";
import PeerIcon from "../../../components/PeerIcon";
import { skippedClusterSlotsAtom } from "../../../atoms";
import { isStartupProgressVisibleAtom } from "../../StartupProgress/atoms";

/**
 * Labels for shreds slots.
 * Don't render during startup, because there will be multiple overlapping slots
 * during the catching up phase.
 */
export default function ShredsSlotLabels() {
  const isStartup = useAtomValue(isStartupProgressVisibleAtom);
  const groupLeaderSlots = useAtomValue(shredsAtoms.groupLeaderSlots);

  if (isStartup) return;

  return (
    <Flex overflow="hidden" position="relative" style={{ height: "25px" }}>
      {groupLeaderSlots.map((slot) => (
        <SlotGroupLabel key={slot} firstSlot={slot} />
      ))}
    </Flex>
  );
}

interface SlotGroupLabelProps {
  firstSlot: number;
}
function SlotGroupLabel({ firstSlot }: SlotGroupLabelProps) {
  const { peer, name, isLeader } = useSlotInfo(firstSlot);
  const slots = useMemo(() => {
    return Array.from({ length: slotsPerLeader }, (_, i) => firstSlot + i);
  }, [firstSlot]);

  const skippedClusterSlots = useAtomValue(skippedClusterSlotsAtom);
  const skippedSlots = useMemo(() => {
    const skipped = new Set<number>();
    for (const slot of slots) {
      if (skippedClusterSlots.has(slot)) {
        skipped.add(slot);
      }
    }
    return skipped;
  }, [slots, skippedClusterSlots]);

  return (
    <Flex
      height="100%"
      direction="column"
      gap="2px"
      position="absolute"
      justify="center"
      align="center"
      overflow="hidden"
      id={getSlotGroupLabelId(firstSlot)}
      className={clsx(styles.slotGroupLabel, {
        [styles.you]: isLeader,
        [styles.skipped]: skippedSlots.size > 0,
      })}
    >
      <Flex
        justify="center"
        align="center"
        width="100%"
        gap="4px"
        p="1px 2px"
        wrap="nowrap"
        flexGrow="1"
        className={styles.slotGroupNameContainer}
      >
        <PeerIcon
          url={peer?.info?.icon_url}
          size={17}
          isYou={isLeader}
          hideTooltip
        />
        <Text className={styles.name}>{name}</Text>
      </Flex>

      <Flex
        width="100%"
        height="3px"
        position="relative"
        overflow="hidden"
        className={styles.slotBarsContainer}
      >
        {slots.map((slot) => (
          <div
            key={slot}
            className={clsx(styles.slotBar, {
              [styles.skipped]: skippedSlots.has(slot),
            })}
            id={getSlotLabelId(slot)}
          />
        ))}
      </Flex>
    </Flex>
  );
}
