import { DateTime, Duration } from "luxon";
import type { Cluster, Epoch, Peer, SlotTransactions } from "./api/types";
import { lamportsPerSol, slotsPerLeader } from "./consts";
import {
  clusterMainnetBetaColor,
  clusterTestnetColor,
  clusterDevelopmentColor,
  clusterDevnetColor,
  clusterPythnetColor,
  clusterPythtestColor,
  clusterUnknownColor,
} from "./colors";

export function getLeaderSlots(epoch: Epoch, pubkey: string) {
  return epoch.leader_slots.reduce<number[]>((leaderSlots, pubkeyIndex, i) => {
    if (epoch.staked_pubkeys[pubkeyIndex] === pubkey)
      leaderSlots.push(i * slotsPerLeader + epoch.start_slot);
    return leaderSlots;
  }, []);
}

export function getSlotGroupLeader(slot: number) {
  return slot - (slot % slotsPerLeader);
}

const descendingUnits = [
  { unit: "years", suffix: "y" },
  { unit: "months", suffix: "m" },
  { unit: "weeks", suffix: "w" },
  { unit: "days", suffix: "d" },
  { unit: "hours", suffix: "h" },
  { unit: "minutes", suffix: "m" },
  { unit: "seconds", suffix: "s" },
] as const;

export interface DurationOptions {
  showOnlyTwoSignificantUnits?: boolean;
  omitSeconds?: boolean;
}

function getUnitValues(
  duration: Duration,
  options?: DurationOptions,
): [number, string][] {
  if (options?.showOnlyTwoSignificantUnits) {
    const firstUnitIndex = descendingUnits.findIndex(
      ({ unit }) => !!duration[unit],
    );
    return descendingUnits
      .slice(firstUnitIndex, firstUnitIndex + 2)
      .map(({ unit, suffix }) => [duration[unit], suffix]);
  }

  return descendingUnits
    .filter(({ unit }) => {
      if (options?.omitSeconds && unit === "seconds") return false;

      // drop zero values
      return !!duration[unit];
    })
    .map(({ unit, suffix }) => [duration[unit], suffix]);
}

export function getDurationValues(
  duration?: Duration,
  options?: DurationOptions,
): [number, string][] | undefined {
  if (!duration) return;

  if (duration.toMillis() < 1000) return [[0, "s"]];

  const units = getUnitValues(duration, options);
  return units.length ? units : [[0, "s"]];
}

export function getDurationText(
  duration?: Duration,
  options?: DurationOptions,
) {
  const values = getDurationValues(duration, options);
  if (!values) return "Never";

  return values.map(([val, suffix]) => `${val}${suffix}`).join(" ");
}

export function getTimeTillText(
  duration?: Duration,
  options: { showSeconds: boolean } = { showSeconds: true },
) {
  if (!duration) return "Never";

  if (duration.toMillis() < 0) return "0s";

  let text = "";

  if (duration.years) {
    if (text) text += " ";
    text += `${duration.years}y`;
  }

  if (duration.months) {
    if (text) text += " ";
    text += `${duration.months}m`;
  }

  if (duration.weeks) {
    if (text) text += " ";
    text += `${duration.weeks}w`;
  }

  if (duration.days) {
    if (text) text += " ";
    text += `${duration.days}d`;
  }

  if (duration.hours) {
    if (text) text += " ";
    text += `${duration.hours}h`;
  }

  if (duration.minutes) {
    if (text) text += " ";
    text += `${duration.minutes}m`;
  }

  if (duration.seconds && options.showSeconds) {
    if (text) text += " ";
    text += `${duration.seconds}s`;
  }

  if (!text) {
    text = "0s";
  }

  return text;
}

export function formatDuration(seconds: number) {
  const duration = Duration.fromObject({ seconds }).rescale();
  return getTimeTillText(duration);
}

export let slowDateTimeNow = DateTime.now();
setInterval(() => {
  slowDateTimeNow = DateTime.now();
}, 1_000);

export function isDefined<T>(item: T | undefined): item is T {
  return item !== undefined;
}

export const fixValue = (val: number) =>
  val >= 18446744073709552000 ? 0 : val;

export function getStake(peer: Peer) {
  return peer.vote.reduce(
    (total, { activated_stake }) => total + activated_stake,
    0n,
  );
}

export function getSolString(
  lamportAmount?: bigint,
  smallValueDecimals?: number,
) {
  if (lamportAmount === undefined) return;

  const solAmount = Number(lamportAmount) / lamportsPerSol;
  if (solAmount < 1) {
    return solAmount.toLocaleString(undefined, {
      maximumFractionDigits: smallValueDecimals,
    });
  }

  if (solAmount < 100) {
    return solAmount.toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  }

  return solAmount.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

export function getFmtStake(stake?: bigint, smallValueDecimals?: number) {
  const solString = getSolString(stake, smallValueDecimals);
  if (solString === undefined) return;

  return `${solString}\xa0SOL`;
}

/** Dumb workaround for Array.isArray type checking with eslint for readonly arrays */
export const isArray = <T>(arg: unknown): arg is ReadonlyArray<T> =>
  Array.isArray(arg);

export const hasModKey = ({
  shiftKey,
  ctrlKey,
  metaKey,
}: KeyboardEvent | React.MouseEvent | WheelEvent) =>
  shiftKey || ctrlKey || metaKey;

export function copyToClipboard(copyValue: string) {
  if (navigator.clipboard) {
    void navigator.clipboard.writeText(copyValue);
    return;
  }

  // Copy fallback for when not https or localhost
  const copyEl = document.createElement("textarea");
  copyEl.value = copyValue;

  // Move el out of the viewport so it's not visible
  copyEl.style.position = "absolute";
  copyEl.style.left = "-999999px";

  document.body.appendChild(copyEl);
  copyEl.select();

  try {
    const successful = document.execCommand("copy");
    if (!successful) {
      console.error("Failed to copy text", copyValue);
    }
  } catch (error) {
    console.error("Failed to copy text", copyValue, error);
  } finally {
    document.body.removeChild(copyEl);
  }
}

export function isElementFullyInView(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <=
      (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

export function getPaidTxnFees(transactions: SlotTransactions, txnIdx: number) {
  // fees are only paid by landed transactions with a valid fee payer (errors 5, 6 result in an invalid fee payer)
  return transactions.txn_landed[txnIdx] &&
    ![5, 6].includes(transactions.txn_error_code[txnIdx])
    ? transactions.txn_priority_fee[txnIdx] +
        transactions.txn_transaction_fee[txnIdx]
    : 0n;
}

export function getPaidTxnTips(transactions: SlotTransactions, txnIdx: number) {
  return transactions.txn_landed[txnIdx] &&
    transactions.txn_error_code[txnIdx] === 0
    ? transactions.txn_tips[txnIdx]
    : 0n;
}

export function getTxnIncome(transactions: SlotTransactions, txnIdx: number) {
  return (
    getPaidTxnFees(transactions, txnIdx) + getPaidTxnTips(transactions, txnIdx)
  );
}

export function removePortFromIp(ip: string) {
  return ip.split(":")[0];
}

export function getClusterColor(cluster?: Cluster) {
  switch (cluster) {
    case "mainnet-beta":
      return clusterMainnetBetaColor;
    case "testnet":
      return clusterTestnetColor;
    case "development":
      return clusterDevelopmentColor;
    case "devnet":
      return clusterDevnetColor;
    case "pythnet":
      return clusterPythnetColor;
    case "pythtest":
      return clusterPythtestColor;
    case "unknown":
    case undefined:
      return clusterUnknownColor;
  }
}
