import { Flex, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import { useSlotQueryPublish } from "../../../../hooks/useSlotQuery";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import {
  slotDetailsStatsPrimary,
  slotDetailsStatsSecondary,
} from "../../../../colors";

export function SlotDurationStats() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const durationNanos =
    useSlotQueryPublish(selectedSlot).publish?.duration_nanos;

  return (
    <SlotDetailsSubSection title="Slot Duration">
      <Flex gap="2">
        <Text style={{ color: slotDetailsStatsSecondary }}>Actual</Text>
        {durationNanos != null && (
          <Text style={{ color: slotDetailsStatsPrimary }}>
            {`${(durationNanos / 1_000_000).toFixed(2)} ms`}
          </Text>
        )}
      </Flex>
    </SlotDetailsSubSection>
  );
}
