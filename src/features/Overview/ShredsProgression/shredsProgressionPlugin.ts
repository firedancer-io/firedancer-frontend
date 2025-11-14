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
import { getSlotGroupLabelId, getSlotLabelId } from "./utils";
import { slotsPerLeader } from "../../../consts";

const store = getDefaultStore();
const xScaleKey = "x";

type EventsByFillStyle = {
  [fillStyle: string]: Array<[x: number, y: number, width: number]>;
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
  labelPositionsRef: React.MutableRefObject<LabelPositions | undefined>,
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
          const maxX = u.scales[xScaleKey].max;

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
          }

          // Offset to convert shred event delta to chart x value
          const delayedNow = new Date().getTime() - delayMs;
          const tsXValueOffset = delayedNow - liveShreds.referenceTs;

          const minSlot = isOnStartupScreen
            ? slotRange.min
            : Math.max(slotRange.min, minCompletedSlot ?? slotRange.min);
          const maxSlot = slotRange.max;

          u.ctx.save();
          u.ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
          u.ctx.clip();

          // helper to get x pos
          const getXPos = (xVal: number) => u.valToPos(xVal, xScaleKey, true);

          const { maxShreds, orderedSlotNumbers } = getDrawInfo(
            minSlot,
            maxSlot,
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

          if (!isOnStartupScreen) {
            updateLabels(
              slotRange,
              liveShreds.slots,
              skippedSlotsCluster,
              u,
              maxX,
              tsXValueOffset,
              labelPositionsRef,
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
      : getXPos(slotCompletionTsDelta - tsXValueOffset);

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
  labelPositionsRef: React.MutableRefObject<LabelPositions | undefined>,
) {
  const slotBlocks = getSlotBlocks(slotRange, slots);
  const slotTsDeltas = estimateSlotTsDeltas(slotBlocks, skippedSlotsCluster);
  const groupLeaderSlots = store.get(shredsAtoms.groupLeaderSlots);
  const groupTsDeltas = getGroupTsDeltas(slotTsDeltas, groupLeaderSlots);

  const newLabelPositions: LabelPositions = {
    groups: {},
    slots: {},
  };

  const xValToCssPos = (xVal: number) => u.valToPos(xVal, xScaleKey, false);
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
    moveLabelPosition(
      true,
      leaderSlot,
      groupPos,
      maxXPos,
      leaderEl,
      labelPositionsRef.current,
      newLabelPositions,
    );

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

      moveLabelPosition(
        false,
        slotNumber,
        relativeSlotPos,
        maxXPos,
        slotEl,
        labelPositionsRef.current,
        newLabelPositions,
      );
    }
  }

  // update stored positions
  labelPositionsRef.current = newLabelPositions;
}

interface CompleteBlock {
  type: "complete";
  startTsDelta: number;
  completionTsDelta: number;
  slotNumber: number;
}
interface IncompleteBlock {
  type: "incomplete";
  startTsDelta: number;
  nextCompletionTsDelta: number | undefined;
  nextStartTsDelta: number | undefined;
  slotNumbers: number[];
}
/**
 * Group ordered slots into blocks that are compelted / incomplete
 */
function getSlotBlocks(
  slotRange: {
    min: number;
    max: number;
  },
  slots: SlotsShreds["slots"],
): Array<CompleteBlock | IncompleteBlock> {
  // skip to the first defined slot
  let firstDefinedSlotNumber = undefined;
  for (
    let slotNumber = slotRange.min;
    slotNumber <= slotRange.max;
    slotNumber++
  ) {
    const slot = slots.get(slotNumber);
    if (slot?.minEventTsDelta != null) {
      firstDefinedSlotNumber = slotNumber;
      break;
    }
  }

  if (firstDefinedSlotNumber === undefined) return [];

  // Collect all blocks based on shared start and completion ts
  // For incomplete blocks, include next start ts but not next completion ts yet
  const blocks: Array<CompleteBlock | IncompleteBlock> = [];
  let incompleteBlockSlotNumbers: number[] = [];
  let incompleteBlockStart: number | undefined = undefined;

  for (
    let slotNumber = firstDefinedSlotNumber;
    slotNumber <= slotRange.max;
    slotNumber++
  ) {
    const slot = slots.get(slotNumber);

    // add missing slot to incomplete block
    if (slot?.minEventTsDelta == null) {
      incompleteBlockSlotNumbers.push(slotNumber);
      continue;
    }

    // mark potential end for incomplete block
    if (incompleteBlockSlotNumbers.length && incompleteBlockStart != null) {
      blocks.push({
        type: "incomplete",
        startTsDelta: incompleteBlockStart,
        nextStartTsDelta: slot.minEventTsDelta,
        nextCompletionTsDelta: undefined,
        slotNumbers: incompleteBlockSlotNumbers,
      });

      // reset current incomplete block
      incompleteBlockSlotNumbers = [];
    }

    if (slot.completionTsDelta != null) {
      blocks.push({
        type: "complete",
        startTsDelta: slot.minEventTsDelta,
        completionTsDelta: slot.completionTsDelta,
        slotNumber,
      });
      incompleteBlockStart = slot.completionTsDelta;
    } else {
      // incomplete
      incompleteBlockStart = slot.minEventTsDelta;
      incompleteBlockSlotNumbers.push(slotNumber);
    }
  }

  // add final incomplete block
  if (incompleteBlockSlotNumbers.length && incompleteBlockStart != null) {
    blocks.push({
      type: "incomplete",
      startTsDelta: incompleteBlockStart,
      nextStartTsDelta: undefined,
      nextCompletionTsDelta: undefined,
      slotNumbers: incompleteBlockSlotNumbers,
    });
  }

  // iterate backwards to populate incomplete blocks with next completion ts deltas
  let nextCompletionTsDelta = undefined;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (block.type === "complete") {
      nextCompletionTsDelta = block.completionTsDelta;
      continue;
    }
    block.nextCompletionTsDelta = nextCompletionTsDelta;
  }

  return blocks;
}

