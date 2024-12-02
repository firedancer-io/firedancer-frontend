import { Flex, Text } from "@radix-ui/themes";
import { usePubKey } from "../../../hooks/usePubKey";
import usePeer from "../../../hooks/usePeer";
import { DateTime } from "luxon";
import { useMemo } from "react";
import {
  getStake,
  getFmtStake,
  getTimeTillText,
  isDefined,
  slowDateTimeNow,
} from "../../../utils";
import { useAtomValue } from "jotai";
import PeerIcon from "../../../components/PeerIcon";
import { identityKeyAtom } from "../../../api/atoms";
import styles from "./cardValidatorSummary.module.css";
import useSlotQuery from "../../../hooks/useSlotQuery";
import { useHarmonicIntervalFn, useUpdate } from "react-use";
import { Peer } from "../../../api/types";
import { peerStatsAtom } from "../../../atoms";
import { formatNumber } from "../../../numUtils";
import clsx from "clsx";

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
        gap="1"
        align="start"
        style={{ marginLeft: "6px" }}
      >
        <Text className={styles.name}>{name}</Text>
        <Text className={styles.primaryText}>{pubkey}</Text>
        <ValidatorInfo peer={peer} />
        <TimeAgo slot={slot} showTime={showTime} />
      </Flex>
    </>
  );
}

function getStakeMsg(
  peer?: Peer,
  activeStake?: number,
  delinquentStake?: number
) {
  if (!peer) return;

  const stake = getStake(peer);
  const pct =
    activeStake !== undefined || delinquentStake !== undefined
      ? (stake / ((activeStake ?? 0) + (delinquentStake ?? 0))) * 100
      : undefined;

  return `${getFmtStake(stake)} ${
    pct !== undefined
      ? `(${formatNumber(pct, {
          significantDigits: 4,
          trailingZeroes: false,
        })}%)`
      : ""
  }`;
}

interface ValidatorInfoProps {
  peer?: Peer;
}

function ValidatorInfo({ peer }: ValidatorInfoProps) {
  const peerStats = useAtomValue(peerStatsAtom);

  const validator = peer?.gossip?.version
    ? `${peer.gossip.version[0] === "0" ? "Frankendancer" : "Agave"} v${peer.gossip.version}`
    : undefined;

  const message = [
    peer?.gossip?.version
      ? `${peer.gossip.version[0] === "0" ? "Frankendancer" : "Agave"} v${peer.gossip.version}`
      : undefined,
    getStakeMsg(peer, peerStats?.activeStake, peerStats?.delinquentStake),
    peer?.gossip?.sockets["tvu"]?.split(":")[0],
  ]
    .filter(isDefined)
    .join(" - ");

  if (!message) return null;

  const isFd = validator?.startsWith("Frankendancer");

  return (
    <Flex gap="1" className={styles.secondaryText}>
      <Text
        className={clsx({
          [styles.fdText]: isFd,
          [styles.agaveText]: !isFd,
        })}
      >
        {validator}
      </Text>
      <Text className={styles.divider}>&bull;</Text>
      <Text>
        {getStakeMsg(peer, peerStats?.activeStake, peerStats?.delinquentStake)}
      </Text>
      <Text className={styles.divider}>&bull;</Text>
      <Text>{peer?.gossip?.sockets["tvu"]?.split(":")[0]}</Text>
    </Flex>
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
    <Text className={styles.secondaryText}>
      {slotDateTime?.toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS)}
      {diffDuration && ` (${getTimeTillText(diffDuration)} ago)`}
    </Text>
  );
}
