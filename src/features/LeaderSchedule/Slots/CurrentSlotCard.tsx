import { Flex, Box } from "@radix-ui/themes";
import styles from "./currentSlotCard.module.css";
import sharedStyles from "./slots.module.css";
import SlotCardGrid from "./SlotCardGrid";
import { useAtomValue } from "jotai";
import CardValidatorSummary from "./CardValidatorSummary";
import { currentSlotAtom } from "../../../atoms";
import { identityKeyAtom } from "../../../api/atoms";
import { usePubKey } from "../../../hooks/usePubKey";

interface CurrentSlotCardProps {
  slot: number;
}

export default function CurrentSlotCard({ slot }: CurrentSlotCardProps) {
  const currentSlot = useAtomValue(currentSlotAtom);
  const myPubkey = useAtomValue(identityKeyAtom);
  const pubkey = usePubKey(slot);
  const isLeader = myPubkey === pubkey;

  return (
    <div className={`${styles.card} ${isLeader ? sharedStyles.mySlots : ""}`}>
      <Flex gap="1" align="start">
        <CardValidatorSummary slot={slot} />
        <Box flexGrow="1" />
        <SlotCardGrid slot={slot} currentSlot={currentSlot} />
      </Flex>
    </div>
  );
}
