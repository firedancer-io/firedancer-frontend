import { Flex, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import { useSlotQueryPublish } from "../../../../hooks/useSlotQuery";

export function SlotDurationStats() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const durationNanos =
    useSlotQueryPublish(selectedSlot).publish?.duration_nanos;

  return (
    <Flex direction="column">
      <Text style={{ color: "var(--gray-12)" }}>Slot Duration</Text>
      <Flex gap="2">
        <Text style={{ color: "var(--gray-10)" }}>Actual</Text>
        {durationNanos != null && (
          <Text style={{ color: "var(--gray-11)" }}>
            {`${(durationNanos / 1_000_000).toFixed(2)} ms`}
          </Text>
        )}
      </Flex>
    </Flex>
  );
}
