import type uPlot from "uplot";
import { getDefaultStore } from "jotai";
import {
  liveShredsDataAtom,
  liveShredsPostStartupLeaderSlotsAtom,
  liveShredsPostStartupRangeAtom,
} from "./atoms";
import { rowShredEventDescPriorities, shredEventDescPriorities } from "./const";
import { showStartupProgressAtom } from "../../StartupProgress/atoms";
import {
  gridLineColor,
  shredPublishedColor,
  shredReceivedRepairColor,
  shredReceivedTurbineColor,
  shredRepairRequestedColor,
  shredReplayedNothingColor,
  shredReplayedRepairColor,
  shredReplayedTurbineColor,
  shredSkippedColor,
} from "../../../colors";
import { serverTimeMsAtom, skippedClusterSlotsAtom } from "../../../atoms";
import { clamp, sum } from "lodash";
import { ShredEvent } from "../../../api/entities";
import { getSlotGroupLabelId, getSlotLabelId } from "./utils";
import { slotsPerLeader } from "../../../consts";
import { delayMs } from "../../../api/worker/cache/shreds/shredsCalc";
import type {
  SlotsShreds,
  ShredEventTsDeltas,
} from "../../../api/worker/cache/shreds/types";

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

type XRange = {
  minDeltaTs: number;
  maxDeltaTs: number;
  minCanvasPos: number;
  maxCanvasPos: number;
  minCssPos: number;
  maxCssPos: number;
};

export function shredsProgressionPlugin(
  isOnStartupScreen: boolean,
): uPlot.Plugin {
  const prevTimeDiffs: number[] = [];

  /**
   * Get timestamp for "now", which is the ts at x = 0 (right-most in chart).
   * "now" is adjusted using an avg diff of server time and real now ts to smooth out server msg delays.
   * We also delay "now" by one data update interval to prevent instability of right-most data.
   */
  function getAdjustedNow() {
    // Use server time for chart axis
    // Use a rolling avg of the server time and client now diff.
    // If we get ws messages buffered and it results in a temporary high
    // diff, shred still move smoothly by using the avg
    const now = Date.now();
    const serverTimeMs = store.get(serverTimeMsAtom);

    if (serverTimeMs) {
      const timeDiff = now - serverTimeMs;
      prevTimeDiffs.push(timeDiff);
      while (prevTimeDiffs.length > 20) {
        prevTimeDiffs.shift();
      }
    }

    const timeDiffAvg = prevTimeDiffs.length
      ? sum(prevTimeDiffs) / prevTimeDiffs.length
      : undefined;
    const adjustedTimeMs =
      timeDiffAvg == null ? (serverTimeMs ?? now) : now - timeDiffAvg;
    return adjustedTimeMs - delayMs;
  }

  return {
    hooks: {
      draw: [
        (u) => {
          if (isOnStartupScreen) {
            drawStartupChartAxes(u);
          }

          const {
            slotsShreds: liveShreds,
            range: slotRange,
            minCompletedSlot,
          } = store.get(liveShredsDataAtom) ?? {};
          const skippedSlotsCluster = store.get(skippedClusterSlotsAtom);
          const rangeAfterStartup = store.get(liveShredsPostStartupRangeAtom);

          const { min: minXScale, max: maxXScale } = u.scales[shredsXScaleKey];

          if (
            !liveShreds ||
            !slotRange ||
            minXScale == null ||
            maxXScale == null
          ) {
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

          const adjustedNow = getAdjustedNow();

          const maxReferenceTs = adjustedNow - liveShreds.referenceTs;
          const tsSpan = maxXScale - minXScale;

          const xRange: XRange = {
            minDeltaTs: maxReferenceTs - tsSpan,
            maxDeltaTs: maxReferenceTs,
            minCanvasPos: u.bbox.left,
            maxCanvasPos: u.bbox.left + u.bbox.width,
            minCssPos: u.valToPos(minXScale, shredsXScaleKey, false),
            maxCssPos: u.valToPos(maxXScale, shredsXScaleKey, false),
          };

          const minSlot = isOnStartupScreen
            ? slotRange.min
            : Math.max(slotRange.min, minCompletedSlot ?? slotRange.min);
          const maxSlot = slotRange.max;

          const { maxShreds, orderedSlotNumbers } = getDrawInfo(
            minSlot,
            maxSlot,
            liveShreds,
            xRange,
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

          u.ctx.save();
          u.ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
          u.ctx.clip();

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
                firstShredIdx,
                lastShredIdx,
                shreds: slot.shreds,
                slotCompletionTsDelta: slot.completionTsDelta,
                isSlotSkipped,
                drawOnlyDots: isOnStartupScreen,
                y: (rowPxHeight + gapPxHeight) * rowIdx + u.bbox.top,
                getYOffset,
                xRange,
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
              xRange,
            );
          }
        },
      ],
    },
  };
}

