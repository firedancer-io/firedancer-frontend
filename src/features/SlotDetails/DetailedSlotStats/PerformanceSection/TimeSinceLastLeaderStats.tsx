import { Flex, Text } from "@radix-ui/themes";
import TxnIncomePctBarChart from "../../TxnIncomePctChart/TxnIncomePctBarChart";
import { useAtomValue } from "jotai";
import { Duration } from "luxon";
import { useMemo, type useReducer } from "react";
import { useHarmonicIntervalFn } from "react-use";
import {
  currentSlotAtom,
  leaderSlotsAtom,
  slotDurationAtom,
} from "../../../../atoms";
import { getDurationText, getSlotGroupLeader } from "../../../../utils";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import { slotsPerLeader } from "../../../../consts";

export function TimeSinceLastLeaderStats() {
  const slotDuration = useAtomValue(slotDurationAtom);
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const leaderSlots = useAtomValue(leaderSlotsAtom);

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
    <Flex direction="column">
      <Text style={{ color: "var(--gray-12)" }}>Scheduler</Text>
      <Flex gap="2">
        <Text style={{ color: "var(--gray-10)" }}>
          Time Since Last Leader Group
        </Text>
        <Text style={{ color: "var(--gray-11)" }}>
          {getDurationText(timeTill)}
        </Text>
      </Flex>
    </Flex>
  );
}