type TsDeltaRange = [startTsDelta: number, endTsDelta: number | undefined];

/**
 * Get each slot's start and end ts deltas.
 * Some slots will not have end ts deltas, and would extend to the max X axis value
 * Incomplete blocks:
 *   - split the range (incomplete block start ts to next start ts) equally among the slots
 *   - skipped slots will have the above range, offset by its index in the incomplete block
 *   - non-skipped slots will extend from the incomplete block start to the next completion start
 *     (when a slot is completed, all previous slots are considered completed too)
 *   - if there is no next start ts or next completion ts, only include the first slot in the block, ending at max X ts
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
      slotTsDeltas[block.slotNumber] = [
        block.startTsDelta,
        block.completionTsDelta,
      ];
      continue;
    }

    if (block.nextStartTsDelta == null) {
      // unknown incomplete block end time
      // only include first slot, because we don't have a good estimate for when the others would have started
      slotTsDeltas[block.slotNumbers[0]] = [block.startTsDelta, undefined];
      continue;
    }

    // known block end time
    // split block range equally to determine slot start ts
    const singleSlotTsRange =
      (block.nextStartTsDelta - block.startTsDelta) / block.slotNumbers.length;
    for (let i = 0; i < block.slotNumbers.length; i++) {
      const slotNumber = block.slotNumbers[i];
      const slotStart = block.startTsDelta + i * singleSlotTsRange;

      const slotEnd = skippedSlotsCluster.has(slotNumber)
        ? slotStart + singleSlotTsRange
        : block.nextCompletionTsDelta;
      slotTsDeltas[slotNumber] = [slotStart, slotEnd];
    }
  }

  return slotTsDeltas;
}

function getGroupTsDeltas(
  slotTsDeltas: {
    [slotNumber: number]: TsDeltaRange;
  },
  groupLeaderSlots: number[],
) {
  const groupTsDeltas: {
    [leaderSlotNumber: number]: TsDeltaRange;
  } = {};

  for (const leaderSlot of groupLeaderSlots) {
    // get first defined slot
    // ignore missing slots at the start when positioning group
    let firstDefinedSlot = undefined;
    for (
      let slotNumber = leaderSlot;
      slotNumber < leaderSlot + slotsPerLeader;
      slotNumber++
    ) {
      if (slotNumber in slotTsDeltas) {
        firstDefinedSlot = slotNumber;
        break;
      }
    }

    if (firstDefinedSlot === undefined) {
      continue;
    }

    let groupStart = Infinity;
    let groupEnd = -Infinity;

    for (
      let slotNumber = firstDefinedSlot;
      slotNumber < leaderSlot + slotsPerLeader;
      slotNumber++
    ) {
      const slotTsDeltaRange = slotTsDeltas[slotNumber];
      const slotStart = slotTsDeltaRange?.[0];
      const slotEnd = slotTsDeltaRange?.[1];

      if (slotStart != null) {
        groupStart = Math.min(groupStart, slotStart);
      }
      // undefined slot end will extend to max x
      groupEnd = Math.max(groupEnd, slotEnd ?? Infinity);
    }

    // replace Infinity with undefined for end
    const end = groupEnd === Infinity ? undefined : groupEnd;
    groupTsDeltas[leaderSlot] = [groupStart, end];
  }
  return groupTsDeltas;
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
 * Update changed styles and store new positions in labelPositions
 */
function moveLabelPosition(
  isGroup: boolean,
  slotNumber: number,
  position: Position | undefined,
  maxXPos: number,
  el: HTMLElement,
  prevLabelPositions: LabelPositions | undefined,
  labelPositionsToMutate: LabelPositions,
) {
  // force all updates if previously, nothing was positioned
  const forceUpdates = !prevLabelPositions;

  const key = isGroup ? "groups" : "slots";
  const positionsToMutate = labelPositionsToMutate[key];

  const isVisible = !!position;
  const prevPositions = prevLabelPositions?.[key];
  const prevVisible = !!prevPositions?.[slotNumber];

  if (forceUpdates || isVisible !== prevVisible) {
    // hide / show
    const prop = isGroup ? "--group-y" : "--slot-y";
    el.style.setProperty(prop, isVisible ? "0" : "-150%");
  }

  if (!isVisible) return;
  positionsToMutate[slotNumber] = position;

  const xPos = position[0];
  const prevXPos = prevPositions?.[slotNumber]?.[0];

  if (forceUpdates || xPos !== prevXPos) {
    const prop = isGroup ? "--group-x" : "--slot-x";
    el.style.setProperty(prop, `${xPos}px`);
  }

  // no width data -- extend to max width
  const width = position[1];
  const isExtended = position[1] == null;
  const extendedWidth = width ?? maxXPos - xPos;
  const prevWidth = prevPositions?.[slotNumber]?.[1];

  if (forceUpdates || extendedWidth !== prevWidth) {
    el.style.width = `${extendedWidth}px`;
  }

  const wasPrevExtended =
    prevPositions?.[slotNumber] && prevPositions[slotNumber][1] == null;

  if (isGroup && (forceUpdates || isExtended !== wasPrevExtended)) {
    el.style.setProperty("--group-name-opacity", isExtended ? "0" : "1");
  }
}
