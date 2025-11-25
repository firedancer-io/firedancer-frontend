import type uPlot from "uplot";
import { getDefaultStore } from "jotai";
import {
  shredsAtoms,
  type ShredEventTsDeltas,
  type SlotsShreds,
} from "./atoms";
import { delayMs, shredEventDescPriorities } from "./const";
import { showStartupProgressAtom } from "../../StartupProgress/atoms";
import {
  shredReceivedRepairColor,
  shredReceivedTurbineColor,
  shredRepairRequestedColor,
  shredReplayedNothingColor,
  shredReplayedRepairColor,
  shredReplayedTurbineColor,
  shredReplayStartedColor,
  shredSkippedColor,
} from "../../../colors";
import { skippedClusterSlotsAtom } from "../../../atoms";
import { clamp } from "lodash";
import { ShredEvent } from "../../../api/entities";

const store = getDefaultStore();
const xScaleKey = "x";

type EventsByFillStyle = {
  [fillStyle: string]: Array<[x: number, y: number, width: number]>;
};

export function shredsProgressionPlugin(
  isOnStartupScreen: boolean,
): uPlot.Plugin {
  return {
    hooks: {
      draw: [
        (u) => {
          const atoms = shredsAtoms;

          const liveShreds = store.get(atoms.slotsShreds);
          const slotRange = store.get(atoms.range);
          const skippedSlotsCluster = store.get(skippedClusterSlotsAtom);

          if (!liveShreds || !slotRange) {
            return;
          }

          if (!isOnStartupScreen && store.get(showStartupProgressAtom)) {
            // if startup is running, prevent drawing non-startup screen chart
            return;
          }

          // Offset to convert shred event delta to chart x value
          const delayedNow = new Date().getTime() - delayMs;
          const tsXValueOffset = delayedNow - liveShreds.referenceTs;

          u.ctx.save();
          u.ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
          u.ctx.clip();

          // helper to get x pos
          const getXPos = (xVal: number) => u.valToPos(xVal, xScaleKey, true);

          const { maxShreds, orderedSlotNumbers } = getDrawInfo(
            slotRange.min,
            slotRange.max,
            liveShreds,
            u.scales[xScaleKey],
            tsXValueOffset,
          );

          const canvasHeight = isOnStartupScreen
            ? Math.trunc(u.bbox.height / 3)
            : u.bbox.height;

          const getYOffset = isOnStartupScreen
            ? (eventType: Exclude<ShredEvent, ShredEvent.slot_complete>) => {
                switch (eventType) {
                  case ShredEvent.shred_received_turbine: {
                    return 0;
                  }
                  case ShredEvent.shred_repair_request:
                  case ShredEvent.shred_received_repair: {
                    return canvasHeight;
                  }
                  case ShredEvent.shred_replay_start:
                  case ShredEvent.shred_replayed: {
                    return canvasHeight * 2;
                  }
                }
              }
            : undefined;

          // each row is at least 1 px
          const rowPxHeight = clamp(canvasHeight / maxShreds, 1, 10);
          const gapPxHeight = 1;

          // n rows, n-1 gaps
          const rowsCount = Math.trunc(
            (canvasHeight + gapPxHeight) / (rowPxHeight + gapPxHeight),
          );
          const shredsPerRow = maxShreds / rowsCount;

          for (const slotNumber of orderedSlotNumbers) {
            const eventsByFillStyle: EventsByFillStyle = {};
            const addEventPosition = (
              fillStyle: string,
              position: [x: number, y: number, width: number],
            ) => {
              eventsByFillStyle[fillStyle] ??= [];
              eventsByFillStyle[fillStyle].push(position);
            };

            const slot = liveShreds.slots.get(slotNumber);
            if (!slot) continue;

            const isSlotSkipped = skippedSlotsCluster.has(slotNumber);

            for (let rowIdx = 0; rowIdx < rowsCount; rowIdx++) {
              const shredsAboveRow = rowIdx * shredsPerRow;
              const firstShredIdx = Math.trunc(shredsAboveRow);

              const shredsAboveOrInRow = (rowIdx + 1) * shredsPerRow;
              const lastShredIdx = Math.min(
                maxShreds,
                Math.ceil(shredsAboveOrInRow) - 1,
              );

              addEventsForRow({
                addEventPosition,
                u,
                firstShredIdx,
                lastShredIdx,
                shreds: slot.shreds,
                slotCompletionTsDelta: slot.completionTsDelta,
                isSlotSkipped,
                drawOnlyDots: isOnStartupScreen,
                tsXValueOffset,
                y: (rowPxHeight + gapPxHeight) * rowIdx + u.bbox.top,
                getYOffset,
                dotWidth: rowPxHeight,
                scaleX: u.scales[xScaleKey],
                getXPos,
              });
            }

            // draw events, one fillStyle at a time for this slot
            for (const fillStyle of Object.keys(eventsByFillStyle)) {
              u.ctx.beginPath();
              u.ctx.fillStyle = fillStyle;
              for (const [x, y, width] of eventsByFillStyle[fillStyle]) {
                u.ctx.rect(x, y, width, rowPxHeight);
              }
              u.ctx.fill();
            }
          }

          u.ctx.restore();
        },
      ],
    },
  };
}

/**
 * Get slots in draw order
 * and max shreds count per slot for scaling
 */
