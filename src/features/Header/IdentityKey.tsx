import { useAtomValue } from "jotai";
import {
  identityBalanceAtom,
  voteBalanceAtom,
  voteCommissionAtom,
} from "../../api/atoms";
import { Text, Flex } from "@radix-ui/themes";
import styles from "./identityKey.module.css";
import PeerIcon from "../../components/PeerIcon";
import { myStakePctAtom, myStakeAmountAtom } from "../../atoms";
import type { PropsWithChildren } from "react";
import { Fragment, useEffect } from "react";
import { getSolString, getDurationValues } from "../../utils";
import { formatNumber } from "../../numUtils";
import { useMedia } from "react-use";
import clsx from "clsx";
import { useIdentityPeer } from "../../hooks/useIdentityPeer";
import PopoverDropdown from "../../components/PopoverDropdown";
import { identityIconOnlyWidth, maxZIndex } from "../../consts";
import { useUptimeDuration } from "../../hooks/useUptime";
import CopyButton from "../../components/CopyButton";
import ConditionalTooltip from "../../components/ConditionalTooltip";
import { client, isFiredancer } from "../../client";

// Reserves the identity-key column before summary.identity_key arrives:
// base58 alphabet, same 44-glyph length as the key (within ~3px)
const identityKeyPlaceholder = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijk";

export default function IdentityKey() {
  const { peer, identityKey } = useIdentityPeer();

  const isXXNarrowScreen = useMedia(`(min-width: ${identityIconOnlyWidth})`);
  const isXNarrowScreen = useMedia("(min-width: 798px)");
  const isNarrowScreen = useMedia("(min-width: 914px)");

  useEffect(() => {
    const suffix = peer?.info?.name ?? identityKey;
    document.title = suffix ? `${client} | ${suffix}` : client;
  }, [identityKey, peer]);

  return (
    <DropdownContainer showDropdown>
      <div className={clsx(styles.container, styles.horizontal)}>
        <PeerIcon url={peer?.info?.icon_url} size={28} isYou />

        {isXXNarrowScreen && <ValidatorName shouldShrink reserve />}
        {isXNarrowScreen && (
          <>
            <StakeValue showTooltip />
            <StakePct showTooltip />
          </>
        )}
        {isNarrowScreen && (
          <>
            <Commission />
            <IdentityBalance showTooltip />
            <StartupTime reserve />
          </>
        )}
      </div>
    </DropdownContainer>
  );
}

interface DropdownContainerProps {
  showDropdown: boolean;
}

function DropdownContainer({
  showDropdown,
  children,
}: PropsWithChildren<DropdownContainerProps>) {
  if (!showDropdown) {
    return children;
  }

  return (
    <PopoverDropdown content={<DropdownMenu />} align="end">
      {children}
    </PopoverDropdown>
  );
}

function DropdownMenu() {
  const { peer } = useIdentityPeer();

  return (
    <Flex
      direction="column"
      wrap="wrap"
      gap="2"
      className={clsx(styles.container, styles.dropdownMenu)}
      style={{ zIndex: maxZIndex }}
    >
      <Flex gap="2">
        <PeerIcon url={peer?.info?.icon_url} size={24} isYou />
        <ValidatorName />
      </Flex>
      <StakeValue />
      <StakePct />
      <Commission />
      <IdentityBalance />
      <VotePubkey />
      <VoteBalance />
      <StartupTime />
    </Flex>
  );
}

interface TooltipProps {
  showTooltip?: boolean;
}

function ValidatorName({
  shouldShrink,
  reserve,
}: {
  shouldShrink?: boolean;
  reserve?: boolean;
}) {
  const { identityKey } = useIdentityPeer();

  return (
    <Label
      label="Validator Name"
      copyValue={identityKey}
      shouldShrink={shouldShrink}
      placeholder={reserve ? identityKeyPlaceholder : undefined}
    >
      {identityKey}
    </Label>
  );
}

function VotePubkey() {
  const { peer } = useIdentityPeer();

  return <Label label="Vote Pubkey">{peer?.vote[0]?.vote_account}</Label>;
}

function VoteBalance() {
  const voteBalance = useAtomValue(voteBalanceAtom);
  const solString = getSolString(voteBalance);

  return (
    <Label label="Vote Balance">
      <ValueWithSuffix value={solString} suffix="SOL" />
    </Label>
  );
}

