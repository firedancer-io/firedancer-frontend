import { Flex } from "@radix-ui/themes";
import styles from "./pastSlotCard.module.css";
import sharedStyles from "./slots.module.css";
import SlotCardGrid from "./SlotCardGrid";
import CardValidatorSummary, {
  CardValidatorSummaryMobile,
} from "./CardValidatorSummary";
import useSlotQuery from "../../../hooks/useSlotQuery";
import { identityKeyAtom, startupProgressAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import { usePubKey } from "../../../hooks/usePubKey";
import { useMedia } from "react-use";
import clsx from "clsx";

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
  const isSkipped =
    response.slotResponse?.publish.skipped ||
    response1.slotResponse?.publish.skipped ||
    response2.slotResponse?.publish.skipped ||
    response3.slotResponse?.publish.skipped;

  const startupProgress = useAtomValue(startupProgressAtom);

  const isWideScreen = useMedia("(min-width: 900px)");

  return (
    <div
      className={clsx(styles.card, {
        [sharedStyles.mySlots]: isLeader,
        [styles.skipped]: isSkipped,
        [styles.snapshot]: slot < (startupProgress?.downloading_incremental_snapshot_slot ?? 0),
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
