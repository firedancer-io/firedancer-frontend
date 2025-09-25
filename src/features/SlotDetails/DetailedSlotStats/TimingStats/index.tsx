import { Flex } from "@radix-ui/themes";
import { Section } from "../StatSection";
import Duration from "./Duration";
import TxnStageTimings from "./TxnStageTimings";
import TxnAvgDurations from "./TxnAvgDurations";

export default function TimingStats() {
  return (
    <Section title="Timing">
      <Flex direction="column" gap="3">
        <Duration />
        <TxnStageTimings />
        <TxnAvgDurations />
      </Flex>
    </Section>
  );
}
