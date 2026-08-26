import { slotsPerLeader } from "../../../consts";
import type { SlotsShreds } from "../../../api/worker/cache/shreds/types";
import type { XRange } from "./utils";

/**
 * DOM-free slot label layout math, shared by the main-thread chart label
 * updater (shredsProgressionPlugin.ts) and the OffscreenCanvas chart
 * worker, which posts computed frames back for DOM application.
 */

export type Position = [xPos: number, cssWidth: number | undefined];

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
  groupLeaderSlots: { min: number; max: number },
) {
  const tsDeltasByGroup: TsDeltasBySlot = {};

  for (
    let leaderSlot = groupLeaderSlots.min;
    leaderSlot <= groupLeaderSlots.max;
    leaderSlot += slotsPerLeader
  ) {
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

export function getXPos(tsDelta: number, xRange: XRange, isCanvasPos: boolean) {
  const tsRange = xRange.maxDeltaTs - xRange.minDeltaTs;
  const minPos = isCanvasPos ? xRange.minCanvasPos : xRange.minCssPos;
  const maxPos = isCanvasPos ? xRange.maxCanvasPos : xRange.maxCssPos;
  const posRange = maxPos - minPos;
  return minPos + posRange * ((tsDelta - xRange.minDeltaTs) / tsRange);
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

export interface LabelFrameEntry {
  slot: number;
  /** css x position; null = label hidden */
  x: number | null;
  /** css width; null = extend to max X */
  w: number | null;
  skipped: boolean;
}

/**
 * One frame of computed label positions: cheap to structured-clone
 * across a postMessage boundary, applied to the DOM by labelsApply.ts.
 */
export interface LabelFrame {
  maxCssPos: number;
  groups: LabelFrameEntry[];
  slots: LabelFrameEntry[];
}

export function computeLabelFrame(
  slotRange: {
    min: number;
    max: number;
  },
  leaderSlotsRange: {
    min: number;
    max: number;
  },
  slots: SlotsShreds["slots"],
  skippedSlotsCluster: Set<number>,
  xRange: XRange,
): LabelFrame {
  const slotBlocks = getSlotBlocks(slotRange, slots);
  const slotTsDeltas = estimateSlotTsDeltas(slotBlocks, skippedSlotsCluster);
  const groupTsDeltas = getGroupTsDeltas(slotTsDeltas, leaderSlotsRange);

  const frame: LabelFrame = {
    maxCssPos: xRange.maxCssPos,
    groups: [],
    slots: [],
  };

  for (
    let leaderSlot = leaderSlotsRange.min;
    leaderSlot <= leaderSlotsRange.max;
    leaderSlot += slotsPerLeader
  ) {
    const groupRange = groupTsDeltas[leaderSlot];
    const groupPos = getPosFromTsDeltaRange(groupRange, xRange);

    let isGroupSkipped = false;
    for (let slot = leaderSlot; slot < leaderSlot + slotsPerLeader; slot++) {
      if (skippedSlotsCluster.has(slot)) {
        isGroupSkipped = true;
        break;
      }
    }

    frame.groups.push({
      slot: leaderSlot,
      x: groupPos ? groupPos[0] : null,
      w: groupPos ? (groupPos[1] ?? null) : null,
      skipped: isGroupSkipped,
    });

    for (
      let slotNumber = leaderSlot;
      slotNumber < leaderSlot + slotsPerLeader;
      slotNumber++
    ) {
      const slotPos = getPosFromTsDeltaRange(slotTsDeltas[slotNumber], xRange);

      // position slot relative to its slot group
      const relativeSlotPos =
        slotPos && groupPos
          ? ([slotPos[0] - groupPos[0], slotPos[1]] satisfies Position)
          : undefined;

      frame.slots.push({
        slot: slotNumber,
        x: relativeSlotPos ? relativeSlotPos[0] : null,
        w: relativeSlotPos ? (relativeSlotPos[1] ?? null) : null,
        skipped: skippedSlotsCluster.has(slotNumber),
      });
    }
  }

  return frame;
}
