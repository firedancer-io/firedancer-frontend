import { Flex, Text } from "@radix-ui/themes";
import { slotsPerLeader } from "../../../consts";
import { usePubKey } from "../../../hooks/usePubKey";
import styles from "./upcomingSlot.module.css";
import sharedStyles from "./slots.module.css";
import { useAtomValue } from "jotai";
import {
  currentLeaderSlotAtom,
  currentSlotAtom,
  slotDurationAtom,
} from "../../../atoms";
import usePeer from "../../../hooks/usePeer";
import { identityKeyAtom } from "../../../api/atoms";
import { useReducer } from "react";
import { DateTime, Duration } from "luxon";
import { getTimeTillText, slowDateTimeNow } from "../../../utils";
import PeerIcon from "../../../components/PeerIcon";
import { useHarmonicIntervalFn } from "react-use";

interface UpcomingSlotCardProps {
  slot: number;
}

export default function UpcomingSlotCard({ slot }: UpcomingSlotCardProps) {
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);
  const myPubkey = useAtomValue(identityKeyAtom);
  const pubkey = usePubKey(slot);
  const peer = usePeer(pubkey ?? "");

  const isLeader = myPubkey === pubkey;
  const isOneAway =
    currentLeaderSlot !== undefined &&
    slot === currentLeaderSlot + slotsPerLeader;
  const isTwoAway =
    currentLeaderSlot !== undefined &&
    slot === currentLeaderSlot + slotsPerLeader * 2;

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
        <TimeTillText slot={slot} />
      </Flex>
    </div>
  );
}

interface TimeTillTextProps {
  slot: number;
}

function TimeTillText({ slot }: TimeTillTextProps) {
  const currentSlot = useAtomValue(currentSlotAtom);
  const slotDuration = useAtomValue(slotDurationAtom);

  const timeTill = currentSlot
    ? Duration.fromMillis(slotDuration * (slot - currentSlot)).rescale()
    : undefined;

  const [dtText, setDtText] = useReducer(dtTextReducer, getDtText(timeTill));

  const [timeTillText, setTimeTillText] = useReducer(
    timeTillTextReducer,
    getTimeTillText(timeTill)
  );

  useHarmonicIntervalFn(() => {
    setTimeTillText(timeTill);
    setDtText(timeTill);
  }, 1_000);

  return (
    <Text className={styles.timeTill}>
      {dtText} ({timeTillText})
    </Text>
  );
}

function dtTextReducer(_: string, timeTill: Duration | undefined) {
  return getDtText(timeTill);
}

function timeTillTextReducer(_: string, timeTill: Duration | undefined) {
  return getTimeTillText(timeTill);
}

function getDtText(timeTill?: Duration) {
  if (!timeTill) return "";

  const slotDt = slowDateTimeNow.plus(timeTill);
  return slotDt?.toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS);
}
