import { Flex } from "@radix-ui/themes";
import styles from "./currentSlotCard.module.css";
import sharedStyles from "./slots.module.css";
import SlotCardGrid from "./SlotCardGrid";
import { useAtomValue } from "jotai";
import CardValidatorSummary, {
  CardValidatorSummaryMobile,
} from "./CardValidatorSummary";
import { currentSlotAtom } from "../../../atoms";
import { useMedia } from "react-use";
import clsx from "clsx";
import { useSlotInfo } from "../../../hooks/useSlotInfo";

interface CurrentSlotCardProps {
  slot: number;
}

export default function CurrentSlotCard({ slot }: CurrentSlotCardProps) {
  const currentSlot = useAtomValue(currentSlotAtom);
  const { isLeader } = useSlotInfo(slot);
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
