import {
  TimelineEventType,
  isTimelineIdentityEvent,
} from "../../../../api/entities.ts";
import type { EventInfo } from "../../Events/atoms";
import { getDateTimeFromNanos } from "../../../../utils.ts";
import { calcAbsoluteNs } from "../../utils.ts";
import { epochLabel } from "../../../../epochUtils.ts";

export const pinGroupPxThreshold = 4;

export interface EventGroup {
  ts: number;
  events: EventInfo[];
}

export function getEventGroupKey(group: EventGroup) {
  const eventsKey = group.events
    .map(({ ts, slot }) => `${ts}:${slot}`)
    .join(",");
  return `${group.ts}|${eventsKey}`;
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

export function getMultiPinHeader(
  type: TimelineEventType,
  count: number,
): string {
  switch (type) {
    case TimelineEventType.LeaderSkip:
      return `${count} of your slots skipped here`;
    case TimelineEventType.EpochStart:
      return `${count} epoch boundaries`;
    case TimelineEventType.IdentitySet:
      return `Identity set ${count} times`;
    case TimelineEventType.IdentityPromote:
      return `Identity promoted ${count} times`;
    case TimelineEventType.IdentityTakeover:
      return `Identity taken over ${count} times`;
    case TimelineEventType.IdentityHandoff:
      return `Identity handed off ${count} times`;
    case TimelineEventType.Boot:
      return `Validator restarted ${count} times`;
    case TimelineEventType.CatchUp:
      return `Validator began catching up ${count} times`;
  }
}

export interface IdentityDetailLine {
  kind: "keys" | "result" | "notes";
  text: string;
}

export function getIdentityDetailLines(event: EventInfo): IdentityDetailLine[] {
  return [
    {
      kind: "keys",
      text: `${event.identity_from} to ${event.identity_to}`,
    },
    {
      kind: "result",
      text: event.identity_result ?? "",
    },
    {
      kind: "notes",
      text: event.identity_notes ?? "",
    },
  ].filter((line): line is IdentityDetailLine => !!line.text);
}

function getSinglePinLabel(
  type: Exclude<TimelineEventType, TimelineEventType.LeaderSkip>,
  epochNumber: number | undefined,
): string {
  switch (type) {
    case TimelineEventType.IdentitySet:
      return "Identity set";
    case TimelineEventType.IdentityPromote:
      return "Identity promoted";
    case TimelineEventType.IdentityTakeover:
      return "Identity taken over";
    case TimelineEventType.IdentityHandoff:
      return "Identity handed off";
    case TimelineEventType.EpochStart:
      return `${epochLabel(epochNumber)} began`;
    case TimelineEventType.Boot:
      return "Validator restarted";
    case TimelineEventType.CatchUp:
      return "Validator began catching up";
  }
}

export function getSinglePinText(
  type: TimelineEventType,
  event: EventInfo,
  epochNumber: number | undefined,
  referenceNs: bigint | undefined,
): { lines: string[]; ariaLabel: string } {
  const slotStr = event.slot.toLocaleString();
  const time = formatSlotTime(referenceNs, event.ts);

  if (type === TimelineEventType.LeaderSkip) {
    return {
      lines: [`Your slot ${slotStr} skipped`, time],
      ariaLabel: `Jump to skipped slot ${slotStr}`,
    };
  }

  const ariaLabel = `Jump to slot ${slotStr}`;
  const slotLine = `slot ${slotStr}`;
  const label = getSinglePinLabel(type, epochNumber);

  if (isTimelineIdentityEvent(type)) {
    return {
      lines: [
        label,
        ...getIdentityDetailLines(event).map((line) => line.text),
        slotLine,
        time,
      ],
      ariaLabel,
    };
  }

  return {
    lines: [label, slotLine, time],
    ariaLabel,
  };
}