const getDrawInfo = (
  minSlotNumber: number,
  maxSlotNumber: number,
  liveShreds: SlotsShreds,
  scaleX: uPlot.Scale,
  tsXValueOffset: number,
) => {
  const orderedSlotNumbers = [];
  let maxShreds = 0;

  for (
    let slotNumber = minSlotNumber;
    slotNumber <= maxSlotNumber;
    slotNumber++
  ) {
    const slot = liveShreds.slots.get(slotNumber);
    if (!slot || !slot.shreds.length || slot.minEventTsDelta == null) {
      // slot has no events
      continue;
    }

    if (
      scaleX.max != null &&
      slot.minEventTsDelta - tsXValueOffset > scaleX.max
    ) {
      // slot started after chart max X
      continue;
    }

    if (
      scaleX.min != null &&
      slot.completionTsDelta != null &&
      slot.completionTsDelta - tsXValueOffset < scaleX.min
    ) {
      // slot completed before chart min X
      continue;
    }

    orderedSlotNumbers.push(slotNumber);
    maxShreds = Math.max(maxShreds, slot.shreds.length);
  }

  return {
    maxShreds,
    orderedSlotNumbers,
  };
};

interface AddEventsForRowArgs {
  addEventPosition: (
    fillStyle: string,
    position: [x: number, y: number, width: number],
  ) => void;
  u: uPlot;
  firstShredIdx: number;
  lastShredIdx: number;
  shreds: (ShredEventTsDeltas | undefined)[];
  slotCompletionTsDelta: number | undefined;
  isSlotSkipped: boolean;
  drawOnlyDots: boolean;
  tsXValueOffset: number;
  y: number;
  getYOffset?: (
    eventType: Exclude<ShredEvent, ShredEvent.slot_complete>,
  ) => number;
  dotWidth: number;
  scaleX: uPlot.Scale;
  getXPos: (xVal: number) => number;
}
/**
 * Draw rows for shreds, with rectangles or dots for events.
 * Each row may represent partial or multiple shreds. Use the most completed shred.
 */
function addEventsForRow({
  addEventPosition,
  u,
  firstShredIdx,
  lastShredIdx,
  shreds,
  slotCompletionTsDelta,
  tsXValueOffset,
  drawOnlyDots,
  isSlotSkipped,
  y,
  getYOffset,
  dotWidth,
  scaleX,
  getXPos,
}: AddEventsForRowArgs) {
  if (scaleX.max == null || scaleX.min == null) return;

  const shredIdx = getMostCompletedShredIdx(
    firstShredIdx,
    lastShredIdx,
    shreds,
  );

  const eventTsDeltas = shreds[shredIdx];
  if (!eventTsDeltas) return;

  const maxXPos = u.bbox.left + u.bbox.width;
  let endXPos: number =
    slotCompletionTsDelta == null
      ? // event goes to max x
        maxXPos
      : // event goes to slot completion or max x
        Math.min(getXPos(slotCompletionTsDelta - tsXValueOffset), maxXPos);

  const eventPositions = new Map<
    Exclude<ShredEvent, ShredEvent.slot_complete>,
    [x: number, y: number, width: number]
  >();

  // draw events from highest to lowest priority
  for (const eventType of shredEventDescPriorities) {
    const tsDelta = eventTsDeltas[eventType];
    if (tsDelta == null) continue;

    const startXVal = tsDelta - tsXValueOffset;
    const startXPos = getXPos(startXVal);

    // ignore overlapping events with lower priority
    if (startXPos >= endXPos) continue;

    const yOffset = getYOffset?.(eventType) ?? 0;

    eventPositions.set(
      eventType,
      drawOnlyDots || isSlotSkipped
        ? [startXPos, y + yOffset, dotWidth]
        : [startXPos, y + yOffset, endXPos - startXPos],
    );
    endXPos = startXPos;
  }

  for (const [eventType, position] of eventPositions.entries()) {
    if (isSlotSkipped) {
      addEventPosition(shredSkippedColor, position);
      continue;
    }
    switch (eventType) {
      case ShredEvent.shred_repair_request: {
        addEventPosition(shredRepairRequestedColor, position);
        break;
      }
      case ShredEvent.shred_received_turbine: {
        addEventPosition(shredReceivedTurbineColor, position);
        break;
      }
      case ShredEvent.shred_received_repair: {
        addEventPosition(shredReceivedRepairColor, position);
        break;
      }
      case ShredEvent.shred_replay_start: {
        addEventPosition(shredReplayStartedColor, position);
        break;
      }
      case ShredEvent.shred_replayed: {
        if (eventPositions.has(ShredEvent.shred_received_repair)) {
          addEventPosition(shredReplayedRepairColor, position);
        } else if (eventPositions.has(ShredEvent.shred_received_turbine)) {
          addEventPosition(shredReplayedTurbineColor, position);
        } else {
          addEventPosition(shredReplayedNothingColor, position);
        }
        break;
      }
    }
  }
}

function getMostCompletedShredIdx(
  firstShredIdx: number,
  lastShredIdx: number,
  shreds: (ShredEventTsDeltas | undefined)[],
): number {
  for (const shredEvent of shredEventDescPriorities) {
    const shredIdx = findShredIdx(
      firstShredIdx,
      lastShredIdx,
      shreds,
      (shred: ShredEventTsDeltas | undefined) => shred?.[shredEvent] != null,
    );
    if (shredIdx !== -1) return shredIdx;
  }
  return firstShredIdx;
}

/**
 * Find first shred index that satisfies the condition.
 * Returns -1 if no shred passes the condition.
 */
function findShredIdx(
  firstShredIdx: number,
  lastShredIdx: number,
  shreds: (ShredEventTsDeltas | undefined)[],
  condition: (shred: ShredEventTsDeltas | undefined) => boolean,
) {
  for (let shredIdx = firstShredIdx; shredIdx < lastShredIdx; shredIdx++) {
    if (condition(shreds[shredIdx])) return shredIdx;
  }
  return -1;
}
