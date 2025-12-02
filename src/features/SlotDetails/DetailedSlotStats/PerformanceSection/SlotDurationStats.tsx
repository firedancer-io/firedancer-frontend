import { Flex, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import { useSlotQueryPublish } from "../../../../hooks/useSlotQuery";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import styles from "../detailedSlotStats.module.css";
import { gridGapX } from "../consts";

export function SlotDurationStats() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const durationNanos =
    useSlotQueryPublish(selectedSlot).publish?.duration_nanos;

  return (
    <SlotDetailsSubSection title="Slot Duration">
      <Flex gap={gridGapX}>
        <Text className={styles.label}>Actual</Text>
        {durationNanos != null && (
          <Text className={styles.value}>
            {`${(durationNanos / 1_000_000).toFixed(2)}ms`}
          </Text>
        )}
      </Flex>
    </SlotDetailsSubSection>
  );
}
