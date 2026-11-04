import { useAtomValue } from "jotai";
import { ShredEvent } from "../../../api/entities";
import { useSlotInfo } from "../../../hooks/useSlotInfo";
import type { ShredEventTsDeltas } from "../../Shreds/types";
import { SHREDS_PER_FEC_SET } from "../../Shreds/const";
import RowSeparator from "../../../components/RowSeparator";
import ReplayCursorTooltip, {
  TooltipHeader,
  TooltipRow,
  CursorTimestampRow,
} from "../Tooltip";
import styles from "./shredTooltip.module.css";
import {
  hoveredShredAtom,
  hoveredSlotInfoAtom,
  type HoveredShred,
} from "../atoms";

export default function ShredTooltip() {
  const hovered = useAtomValue(hoveredShredAtom);
  if (hovered == null) return null;

  return (
    <ReplayCursorTooltip>
      <ShredTooltipContent hovered={hovered} />
    </ReplayCursorTooltip>
  );
}

interface ShredTooltipContentProps {
  hovered: HoveredShred;
}

type MainEventType = "published" | "repair" | "turbine" | "reconstructed";

function getMainEventType(
  shred: ShredEventTsDeltas,
): MainEventType | undefined {
  const repairTs = shred[ShredEvent.shred_received_repair];
  const turbineTs = shred[ShredEvent.shred_received_turbine];

  const replayTs = shred[ShredEvent.shred_replayed];
  if (replayTs != null) {
    if (repairTs != null && repairTs < replayTs) return "repair";
    if (turbineTs != null && turbineTs < replayTs) return "turbine";
    return "reconstructed";
  }

  // not replayed: whichever receipt arrived first
  if (repairTs != null && turbineTs != null) {
    return repairTs <= turbineTs ? "repair" : "turbine";
  }
  if (repairTs != null) return "repair";
  if (turbineTs != null) return "turbine";
}

const eventTypeInfo: Record<
  MainEventType,
  {
    receivedLabel: string;
    receivedEvent?: ShredEvent;
    receivedColorClassName?: string;
    replayedLabel?: string;
    replayedColorClassName?: string;
  }
> = {
  // our own slots: a single "Published" row via the received slot
  published: {
    receivedLabel: "Published",
    receivedEvent: ShredEvent.shred_published,
    receivedColorClassName: styles.publishedColor,
  },
  repair: {
    receivedLabel: "Repair received",
    receivedEvent: ShredEvent.shred_received_repair,
    receivedColorClassName: styles.receivedRepairColor,
    replayedLabel: "Repair replayed",
    replayedColorClassName: styles.replayedRepairColor,
  },
  turbine: {
    receivedLabel: "Turbine received",
    receivedEvent: ShredEvent.shred_received_turbine,
    receivedColorClassName: styles.receivedTurbineColor,
    replayedLabel: "Turbine replayed",
    replayedColorClassName: styles.replayedTurbineColor,
  },
  // replayed with neither receipt
  reconstructed: {
    receivedLabel: "Received",
    replayedLabel: "Replayed reconstructed",
    replayedColorClassName: styles.reconstructedTextColor,
  },
};

/** Header color matching how the shreds track paints the event type. */
function getHeaderColorClassName(
  eventType: MainEventType | undefined,
  skipped: boolean,
): string | undefined {
  if (skipped) return styles.skippedColor;
  switch (eventType) {
    case "published":
      return styles.publishedColor;
    case "repair":
      return styles.receivedRepairColor;
    case "turbine":
      return styles.receivedTurbineColor;
    case "reconstructed":
      return styles.reconstructedTextColor;
    case undefined:
      // use the default header color
      return undefined;
  }
}

function getRelativeTsText(delta: number | undefined, slotStart: number) {
  if (delta == null) return undefined;
  const rel = Math.round(delta - slotStart);
  return `${rel >= 0 ? "+" : ""}${rel}`;
}

function ShredTooltipContent({ hovered }: ShredTooltipContentProps) {
  const { slot, isFec, idx, maxIdx, shred, completeTs, skipped } = hovered;

  const slotInfo = useAtomValue(hoveredSlotInfoAtom);
  const { name, isLeader } = useSlotInfo(slot);

  if (slotInfo == null) return null;
  const slotStart = slotInfo.startMs;

  // only our own, non-skipped slots publish
  const isMine = slotInfo.isMine && !skipped;

  const headerLabel = isFec
    ? `FEC set ${idx + 1} of ${maxIdx + 1}`
    : `Shred ${idx + 1} of ${maxIdx + 1}`;

  const fecShredRange = `${idx * SHREDS_PER_FEC_SET + 1}–${
    idx * SHREDS_PER_FEC_SET + SHREDS_PER_FEC_SET
  }`;
  const fecSetNumber = Math.floor(idx / SHREDS_PER_FEC_SET) + 1;

  // the hovered shred's own earliest event, for the into-slot delta
  const shredStart = shred.reduce<number | undefined>((min, d) => {
    if (d == null) return min;
    return min == null || d < min ? d : min;
  }, undefined);

  const intoSlot =
    shredStart == null ? undefined : Math.round(shredStart - slotStart);

  const eventType: MainEventType | undefined = isMine
    ? "published"
    : getMainEventType(shred);

  const completeText = getRelativeTsText(completeTs, slotStart);

  return (
    <>
      <TooltipHeader
        colorClassName={getHeaderColorClassName(eventType, skipped)}
      >
        {headerLabel}
      </TooltipHeader>

      <RowSeparator />
      <CursorTimestampRow />
      <TooltipRow label="Into slot" value={intoSlot} unit="ms" />

      <RowSeparator />
      <TooltipRow label="Slot" value={slot} />
      <TooltipRow label="Leader" value={isLeader ? `You · ${name}` : name} />
      {isFec ? (
        <TooltipRow label="Shreds" value={fecShredRange} />
      ) : (
        <TooltipRow label="FEC set" value={fecSetNumber} />
      )}

      {(eventType || completeText) && (
        <>
          <RowSeparator />
          <EventRows
            eventType={eventType}
            shred={shred}
            slotStart={slotStart}
          />
          {completeText && (
            <TooltipRow label="Slot complete" value={completeText} unit="ms" />
          )}
        </>
      )}
    </>
  );
}

interface EventRowsProps {
  eventType: MainEventType | undefined;
  shred: ShredEventTsDeltas;
  slotStart: number;
}

function EventRows({ eventType, shred, slotStart }: EventRowsProps) {
  const eventInfo = eventType == null ? undefined : eventTypeInfo[eventType];
  if (!eventInfo) return null;

  const receivedValue =
    eventInfo.receivedEvent == null
      ? undefined
      : getRelativeTsText(shred[eventInfo.receivedEvent], slotStart);

  const replayedValue = getRelativeTsText(
    shred[ShredEvent.shred_replayed],
    slotStart,
  );

  return (
    <>
      {receivedValue && (
        <TooltipRow
          label={eventInfo.receivedLabel}
          value={receivedValue}
          unit="ms"
          valueColorClassName={eventInfo.receivedColorClassName}
        />
      )}
      {eventInfo.replayedLabel && replayedValue && (
        <TooltipRow
          label={eventInfo.replayedLabel}
          value={replayedValue}
          unit="ms"
          valueColorClassName={eventInfo.replayedColorClassName}
        />
      )}
    </>
  );
}
