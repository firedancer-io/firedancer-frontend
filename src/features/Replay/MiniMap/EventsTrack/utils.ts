import type { EventTs } from "../../Events/atoms";
import { getDateTimeFromNanos } from "../../../../utils.ts";
import { calcAbsoluteNs } from "../../utils.ts";

export const pinGroupPxThreshold = 4;

export interface EventGroup {
  ts: number;
  slots: EventTs[];
}

export function getEventGroupKey(group: EventGroup) {
  const slotsKey = group.slots.map(({ ts, slot }) => `${ts}:${slot}`).join(",");
  return `${group.ts}|${slotsKey}`;
}

export function getPxPerMs(width: number, windowMs: number) {
  if (windowMs <= 0) return 0;
  return width / windowMs;
}

export function formatSlotTime(
  referenceNs: bigint | undefined,
  slotTs: number,
) {
  if (referenceNs == null) return "";
  return getDateTimeFromNanos(calcAbsoluteNs(referenceNs, slotTs)).toFormat(
    "LLL d, h:mm:ss a",
  );
}
