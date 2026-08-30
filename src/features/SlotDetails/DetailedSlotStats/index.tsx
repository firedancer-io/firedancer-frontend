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
  const { response: queryResponse, hasWaitedForData } =
    useSlotQueryResponseDetailed(selectedSlot);

  // Render once any detail field is present (each section hides its own missing
  // data); older slots may have e.g. the waterfall but not transactions.
  const hasAnyDetail =
    !!queryResponse &&
    (!!queryResponse.waterfall ||
      !!queryResponse.tile_timers ||
      !!queryResponse.tile_primary_metric ||
      !!queryResponse.scheduler_counts ||
      !!queryResponse.scheduler_stats ||
      !!queryResponse.transactions ||
      !!queryResponse.limits);

  if (!hasAnyDetail) {
    if (hasWaitedForData) return <DetailedSlotStatsUnavailable />;
    return <DetailedSlotStatsPlaceholder />;
  }

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

function DetailedSlotStatsUnavailable() {
  return (
    <>
      <SlotDetailsHeader />
      <Card
        style={{
          display: "flex",
          flexGrow: "1",
          height: "550px",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <Text color="gray">
          Detailed statistics are not available for this slot. This node only
          retains full per-slot detail for slots it recently produced as leader.
        </Text>
      </Card>
    </>
  );
}
