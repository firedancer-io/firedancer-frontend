import type { Duration } from "luxon";
import { DateTime } from "luxon";
import type { Cluster, Epoch, Peer } from "./api/types";
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

function getUnitText(value: number, suffix: string, showZeros: boolean) {
  if (value === 0 && !showZeros) return;
  return `${value}${suffix}`;
}

function getUnitTexts(duration: Duration, options?: DurationOptions) {
  if (options?.showOnlyTwoSignificantUnits) {
    const firstUnitIndex = descendingUnits.findIndex(({ unit }) => {
      return !!duration[unit];
    });
    return descendingUnits
      .slice(firstUnitIndex, firstUnitIndex + 2)
      .map(({ unit, suffix }) => {
        const value = duration[unit];
        return getUnitText(value, suffix, true);
      });
  }

  return descendingUnits
    .map(({ unit, suffix }) => {
      if (options?.omitSeconds && unit === "seconds") return;

      const value = duration[unit];
      if (!value) return;

      return getUnitText(value, suffix, false);
    })
    .filter((v) => !!v);
}

export function getDurationText(
  duration?: Duration,
  options?: DurationOptions,
) {
  if (!duration) return "Never";

  if (duration.toMillis() < 1000) return "0s";

  const texts = getUnitTexts(duration, options);
  return texts.join(" ") || "0s";
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

export function getFmtStake(stake?: bigint) {
  if (stake === undefined) return;

  let value = "";
  const solAmount = Number(stake) / lamportsPerSol;
  if (solAmount < 1) {
    value = solAmount.toLocaleString();
  } else if (solAmount < 100) {
    value = solAmount.toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  } else {
    value = solAmount.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    });
  }

  return `${value}\xa0SOL`;
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