function IdentityBalance({ showTooltip }: TooltipProps) {
  const identityBalance = useAtomValue(identityBalanceAtom);
  const solString = getSolString(identityBalance);

  return (
    <Label
      label="Identity Balance"
      tooltip={
        showTooltip
          ? "Account balance of this validators identity account. The balance is on the highest slot of the currently active fork of the validator."
          : undefined
      }
    >
      <ValueWithSuffix value={solString} suffix="SOL" />
    </Label>
  );
}

function StakePct({ showTooltip }: TooltipProps) {
  const stakePct = useAtomValue(myStakePctAtom);

  const value =
    stakePct === undefined
      ? undefined
      : formatNumber(stakePct, {
          significantDigits: 4,
          trailingZeroes: false,
        });

  return (
    <Label
      label="Stake %"
      tooltip={
        showTooltip
          ? "What percentage of total stake is delegated to this validator"
          : undefined
      }
    >
      <ValueWithSuffix value={value} suffix="%" />
    </Label>
  );
}

function StakeValue({ showTooltip }: TooltipProps) {
  const stake = useAtomValue(myStakeAmountAtom);
  const solString = getSolString(stake);

  return (
    <Label
      label="Stake Amount"
      tooltip={
        showTooltip
          ? "Amount of total stake that is delegated to this validator"
          : undefined
      }
    >
      <ValueWithSuffix value={solString} suffix="SOL" />
    </Label>
  );
}

function Commission() {
  return (
    <Label label="Commission">
      {isFiredancer ? (
        <FiredancerCommissionValue />
      ) : (
        <FrankendancerCommissionValue />
      )}
    </Label>
  );
}

function FrankendancerCommissionValue() {
  const { peer } = useIdentityPeer();

  const maxCommission = peer?.vote.reduce<{
    maxStake: bigint;
    commission?: number;
  }>(
    (acc, vote) => {
      if (vote.activated_stake > acc.maxStake) {
        return { maxStake: vote.activated_stake, commission: vote.commission };
      }
      return acc;
    },
    { maxStake: 0n, commission: undefined },
  );
  return (
    <ValueWithSuffix
      value={maxCommission?.commission?.toLocaleString()}
      suffix="%"
    />
  );
}

function FiredancerCommissionValue() {
  const voteCommissionBps = useAtomValue(voteCommissionAtom);

  const value =
    voteCommissionBps == null
      ? undefined
      : formatNumber(voteCommissionBps / 100, {
          decimals: 2,
          trailingZeroes: false,
        });

  return <ValueWithSuffix value={value} suffix="%" />;
}

function StartupTime({ reserve }: { reserve?: boolean }) {
  const uptimeDuration = useUptimeDuration(60_000);

  const values = uptimeDuration
    ? getDurationValues(uptimeDuration, {
        omitSeconds: true,
      })
    : undefined;

  return (
    <Label label="Uptime" placeholder={reserve ? "0m" : undefined}>
      {values?.map(([value, suffix], i) => {
        return (
          <Fragment key={`${value}${suffix}`}>
            {i !== 0 && "\xa0"}
            <ValueWithSuffix value={value} suffix={suffix} excludeSpace />
          </Fragment>
        );
      })}
    </Label>
  );
}

interface LabelProps {
  label: string;
  tooltip?: string;
  shouldShrink?: boolean;
  copyValue?: string;
  /** Reserve the filled column's size invisibly while children are empty */
  placeholder?: string;
}
function Label({
  label,
  tooltip,
  shouldShrink = false,
  children,
  copyValue,
  placeholder,
}: PropsWithChildren<LabelProps>) {
  if (!children && placeholder === undefined) return null;
  const reserved = !children;

  return (
    <ConditionalTooltip content={tooltip}>
      <Flex
        direction="column"
        minWidth="0"
        flexShrink={shouldShrink ? "1" : "0"}
        style={reserved ? { visibility: "hidden" } : undefined}
      >
        <Text truncate className={styles.label}>
          {label}
        </Text>
        <CopyButton
          value={reserved ? undefined : copyValue}
          color="white"
          size="10px"
          hideIconUntilHover
        >
          <Text truncate className={styles.value}>
            {reserved ? placeholder : children}
          </Text>
        </CopyButton>
      </Flex>
    </ConditionalTooltip>
  );
}

function ValueWithSuffix({
  value,
  suffix,
  valueColor,
  excludeSpace,
}: {
  value?: string | number;
  suffix: string;
  valueColor?: string;
  excludeSpace?: boolean;
}) {
  return (
    <>
      <span style={{ color: valueColor }}>
        {value}
        {!excludeSpace && "\xa0"}
      </span>
      <span className={styles.valueSuffix}>{suffix}</span>
    </>
  );
}
