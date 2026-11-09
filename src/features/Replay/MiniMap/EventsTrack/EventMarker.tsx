import { memo, type CSSProperties } from "react";
import { Flex, Tooltip } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { HoverCard } from "radix-ui";
import clsx from "clsx";
import {
  TimelineEventType,
  isTimelineIdentityEvent,
} from "../../../../api/entities.ts";
import { containerElAtom } from "../../../../atoms.ts";
import { referenceNsAtom } from "../../atoms.ts";
import { SlotStatus } from "../../HeaderTrack/SlotStatus.tsx";
import styles from "./eventsTrack.module.css";
import {
  formatSlotTime,
  getIdentityDetailLines,
  getMultiPinHeader,
  getSinglePinText,
  type EventGroup,
  type IdentityDetailLine,
} from "./utils.ts";
import type { EventInfo } from "../../Events/atoms.ts";
import { Pin } from "./Pin.tsx";
import { useGetEpochForSlot } from "../../../../epochUtils.ts";

const identityLineClass: Record<IdentityDetailLine["kind"], string> = {
  keys: styles.pinPopoverIdentityKeys,
  result: styles.pinPopoverIdentityResult,
  notes: styles.pinPopoverIdentityNotes,
};

interface PinContainerProps extends EventGroup {
  type: TimelineEventType;
  panToTs: (ts: number) => void;
}

const PinContainer = memo(function PinContainer({
  type,
  ts,
  events,
  panToTs,
}: PinContainerProps) {
  const referenceNs = useAtomValue(referenceNsAtom);

  return (
    <Flex
      className={styles.pinContainer}
      position="absolute"
      // full-width container positioned with translate x
      inset="0"
      style={{ "--event-ts": `${ts}` } as CSSProperties}
    >
      {events.length > 1 ? (
        <MultiPin events={events} type={type} panToTs={panToTs} />
      ) : (
        <SinglePin
          type={type}
          event={events[0]}
          referenceNs={referenceNs}
          panToTs={panToTs}
        />
      )}
    </Flex>
  );
});

export default PinContainer;

interface SinglePinProps {
  type: TimelineEventType;
  event: EventInfo;
  referenceNs: bigint | undefined;
  panToTs: (ts: number) => void;
}

/**
 * Click navigates to event ts
 */
function SinglePin({ type, event, referenceNs, panToTs }: SinglePinProps) {
  const getEpochForSlot = useGetEpochForSlot();
  const epochNumber =
    type === TimelineEventType.EpochStart
      ? getEpochForSlot?.(event.slot)
      : undefined;
  const isIdentity = isTimelineIdentityEvent(type);
  const { lines, ariaLabel } = getSinglePinText(
    type,
    event,
    epochNumber,
    referenceNs,
  );

  return (
    <Tooltip
      side="bottom"
      disableHoverableContent
      // close immediately to open adjacent marker tooltip
      delayDuration={0}
      className={isIdentity ? styles.identityTooltip : undefined}
      content={lines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {line}
        </span>
      ))}
    >
      <button
        type="button"
        className={clsx(styles.pinPositioner, styles.pinButton)}
        onClick={(e) => {
          e.stopPropagation();
          panToTs(event.ts);
        }}
        aria-label={ariaLabel}
      >
        <Pin eventType={type} />
      </button>
    </Tooltip>
  );
}

interface MultiPinProps {
  events: EventInfo[];
  type: TimelineEventType;
  panToTs: (ts: number) => void;
}
/**
 * Hover opens popover with a button for each event
 */
function MultiPin({ events, type, panToTs }: MultiPinProps) {
  const popoverContainerEl = useAtomValue(containerElAtom);
  const referenceNs = useAtomValue(referenceNsAtom);
  const skipped = type === TimelineEventType.LeaderSkip;
  const isIdentity = isTimelineIdentityEvent(type);
  const header = getMultiPinHeader(type, events.length);

  return (
    <HoverCard.Root openDelay={100} closeDelay={100}>
      <HoverCard.Trigger asChild>
        <div className={styles.pinPositioner}>
          <Pin count={events.length} eventType={type} />
        </div>
      </HoverCard.Trigger>

      <HoverCard.Portal container={popoverContainerEl}>
        <HoverCard.Content
          className={styles.pinPopover}
          side="top"
          sideOffset={6}
          align="center"
          collisionPadding={8}
        >
          <Flex
            className={styles.pinPopoverHeader}
            align="center"
            justify="between"
            p="2px 4px 8px"
          >
            <span>{header}</span>
            <span className={styles.pinPopoverJumpAll}>click to jump</span>
          </Flex>

          <Flex direction="column" maxHeight="180px" overflowY="auto">
            {events.map((event) => {
              const { slot, ts: slotTs } = event;
              const slotTime = (
                <>
                  <span className={styles.pinPopoverSlot}>
                    {slot.toLocaleString()}
                  </span>
                  <span className={styles.pinPopoverTime}>
                    {formatSlotTime(referenceNs, slotTs)}
                  </span>
                </>
              );
              return (
                <button
                  type="button"
                  key={`${slot}:${slotTs}`}
                  className={clsx(
                    styles.pinPopoverRow,
                    isIdentity && styles.pinPopoverRowIdentity,
                    skipped && styles.pinPopoverRowSkipped,
                  )}
                  onClick={() => panToTs(slotTs)}
                >
                  {skipped && <SlotStatus slot={slot} skipped={skipped} />}
                  {isIdentity ? (
                    <span className={styles.pinPopoverIdentity}>
                      {getIdentityDetailLines(event).map((line) => (
                        <span
                          key={line.kind}
                          className={identityLineClass[line.kind]}
                        >
                          {line.text}
                        </span>
                      ))}
                      {slotTime}
                    </span>
                  ) : (
                    slotTime
                  )}
                  <span className={styles.pinPopoverJump}>jump</span>
                </button>
              );
            })}
          </Flex>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
