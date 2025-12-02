import { Flex, Text } from "@radix-ui/themes";
import PeerIcon from "../../../components/PeerIcon";
import SlotClient from "../../../components/SlotClient";
import { useSlotInfo } from "../../../hooks/useSlotInfo";
import { selectedSlotAtom } from "../../Overview/SlotPerformance/atoms";
import { useAtomValue } from "jotai";
import {
  useSlotQueryPublish,
  useSlotQueryResponseDetailed,
} from "../../../hooks/useSlotQuery";
import { epochAtom } from "../../../atoms";
import { useMemo } from "react";
import { DateTime } from "luxon";

import styles from "./detailedSlotStats.module.css";

export default function SlotDetailsHeader() {
  const slot = useAtomValue(selectedSlotAtom);
  const { peer, isLeader, name, pubkey, countryCode, countryFlag } =
    useSlotInfo(slot ?? 0);
  const epoch = useAtomValue(epochAtom);
  const slotPublish = useSlotQueryPublish(slot).publish;
  const schedulerStats =
    useSlotQueryResponseDetailed(slot).response?.scheduler_stats;

  const slotTime = useMemo(() => {
    if (!slotPublish?.completed_time_nanos) return;
    const seconds = Number(slotPublish.completed_time_nanos / 1_000_000_000n);
    return DateTime.fromSeconds(seconds).toLocaleString({
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
  }, [slotPublish]);

  if (slot === undefined) return;

  return (
    <Flex gapX="4" gapY="2" wrap="wrap" justify="start" align="center">
      <Flex gap="5px" align="center">
        <PeerIcon url={peer?.info?.icon_url} size={16} isYou={isLeader} />
        <Text className={styles.name}>{name}</Text>
        <Text className={styles.pubkey}>{pubkey}</Text>
        <SlotClient slot={slot} size="large" />
      </Flex>
      {countryCode && (
        <HorizontalLabelValue
          label="Country"
          value={countryCode}
          icon={countryFlag}
        />
      )}
      <HorizontalLabelValue label="Slot Time" value={slotTime} />
      <HorizontalLabelValue
        label="Block Hash"
        value={schedulerStats?.block_hash}
      />
      <HorizontalLabelValue
        label="Votes"
        value={slotPublish?.success_vote_transaction_cnt?.toLocaleString()}
      />
      <HorizontalLabelValue
        label="Vote Failures"
        value={slotPublish?.failed_vote_transaction_cnt?.toLocaleString()}
      />
      <HorizontalLabelValue
        label="Non-votes"
        value={slotPublish?.failed_nonvote_transaction_cnt?.toLocaleString()}
      />
      <HorizontalLabelValue
        label="Non-vote Failures"
        value={slotPublish?.failed_nonvote_transaction_cnt?.toLocaleString()}
      />
      <HorizontalLabelValue label="Epoch" value={epoch?.epoch} />
    </Flex>
  );
}

interface HorizontalLabelValueProps {
  label: string;
  value?: string | number;
  icon?: string;
}

function HorizontalLabelValue({
  label,
  value,
  icon,
}: HorizontalLabelValueProps) {
  return (
    <Flex gap="1">
      <Text className={styles.label}>{label}</Text>
      <Text className={styles.value}>{value}</Text>
      {icon && <Text className={styles.value}>{icon}</Text>}
    </Flex>
  );
}
