import { useAtomValue } from "jotai";
import {
  identityBalanceAtom,
  startupTimeAtom,
  voteBalanceAtom,
} from "../../api/atoms";
import { Text, Flex, Tooltip } from "@radix-ui/themes";
import styles from "./identityKey.module.css";
import PeerIcon from "../../components/PeerIcon";
import { myStakePctAtom, myStakeAmountAtom } from "../../atoms";
import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { DateTime } from "luxon";
import { getFmtStake, getDurationText, slowDateTimeNow } from "../../utils";
import { formatNumber } from "../../numUtils";
import { useInterval, useMedia, useUpdate } from "react-use";
import clsx from "clsx";
import { useIdentityPeer } from "../../hooks/useIdentityPeer";
import PopoverDropdown from "../../components/PopoverDropdown";
import { maxZIndex } from "../../consts";

export default function IdentityKey() {
  const { peer, identityKey } = useIdentityPeer();

  const isXXNarrowScreen = useMedia("(min-width: 473px)");
  const isXNarrowScreen = useMedia("(min-width: 608px)");
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

        {isXXNarrowScreen && (
          <Label
            label="Validator Name"
            value={`${identityKey?.substring(0, 8)}...`}
            tooltip="The validators identity public key"
          />
        )}
        {isXNarrowScreen && (
          <>
            <StakeValue />
            <StakePct />
          </>
        )}
        {isNarrowScreen && (
          <>
            <StartupTime />
            <Commission />
            <IdentityBalance />
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
  const { peer, identityKey } = useIdentityPeer();

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
        <Label
          label="Validator Name"
          value={identityKey}
          tooltip="The validators identity public key"
        />
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

function VotePubkey() {
  const { peer } = useIdentityPeer();

  return (
    <Label
      label="Vote Pubkey"
      value={peer?.vote[0]?.vote_account}
      tooltip="The public key of vote account, encoded in base58"
    />
  );
}

function VoteBalance() {
  const voteBalance = useAtomValue(voteBalanceAtom);

  return (
    <>
      <Label
        label="Vote Balance"
        value={getFmtStake(voteBalance) ?? "-"}
        tooltip="Account balance of this validators vote account. The balance is on the highest slot of the currently active fork of the validator."
      />
    </>
  );
}

function IdentityBalance() {
  const identityBalance = useAtomValue(identityBalanceAtom);

  return (
    <Label
      label="Identity Balance"
      value={getFmtStake(identityBalance) ?? "-"}
      tooltip="Account balance of this validators identity account. The balance is on the highest slot of the currently active fork of the validator."
    />
  );
}

function StakePct() {
  const stakePct = useAtomValue(myStakePctAtom);
  let value = "-";

  if (stakePct !== undefined) {
    value = formatNumber(stakePct, {
      significantDigits: 4,
      trailingZeroes: false,
    });
    value += "%";
  }

  return (
    <Label
      label="Stake %"
      value={value}
      tooltip="What percentage of total stake is delegated to this validator"
    />
  );
}

function StakeValue() {
  const stake = useAtomValue(myStakeAmountAtom);

  return (
    <Label
      label="Stake Amount"
      value={getFmtStake(stake) ?? "-"}
      tooltip="Amount of total stake that is delegated to this validator"
    />
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
    <Label
      label="Commission"
      value={
        maxCommission?.commission !== undefined
          ? maxCommission.commission.toLocaleString() + "%"
          : "-"
      }
    />
  );
}

function StartupTime() {
  const startupTime = useAtomValue(startupTimeAtom);

  const getValue = () => {
    if (!startupTime) return "-";
    const uptimeDuration = slowDateTimeNow.diff(
      DateTime.fromMillis(
        Math.floor(Number(startupTime.startupTimeNanos) / 1_000_000),
      ),
    );

    const text = getDurationText(uptimeDuration.rescale(), {
      omitSeconds: true,
    });
    return text;
  };

  const update = useUpdate();
  useInterval(update, 60_000);

  return <Label label="Uptime" value={getValue()} />;
}

interface LabelProps {
  label: string;
  value?: string | null;
  color?: string;
  tooltip?: string;
}
function Label({ label, value, color, tooltip }: LabelProps) {
  if (!value) return null;
  const textValue = (
    <Text className={styles.value} style={{ color: color }}>
      {value}
    </Text>
  );

  return (
    <Flex direction="column">
      <Text className={styles.label}>{label}</Text>
      {tooltip ? <Tooltip content={tooltip}>{textValue}</Tooltip> : textValue}
    </Flex>
  );
}
