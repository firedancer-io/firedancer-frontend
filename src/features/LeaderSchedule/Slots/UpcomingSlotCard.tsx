import { Box, Flex, Text } from "@radix-ui/themes";
import { slotsPerLeader } from "../../../consts";
import styles from "./upcomingSlot.module.css";
import sharedStyles from "./slots.module.css";
import { useAtomValue } from "jotai";
import {
  currentLeaderSlotAtom,
  currentSlotAtom,
  slotDurationAtom,
} from "../../../atoms";
import { useReducer } from "react";
import { DateTime, Duration } from "luxon";
import { getDurationText, slowDateTimeNow } from "../../../utils";
import PeerIcon from "../../../components/PeerIcon";
import { useHarmonicIntervalFn, useMedia } from "react-use";
import clsx from "clsx";
import { useSlotInfo } from "../../../hooks/useSlotInfo";

interface UpcomingSlotCardProps {
  slot: number;
}

export default function UpcomingSlotCard({ slot }: UpcomingSlotCardProps) {
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);
  const { pubkey, peer, isLeader, name } = useSlotInfo(slot);

  const isOneAway =
    currentLeaderSlot !== undefined &&
    slot === currentLeaderSlot + slotsPerLeader;
  const isTwoAway =
    currentLeaderSlot !== undefined &&
    slot === currentLeaderSlot + slotsPerLeader * 2;

  const isWideScreen = useMedia("(min-width: 1200px)");

  return (
    <div
      className={clsx(styles.card, {
        [styles.oneAway]: isOneAway,
        [styles.twoAway]: isTwoAway,
        [sharedStyles.mySlots]: isLeader,
      })}
    >
      {isWideScreen ? (
        <UpcomingSlotBody
          iconUrl={peer?.info?.icon_url}
          isLeader={isLeader}
          name={name}
          pubkey={pubkey}
          slot={slot}
        />
      ) : (
        <MobileUpcomingSlotBody
          iconUrl={peer?.info?.icon_url}
          isLeader={isLeader}
          name={name}
          pubkey={pubkey}
          slot={slot}
        />
      )}
    </div>
  );
}

interface UpcomingSlotBodyProps {
  iconUrl?: string | null;
  isLeader: boolean;
  name: string;
  pubkey?: string;
  slot: number;
}

function UpcomingSlotBody({
  iconUrl,
  isLeader,
  name,
  pubkey,
  slot,
}: UpcomingSlotBodyProps) {
  return (
    <Flex gap="2">
      <Flex gap="2" minWidth="300px" align="center">
        <PeerIcon url={iconUrl} size={24} isYou={isLeader} />
        <Text className={styles.nameText}>{name}</Text>
      </Flex>
      <Text className={styles.pubkeyText}>{pubkey}</Text>
      <Flex flexGrow="1" justify="center">
        <Text>{slot}</Text>
      </Flex>
      <TimeTillText slot={slot} />
    </Flex>
  );
}

function MobileUpcomingSlotBody({
  iconUrl,
  isLeader,
  name,
  pubkey,
  slot,
}: UpcomingSlotBodyProps) {
  return (
    <Flex direction="column">
      <Flex gap="2" align="center">
        <PeerIcon url={iconUrl} size={16} isYou={isLeader} />
        <Text className={styles.nameText}>{name}</Text>
        <Box flexGrow="1" />
        <Text className={clsx(styles.pubkeyText, styles.narrowScreen)}>
          {pubkey}
        </Text>
      </Flex>
      <Flex justify="between">
        <Text>{slot}</Text>
        <TimeTillText slot={slot} isNarrowScreen />
      </Flex>
    </Flex>
  );
}

interface TimeTillTextProps {
  slot: number;
  isNarrowScreen?: boolean;
}

function TimeTillText({ slot, isNarrowScreen }: TimeTillTextProps) {
  const currentSlot = useAtomValue(currentSlotAtom);
  const slotDuration = useAtomValue(slotDurationAtom);

  const timeTill = currentSlot
    ? Duration.fromMillis(slotDuration * (slot - currentSlot)).rescale()
    : undefined;

  const [dtText, setDtText] = useReducer(dtTextReducer, getDtText(timeTill));

  const [timeTillText, setTimeTillText] = useReducer(
    timeTillTextReducer,
    getDurationText(timeTill),
  );

  useHarmonicIntervalFn(() => {
    setTimeTillText(timeTill);
    setDtText(timeTill);
  }, 1_000);

  return (
    <Text
      className={clsx(styles.timeTill, {
        [styles.narrowScreen]: isNarrowScreen,
      })}
    >
      {dtText} ({timeTillText})
    </Text>
  );
}

function dtTextReducer(_: string, timeTill: Duration | undefined) {
  return getDtText(timeTill);
}

function timeTillTextReducer(_: string, timeTill: Duration | undefined) {
  return getDurationText(timeTill);
}

function getDtText(timeTill?: Duration) {
  if (!timeTill) return "";

  const slotDt = slowDateTimeNow.plus(timeTill);
  return slotDt?.toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS);
}
