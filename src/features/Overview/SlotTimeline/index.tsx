import { useAtomValue } from "jotai";
import { Flex, Text } from "@radix-ui/themes";
import Card from "../../../components/Card";
import { headerGap } from "../../Gossip/consts";
import { showStartupProgressAtom } from "../../StartupProgress/atoms";
import SlotLanes from "./SlotLanes";

export default function SlotTimeline() {
  const isStartupRunning = useAtomValue(showStartupProgressAtom);
  if (isStartupRunning) return;

  return (
    <Card>
      <Flex direction="column" height="100%" gap={headerGap}>
        <Text
          style={{
            color: "var(--primary-text-color)",
            fontSize: "18px",
          }}
        >
          Slots
        </Text>
        <SlotLanes />
      </Flex>
    </Card>
  );
}
