import { useAtomValue } from "jotai";
import StatCard from "./StatCard";
import { Text } from "@radix-ui/themes";
import { skippedSlotsAtom } from "../../../api/atoms";

export default function SkippedSlotsStatCard() {
  const skippedSlots = useAtomValue(skippedSlotsAtom);

  return (
    <StatCard
      headerText="Missed Slots"
      primaryText={`${skippedSlots?.length ?? 0}`}
      primaryTextColor="#E13131"
    >
      <Text style={{ color: "#717171" }}>
        {" "}
        of {skippedSlots?.length ?? 0 * 9}
      </Text>
    </StatCard>
  );
}