/**
 * Draw grid lines to split y axis into thirds
 */
function drawStartupChartAxes(u: uPlot) {
  u.ctx.save();
  u.ctx.strokeStyle = gridLineColor;
  u.ctx.lineWidth = 1;
  u.ctx.beginPath();

  const left = u.bbox.left;
  const right = u.bbox.left + u.bbox.width;

  for (let i = 0; i < 3; i++) {
    u.ctx.moveTo(left, u.bbox.top + (u.bbox.height * i) / 3);
    u.ctx.lineTo(right, u.bbox.top + (u.bbox.height * i) / 3);
  }
  u.ctx.stroke();
  u.ctx.restore();
}

/**
 * Get slots in draw order
 * and max shreds count per slot for scaling
 */
function getDrawInfo(
  minSlotNumber: number,
  maxSlotNumber: number,
  liveShreds: SlotsShreds,
  xRange: XRange,
) {
  const orderedSlotNumbers = [];
  let maxShreds = 0;

  for (
    let slotNumber = minSlotNumber;
    slotNumber <= maxSlotNumber;
    slotNumber++
  ) {
    const slot = liveShreds.slots.get(slotNumber);
    if (!slot?.shreds.length || slot.minEventTsDelta == null) {
      // slot has no events
      continue;
    }

    if (slot.minEventTsDelta > xRange.maxDeltaTs) {
      // slot started after chart max X
      continue;
    }

    if (
      slot.completionTsDelta != null &&
      slot.completionTsDelta < xRange.minDeltaTs
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
}

function getXPos(tsDelta: number, xRange: XRange, isCanvasPos: boolean) {
  const tsRange = xRange.maxDeltaTs - xRange.minDeltaTs;
  const minPos = isCanvasPos ? xRange.minCanvasPos : xRange.minCssPos;
  const maxPos = isCanvasPos ? xRange.maxCanvasPos : xRange.maxCssPos;
  const posRange = maxPos - minPos;
  return minPos + posRange * ((tsDelta - xRange.minDeltaTs) / tsRange);
}

interface AddEventsForRowArgs {
  addEventPosition: (fillStyle: string, position: Coordinates) => void;
  firstShredIdx: number;
  lastShredIdx: number;
  shreds: (ShredEventTsDeltas | undefined)[];
  slotCompletionTsDelta: number | undefined;
  isSlotSkipped: boolean;
  drawOnlyDots: boolean;
  y: number;
  getYOffset?: (
    eventType: Exclude<ShredEvent, ShredEvent.slot_complete>,
  ) => number;
  xRange: XRange;
}
/**
 * Draw rows for shreds, with rectangles or dots for events.
 * Each row may represent partial or multiple shreds. Use the row shred priorities to determine
 * which shred to draw.
 */
function addEventsForRow({
  addEventPosition,
  firstShredIdx,
  lastShredIdx,
  shreds,
  slotCompletionTsDelta,
  drawOnlyDots,
  isSlotSkipped,
  y,
  getYOffset,
  xRange,
}: AddEventsForRowArgs) {
  const shredIdx = getShredIdxToDrawForRow(firstShredIdx, lastShredIdx, shreds);

  const eventTsDeltas = shreds[shredIdx];
  // no events to draw
  if (!eventTsDeltas) return;

  let endXPos: number =
    slotCompletionTsDelta == null
      ? // event goes to max x
        xRange.maxCanvasPos
      : getXPos(slotCompletionTsDelta, xRange, true);

  const eventPositions = new Map<
    Exclude<ShredEvent, ShredEvent.slot_complete>,
    Coordinates
  >();

  // draw events from highest to lowest priority
  for (const eventType of shredEventDescPriorities) {
    const tsDelta = eventTsDeltas[eventType];
    if (tsDelta == null) continue;

    const startXPos = getXPos(tsDelta, xRange, true);

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

function getShredIdxToDrawForRow(
  firstShredIdx: number,
  lastShredIdx: number,
  shreds: (ShredEventTsDeltas | undefined)[],
): number {
  for (const shredEvent of rowShredEventDescPriorities) {
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
  xRange: XRange,
) {
  const slotBlocks = getSlotBlocks(slotRange, slots);
  const slotTsDeltas = estimateSlotTsDeltas(slotBlocks, skippedSlotsCluster);
  const postStartupLeaderSlots = store.get(
    liveShredsPostStartupLeaderSlotsAtom,
  );
  const groupTsDeltas = getGroupTsDeltas(slotTsDeltas, postStartupLeaderSlots);

  for (let groupIdx = 0; groupIdx < postStartupLeaderSlots.length; groupIdx++) {
    const leaderSlot = postStartupLeaderSlots[groupIdx];
    const leaderElId = getSlotGroupLabelId(leaderSlot);
    const leaderEl = document.getElementById(leaderElId);
    if (!leaderEl) continue;

    const groupRange = groupTsDeltas[leaderSlot];

    const groupPos = getPosFromTsDeltaRange(groupRange, xRange);
    moveLabelPosition(true, groupPos, xRange.maxCssPos, leaderEl);

    for (
      let slotNumber = leaderSlot;
      slotNumber < leaderSlot + slotsPerLeader;
      slotNumber++
    ) {
      const slotElId = getSlotLabelId(slotNumber);
      const slotEl = document.getElementById(slotElId);
      if (!slotEl) continue;

      const slotRange = slotTsDeltas[slotNumber];
      const slotPos = getPosFromTsDeltaRange(slotRange, xRange);

      // position slot relative to its slot group
      const relativeSlotPos =
        slotPos && groupPos
          ? ([slotPos[0] - groupPos[0], slotPos[1]] satisfies Position)
          : undefined;

      moveLabelPosition(false, relativeSlotPos, xRange.maxCssPos, slotEl);
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
  firstSlotMaxEventTsDelta?: number;
}
/**
 * Group ordered slots into blocks that are complete / incomplete.
 * Each block has a slot or array of slots sharing the same
 * start and end ts
 */
export function getSlotBlocks(
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
      // don't collect incomplete blocks until we have at least one block started
      if (blocks.length === 0 && incompleteBlockSlotNumbers.length === 0) {
        continue;
      }

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
      if (blockStart == null) break;

      blocks.push({
        type: "incomplete",
        startTsDelta: blockStart,
        endTsDelta: slot.minEventTsDelta,
        firstSlotMaxEventTsDelta: slots.get(incompleteBlockSlotNumbers[0])
          ?.maxEventTsDelta,
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
      firstSlotMaxEventTsDelta: slots.get(incompleteBlockSlotNumbers[0])
        ?.maxEventTsDelta,
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
export type TsDeltasBySlot = {
  [slotNumber: number]: TsDeltaRange | undefined;
};

/**
 * Get each slot's start and end ts deltas.
 * Some slots will not have end ts deltas, and would extend to the max X axis value
 * Incomplete blocks:
 *   - split the range (incomplete block start ts to next start ts) equally among the slots
 *     - if the split range is < the first slot's max event range, use the max event range and
 *       split the remaining time among other slots
 *   - if the range is negative (caused by overlapping slots), give it undefined range
 *   - skipped slots will have the above range, offset by its index in the incomplete block
 *   - non-skipped slots will extend from the incomplete block start to the max X axis value
 *   - if there is no next start ts, only include the first slot in the block, ending at max X ts
 */
export function estimateSlotTsDeltas(
  slotBlocks: Array<CompleteBlock | IncompleteBlock>,
  skippedSlotsCluster: Set<number>,
) {
  let slotTsDeltas: TsDeltasBySlot = {};

  for (const block of slotBlocks) {
    if (block.type === "complete") {
      slotTsDeltas[block.slotNumber] = [block.startTsDelta, block.endTsDelta];
      continue;
    }

    const firstSlotNumber = block.slotNumbers[0];
    if (block.endTsDelta == null) {
      // unknown incomplete block end time
      // only include first slot, because we don't have a good estimate for when the others would have started
      slotTsDeltas[firstSlotNumber] = [block.startTsDelta, undefined];
      continue;
    }

    // known block end time

    const singleSlotTsRange =
      (block.endTsDelta - block.startTsDelta) / block.slotNumbers.length;
    if (
      skippedSlotsCluster.has(firstSlotNumber) &&
      block.firstSlotMaxEventTsDelta != null &&
      singleSlotTsRange < block.firstSlotMaxEventTsDelta - block.startTsDelta
    ) {
      // first slot should extend to its max event ts delta
      // other slots will occupy remaining space
      slotTsDeltas = {
        ...slotTsDeltas,
        [firstSlotNumber]: [block.startTsDelta, block.firstSlotMaxEventTsDelta],
        ...splitRangeAmongSlots(
          block.slotNumbers.slice(1),
          block.firstSlotMaxEventTsDelta,
          block.endTsDelta,
          skippedSlotsCluster,
        ),
      };
    } else {
      // all skipped slots get equal width
      slotTsDeltas = {
        ...slotTsDeltas,
        ...splitRangeAmongSlots(
          block.slotNumbers,
          block.startTsDelta,
          block.endTsDelta,
          skippedSlotsCluster,
        ),
      };
    }
  }

  return slotTsDeltas;
}

function splitRangeAmongSlots(
  slotNumbers: number[],
  startTsDelta: number,
  endTsDelta: number,
  skippedSlotsCluster: Set<number>,
) {
  const slotTsDeltas: TsDeltasBySlot = {};

  const singleSlotTsRange = (endTsDelta - startTsDelta) / slotNumbers.length;
  for (let i = 0; i < slotNumbers.length; i++) {
    const slotNumber = slotNumbers[i];
    if (singleSlotTsRange <= 0) {
      // undefined range for slot with non-positive range caused by overlapping slots
      slotTsDeltas[slotNumber] = undefined;
      continue;
    }

    const slotStart = startTsDelta + i * singleSlotTsRange;

    const slotEnd = skippedSlotsCluster.has(slotNumber)
      ? slotStart + singleSlotTsRange
      : undefined;
    slotTsDeltas[slotNumber] = [slotStart, slotEnd];
  }

  return slotTsDeltas;
}

/**
 * Get start and end ts deltas for group, from its slots ts deltas
 * Ignore slots with undefined range (they will have no width due to slot overlaps)
 * For missing slots, return undefined end to indicate the group extends to max X
 */
export function getGroupTsDeltas(
  slotTsDeltas: TsDeltasBySlot,
  groupLeaderSlots: number[],
) {
  const tsDeltasByGroup: TsDeltasBySlot = {};

  for (const leaderSlot of groupLeaderSlots) {
    // filter to relevant slots
    const slotsWithWidths = Array.from(
      { length: slotsPerLeader },
      (_, i) => i + leaderSlot,
    ).reduce<number[]>((acc, slotNumber) => {
      // ignore missing slots at start of group
      if (acc.length === 0 && !(slotNumber in slotTsDeltas)) {
        return acc;
      }
      // ignore slots with undefined range
      if (
        slotNumber in slotTsDeltas &&
        slotTsDeltas[slotNumber] === undefined
      ) {
        return acc;
      }
      acc.push(slotNumber);
      return acc;
    }, []);

    if (slotsWithWidths.length === 0) {
      // ignore groups with no slots with widths
      continue;
    }

    const groupTsDelta = slotsWithWidths.reduce<TsDeltaRange>(
      (acc, slotNumber) => {
        const slotStart = slotTsDeltas[slotNumber]?.[0];
        const slotEnd = slotTsDeltas[slotNumber]?.[1];
        if (slotStart != null) {
          acc[0] = Math.min(acc[0], slotStart);
        }

        // undefined slotEnd (missing end slots, or incomplete non-skipped slot) means the slot extends to the max X
        acc[1] =
          acc[1] === undefined || slotEnd === undefined
            ? undefined
            : Math.max(slotEnd, acc[1]);
        return acc;
      },
      [Infinity, -Infinity],
    );
    tsDeltasByGroup[leaderSlot] = groupTsDelta;
  }
  return tsDeltasByGroup;
}

/**
 * If missing range end, set width as undefined
 */
function getPosFromTsDeltaRange(
  tsDeltaRange: TsDeltaRange | undefined,
  xRange: XRange,
): Position | undefined {
  if (!tsDeltaRange) return;

  const xStartPos = getXPos(tsDeltaRange[0], xRange, false);
  const xEndVal = tsDeltaRange[1];

  if (xEndVal == null) {
    return [xStartPos, undefined];
  }

  const xEndPos = getXPos(xEndVal, xRange, false);
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
    `${xPos - (isGroup ? groupBorderOffset : 0)}px`,
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
