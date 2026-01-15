import { Flex, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { Duration } from "luxon";
import { useMemo } from "react";
import {
  clientAtom,
  leaderSlotsAtom,
  slotDurationAtom,
} from "../../../../atoms";
import { getDurationText, getSlotGroupLeader } from "../../../../utils";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import { slotsPerLeader } from "../../../../consts";
import { useSlotQueryResponseDetailed } from "../../../../hooks/useSlotQuery";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import styles from "../detailedSlotStats.module.css";
import { gridGapX, gridGapY } from "../consts";
import { ClientEnum } from "../../../../api/entities";

export function TimeSinceLastLeaderStats() {
  const client = useAtomValue(clientAtom);
  const slotDuration = useAtomValue(slotDurationAtom);
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const leaderSlots = useAtomValue(leaderSlotsAtom);
  const schedulerStats =
    useSlotQueryResponseDetailed(selectedSlot).response?.scheduler_stats;

  const prevGroupSlot = useMemo(() => {
    if (selectedSlot === undefined || !leaderSlots) return;

    const slotGroupLeader = getSlotGroupLeader(selectedSlot);
    const leaderSlotsIdx = leaderSlots.indexOf(slotGroupLeader) - 1;
    if (leaderSlotsIdx < 0) return;

    // get the last slot of the previous group
    return leaderSlots[leaderSlotsIdx] + slotsPerLeader - 1;
  }, [leaderSlots, selectedSlot]);

  if (selectedSlot === undefined) return;

  const timeTill = prevGroupSlot
    ? Duration.fromMillis(
        slotDuration * (selectedSlot - prevGroupSlot),
      ).rescale()
    : undefined;

  return (
    <SlotDetailsSubSection title="Scheduler">
      <Flex direction="column" gap={gridGapY}>
        <Flex gap={gridGapX}>
          <Text className={styles.label}>Time Since Last Leader Group</Text>
          <Text className={styles.value}>{getDurationText(timeTill)}</Text>
        </Flex>
        {client !== ClientEnum.Frankendancer && (
          <Flex gap={gridGapX}>
            <Text className={styles.label}>End slot reason</Text>
            <Text className={styles.value}>
              {schedulerStats?.end_slot_reason}
            </Text>
          </Flex>
        )}
      </Flex>
    </SlotDetailsSubSection>
  );
}
