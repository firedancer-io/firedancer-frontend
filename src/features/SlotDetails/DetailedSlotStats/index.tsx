import { Flex, Text } from "@radix-ui/themes";
import CuIncomeChart from "../CuIncomeChart";
import Card from "../../../components/Card";
import PeerIcon from "../../../components/PeerIcon";
import SlotClient from "../../../components/SlotClient";
import { useSlotInfo } from "../../../hooks/useSlotInfo";
import { selectedSlotAtom } from "../../Overview/SlotPerformance/atoms";
import { useAtomValue } from "jotai";
import CuStats from "./CuStats";
import EarningsStats from "./EarningsStats";
import TimingStats from "./TimingStats";

export default function DetailedSlotStats() {
  return (
    <Card>
      <Flex gap="6" wrap="wrap" justify="between">
        <Flex gap="3" direction="column" flexGrow="1" flexBasis="0">
          <SlotHeader />
          <CuStats />
          <EarningsStats />
        </Flex>
        <Flex direction="column" flexGrow="1" flexBasis="0">
          <TimingStats />
        </Flex>
        <Flex direction="column" flexGrow="1" >
          <CuIncomeChart />
        </Flex>
      </Flex>
    </Card>
  );
}

function SlotHeader() {
  const slot = useAtomValue(selectedSlotAtom);
  const { peer, isLeader, name } = useSlotInfo(slot ?? 0);

  if (slot === undefined) return;

  return (
    <Flex gap="3" wrap="wrap" align="center" justify="start">
      <PeerIcon url={peer?.info?.icon_url} size={22} isYou={isLeader} />
      <Text
        style={{
          fontSize: "18px",
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </Text>
      <Flex gap="1">
        <SlotClient slot={slot} size="large" />
      </Flex>
    </Flex>
  );
}
