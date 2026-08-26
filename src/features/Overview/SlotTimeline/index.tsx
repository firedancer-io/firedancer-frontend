import { useAtomValue } from "jotai";
import { Flex, Text } from "@radix-ui/themes";
import Card from "../../../components/Card";
import { headerGap } from "../../Gossip/consts";
import { isStartupPhaseAtom } from "../../StartupProgress/atoms";
import SlotLanes from "./SlotLanes";

export default function SlotTimeline() {
  // keys off the phase so the reveal lands in the same commit as the
  // flush that populates the bars (the showStartupProgress mirror is set
  // in an effect, one commit later)
  const isStartup = useAtomValue(isStartupPhaseAtom);

  return (
    // Stays in flow (hidden) during startup so the cards grid below
    // renders at its final position from the first paint
    <Card style={isStartup ? { visibility: "hidden" } : undefined}>
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
