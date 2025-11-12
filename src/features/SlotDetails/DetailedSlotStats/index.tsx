import { Flex } from "@radix-ui/themes";
import Card from "../../../components/Card";
import ComputeSection from "./ComputeSection";
import FeeSection from "./FeeSection";
import PerformanceSection from "./PerformanceSection";
import SlotDetailsHeader from "./SlotDetailsHeader";

export default function DetailedSlotStats() {
  return (
    <Card>
      <Flex gap="3" direction="column" flexBasis="0">
        <SlotDetailsHeader />
        <Flex gap="5" wrap="wrap" justify="between">
          <ComputeSection />
          <FeeSection />
          <PerformanceSection />
        </Flex>
      </Flex>
    </Card>
  );
}
