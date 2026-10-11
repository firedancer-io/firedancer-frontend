import { Box, Flex, Text, Tooltip } from "@radix-ui/themes";
import { getEpochStake, getFmtStake, removePortFromIp } from "../../../utils";
import { useAtomValue } from "jotai";
import PeerIcon from "../../../components/PeerIcon";
import styles from "./cardValidatorSummary.module.css";
import type { Peer } from "../../../api/types";
import { epochStakesAtom, totalNetworkStakeAtom } from "../../../atoms";
import { formatNumber } from "../../../numUtils";
import clsx from "clsx";
import ArrowDropdown from "../../../components/ArrowDropdown";
import { useSlotInfo } from "../../../hooks/useSlotInfo";
import { useTimeAgo } from "../../../hooks/useTimeAgo";
import { usePeerInfo } from "../../../hooks/usePeerInfo";
import type { ClientName } from "../../../consts";
import { TimePopoverDropdown } from "../../../components/TimePopoverDropdown";
import { formatDateTime } from "./slotsUtils";
import SlotClient from "../../../components/SlotClient";

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
    <Flex direction="column" className={styles.summaryContainer} gap="2" mr="2">
      <Flex gap="1">
        <PeerIcon url={peer?.info?.icon_url} size={30} isYou={isLeader} />
        <Text className={clsx(styles.name, { [styles.you]: isLeader })}>
          {name}
        </Text>
      </Flex>

      <Text className={styles.primaryText}>{pubkey}</Text>

      <ValidatorInfoHorizontal
        slot={slot}
        pubkey={pubkey}
        peer={peer}
        showTime={showTime}
      />
    </Flex>
  );
}

export function CardValidatorSummaryTablet({
  slot,
  showTime,
}: CardValidatorSummaryProps) {
  const { pubkey, peer, isLeader, name } = useSlotInfo(slot);

  return (
    <Flex direction="column" gap="1">
      <Flex gap="1">
        <PeerIcon url={peer?.info?.icon_url} size={16} isYou={isLeader} />
        <Text className={clsx(styles.name, styles.mobile)}>{name}</Text>
        <Box flexGrow="1" />
        <Text className={styles.primaryText}>{pubkey}</Text>
      </Flex>

      <ValidatorInfoHorizontal
        slot={slot}
        pubkey={pubkey}
        peer={peer}
        showTime={showTime}
        full
      />
    </Flex>
  );
}

export function CardValidatorSummaryMobile({
  slot,
  showTime,
}: CardValidatorSummaryProps) {
  const { pubkey, peer, isLeader, name } = useSlotInfo(slot);

  return (
    <Flex gap="1">
      <PeerIcon url={peer?.info?.icon_url} size={16} isYou={isLeader} />
      <Text className={styles.primaryText}>{name}</Text>
      <ArrowDropdown align="start">
        <Flex p="1" direction="column" gap="2" className={styles.mobile}>
          <Text>{pubkey}</Text>
          <ValidatorInfoMobile
            slot={slot}
            pubkey={pubkey}
            peer={peer}
            showTime={showTime}
          />
        </Flex>
      </ArrowDropdown>
    </Flex>
  );
}

function useValidatorInfoData(pubkey?: string, peer?: Peer) {
  const epochStakes = useAtomValue(epochStakesAtom);
  const totalStake = useAtomValue(totalNetworkStakeAtom);
  const { client, version, countryCode, countryFlag, cityName } =
    usePeerInfo(peer);

  const stake = getEpochStake(epochStakes, pubkey);
  const stakePct =
    stake !== undefined && totalStake !== undefined && totalStake > 0n
      ? (Number(stake) / Number(totalStake)) * 100
      : undefined;
  const stakeMsg =
    stake !== undefined
      ? `${getFmtStake(stake)}${
          stakePct !== undefined
            ? ` • ${formatNumber(stakePct, {
                significantDigits: 4,
                trailingZeroes: false,
              })}%`
            : " • --"
        }`
      : "--";
  const ipWithoutPort = removePortFromIp(
    !peer?.removed ? (peer?.gossip?.sockets["tvu"] ?? "") : "",
  );

  return {
    client,
    version,
    countryCode,
    countryFlag,
    cityName,
    stakeText: stakeMsg,
    ipText:
      !peer?.removed && peer?.gossip != null
        ? ipWithoutPort || "--"
        : "Offline",
  };
}

interface ValidatorInfoProps {
  slot: number;
  pubkey?: string;
  peer?: Peer;
  showTime?: boolean;
}

interface ValidatorInfoHorizontalProps extends ValidatorInfoProps {
  /** Right-side columns right-align to fill the full card width */
  full?: boolean;
}

