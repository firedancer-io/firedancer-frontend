import { useAtomValue } from "jotai";
import { identityKeyAtom, uptimeAtom } from "../../api/atoms";
import { Text, Flex, Tooltip } from "@radix-ui/themes";
import styles from "./identityKey.module.css";
import usePeer from "../../hooks/usePeer";
import PeerIcon from "../../components/PeerIcon";
import { myStakePctAtom, myStakeAmountAtom } from "../../atoms";
import { PropsWithChildren, useEffect } from "react";
import { Duration } from "luxon";
import { getFmtStake, getTimeTillText, slowDateTimeNow } from "../../utils";
import { formatNumber } from "../../numUtils";
import { useInterval, useMedia, useUpdate } from "react-use";
import Dropdown from "../../components/Dropdown";
import clsx from "clsx";

export default function IdentityKey() {
  const identityKey = useAtomValue(identityKeyAtom);
  const peer = usePeer(identityKey);

  const isXXNarrowScreen = useMedia("(min-width: 500px)");
  const isXNarrowScreen = useMedia("(min-width: 750px)");
  const isNarrowScreen = useMedia("(min-width: 900px)");
  const isWideScreen = useMedia("(min-width: 1366px)");

  useEffect(() => {
    let title = "Firedancer";
    if (peer?.info?.name) {
      title += ` | ${peer.info.name}`;
    } else if (identityKey) {
      title += ` | ${identityKey}`;
    }

    document.title = title;
  }, [identityKey, peer]);

  const identityKeyLabel =
    isWideScreen || !identityKey
      ? identityKey
      : `${identityKey.substring(0, 8)}...`;

  return (
    <DropdownContainer showDropdown={!isNarrowScreen}>
      <div className={clsx(styles.container, styles.horizontal)}>
        {isXXNarrowScreen && (
          <PeerIcon url={peer?.info?.icon_url} size={24} isYou />
        )}
        <Label
          label="Validator Name"
          value={identityKeyLabel}
          tooltip="The validators identity public key"
        />
        {isXNarrowScreen && (
          <>
            <StakeValue />
            <StakePct />
          </>
        )}
        {isNarrowScreen && (
          <>
            <Uptime />
            <Commission />
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
    <Dropdown dropdownMenu={<DropdownMenu />} noPadding>
      {children}
    </Dropdown>
  );
}

function DropdownMenu() {
  const identityKey = useAtomValue(identityKeyAtom);
  const peer = usePeer(identityKey);

  return (
    <div className={styles.container}>
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
      <Uptime />
      <Commission />
    </div>
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
  const identityKey = useAtomValue(identityKeyAtom);
  const peer = usePeer(identityKey);

  const maxCommission = peer?.vote.reduce<{
    maxStake: number;
    commission?: number;
  }>(
    (acc, vote) => {
      if (vote.activated_stake > acc.maxStake) {
        return { maxStake: vote.activated_stake, commission: vote.commission };
      }
      return acc;
    },
    { maxStake: 0, commission: undefined },
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

function Uptime() {
  const uptime = useAtomValue(uptimeAtom);

  const getValue = () => {
    if (!uptime) return "-";

    const uptimeDuration = Duration.fromMillis(uptime.uptimeNanos / 1_000_000);
    const diffDuration = slowDateTimeNow.diff(uptime.ts);

    const text = getTimeTillText(uptimeDuration.plus(diffDuration).rescale(), {
      showSeconds: false,
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

  return (
    <Flex direction="column">
      <Text className={styles.label}>{label}</Text>
      <Tooltip content={tooltip}>
        <Text className={styles.value} style={{ color: color }}>
          {value}
        </Text>
      </Tooltip>
    </Flex>
  );
}
