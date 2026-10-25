import { memo, type CSSProperties } from "react";
import { Box, Flex, Tooltip } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { HoverCard } from "radix-ui";
import clsx from "clsx";
import { TimelineEventType } from "../../../../api/entities.ts";
import { containerElAtom } from "../../../../atoms.ts";
import { referenceNsAtom } from "../../atoms.ts";
import { SlotStatus } from "../../HeaderTrack/SlotStatus.tsx";
import styles from "./eventsTrack.module.css";
import chartStyles from "../../chart.module.css";
import { formatSlotTime, type EventGroup } from "./utils.ts";
import type { EventTs } from "../../Events/atoms.ts";

interface PinContainerProps extends EventGroup {
  type: TimelineEventType;
  panToTs: (ts: number) => void;
}

const PinContainer = memo(function PinContainer({
  type,
  ts,
  slots,
  panToTs,
}: PinContainerProps) {
  return (
    <Flex
      className={styles.pinContainer}
      position="absolute"
      // full-width container positioned with translate x
      inset="0"
      style={{ "--event-ts": `${ts}` } as CSSProperties}
    >
      {slots.length > 1 ? (
        <MultiPin slots={slots} type={type} panToTs={panToTs} />
      ) : (
        <SinglePin slot={slots[0]} type={type} panToTs={panToTs} />
      )}
    </Flex>
  );
});

export default PinContainer;

interface SinglePinProps {
  slot: EventTs;
  type: TimelineEventType;
  panToTs: (ts: number) => void;
}

/**
 * Click navigates to event ts
 */
function SinglePin({ slot, type, panToTs }: SinglePinProps) {
  const referenceNs = useAtomValue(referenceNsAtom);

  return (
    <Tooltip
      side="bottom"
      disableHoverableContent
      // close immediately to open adjacent marker tooltip
      delayDuration={0}
      content={`Your slot ${slot.slot.toLocaleString()} skipped · ${formatSlotTime(
        referenceNs,
        slot.ts,
      )}`}
    >
      <button
        type="button"
        className={clsx(styles.pinPositioner, styles.pinButton)}
        onClick={(e) => {
          e.stopPropagation();
          panToTs(slot.ts);
        }}
        aria-label={`Jump to skipped slot ${slot.slot.toLocaleString()}`}
      >
        <Pin eventType={type} />
      </button>
    </Tooltip>
  );
}

interface MultiPinProps {
  slots: EventTs[];
  type: TimelineEventType;
  panToTs: (ts: number) => void;
}
/**
 * Hover opens popover with a button for each slot
 */
function MultiPin({ slots, type, panToTs }: MultiPinProps) {
  const popoverContainerEl = useAtomValue(containerElAtom);
  const referenceNs = useAtomValue(referenceNsAtom);

  return (
    <HoverCard.Root openDelay={100} closeDelay={100}>
      <HoverCard.Trigger asChild>
        <div className={styles.pinPositioner}>
          <Pin count={slots.length} eventType={type} />
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
            <span>{slots.length} of your slots skipped here</span>
            <span className={styles.pinPopoverJumpAll}>click to jump</span>
          </Flex>

          <Flex direction="column" maxHeight="180px" overflowY="auto">
            {slots.map(({ slot, ts: slotTs }) => (
              <button
                type="button"
                key={slot}
                className={styles.pinPopoverRow}
                onClick={() => panToTs(slotTs)}
              >
                <SlotStatus slot={slot} skipped />
                <span className={styles.pinPopoverSlot}>
                  {slot.toLocaleString()}
                </span>
                <span className={styles.pinPopoverTime}>
                  {formatSlotTime(referenceNs, slotTs)}
                </span>
                <span className={styles.pinPopoverJump}>jump</span>
              </button>
            ))}
          </Flex>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

const eventTypeClassName: Record<TimelineEventType, string> = {
  [TimelineEventType.LeaderSkip]: styles.eventType0,
};

interface PinProps {
  count?: number;
  eventType: TimelineEventType;
}

function Pin({ count, eventType }: PinProps) {
  return (
    <Flex
      width="100%"
      height="100%"
      direction="column"
      align="center"
      justify="between"
      className={clsx(
        chartStyles.noChartExplore,
        eventTypeClassName[eventType],
      )}
    >
      <Flex position="relative">
        <svg
          className={styles.pinTriangle}
          xmlns="http://www.w3.org/2000/svg"
          width="10"
          height="7"
          viewBox="0 0 10 7"
          fill="none"
        >
          <path d="M1 0.5H9L5 5.5L1 0.5Z" stroke="black" />
        </svg>
        {count && <span className={styles.pinCount}>{count}</span>}
      </Flex>
      <Box height="10px" width="2px" className={styles.pinBar} />
    </Flex>
  );
}
