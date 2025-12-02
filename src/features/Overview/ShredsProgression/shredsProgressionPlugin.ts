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
  shredPublishedColor,
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
import { getSlotGroupLabelId, getSlotLabelId } from "./utils";
import { slotsPerLeader } from "../../../consts";

const store = getDefaultStore();
export const shredsXScaleKey = "shredsXScaleKey";

type Coordinates = [x: number, y: number, width?: number];
type EventsByFillStyle = {
  [fillStyle: string]: Array<Coordinates>;
};
export type Position = [xPos: number, cssWidth: number | undefined];
export type LabelPositions = {
  groups: {
    [leaderSlotNumber: number]: Position;
  };
  slots: {
    [slotNumber: number]: Position;
  };
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
          const minCompletedSlot = store.get(atoms.minCompletedSlot);
          const skippedSlotsCluster = store.get(skippedClusterSlotsAtom);
          const rangeAfterStartup = store.get(atoms.rangeAfterStartup);

          const maxX = u.scales[shredsXScaleKey].max;

          if (!liveShreds || !slotRange || maxX == null) {
            return;
          }

          if (!isOnStartupScreen) {
            // if startup is running, prevent drawing non-startup screen chart
            if (store.get(showStartupProgressAtom)) return;
            // Sometimes we've missed the completion event for the first slots
            // depending on connection time. Ignore those slots, and only draw slots
            // from min completed.
            if (minCompletedSlot == null) return;

            if (!rangeAfterStartup) return;
          }

          // Offset to convert shred event delta to chart x value
          const delayedNow = Date.now() - delayMs;

          const tsXValueOffset = delayedNow - liveShreds.referenceTs;

          const minSlot = isOnStartupScreen
            ? slotRange.min
            : Math.max(slotRange.min, minCompletedSlot ?? slotRange.min);
          const maxSlot = slotRange.max;

          u.ctx.save();
          u.ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
          u.ctx.clip();

          // helper to get x pos
          const getXPos = (xVal: number) =>
            u.valToPos(xVal, shredsXScaleKey, true);

          const { maxShreds, orderedSlotNumbers } = getDrawInfo(
            minSlot,
            maxSlot,
            liveShreds,
            u.scales[shredsXScaleKey],
            tsXValueOffset,
          );

          const canvasHeight = isOnStartupScreen
            ? Math.trunc(u.bbox.height / 3)
            : u.bbox.height;

          const getYOffset = isOnStartupScreen
            ? (eventType: Exclude<ShredEvent, ShredEvent.slot_complete>) => {
                switch (eventType) {
                  case ShredEvent.shred_received_turbine:
                  case ShredEvent.shred_published: {
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

          const dotSize = Math.max(rowPxHeight, 3);

          // n rows, n-1 gaps
          const rowsCount = Math.trunc(
            (canvasHeight + gapPxHeight) / (rowPxHeight + gapPxHeight),
          );
          const shredsPerRow = maxShreds / rowsCount;

          for (const slotNumber of orderedSlotNumbers) {
            const eventsByFillStyle: EventsByFillStyle = {};
            const addEventPosition = (
              fillStyle: string,
              position: Coordinates,
            ) => {
              eventsByFillStyle[fillStyle] ??= [];
              eventsByFillStyle[fillStyle].push(position);
            };

            const slot = liveShreds.slots.get(slotNumber);
            if (slot?.minEventTsDelta == null) continue;

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
                scaleX: u.scales[shredsXScaleKey],
                getXPos,
              });
            }

            // draw events, one fillStyle at a time for this slot
            for (const fillStyle of Object.keys(eventsByFillStyle)) {
              u.ctx.beginPath();
              u.ctx.fillStyle = fillStyle;
              for (const [x, y, width] of eventsByFillStyle[fillStyle]) {
                if (width == null) {
                  // dot
                  u.ctx.rect(x, y, dotSize, dotSize);
                } else {
                  u.ctx.rect(x, y, width, rowPxHeight);
                }
              }
              u.ctx.fill();
            }
          }

          u.ctx.restore();

          if (!isOnStartupScreen && rangeAfterStartup) {
            updateLabels(
              rangeAfterStartup,
              liveShreds.slots,
              skippedSlotsCluster,
              u,
              maxX,
              tsXValueOffset,
            );
          }
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
  addEventPosition: (fillStyle: string, position: Coordinates) => void;
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
      : getXPos(slotCompletionTsDelta - tsXValueOffset);

  const eventPositions = new Map<
    Exclude<ShredEvent, ShredEvent.slot_complete>,
    Coordinates
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
        ? [startXPos, y + yOffset]
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
      case ShredEvent.shred_published: {
        addEventPosition(shredPublishedColor, position);
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

function updateLabels(
  slotRange: {
    min: number;
    max: number;
  },
  slots: SlotsShreds["slots"],
  skippedSlotsCluster: Set<number>,
  u: uPlot,
  maxX: number,
  tsXValueOffset: number,
) {
  const slotBlocks = getSlotBlocks(slotRange, slots);
  const slotTsDeltas = estimateSlotTsDeltas(slotBlocks, skippedSlotsCluster);
  const groupLeaderSlots = store.get(shredsAtoms.groupLeaderSlots);
  const groupTsDeltas = getGroupTsDeltas(slotTsDeltas, groupLeaderSlots);

  const xValToCssPos = (xVal: number) =>
    u.valToPos(xVal, shredsXScaleKey, false);
  const maxXPos = xValToCssPos(maxX);

  for (let groupIdx = 0; groupIdx < groupLeaderSlots.length; groupIdx++) {
    const leaderSlot = groupLeaderSlots[groupIdx];
    const leaderElId = getSlotGroupLabelId(leaderSlot);
    const leaderEl = document.getElementById(leaderElId);
    if (!leaderEl) continue;

    const groupRange = groupTsDeltas[leaderSlot];

    const groupPos = getPosFromTsDeltaRange(
      groupRange,
      tsXValueOffset,
      xValToCssPos,
    );
    moveLabelPosition(true, groupPos, maxXPos, leaderEl);

    for (
      let slotNumber = leaderSlot;
      slotNumber < leaderSlot + slotsPerLeader;
      slotNumber++
    ) {
      const slotElId = getSlotLabelId(slotNumber);
      const slotEl = document.getElementById(slotElId);
      if (!slotEl) continue;

      const slotRange = slotTsDeltas[slotNumber];
      const slotPos = getPosFromTsDeltaRange(
        slotRange,
        tsXValueOffset,
        xValToCssPos,
      );

      // position slot relative to its slot group
      const relativeSlotPos =
        slotPos && groupPos
          ? ([slotPos[0] - groupPos[0], slotPos[1]] satisfies Position)
          : undefined;

      moveLabelPosition(false, relativeSlotPos, maxXPos, slotEl);
    }
  }
}

interface CompleteBlock {
  type: "complete";
  startTsDelta: number;
  endTsDelta: number;
  slotNumber: number;
}
interface IncompleteBlock {
  type: "incomplete";
  startTsDelta: number;
  endTsDelta: number | undefined;
  slotNumbers: number[];
}
/**
 * Group ordered slots into blocks that are complete / incomplete.
 * Each block has a slot or array of slots sharing the same
 * start and end ts
 */
function getSlotBlocks(
  slotRange: {
    min: number;
    max: number;
  },
  slots: SlotsShreds["slots"],
): Array<CompleteBlock | IncompleteBlock> {
  const blocks: Array<CompleteBlock | IncompleteBlock> = [];
  let incompleteBlockSlotNumbers: number[] = [];

  for (
    let slotNumber = slotRange.min;
    slotNumber <= slotRange.max;
    slotNumber++
  ) {
    const slot = slots.get(slotNumber);

    if (slot?.minEventTsDelta == null) {
      // We don't want incomplete blocks with unknown start ts, so
      // don't collect incomplete blocks until we have at least one block stored
      if (blocks.length === 0) continue;

      // add missing slot to incomplete block
      incompleteBlockSlotNumbers.push(slotNumber);
      continue;
    }

    // mark incomplete block's end with current slot's start
    if (incompleteBlockSlotNumbers.length) {
      const blockStart = getIncompleteBlockStart(
        incompleteBlockSlotNumbers,
        slots,
        blocks[blocks.length - 1],
      );
      if (!blockStart) break;

      blocks.push({
        type: "incomplete",
        startTsDelta: blockStart,
        endTsDelta: slot.minEventTsDelta,
        slotNumbers: incompleteBlockSlotNumbers,
      });

      // reset current incomplete block
      incompleteBlockSlotNumbers = [];
    }

    if (slot.completionTsDelta != null) {
      blocks.push({
        type: "complete",
        startTsDelta: slot.minEventTsDelta,
        endTsDelta: slot.completionTsDelta,
        slotNumber,
      });
    } else {
      // incomplete
      incompleteBlockSlotNumbers.push(slotNumber);
    }
  }

  // add final incomplete block
  if (incompleteBlockSlotNumbers.length) {
    const blockStart = getIncompleteBlockStart(
      incompleteBlockSlotNumbers,
      slots,
      blocks[blocks.length - 1],
    );
    if (!blockStart) return blocks;

    blocks.push({
      type: "incomplete",
      startTsDelta: blockStart,
      endTsDelta: undefined,
      slotNumbers: incompleteBlockSlotNumbers,
    });
  }
  return blocks;
}

/**
 *
 * incomplete block starts at either start of first
 * slot in the block, or end of the previous block
 */
function getIncompleteBlockStart(
  blockSlotNumbers: number[],
  slots: SlotsShreds["slots"],
  previousBlock: CompleteBlock | IncompleteBlock,
) {
  const firstSlotNumber = blockSlotNumbers[0];
  const startFirstSlotNumber = slots.get(firstSlotNumber)?.minEventTsDelta;

  if (startFirstSlotNumber != null) return startFirstSlotNumber;

  const prevBlockEnd = previousBlock.endTsDelta;
  if (prevBlockEnd == null) {
    console.error(
      `Missing block start ts for incomplete block beginning at ${firstSlotNumber}`,
    );
    return;
  }

  return prevBlockEnd;
}

type TsDeltaRange = [startTsDelta: number, endTsDelta: number | undefined];

/**
 * Get each slot's start and end ts deltas.
 * Some slots will not have end ts deltas, and would extend to the max X axis value
 * Incomplete blocks:
 *   - split the range (incomplete block start ts to next start ts) equally among the slots
 *   - skipped slots will have the above range, offset by its index in the incomplete block
 *   - non-skipped slots will extend from the incomplete block start to the max X axis value
 *   - if there is no next start ts, only include the first slot in the block, ending at max X ts
 */
function estimateSlotTsDeltas(
  slotBlocks: Array<CompleteBlock | IncompleteBlock>,
  skippedSlotsCluster: Set<number>,
) {
  const slotTsDeltas: {
    [slotNumber: number]: TsDeltaRange;
  } = {};

  for (const block of slotBlocks) {
    if (block.type === "complete") {
      slotTsDeltas[block.slotNumber] = [block.startTsDelta, block.endTsDelta];
      continue;
    }

    if (block.endTsDelta == null) {
      // unknown incomplete block end time
      // only include first slot, because we don't have a good estimate for when the others would have started
      slotTsDeltas[block.slotNumbers[0]] = [block.startTsDelta, undefined];
      continue;
    }

    // known block end time
    // split block range equally to determine slot start ts
    const singleSlotTsRange =
      (block.endTsDelta - block.startTsDelta) / block.slotNumbers.length;
    for (let i = 0; i < block.slotNumbers.length; i++) {
      const slotNumber = block.slotNumbers[i];
      const slotStart = block.startTsDelta + i * singleSlotTsRange;

      const slotEnd = skippedSlotsCluster.has(slotNumber)
        ? slotStart + singleSlotTsRange
        : undefined;
      slotTsDeltas[slotNumber] = [slotStart, slotEnd];
    }
  }

  return slotTsDeltas;
}

/**
 * Get start and end ts deltas for group, from its slots ts deltas
 * Undefined end indicates the group extends to max X
 */
function getGroupTsDeltas(
  slotTsDeltas: {
    [slotNumber: number]: TsDeltaRange;
  },
  groupLeaderSlots: number[],
) {
  const tsDeltasByGroup: {
    [leaderSlotNumber: number]: TsDeltaRange;
  } = {};

  for (const leaderSlot of groupLeaderSlots) {
    let minStart = Infinity;
    let maxEnd = -Infinity;
    for (let slot = leaderSlot; slot < leaderSlot + slotsPerLeader; slot++) {
      const slotStart = slotTsDeltas[slot]?.[0];
      const slotEnd = slotTsDeltas[slot]?.[1];

      if (slotStart !== undefined) {
        minStart = Math.min(slotStart, minStart);
      }

      // don't track end times for initial undefined slots
      const hasSeenDefinedSlot = minStart !== Infinity;
      if (!hasSeenDefinedSlot) continue;

      // undefind slotEnd means the slot extends to the max X
      maxEnd = Math.max(slotEnd ?? Infinity, maxEnd);
    }

    // no defined slots
    if (minStart === Infinity || maxEnd === -Infinity) {
      continue;
    }

    tsDeltasByGroup[leaderSlot] = [
      minStart,
      // convert back to undefined
      maxEnd === Infinity ? undefined : maxEnd,
    ];
  }
  return tsDeltasByGroup;
}

/**
 * If missing range end, set width as undefined
 */
function getPosFromTsDeltaRange(
  tsDeltaRange: TsDeltaRange,
  tsXValueOffset: number,
  valToCssPos: (val: number) => number,
): Position | undefined {
  if (!tsDeltaRange) return undefined;
  const xStartVal = tsDeltaRange[0] - tsXValueOffset;
  const xStartPos = valToCssPos(xStartVal);

  if (tsDeltaRange[1] == null) {
    return [xStartPos, undefined];
  }

  const xEndVal = tsDeltaRange[1] - tsXValueOffset;
  const xEndPos = valToCssPos(xEndVal);
  return [xStartPos, xEndPos - xStartPos];
}

/**
 * Update label element styles
 */
function moveLabelPosition(
  isGroup: boolean,
  position: Position | undefined,
  maxXPos: number,
  el: HTMLElement,
) {
  const groupBorderOffset = 1;
  const xPosProp = isGroup ? "--group-x" : "--slot-x";

  const isVisible = !!position;
  if (!isVisible) {
    // hide
    el.style.setProperty(xPosProp, "-100000px");
    return;
  }

  const [xPos, width] = position;
  el.style.setProperty(
    xPosProp,
    `${xPos + (isGroup ? groupBorderOffset : 0)}px`,
  );

  // If missing width, extend to max width (with extra px to hide right border)
  const newWidth = width ?? maxXPos - xPos + 1;
  el.style.width = `${newWidth + (isGroup ? groupBorderOffset * 2 : 0)}px`;

  const isExtended = width == null;
  if (isGroup) {
    // Extended groups don't have a defined end, so we don't know where to center the name text.
    // Set to opacity 0, and transition to 1 when the group end becomes defined.
    el.style.setProperty("--group-name-opacity", isExtended ? "0" : "1");
  }
}
