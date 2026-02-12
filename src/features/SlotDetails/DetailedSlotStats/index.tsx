import { Flex, Text } from "@radix-ui/themes";
import Card from "../../../components/Card";
import ComputeSection from "./ComputeSection";
import FeeSection from "./FeeSection";
import PerformanceSection from "./PerformanceSection";
import { sectionGapX } from "./consts";
import { useAtomValue } from "jotai";
import { useSlotQueryResponseDetailed } from "../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../../Overview/SlotPerformance/atoms";
import SlotDetailsHeader from "./SlotDetailsHeader";

export default function DetailedSlotStats() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const queryResponse = useSlotQueryResponseDetailed(selectedSlot).response;
  if (!queryResponse?.limits) return <DetailedSlotStatsPlaceholder />;

  return (
    <>
      <SlotDetailsHeader />
      <Card>
        <Flex gap={sectionGapX} wrap="wrap" flexBasis="0">
          <ComputeSection />
          <FeeSection />
          <PerformanceSection />
        </Flex>
      </Card>
    </>
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
