import { Flex, Text } from "@radix-ui/themes";
import { slotsPerLeader } from "../../../consts";
import { usePubKey } from "../../../hooks/usePubKey";
import styles from "./upcomingSlot.module.css";
import sharedStyles from "./slots.module.css";
import { useAtomValue } from "jotai";
import { currentLeaderSlotAtom, slotDurationAtom } from "../../../atoms";
import usePeer from "../../../hooks/usePeer";
import { identityKeyAtom } from "../../../api/atoms";
import { useMemo } from "react";
import { DateTime, Duration } from "luxon";
import { getTimeTillText, slowDateTimeNow } from "../../../utils";
import PeerIcon from "../../../components/PeerIcon";

interface UpcomingSlotCardProps {
  slot: number;
}

export default function UpcomingSlotCard({ slot }: UpcomingSlotCardProps) {
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);
  const myPubkey = useAtomValue(identityKeyAtom);
  const pubkey = usePubKey(slot);
  const peer = usePeer(pubkey ?? "");
  const slotDuration = useAtomValue(slotDurationAtom);

  const isLeader = myPubkey === pubkey;
  const isOneAway =
    currentLeaderSlot !== undefined &&
    slot === currentLeaderSlot + slotsPerLeader;
  const isTwoAway =
    currentLeaderSlot !== undefined &&
    slot === currentLeaderSlot + slotsPerLeader * 2;

  const timeTill = useMemo(() => {
    if (!currentLeaderSlot) return;

    return Duration.fromMillis(
      slotDuration * (slot - currentLeaderSlot)
    ).rescale();
  }, [currentLeaderSlot, slot, slotDuration]);

  const slotTime = useMemo(() => {
    if (!timeTill) return;

    return slowDateTimeNow.plus(timeTill);
  }, [timeTill]);

  const name = peer?.info?.name ?? (isLeader ? "You" : "Private");

  return (
    <div
      className={`${styles.card} ${isOneAway ? styles.oneAway : ""} ${isTwoAway ? styles.twoAway : ""} ${isLeader ? sharedStyles.mySlots : ""}`}
    >
      <Flex gap="2">
        <Flex gap="1" minWidth="300px" align="center">
          <PeerIcon url={peer?.info?.icon_url} size={24} isYou={isLeader} />
          <Text className={styles.nameText}>{name}</Text>
        </Flex>
        <Text className={styles.pubkeyText}>{pubkey}</Text>
        <Flex flexGrow="1" justify="center">
          <Text className={styles.slot}>{slot}</Text>
        </Flex>
        <Text className={styles.timeTill}>
          {slotTime?.toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS)} (
          {getTimeTillText(timeTill)})
        </Text>
      </Flex>
    </div>
  );
}
