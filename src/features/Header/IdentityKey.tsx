import { useAtomValue } from "jotai";
import { identityBalanceAtom, voteBalanceAtom } from "../../api/atoms";
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

export default function IdentityKey() {
  const { peer, identityKey } = useIdentityPeer();

  const isXXNarrowScreen = useMedia(`(min-width: ${identityIconOnlyWidth})`);
  const isXNarrowScreen = useMedia("(min-width: 620px)");
  const isNarrowScreen = useMedia("(min-width: 1100px)");

  useEffect(() => {
    let title = document.title;
    if (peer?.info?.name) {
      title += ` | ${peer.info.name}`;
    } else if (identityKey) {
      title += ` | ${identityKey}`;
    }

    document.title = title;
  }, [identityKey, peer]);

  return (
    <DropdownContainer showDropdown>
      <div
        className={clsx(styles.container, styles.horizontal, styles.pointer)}
      >
        <PeerIcon url={peer?.info?.icon_url} size={28} isYou />

        {isXXNarrowScreen && <ValidatorName shouldShrink />}
        {isXNarrowScreen && (
          <>
            <StakeValue showTooltip />
            <StakePct showTooltip />
          </>
        )}
        {isNarrowScreen && (
          <>
            <StartupTime />
            <Commission />
            <IdentityBalance showTooltip />
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
    <PopoverDropdown content={<DropdownMenu />}>{children}</PopoverDropdown>
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
      <StartupTime />
      <Commission />
      <IdentityBalance />
      <VotePubkey />
      <VoteBalance />
    </Flex>
  );
}

interface TooltipProps {
  showTooltip?: boolean;
}

function ValidatorName({ shouldShrink }: { shouldShrink?: boolean }) {
  const { identityKey } = useIdentityPeer();

  return (
    <Label
      label="Validator Name"
      copyValue={identityKey}
      shouldShrink={shouldShrink}
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
    <Label label="Commission">
      <ValueWithSuffix
        value={maxCommission?.commission?.toLocaleString()}
        suffix="%"
      />
    </Label>
  );
}

function StartupTime() {
  const uptimeDuration = useUptimeDuration(60_000);

  const values = uptimeDuration
    ? getDurationValues(uptimeDuration, {
        omitSeconds: true,
      })
    : undefined;

  return (
    <Label label="Uptime">
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
}
function Label({
  label,
  tooltip,
  shouldShrink = false,
  children,
  copyValue,
}: PropsWithChildren<LabelProps>) {
  if (!children) return null;

  return (
    <ConditionalTooltip content={tooltip}>
      <Flex
        direction="column"
        minWidth="0"
        flexShrink={shouldShrink ? "1" : "0"}
      >
        <Text className={styles.label}>{label}</Text>
        <CopyButton
          value={copyValue}
          color="white"
          size="10px"
          hideIconUntilHover
        >
          <div className={styles.value}>{children}</div>
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
