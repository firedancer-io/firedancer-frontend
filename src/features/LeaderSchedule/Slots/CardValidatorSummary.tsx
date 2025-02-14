import { Box, Flex, Text, TextProps } from "@radix-ui/themes";
import { usePubKey } from "../../../hooks/usePubKey";
import usePeer from "../../../hooks/usePeer";
import { DateTime } from "luxon";
import { useMemo, useRef } from "react";
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
import { useHarmonicIntervalFn, useMedia, useUpdate } from "react-use";
import { Peer } from "../../../api/types";
import { peerStatsAtom } from "../../../atoms";
import { formatNumber } from "../../../numUtils";
import clsx from "clsx";
import ArrowDropdown from "../../../components/ArrowDropdown";

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
    <Flex gap="1">
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
    </Flex>
  );
}

export function CardValidatorSummaryMobile({
  slot,
  showTime,
}: CardValidatorSummaryProps) {
  const pubkey = usePubKey(slot);
  const myPubkey = useAtomValue(identityKeyAtom);
  const peer = usePeer(pubkey ?? "");

  const isLeader = myPubkey === pubkey;
  const isWideScreen = useMedia("(min-width: 700px)");

  let name = peer?.info?.name ?? (isLeader ? "You" : "");
  if (!name) {
    if (isWideScreen) {
      name = "Private";
    } else {
      name = pubkey ? `${pubkey.substring(0, 8)}...` : "Private";
    }
  }

  return (
    <Flex direction="column" className={styles.containerMobile} gap="1">
      <Flex gap="1">
        {isWideScreen ? (
          <>
            <PeerIcon url={peer?.info?.icon_url} size={16} isYou={isLeader} />
            <Text className={clsx(styles.name, styles.mobile)}>{name}</Text>
            <Box flexGrow="1" />
            <Text className={styles.primaryText}>{pubkey}</Text>
          </>
        ) : (
          <>
            <Text className={styles.text}>{slot}</Text>
            <Box flexGrow="1" />
            <PeerIcon url={peer?.info?.icon_url} size={16} isYou={isLeader} />
            <Text className={styles.text}>{name}</Text>
            <ArrowDropdown>
              <Flex gap="1" direction="column">
                <Text className={styles.secondaryText}>{pubkey}</Text>
                <ValidatorInfo peer={peer} />
                <TimeAgo slot={slot} showTime={showTime} />
              </Flex>
            </ArrowDropdown>
          </>
        )}
      </Flex>
      {isWideScreen && (
        <Flex gap="1">
          <ValidatorInfo peer={peer} />
          <Box flexGrow="1" />
          <TimeAgo slot={slot} showTime={showTime} />
        </Flex>
      )}
    </Flex>
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

  const ref = useRef<HTMLDivElement>(null);
  if (!message) return null;

  const isFd = validator?.startsWith("Frankendancer");
  const isAgave = validator && !isFd;

  const shouldWrap = (ref.current?.scrollWidth ?? 0) > 364;
  const textProps: TextProps = shouldWrap
    ? { style: { flexBasis: 0 } }
    : { wrap: "nowrap" };

  return (
    <Flex gap="1" className={styles.secondaryText} ref={ref}>
      <Text
        className={clsx({
          [styles.fdText]: isFd,
          [styles.agaveText]: isAgave,
        })}
        {...textProps}
      >
        {validator || "Unknown"}
      </Text>
      <Text className={styles.divider}>&bull;</Text>
      <Text {...textProps}>
        {getStakeMsg(peer, peerStats?.activeStake, peerStats?.delinquentStake)}
      </Text>
      <Text className={styles.divider}>&bull;</Text>
      <Text>{peer?.gossip?.sockets["tvu"]?.split(":")[0] || "Offline"}</Text>
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
