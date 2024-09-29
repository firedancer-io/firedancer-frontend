import { Flex, Box } from "@radix-ui/themes";
import styles from "./pastSlotCard.module.css";
import sharedStyles from "./slots.module.css";
import SlotCardGrid from "./SlotCardGrid";
import CardValidatorSummary from "./CardValidatorSummary";
import useSlotQuery from "../../../hooks/useSlotQuery";
import { identityKeyAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import { usePubKey } from "../../../hooks/usePubKey";

interface PastSlotCardProps {
  slot: number;
}

export function PastSlotCard({ slot }: PastSlotCardProps) {
  const myPubkey = useAtomValue(identityKeyAtom);
  const pubkey = usePubKey(slot);
  const isLeader = myPubkey === pubkey;

  const response = useSlotQuery(slot);
  const response1 = useSlotQuery(slot + 1);
  const response2 = useSlotQuery(slot + 3);
  const response3 = useSlotQuery(slot + 3);
  const skipped =
    response.slotResponse?.publish.skipped ||
    response1.slotResponse?.publish.skipped ||
    response2.slotResponse?.publish.skipped ||
    response3.slotResponse?.publish.skipped;

  return (
    <div
      className={`${styles.card} ${isLeader ? sharedStyles.mySlots : ""} ${skipped ? styles.skipped : ""}`}
    >
      <Flex gap="1" align="start">
        <CardValidatorSummary slot={slot} showTime />
        <Box flexGrow="1" />
        <SlotCardGrid slot={slot} />
      </Flex>
    </div>
  );
}
