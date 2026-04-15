import { Flex } from "@radix-ui/themes";
import styles from "./currentSlotCard.module.css";
import sharedStyles from "./slots.module.css";
import SlotCardGrid from "./SlotCardGrid";
import { useAtomValue } from "jotai";
import CardValidatorSummary, {
  CardValidatorSummaryTablet,
  CardValidatorSummaryMobile,
} from "./CardValidatorSummary";
import { currentSlotAtom } from "../../../atoms";
import { useMedia } from "react-use";
import clsx from "clsx";
import { useSlotInfo } from "../../../hooks/useSlotInfo";
import { mediumScreenMedia, wideScreenMedia } from "./consts";

interface CurrentSlotCardProps {
  slot: number;
}

export default function CurrentSlotCard({ slot }: CurrentSlotCardProps) {
  const currentSlot = useAtomValue(currentSlotAtom);
  const { isLeader } = useSlotInfo(slot);
  const isWide = useMedia(wideScreenMedia);
  const isMedium = useMedia(mediumScreenMedia);

  return (
    <div
      className={clsx(styles.card, {
        [sharedStyles.mySlots]: isLeader,
      })}
    >
      {isWide ? (
        <Flex gap="1" align="start" justify="between">
          <CardValidatorSummary slot={slot} />
          <SlotCardGrid slot={slot} currentSlot={currentSlot} />
        </Flex>
      ) : isMedium ? (
        <Flex direction="column" gap="1">
          <CardValidatorSummaryTablet slot={slot} />
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
