import type uPlot from "uplot";
import type { MutableRefObject } from "react";
import { getDefaultStore } from "jotai";
import {
  liveShredsDataAtom,
  liveShredsPostStartupLeaderSlotsAtom,
  liveShredsPostStartupRangeAtom,
} from "./atoms";
import {
  delayMs,
} from "./const";
import { showStartupProgressAtom } from "../../StartupProgress/atoms";
import {
  gridLineColor,
  shredReceivedRepairColor,
  shredReceivedTurbineColor,
  shredRepairRequestedColor,
  shredReplayedNothingColor,
  shredReplayedRepairColor,
  shredReplayedTurbineColor,
  shredSkippedColor,
  shredPublishedColor,
} from "../../../colors";
import { serverTimeMsAtom, skippedClusterSlotsAtom } from "../../../atoms";
import { clamp, sum } from "lodash";
import { getSlotGroupLabelId, getSlotLabelId } from "./utils";
import { slotsPerLeader } from "../../../consts";
import type { SlotsShreds } from "./types";
import type { ChartDrawData } from "../../../api/worker/types";

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

/**
 * Maps a fillStyle to a y-section index for the startup screen.
 *  0 = top section (received_turbine, published)
 *  1 = middle section (repair_request, received_repair)
 *  2 = bottom section (replayed)
 */
const fillStyleToStartupSection: Readonly<Record<string, number>> = {
  [shredReceivedTurbineColor]: 0,
  [shredPublishedColor]: 0,
  [shredRepairRequestedColor]: 1,
  [shredReceivedRepairColor]: 1,
  [shredReplayedTurbineColor]: 2,
  [shredReplayedRepairColor]: 2,
  [shredReplayedNothingColor]: 2,
  [shredSkippedColor]: 0,
};

export function shredsProgressionPlugin(
  isOnStartupScreen: boolean,
  groupedDataRef: MutableRefObject<ChartDrawData | undefined>,
): uPlot.Plugin {
  const prevTimeDiffs: number[] = [];
  return {
    hooks: {
      draw: [
        (u) => {
          u.ctx.save();

          if (isOnStartupScreen) {
            // draw grid lines to split y axis into thirds
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

          const groupedData = groupedDataRef.current;
          const skippedSlotsCluster = store.get(skippedClusterSlotsAtom);
          const rangeAfterStartup = store.get(liveShredsPostStartupRangeAtom);

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

          const maxX = u.scales[shredsXScaleKey].max;

          if (!groupedData || maxX == null) {
            return;
          }

          const { slots, maxShreds, minCompletedSlot, range: slotRange } = groupedData;

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
          const delayedNow = adjustedTimeMs - delayMs;

          const tsXValueOffset = delayedNow - groupedData.referenceTs;

          const minSlot = isOnStartupScreen
            ? slotRange.min
            : Math.max(slotRange.min, minCompletedSlot ?? slotRange.min);

          u.ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
          u.ctx.clip();

          // helper to get x pos
          const getXPos = (xVal: number) =>
            u.valToPos(xVal, shredsXScaleKey, true);

          // Filter slots by time range
          const scaleX = u.scales[shredsXScaleKey];
          const visibleSlots = slots.filter((slot) => {
            if (slot.slotNumber < minSlot) return false;
            if (
              scaleX.max != null &&
              slot.minEventTsDelta - tsXValueOffset > scaleX.max
            )
              return false;
            if (
              scaleX.min != null &&
              slot.completionTsDelta != null &&
              slot.completionTsDelta - tsXValueOffset < scaleX.min
            )
              return false;
            return true;
          });

          const canvasHeight = isOnStartupScreen
            ? Math.trunc(u.bbox.height / 3)
            : u.bbox.height;

          // each row is at least 1 px
          const rowPxHeight = clamp(canvasHeight / maxShreds, 1, 10);
          const gapPxHeight = 1;

          const dotSize = Math.max(rowPxHeight, 3);

          const maxXPos = u.bbox.left + u.bbox.width;

          for (const slotData of visibleSlots) {
            const eventsByFillStyle: EventsByFillStyle = {};
            const addEventPosition = (
              fillStyle: string,
              position: Coordinates,
            ) => {
              eventsByFillStyle[fillStyle] ??= [];
              eventsByFillStyle[fillStyle].push(position);
            };

            const isSlotSkipped = skippedSlotsCluster.has(slotData.slotNumber);

            for (let rowIdx = 0; rowIdx < slotData.rows.length; rowIdx++) {
              const row = slotData.rows[rowIdx];

              const y = (rowPxHeight + gapPxHeight) * rowIdx + u.bbox.top;

              let endXPos: number =
                row.endTsDelta == null
                  ? maxXPos
                  : getXPos(row.endTsDelta - tsXValueOffset);

              for (const event of row.events) {
                const startXVal = event.startTsDelta - tsXValueOffset;
                const startXPos = getXPos(startXVal);

                // Pixel-space overlap check (handles edge cases not caught in tsDelta space)
                if (startXPos >= endXPos) continue;

                const yOffset = isOnStartupScreen
                  ? (fillStyleToStartupSection[event.fillStyle] ?? 0) *
                    canvasHeight
                  : 0;

                const fillStyle = isSlotSkipped
                  ? shredSkippedColor
                  : event.fillStyle;

                addEventPosition(
                  fillStyle,
                  isOnStartupScreen || isSlotSkipped
                    ? [startXPos, y + yOffset]
                    : [startXPos, y + yOffset, endXPos - startXPos],
                );

                endXPos = startXPos;
              }
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
            const liveShredsData = store.get(liveShredsDataAtom);
            if (liveShredsData?.slotsShreds) {
              updateLabels(
                rangeAfterStartup,
                liveShredsData.slotsShreds.slots,
                skippedSlotsCluster,
                u,
                maxX,
                tsXValueOffset,
              );
            }
          }
        },
      ],
    },
  };
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
  const postStartupLeaderSlots = store.get(
    liveShredsPostStartupLeaderSlotsAtom,
  );
  const groupTsDeltas = getGroupTsDeltas(slotTsDeltas, postStartupLeaderSlots);

  const xValToCssPos = (xVal: number) =>
    u.valToPos(xVal, shredsXScaleKey, false);
  const maxXPos = xValToCssPos(maxX);

  for (let groupIdx = 0; groupIdx < postStartupLeaderSlots.length; groupIdx++) {
    const leaderSlot = postStartupLeaderSlots[groupIdx];
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