function ValidatorInfoHorizontal({
  slot,
  pubkey,
  peer,
  showTime,
  full,
}: ValidatorInfoHorizontalProps) {
  const data = useValidatorInfoData(pubkey, peer);

  const {
    client,
    version,
    countryCode,
    countryFlag,
    cityName,
    stakeText,
    ipText,
  } = data;

  return (
    <Flex
      gap="4"
      minWidth="0"
      justify="between"
      className={styles.secondaryText}
    >
      <Flex direction="column" minWidth="0">
        <Tooltip
          content={`${client ?? "Unknown"}${version != null ? ` v${version}` : ""}`}
        >
          <Flex gap="1">
            <Flex width="26px" align="center" flexShrink="0">
              <SlotClient slot={slot} size="medium" />
            </Flex>
            <ValidatorText client={client} version={version} />
          </Flex>
        </Tooltip>

        {cityName && countryCode && (
          <Tooltip content={`${cityName}, ${countryCode}`}>
            <Flex gap="1">
              <Flex width="26px" align="center" flexShrink="0">
                <Text>{countryFlag}</Text>
              </Flex>
              <LocationText cityName={cityName} countryCode={countryCode} />
            </Flex>
          </Tooltip>
        )}
      </Flex>

      <Flex gap="4">
        <Flex direction="column" width="180px" align={full ? "end" : "start"}>
          <Tooltip content="Current epoch identity stake and percentage of total network stake, including excluded stake.">
            <Text>{stakeText}</Text>
          </Tooltip>
          <Text>{ipText}</Text>
        </Flex>

        <Flex width="165px" justify={full ? "end" : "start"}>
          {showTime && (
            <TimeAgo slot={slot} align={full ? "right" : "left"} multiline />
          )}
        </Flex>
      </Flex>
    </Flex>
  );
}

function ValidatorInfoMobile({
  slot,
  pubkey,
  peer,
  showTime,
}: ValidatorInfoProps) {
  const data = useValidatorInfoData(pubkey, peer);

  const {
    client,
    version,
    countryCode,
    countryFlag,
    cityName,
    stakeText,
    ipText,
  } = data;

  return (
    <Flex gap="2" minWidth="0" justify="between" direction="column">
      <Flex gap="1">
        <SlotClient slot={slot} size="small" />
        <ValidatorText client={client} version={version} />
      </Flex>

      {cityName && countryCode && (
        <Flex gap="1">
          <Text>{countryFlag}</Text>
          <LocationText cityName={cityName} countryCode={countryCode} />
        </Flex>
      )}

      <Tooltip content="Current epoch identity stake and percentage of total network stake, including excluded stake.">
        <Text>{stakeText}</Text>
      </Tooltip>
      <Text>{ipText}</Text>

      {showTime && (
        <Box>
          <TimeAgo slot={slot} align="left" />
        </Box>
      )}
    </Flex>
  );
}

interface LocationTextProps {
  cityName: string;
  countryCode: string;
}

function LocationText({ cityName, countryCode }: LocationTextProps) {
  return (
    <Flex minWidth="0">
      <Text truncate>{cityName}</Text>
      <Text>&nbsp;{countryCode}</Text>
    </Flex>
  );
}

interface ValidatorTextProps {
  client?: ClientName;
  version?: string | null;
}

function ValidatorText({ client, version }: ValidatorTextProps) {
  const splitClient = (client ?? "Unknown").split(" ");
  const primaryClient = splitClient[0];
  const secondaryClient = splitClient[1];
  const primaryClassName = styles[primaryClient.toLowerCase()];

  const match = version?.match(/^(\d+\.\d+)(\..+)$/);
  const majorMinorVersion = match ? match[1] : (version ?? "");
  const remainingVersion = match ? match[2] : "";

  return (
    <Flex minWidth="0">
      <Text truncate>
        <Text className={primaryClassName}>{primaryClient}</Text>
        {secondaryClient && (
          <Text className={styles[secondaryClient.toLowerCase()]}>
            &nbsp;{secondaryClient}
          </Text>
        )}
        {version && <Text>&nbsp;</Text>}
      </Text>

      {version && (
        <Text className={clsx(styles.majorMinorVersionText, primaryClassName)}>
          v{majorMinorVersion}
        </Text>
      )}
      {remainingVersion && (
        <Text
          truncate
          className={clsx(styles.remainingVersionText, primaryClassName)}
        >
          {remainingVersion}
        </Text>
      )}
    </Flex>
  );
}

interface TimeAgoProps extends CardValidatorSummaryProps {
  align: "left" | "right";
  multiline?: boolean;
}

function TimeAgo({ slot, align, multiline = false }: TimeAgoProps) {
  const { slotTimestampNanos, slotDateTime, timeAgoText } = useTimeAgo(slot);

  if (slotTimestampNanos === undefined) return;

  const dateText = slotDateTime ? formatDateTime(slotDateTime) : "";
  const lines = timeAgoText
    ? multiline
      ? [dateText, timeAgoText]
      : [`${dateText} (${timeAgoText})`]
    : [dateText];

  return (
    <TimePopoverDropdown
      nanoTs={slotTimestampNanos}
      lines={lines}
      textClassName={clsx(styles.timeAgo, {
        [styles.rightAligned]: align === "right",
      })}
    />
  );
}
