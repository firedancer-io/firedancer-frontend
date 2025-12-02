import { Flex, Text } from "@radix-ui/themes";
import Card from "../../../components/Card";
import ComputeSection from "./ComputeSection";
import FeeSection from "./FeeSection";
import PerformanceSection from "./PerformanceSection";
import SlotDetailsHeader from "./SlotDetailsHeader";
import { sectionGapX } from "./consts";
import { useAtomValue } from "jotai";
import { useSlotQueryResponseDetailed } from "../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../../Overview/SlotPerformance/atoms";

export default function DetailedSlotStats() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const queryResponse = useSlotQueryResponseDetailed(selectedSlot).response;
  if (!queryResponse?.limits) return <DetailedSlotStatsPlaceholder />;

  return (
    <Card>
      <Flex gap="3" direction="column" flexBasis="0">
        <SlotDetailsHeader />
        <Flex gap={sectionGapX} wrap="wrap">
          <ComputeSection />
          <FeeSection />
          <PerformanceSection />
        </Flex>
      </Flex>
    </Card>
  );
}

function DetailedSlotStatsPlaceholder() {
  return (
    <Card
      style={{
        display: "flex",
        flexGrow: "1",
        height: "550px",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text>Loading Slot Statistics...</Text>
    </Card>
  );
}
