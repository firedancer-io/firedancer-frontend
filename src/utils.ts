import type { Duration } from "luxon";
import { DateTime } from "luxon";
import type { Epoch, Peer } from "./api/types";
import { lamportsPerSol, slotsPerLeader } from "./consts";

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

export function getDurationText(
  duration?: Duration,
  options: { showSeconds: boolean; showOnlyLargestUnit: boolean } = {
    showSeconds: true,
    showOnlyLargestUnit: false,
  },
) {
  if (!duration) return "Never";

  if (duration.toMillis() < 0) return "0s";

  let text = "";

  if (duration.years) {
    const durationText = `${duration.years}y`;
    if (options.showOnlyLargestUnit) return durationText;
    if (text) text += " ";
    text += durationText;
  }

  if (duration.months) {
    const durationText = `${duration.months}m`;
    if (options.showOnlyLargestUnit) return durationText;
    if (text) text += " ";
    text += durationText;
  }

  if (duration.weeks) {
    const durationText = `${duration.weeks}w`;
    if (options.showOnlyLargestUnit) return durationText;
    if (text) text += " ";
    text += durationText;
  }

  if (duration.days) {
    const durationText = `${duration.days}d`;
    if (options.showOnlyLargestUnit) return durationText;
    if (text) text += " ";
    text += durationText;
  }

  if (duration.hours) {
    const durationText = `${duration.hours}h`;
    if (options.showOnlyLargestUnit) return durationText;
    if (text) text += " ";
    text += durationText;
  }

  if (duration.minutes) {
    const durationText = `${duration.minutes}m`;
    if (options.showOnlyLargestUnit) return durationText;
    if (text) text += " ";
    text += durationText;
  }

  if (duration.seconds && options.showSeconds) {
    const durationText = `${duration.seconds}s`;
    if (options.showOnlyLargestUnit) return durationText;
    if (text) text += " ";
    text += durationText;
  }

  if (!text) {
    text = "0s";
  }

  return text;
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
