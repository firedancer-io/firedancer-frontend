import { Flex } from "@radix-ui/themes";
import styles from "./currentSlotCard.module.css";
import sharedStyles from "./slots.module.css";
import SlotCardGrid from "./SlotCardGrid";
import { useAtomValue } from "jotai";
import CardValidatorSummary, {
  CardValidatorSummaryMobile,
} from "./CardValidatorSummary";
import { currentSlotAtom } from "../../../atoms";
import { identityKeyAtom } from "../../../api/atoms";
import { usePubKey } from "../../../hooks/usePubKey";
import { useMedia } from "react-use";
import clsx from "clsx";

interface CurrentSlotCardProps {
  slot: number;
}

export default function CurrentSlotCard({ slot }: CurrentSlotCardProps) {
  const currentSlot = useAtomValue(currentSlotAtom);
  const myPubkey = useAtomValue(identityKeyAtom);
  const pubkey = usePubKey(slot);
  const isLeader = myPubkey === pubkey;

  const isWideScreen = useMedia("(min-width: 900px)");

  return (
    <div
      className={clsx(styles.card, {
        [sharedStyles.mySlots]: isLeader,
      })}
    >
      {isWideScreen ? (
        <Flex gap="1" align="start" justify="between">
          <CardValidatorSummary slot={slot} />
          <SlotCardGrid slot={slot} currentSlot={currentSlot} />
        </Flex>
      ) : (
        <Flex direction="column" gap="1">
          <CardValidatorSummaryMobile slot={slot} />
          <SlotCardGrid slot={slot} currentSlot={currentSlot} />
        </Flex>
      )}
    </div>
  );
}
