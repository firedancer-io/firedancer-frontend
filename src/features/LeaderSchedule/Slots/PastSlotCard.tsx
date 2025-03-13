import { Flex } from "@radix-ui/themes";
import styles from "./pastSlotCard.module.css";
import sharedStyles from "./slots.module.css";
import SlotCardGrid from "./SlotCardGrid";
import CardValidatorSummary, {
  CardValidatorSummaryMobile,
} from "./CardValidatorSummary";
import { identityKeyAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import { usePubKey } from "../../../hooks/usePubKey";
import { useMedia } from "react-use";
import clsx from "clsx";
import { useSlotQueryPublish } from "../../../hooks/useSlotQuery";

interface PastSlotCardProps {
  slot: number;
}

export function PastSlotCard({ slot }: PastSlotCardProps) {
  const myPubkey = useAtomValue(identityKeyAtom);
  const pubkey = usePubKey(slot);
  const isLeader = myPubkey === pubkey;

  const query = useSlotQueryPublish(slot);
  const query1 = useSlotQueryPublish(slot + 1);
  const query2 = useSlotQueryPublish(slot + 2);
  const query3 = useSlotQueryPublish(slot + 3);
  const isSkipped =
    query.publish?.skipped ||
    query1.publish?.skipped ||
    query2.publish?.skipped ||
    query3.publish?.skipped;

  const isWideScreen = useMedia("(min-width: 900px)");

  return (
    <div
      className={clsx(styles.card, {
        [sharedStyles.mySlots]: isLeader,
        [styles.skipped]: isSkipped,
      })}
    >
      {isWideScreen ? (
        <Flex gap="1" align="start" justify="between">
          <CardValidatorSummary slot={slot} showTime />
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
