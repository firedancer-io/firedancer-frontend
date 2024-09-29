import { Flex, Text } from "@radix-ui/themes";
import StatCard from "./StatCard";
import NextSlotStatCard from "./NextSlotStatCard";
import LeaderSlotsStatCard from "./LeaderSlotsStatCard";
import SkippedSlotsStatCard from "./SkippedSlotsStatCard";

export default function StatCards() {
  return (
    <>
      <NextSlotStatCard />
      <LeaderSlotsStatCard />
      <SkippedSlotsStatCard />
      <StatCard
        headerText="Skip Rate"
        primaryText="3%"
        primaryTextColor="#E13131"
      >
        <Flex>
          <Text style={{ color: "#3CFF73" }}>-1%&nbsp;</Text>
          <Text style={{ color: "#717171" }}>over 10D Avg</Text>
        </Flex>
      </StatCard>
      <StatCard
        headerText="Avg TXs per Slot"
        primaryText="7,520"
        primaryTextColor="#E13131"
      >
        <Flex>
          <Text style={{ color: "#3CFF73" }}>+3%&nbsp;</Text>
          <Text style={{ color: "#717171" }}>over 10D Avg</Text>
        </Flex>
      </StatCard>
    </>
  );
}
