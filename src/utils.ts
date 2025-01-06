import { DateTime, Duration } from "luxon";
import { Epoch, Peer } from "./api/types";
import { lamportsPerSol, slotsPerLeader } from "./consts";
import { sum } from "lodash";

export function getLeaderSlots(epoch: Epoch, pubkey: string) {
  return epoch.leader_slots.reduce<number[]>((leaderSlots, pubkeyIndex, i) => {
    if (epoch.staked_pubkeys[pubkeyIndex] === pubkey)
      leaderSlots.push(i * slotsPerLeader + epoch.start_slot);
    return leaderSlots;
  }, []);
}

export function getTimeTillText(
  duration?: Duration,
  options: { showSeconds: boolean } = { showSeconds: true }
) {
  if (!duration) return "Never";

  if (duration.toMillis() < 0) return "0s";

  let text = "";

  if (duration.years) {
    text += `${duration.years}y`;
  }

  if (duration.months) {
    text += `${duration.months}m`;
  }

  if (duration.weeks) {
    text += `${duration.weeks}w`;
  }

  if (duration.days) {
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
  return sum(peer.vote.map(({ activated_stake }) => activated_stake));
}

export function getFmtStake(stake?: number) {
  if (stake === undefined) return;

  let value = "";
  const solAmount = stake / lamportsPerSol;
  if (solAmount < 1) {
    value = solAmount.toLocaleString();
  } else {
    value = solAmount.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    });
  }

  return `${value} SOL`;
}
