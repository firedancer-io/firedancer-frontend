import { Flex } from "@radix-ui/themes";
import styles from "./pastSlotCard.module.css";
import sharedStyles from "./slots.module.css";
import SlotCardGrid from "./SlotCardGrid";
import CardValidatorSummary, {
  CardValidatorSummaryTablet,
  CardValidatorSummaryMobile,
} from "./CardValidatorSummary";
import { useMedia } from "react-use";
import clsx from "clsx";
import { useSlotQueryPublish } from "../../../hooks/useSlotQuery";
import { useSlotInfo } from "../../../hooks/useSlotInfo";
import { discountedLateVoteSlotsAtom } from "../../../atoms";
import { useAtomValue } from "jotai";
import { mediumScreenMedia, wideScreenMedia } from "./consts";

interface PastSlotCardProps {
  slot: number;
}

export function PastSlotCard({ slot }: PastSlotCardProps) {
  const { isLeader } = useSlotInfo(slot);
  const discountedLateVoteSlots = useAtomValue(discountedLateVoteSlotsAtom);

  const query = useSlotQueryPublish(slot);
  const query1 = useSlotQueryPublish(slot + 1);
  const query2 = useSlotQueryPublish(slot + 2);
  const query3 = useSlotQueryPublish(slot + 3);
  const isLateVote = [0, 1, 2, 3].some((offset) =>
    discountedLateVoteSlots.has(slot + offset),
  );

  const isSkipped =
    query.publish?.skipped ||
    query1.publish?.skipped ||
    query2.publish?.skipped ||
    query3.publish?.skipped;

  const isWide = useMedia(wideScreenMedia);
  const isMedium = useMedia(mediumScreenMedia);

  return (
    <div
      className={clsx(styles.card, {
        [sharedStyles.mySlots]: isLeader,
        [styles.lateVote]: isLateVote,
        [styles.skipped]: isSkipped,
      })}
    >
      {isWide ? (
        <Flex gap="1" align="start" justify="between">
          <CardValidatorSummary slot={slot} showTime />
          <SlotCardGrid slot={slot} />
        </Flex>
      ) : isMedium ? (
        <Flex direction="column" gap="1">
          <CardValidatorSummaryTablet slot={slot} showTime />
          <SlotCardGrid slot={slot} />
        </Flex>
      ) : (
        <Flex direction="column" gap="1">
          <CardValidatorSummaryMobile slot={slot} showTime />
          <SlotCardGrid slot={slot} />
        </Flex>
      )}
    </div>
  );
}
