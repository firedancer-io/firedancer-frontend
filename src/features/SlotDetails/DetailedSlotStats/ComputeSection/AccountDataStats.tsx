import { Flex } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useSlotQueryPublish } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import PctBarRow from "../PctBarRow";

export default function AccountDataStats() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const publish = useSlotQueryPublish(selectedSlot).publish;

  if (!publish) return;

  return (
    <Flex gap="2">
      <PctBarRow
        label="Total Account Data Bytes"
        value={732_000_000}
        total={999_999_999}
        valueColor={"#A35829"}
      />
    </Flex>
  );
}
