import { useAtomValue } from "jotai";
import { identityKeyAtom, uptimeAtom } from "../../api/atoms";
import { Text, Flex, Tooltip } from "@radix-ui/themes";
import styles from "./identityKey.module.css";
import usePeer from "../../hooks/usePeer";
import PeerIcon from "../../components/PeerIcon";
import { myStakePctAtom, myStakeAmountAtom } from "../../atoms";
import { useEffect } from "react";
import { Duration } from "luxon";
import { getTimeTillText, slowDateTimeNow } from "../../utils";
import { formatNumber } from "../../numUtils";
import { useInterval, useUpdate, useWindowSize } from "react-use";
import { lamportsPerSol } from "../../consts";

export default function IdentityKey() {
  const identityKey = useAtomValue(identityKeyAtom);
  const peer = usePeer(identityKey);

  const { width } = useWindowSize();
  const isXSmallScreen = width < 750;
  const isSmallScreen = width < 900;
  const isMediumScreen = width < 1366;

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
    isMediumScreen && identityKey
      ? `${identityKey.substring(0, 9)}...`
      : identityKey;

  return (
    <div className={styles.container}>
      <PeerIcon url={peer?.info?.icon_url} size={24} isYou />
      <Label
        label="Validator Name"
        value={identityKeyLabel}
        tooltip="The validators identity public key"
      />
      {!isXSmallScreen && (
        <>
          <StakeValue />
          <StakePct />
        </>
      )}
      {!isSmallScreen && (
        <>
          <Uptime />
          <Commission />
        </>
      )}
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
  const stakeValue = useAtomValue(myStakeAmountAtom);

  let value = "-";

  if (stakeValue !== undefined) {
    const solAmount = stakeValue / lamportsPerSol;
    if (solAmount < 1) {
      value = solAmount.toLocaleString();
    } else {
      value = solAmount.toLocaleString(undefined, {
        // minimumFractionDigits: 2,
        maximumFractionDigits: 0,
      });
    }
    value += " SOL";
  }

  return (
    <Label
      label="Stake Amount"
      value={value}
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
    { maxStake: 0, commission: undefined }
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
