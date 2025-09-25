import { Flex, Text } from "@radix-ui/themes";
import Card from "../../../components/Card";
import PeerIcon from "../../../components/PeerIcon";
import SlotClient from "../../../components/SlotClient";
import { useSlotInfo } from "../../../hooks/useSlotInfo";
import { selectedSlotAtom } from "../../Overview/SlotPerformance/atoms";
import { useAtomValue } from "jotai";
import ComputeSection from "./ComputeSection";
import FeeSection from "./FeeSection";
import PerformanceSection from "./PerformanceSection";

export default function DetailedSlotStats() {
  return (
    <Card>
      <Flex gap="6" wrap="wrap" justify="between">
        <Flex gap="3" direction="column" flexBasis="0">
          <SlotHeader />
          <ComputeSection />
        </Flex>
        <FeeSection />
        <PerformanceSection />
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
