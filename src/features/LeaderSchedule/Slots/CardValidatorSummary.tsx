import { Flex, Text } from "@radix-ui/themes";
import { usePubKey } from "../../../hooks/usePubKey";
import usePeer from "../../../hooks/usePeer";
import { DateTime } from "luxon";
import { useMemo } from "react";
import { getTimeTillText, slowDateTimeNow } from "../../../utils";
import { useAtomValue } from "jotai";
import PeerIcon from "../../../components/PeerIcon";
import { identityKeyAtom } from "../../../api/atoms";
import styles from "./cardValidatorSummary.module.css";
import useSlotQuery from "../../../hooks/useSlotQuery";
import { useHarmonicIntervalFn, useUpdate } from "react-use";

interface CardValidatorSummaryProps {
  slot: number;
  showTime?: boolean;
}

export default function CardValidatorSummary({
  slot,
  showTime,
}: CardValidatorSummaryProps) {
  const pubkey = usePubKey(slot);
  const myPubkey = useAtomValue(identityKeyAtom);
  const peer = usePeer(pubkey ?? "");

  const isLeader = myPubkey === pubkey;

  const name = peer?.info?.name ?? (isLeader ? "You" : "Private");

  return (
    <>
      <PeerIcon url={peer?.info?.icon_url} size={40} isYou={isLeader} />
      <Flex
        direction="column"
        gap="2"
        align="start"
        style={{ marginLeft: "6px" }}
      >
        <Text className={styles.name}>{name}</Text>
        <Text className={styles.pubkey}>{pubkey}</Text>
        <TimeAgo slot={slot} showTime={showTime} />
      </Flex>
    </>
  );
}

function TimeAgo({ slot, showTime }: CardValidatorSummaryProps) {
  const query = useSlotQuery(slot);
  const update = useUpdate();

  useHarmonicIntervalFn(update, 1_000);

  const slotDateTime = useMemo(() => {
    if (!query.slotResponse?.publish.completed_time_nanos) return;

    return DateTime.fromMillis(
      Math.trunc(query.slotResponse.publish.completed_time_nanos / 1_000_000)
    );
  }, [query.slotResponse]);

  const getDiffDuration = () => {
    if (!showTime || !slotDateTime) return;
    return slowDateTimeNow.diff(slotDateTime).rescale();
  };

  if (!showTime) return;

  const diffDuration = getDiffDuration();

  return (
    <Text className={styles.time}>
      {slotDateTime?.toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS)}
      {diffDuration && ` (${getTimeTillText(diffDuration)} ago)`}
    </Text>
  );
}
