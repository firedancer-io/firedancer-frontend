import { Flex, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { Duration } from "luxon";
import { useMemo } from "react";
import { leaderSlotsAtom, slotDurationAtom } from "../../../../atoms";
import { getDurationText, getSlotGroupLeader } from "../../../../utils";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import { slotsPerLeader } from "../../../../consts";
import { useSlotQueryResponseDetailed } from "../../../../hooks/useSlotQuery";
import {
  slotDetailsStatsPrimary,
  slotDetailsStatsSecondary,
} from "../../../../colors";

export function TimeSinceLastLeaderStats() {
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
    <Flex direction="column" gap="1">
      <Flex gap="2">
        <Text style={{ color: slotDetailsStatsSecondary }}>
          Time Since Last Leader Group
        </Text>
        <Text style={{ color: slotDetailsStatsPrimary }}>
          {getDurationText(timeTill)}
        </Text>
      </Flex>
      <Flex gap="2">
        <Text style={{ color: slotDetailsStatsSecondary }}>
          End slot reason
        </Text>
        <Text style={{ color: slotDetailsStatsPrimary }}>
          {schedulerStats?.end_slot_reason}
        </Text>
      </Flex>
    </Flex>
  );
}
