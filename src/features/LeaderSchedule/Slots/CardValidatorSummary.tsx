import type { TextProps } from "@radix-ui/themes";
import { Box, Flex, Text } from "@radix-ui/themes";
import { DateTime } from "luxon";
import { useMemo } from "react";
import {
  getStake,
  getFmtStake,
  isDefined,
  removePortFromIp,
  isAgave,
} from "../../../utils";
import { useAtomValue } from "jotai";
import PeerIcon from "../../../components/PeerIcon";
import styles from "./cardValidatorSummary.module.css";
import { useMedia } from "react-use";
import type { Peer } from "../../../api/types";
import { peerStatsAtom } from "../../../atoms";
import { formatNumber } from "../../../numUtils";
import clsx from "clsx";
import ArrowDropdown from "../../../components/ArrowDropdown";
import { useSlotInfo } from "../../../hooks/useSlotInfo";
import { useTimeAgo } from "../../../hooks/useTimeAgo";
import { usePeerInfo } from "../../../hooks/usePeerInfo";
import type { ClientName } from "../../../consts";
import LinkedSlotText from "./SlotText";
import { TimePopoverDropdown } from "../../../components/TimePopoverDropdown";

interface CardValidatorSummaryProps {
  slot: number;
  showTime?: boolean;
}

export default function CardValidatorSummary({
  slot,
  showTime,
}: CardValidatorSummaryProps) {
  const { pubkey, peer, isLeader, name } = useSlotInfo(slot);

  return (
    <Flex gap="1" className={styles.summaryContainer}>
      <PeerIcon url={peer?.info?.icon_url} size={40} isYou={isLeader} />
      <Flex
        direction="column"
        gap="1"
        align="start"
        minWidth="0"
        style={{ marginLeft: "6px" }}
      >
        <Text className={styles.name}>{name}</Text>
        <Text className={styles.primaryText}>{pubkey}</Text>
        <ValidatorInfo peer={peer} />
        {showTime && <TimeAgo slot={slot} />}
      </Flex>
    </Flex>
  );
}

export function CardValidatorSummaryMobile({
  slot,
  showTime,
}: CardValidatorSummaryProps) {
  const { pubkey, peer, isLeader, name: slotName } = useSlotInfo(slot);
  const isWideScreen = useMedia("(min-width: 700px)");
  const name = useMemo(() => {
    if (slotName !== "Private" || isWideScreen) return slotName;
    return pubkey ? `${pubkey.substring(0, 8)}...` : "Private";
  }, [slotName, isWideScreen, pubkey]);

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
            <LinkedSlotText
              className={styles.text}
              slot={slot}
              isLeader={isLeader}
            />
            <Box flexGrow="1" />
            <PeerIcon url={peer?.info?.icon_url} size={16} isYou={isLeader} />
            <Text className={styles.text}>{name}</Text>
            <ArrowDropdown>
              <Flex gap="1" direction="column">
                <Text className={styles.secondaryText}>{pubkey}</Text>
                <ValidatorInfo peer={peer} />
                {showTime && <TimeAgo slot={slot} />}
              </Flex>
            </ArrowDropdown>
          </>
        )}
      </Flex>
      {isWideScreen && (
        <Flex gap="1">
          <ValidatorInfo peer={peer} />
          <Box flexGrow="1" />
          {showTime && <TimeAgo slot={slot} />}
        </Flex>
      )}
    </Flex>
  );
}

function getStakeMsg(
  peer?: Peer,
  activeStake?: bigint,
  delinquentStake?: bigint,
) {
  if (!peer) return;

  const stake = getStake(peer);
  const pct =
    activeStake !== undefined || delinquentStake !== undefined
      ? (Number(stake) /
          Number((activeStake ?? 0n) + (delinquentStake ?? 0n))) *
        100
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

  const { client, version, countryCode, countryFlag, cityName } =
    usePeerInfo(peer);
  const stakeMsg = getStakeMsg(
    peer,
    peerStats?.activeStake,
    peerStats?.delinquentStake,
  );
  const ipWithoutPort = removePortFromIp(peer?.gossip?.sockets["tvu"] ?? "");

  const message = [client, stakeMsg, ipWithoutPort]
    .filter(isDefined)
    .join(" - ");

  if (!message) return null;

  const versionText = version == null ? "" : ` v${version}`;
  const validatorText = client
    ? `${client}${versionText}`
    : `Unknown${versionText}`;

  const cityText = cityName && countryCode ? `${cityName}, ${countryCode}` : "";
  const stakeText = stakeMsg ?? "";
  const ipText = ipWithoutPort || "Offline";
  // represent country flag as 2 chars because it is composed of multiple chars
  // but renders as ~2 chars worth of space
  const textLength = (
    validatorText +
    cityText +
    (countryFlag ? 2 : 0) +
    stakeText +
    ipText
  ).length;
  const shouldWrap = textLength > 58;
  const textProps: TextProps = shouldWrap
    ? { style: { flexBasis: 0 } }
    : { wrap: "nowrap" };

  return (
    <Flex gap="1" className={styles.secondaryText}>
      <ValidatorText {...textProps} client={client} versionText={versionText} />

      {cityText && (
        <>
          <Text className={styles.divider}>&bull;</Text>
          <Text>{cityText}</Text>
          <Text>{countryFlag}</Text>
        </>
      )}

      <Text className={styles.divider}>&bull;</Text>
      <Text {...textProps}>{stakeText}</Text>
      <Text className={styles.divider}>&bull;</Text>
      <Text>{ipText}</Text>
    </Flex>
  );
}

function ValidatorText({
  client,
  versionText,
  ...textProps
}: {
  client?: ClientName;
  versionText: string;
  textProps?: TextProps;
}) {
  if (!client)
    return (
      <Text {...textProps}>
        <Text>Unknown</Text>
        {versionText && <Text>{versionText}</Text>}
      </Text>
    );

  if (isAgave(client)) {
    const secondaryClient = client.split(" ")?.[1];
    if (secondaryClient) {
      return (
        <Text {...textProps}>
          <Text wrap="nowrap">
            <Text className={styles.agave}>Agave </Text>
            <Text className={styles[secondaryClient.toLowerCase()]}>
              {secondaryClient}
            </Text>
          </Text>
          {versionText && <Text className={styles.agave}>{versionText}</Text>}
        </Text>
      );
    }
  }

  return (
    <Text {...textProps} className={styles[client.toLowerCase()]}>
      <Text wrap="nowrap">{client}</Text>
      {versionText && <Text>{versionText}</Text>}
    </Text>
  );
}

function TimeAgo({ slot }: CardValidatorSummaryProps) {
  const { slotTimestampNanos, slotDateTime, timeAgoText } = useTimeAgo(slot);

  if (slotTimestampNanos === undefined) return;

  return (
    <TimePopoverDropdown nanoTs={slotTimestampNanos}>
      <Text className={styles.secondaryText}>
        {slotDateTime?.toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS)}
        {timeAgoText && ` (${timeAgoText})`}
      </Text>
    </TimePopoverDropdown>
  );
}
