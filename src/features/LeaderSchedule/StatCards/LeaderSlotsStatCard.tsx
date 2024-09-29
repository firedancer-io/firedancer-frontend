import { useAtomValue } from "jotai";
import StatCard from "./StatCard";
import { Text } from "@radix-ui/themes";
import { leaderSlotsAtom, nextLeaderSlotIndexAtom } from "../../../atoms";

export default function LeaderSlotsStatCard() {
  const leaderSlots = useAtomValue(leaderSlotsAtom);
  const nextLeaderSlotIndex = useAtomValue(nextLeaderSlotIndexAtom);

  return (
    <StatCard
      headerText="Leader Slots"
      primaryText={nextLeaderSlotIndex !== undefined ? `${nextLeaderSlotIndex.toLocaleString()}` : ""}
      primaryTextColor="#2A7EDF"
    >
      <Text style={{ color: "#717171" }}>
        of {leaderSlots?.length.toLocaleString() ?? "Private"}
      </Text>
    </StatCard>
  );
}
